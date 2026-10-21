/**
 * 统计路由
 *
 * GET /api/stats/daily?babyId=1&date=2026-10-21  — 某天概览
 * GET /api/stats/trend?babyId=1&days=7           — 近 N 天趋势
 */
const express = require('express')
const { Op } = require('sequelize')
const router = express.Router()

const { auth } = require('../middleware/auth')
const { Baby, User, FeedingRecord, DiaperRecord, SleepRecord } = require('../models')
const {
  formatDate,
  formatTime,
  formatDuration,
  diffMinutes,
  startOfDay,
  endOfDay,
  startOfDaysAgo,
  safeDate,
} = require('../utils/time')

async function findOwnBaby(babyId, userId) {
  if (!babyId) return null
  return Baby.findOne({ where: { id: babyId, userId, status: 1 } })
}

/**
 * 解析统计哪个宝宝：参数 → 当前选中 → 第一个宝宝
 */
async function resolveBaby(req) {
  if (req.query.babyId) {
    const baby = await resolveBaby(req)
    if (baby) return baby
  }

  const user = await User.findByPk(req.userId)
  if (user && user.currentBabyId) {
    const baby = await findOwnBaby(user.currentBabyId, req.userId)
    if (baby) return baby
  }

  return Baby.findOne({
    where: { userId: req.userId, status: 1 },
    order: [['id', 'ASC']],
  })
}

/**
 * 某天概览
 */
router.get('/daily', auth, async (req, res, next) => {
  try {
    const baby = await resolveBaby(req)
    if (!baby) {
      return res.apiError('请先选择宝宝', 400, 400)
    }

    const day = safeDate(req.query.date)
    const from = startOfDay(day)
    const to = endOfDay(day)

    const [feedings, diapers, sleeps] = await Promise.all([
      FeedingRecord.findAll({
        where: { babyId: baby.id, time: { [Op.between]: [from, to] }, status: 1 },
        order: [['time', 'ASC']],
        raw: true,
      }),
      DiaperRecord.findAll({
        where: { babyId: baby.id, time: { [Op.between]: [from, to] }, status: 1 },
        raw: true,
      }),
      SleepRecord.findAll({
        where: {
          babyId: baby.id,
          startTime: { [Op.between]: [from, to] },
          recordStatus: 1,
          status: 1,
        },
        raw: true,
      }),
    ])

    // 奶粉
    const formulaList = feedings.filter((f) => f.type === 'formula')
    const breastList = feedings.filter((f) => f.type === 'breast')
    const totalAmount = formulaList.reduce((sum, f) => sum + (f.amount || 0), 0)
    const breastMinutes = breastList.reduce((sum, f) => sum + (f.duration || 0), 0)

    // 距上一次喂养过了多久（分钟）
    let lastFeeding = null
    if (feedings.length > 0) {
      const last = feedings[feedings.length - 1]
      const ago = diffMinutes(last.time, new Date())
      lastFeeding = {
        timeText: formatTime(last.time),
        agoMinutes: ago,
        agoText: ago < 60 ? `${ago}分钟前` : formatDuration(ago) + '前',
        title: last.type === 'formula' ? `奶粉 ${last.amount}ml` : `母乳 ${last.duration}分钟`,
      }
    }

    // 睡眠（含进行中的那一段）
    const sleepMinutes = sleeps.reduce((sum, s) => sum + (s.duration || 0), 0)
    const ongoing = await SleepRecord.findOne({
      where: { babyId: baby.id, recordStatus: 0, status: 1 },
      raw: true,
    })
    const ongoingMinutes = ongoing ? diffMinutes(ongoing.startTime, new Date()) : 0

    res.apiSuccess({
      date: formatDate(day),
      feeding: {
        count: feedings.length,
        formulaCount: formulaList.length,
        breastCount: breastList.length,
        totalAmount,
        avgAmount: formulaList.length > 0 ? Math.round(totalAmount / formulaList.length) : 0,
        breastMinutes,
        lastFeeding,
      },
      diaper: {
        count: diapers.length,
        peeCount: diapers.filter((d) => d.type === 'pee' || d.type === 'both').length,
        pooCount: diapers.filter((d) => d.type === 'poo' || d.type === 'both').length,
      },
      sleep: {
        count: sleeps.length,
        minutes: sleepMinutes,
        minutesText: formatDuration(sleepMinutes),
        ongoingMinutes,
        ongoingText: ongoing ? formatDuration(ongoingMinutes) : '',
        isSleeping: !!ongoing,
        totalMinutes: sleepMinutes + ongoingMinutes,
        totalText: formatDuration(sleepMinutes + ongoingMinutes),
      },
    })
  } catch (err) {
    next(err)
  }
})

/**
 * 近 N 天趋势
 */
router.get('/trend', auth, async (req, res, next) => {
  try {
    const baby = await resolveBaby(req)
    if (!baby) {
      return res.apiError('请先选择宝宝', 400, 400)
    }

    const days = Math.min(Math.max(parseInt(req.query.days) || 7, 1), 30)
    const from = startOfDaysAgo(days - 1)
    const to = endOfDay(new Date())

    const [feedings, diapers, sleeps] = await Promise.all([
      FeedingRecord.findAll({
        where: { babyId: baby.id, time: { [Op.between]: [from, to] }, status: 1 },
        raw: true,
      }),
      DiaperRecord.findAll({
        where: { babyId: baby.id, time: { [Op.between]: [from, to] }, status: 1 },
        raw: true,
      }),
      SleepRecord.findAll({
        where: {
          babyId: baby.id,
          startTime: { [Op.between]: [from, to] },
          recordStatus: 1,
          status: 1,
        },
        raw: true,
      }),
    ])

    // 按天聚合（内存中分组，数据量小）
    const byDate = {}
    for (let i = days - 1; i >= 0; i--) {
      const dateStr = formatDate(startOfDaysAgo(i))
      byDate[dateStr] = {
        date: dateStr,
        label: i === 0 ? '今天' : `${parseInt(dateStr.slice(5, 7))}/${parseInt(dateStr.slice(8, 10))}`,
        feedingCount: 0,
        totalAmount: 0,
        diaperCount: 0,
        sleepMinutes: 0,
      }
    }

    feedings.forEach((f) => {
      const key = formatDate(f.time)
      if (!byDate[key]) return
      byDate[key].feedingCount++
      if (f.type === 'formula') byDate[key].totalAmount += f.amount || 0
    })

    diapers.forEach((d) => {
      const key = formatDate(d.time)
      if (byDate[key]) byDate[key].diaperCount++
    })

    sleeps.forEach((s) => {
      const key = formatDate(s.startTime)
      if (byDate[key]) byDate[key].sleepMinutes += s.duration || 0
    })

    const list = Object.keys(byDate)
      .sort()
      .map((k) => ({
        ...byDate[k],
        sleepText: formatDuration(byDate[k].sleepMinutes),
      }))

    res.apiSuccess({ days, list })
  } catch (err) {
    next(err)
  }
})

module.exports = router
