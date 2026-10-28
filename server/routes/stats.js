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
const {
  FeedingRecord,
  DiaperRecord,
  SleepRecord,
  ExerciseRecord,
  GrowthRecord,
  TemperatureRecord,
  SpitUpRecord,
  BathRecord,
  WaterRecord,
  SupplementRecord,
  CustomFeed,
} = require('../models')
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

const { resolveBaby } = require('../utils/baby')
const { computeScore } = require('../utils/score')

/**
 * MySQL DECIMAL 取回来是字符串，统一转数字
 */
function toNum(value) {
  if (value === null || value === undefined || value === '') return null
  const n = parseFloat(value)
  return isNaN(n) ? null : n
}

/** 距现在多久（跨天友好：X分钟前 / X小时前 / X天X小时前） */
function agoTextOf(minutes) {
  if (minutes === null || minutes === undefined) return ''
  const m = Math.max(0, Math.round(minutes))
  if (m < 60) return `${m}分钟前`
  if (m < 1440) return formatDuration(m) + '前'
  const d = Math.floor(m / 1440)
  const h = Math.floor((m % 1440) / 60)
  return h > 0 ? `${d}天${h}小时前` : `${d}天前`
}

/**
 * 体温分级
 * < 37.3 正常 / 37.3~38 低热 / 38~39 中度发热 / ≥ 39 高热
 */
function feverLevel(temp) {
  if (temp === null) return 'normal'
  if (temp < 37.3) return 'normal'
  if (temp < 38) return 'low'
  if (temp < 39) return 'moderate'
  return 'high'
}

const FEVER_TEXT = {
  normal: '正常',
  low: '低热',
  moderate: '中度发热',
  high: '高热',
}

// 吐奶量：1 少量 / 2 中量 / 3 大量
const SPIT_UP_LABEL = { 1: '少量', 2: '中量', 3: '大量' }

/** 今天是否（YYYY-MM-DD 对比，东八区本地时间） */
function isToday(day) {
  return formatDate(day) === formatDate(new Date())
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

    const [feedings, diapers, sleeps, exercises, temperatures, spitUps, baths, waters, supplements] = await Promise.all([
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
      ExerciseRecord.findAll({
        where: { babyId: baby.id, time: { [Op.between]: [from, to] }, status: 1 },
        order: [['time', 'DESC']],
        raw: true,
      }),
      TemperatureRecord.findAll({
        where: { babyId: baby.id, time: { [Op.between]: [from, to] }, status: 1 },
        order: [['time', 'DESC']],
        raw: true,
      }),
      SpitUpRecord.findAll({
        where: { babyId: baby.id, time: { [Op.between]: [from, to] }, status: 1 },
        order: [['time', 'DESC']],
        raw: true,
      }),
      BathRecord.findAll({
        where: { babyId: baby.id, time: { [Op.between]: [from, to] }, status: 1 },
        order: [['time', 'DESC']],
        raw: true,
      }),
      WaterRecord.findAll({
        where: { babyId: baby.id, time: { [Op.between]: [from, to] }, status: 1 },
        order: [['time', 'DESC']],
        raw: true,
      }),
      SupplementRecord.findAll({
        where: { babyId: baby.id, time: { [Op.between]: [from, to] }, status: 1 },
        order: [['time', 'DESC']],
        raw: true,
      }),
    ])

    // 身高体重：各自取最近一次「非空」的测量
    // 分开查是因为用户可能只量身高或只称体重，用同一条会把另一项抹成空
    const [latestHeightRow, latestWeightRow] = await Promise.all([
      GrowthRecord.findOne({
        where: { babyId: baby.id, status: 1, height: { [Op.ne]: null } },
        order: [['time', 'DESC']],
        raw: true,
      }),
      GrowthRecord.findOne({
        where: { babyId: baby.id, status: 1, weight: { [Op.ne]: null } },
        order: [['time', 'DESC']],
        raw: true,
      }),
    ])

    // 奶粉
    const formulaList = feedings.filter((f) => f.type === 'formula')
    const breastList = feedings.filter((f) => f.type === 'breast')
    const totalAmount = formulaList.reduce((sum, f) => sum + (f.amount || 0), 0)
    const breastMinutes = breastList.reduce((sum, f) => sum + (f.duration || 0), 0)

    // 距上一次喂养过了多久（分钟）
    // 跨天兜底：今天还没喂时，取昨天/更早最近的一条，避免 0 点后「距上次喂养」消失
    let lastFeedingRow =
      feedings.length > 0 ? feedings[feedings.length - 1] : null
    if (!lastFeedingRow) {
      lastFeedingRow = await FeedingRecord.findOne({
        where: { babyId: baby.id, time: { [Op.lt]: from }, status: 1 },
        order: [['time', 'DESC']],
        raw: true,
      })
    }
    let lastFeeding = null
    if (lastFeedingRow) {
      const ago = diffMinutes(lastFeedingRow.time, new Date())
      lastFeeding = {
        timeText: formatTime(lastFeedingRow.time),
        minutes: ago,
        agoText: agoTextOf(ago),
        title:
          lastFeedingRow.type === 'formula'
            ? `奶粉 ${lastFeedingRow.amount}ml`
            : `母乳 ${lastFeedingRow.duration}分钟`,
      }
    }

    // 上次换尿片 + 距现在多久（同样跨天兜底）
    let lastDiaperRow = null
    if (diapers.length > 0) {
      lastDiaperRow = [...diapers].sort(
        (a, b) => new Date(a.time) - new Date(b.time)
      ).pop()
    } else {
      lastDiaperRow = await DiaperRecord.findOne({
        where: { babyId: baby.id, time: { [Op.lt]: from }, status: 1 },
        order: [['time', 'DESC']],
        raw: true,
      })
    }
    let lastDiaper = null
    if (lastDiaperRow) {
      const ago = diffMinutes(lastDiaperRow.time, new Date())
      lastDiaper = {
        timeText: formatTime(lastDiaperRow.time),
        minutes: ago,
        agoText: agoTextOf(ago),
        typeText:
          lastDiaperRow.type === 'pee'
            ? '小便'
            : lastDiaperRow.type === 'poo'
              ? '大便'
              : '大小便',
      }
    }

    // 睡眠（含进行中的那一段）
    const sleepMinutes = sleeps.reduce((sum, s) => sum + (s.duration || 0), 0)
    const ongoing = await SleepRecord.findOne({
      where: { babyId: baby.id, recordStatus: 0, status: 1 },
      raw: true,
    })
    const ongoingMinutes = ongoing ? diffMinutes(ongoing.startTime, new Date()) : 0

    // 排气操
    const exerciseMinutes = exercises.reduce((sum, e) => sum + (e.duration || 0), 0)
    const lastExercise = exercises[0] || null

    // 体温（今天测过的，按时间倒序，第一条就是最新的）
    const temps = temperatures.map((t) => toNum(t.temperature)).filter((v) => v !== null)
    const latestTemp = temps.length > 0 ? temps[0] : null
    const maxTemp = temps.length > 0 ? Math.max(...temps) : null
    const level = feverLevel(latestTemp)

    // 洗澡（今天洗过几次、累计多久）
    const bathMinutes = baths.reduce((sum, b) => sum + (b.duration || 0), 0)
    const lastBath = baths[0] || null

    // 吐奶
    const lastSpitUp = spitUps[0] || null

    // 身高体重（各自最近一次非空测量）
    const latestHeight = latestHeightRow ? toNum(latestHeightRow.height) : null
    const latestWeight = latestWeightRow ? toNum(latestWeightRow.weight) : null
    // 展示的测量时间取两者中较新的那条
    let measuredAt = null
    if (latestHeightRow && latestWeightRow) {
      measuredAt =
        new Date(latestHeightRow.time) >= new Date(latestWeightRow.time)
          ? latestHeightRow.time
          : latestWeightRow.time
    } else if (latestHeightRow) {
      measuredAt = latestHeightRow.time
    } else if (latestWeightRow) {
      measuredAt = latestWeightRow.time
    }

    // ========== 喂水 / 喂养品统计 ==========
    const waterTotal = waters.reduce((sum, w) => sum + (w.amount || 0), 0)
    const lastWater = waters[0] || null
    const supplementNames = supplements.map((s) => s.name)
    const hasAd = supplementNames.includes('AD')

    // ========== 今日醒目提醒 ==========
    // 仅当天才有提醒；历史日期是回看，不需要提醒
    const reminders = []
    if (isToday(day)) {
      // 1. 喝了两顿奶还没喂水 → 必须喂水
      if (formulaList.length >= 2 && waters.length === 0) {
        reminders.push({
          type: 'water',
          level: 'urgent',
          icon: '🚰',
          text: `已喂 ${formulaList.length} 顿奶还没喂水，两顿奶之间要喂点水哦`,
          action: 'water',
          actionText: '去喂水',
        })
      }

      // 2. 今天维生素AD还没喂
      if (!hasAd) {
        reminders.push({
          type: 'ad',
          level: 'urgent',
          icon: '💊',
          text: '今天的维生素AD还没喂',
          action: 'supplement',
          actionText: '去喂AD',
        })
      }

      // 3. 自定义喂养项今天没喂的逐个提醒
      const customFeeds = await CustomFeed.findAll({
        where: { babyId: baby.id, status: 1 },
        order: [['id', 'ASC']],
        raw: true,
      })
      customFeeds.forEach((c) => {
        if (!supplementNames.includes(c.name)) {
          reminders.push({
            type: 'custom',
            level: 'normal',
            icon: '💊',
            text: `今天的「${c.name}」还没喂`,
            action: 'supplement',
            actionText: '去记录',
            name: c.name,
          })
        }
      })
    }

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
        lastDiaper,
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
      exercise: {
        count: exercises.length,
        minutes: exerciseMinutes,
        minutesText: formatDuration(exerciseMinutes),
        lastText: lastExercise ? formatTime(lastExercise.time) : '',
      },
      temperature: {
        count: temps.length,
        latest: latestTemp,
        latestText: latestTemp !== null ? `${latestTemp}℃` : '',
        max: maxTemp,
        level,
        levelText: FEVER_TEXT[level],
        isFever: level !== 'normal',
        timeText: temperatures.length > 0 ? formatTime(temperatures[0].time) : '',
      },
      growth: {
        hasData: latestHeight !== null || latestWeight !== null,
        height: latestHeight,
        weight: latestWeight,
        heightText: latestHeight !== null ? `${latestHeight}cm` : '',
        weightText: latestWeight !== null ? `${latestWeight}kg` : '',
        measuredText: measuredAt ? formatDate(measuredAt) : '',
      },
      spitUp: {
        count: spitUps.length,
        lastText: lastSpitUp ? formatTime(lastSpitUp.time) : '',
        lastLevel: lastSpitUp ? lastSpitUp.level : null,
        lastLevelText: lastSpitUp ? SPIT_UP_LABEL[lastSpitUp.level] || '' : '',
      },
      bath: {
        count: baths.length,
        minutes: bathMinutes,
        minutesText: formatDuration(bathMinutes),
        lastText: lastBath ? formatTime(lastBath.time) : '',
        lastWaterTemp: lastBath ? toNum(lastBath.waterTemp) : null,
      },
      water: {
        count: waters.length,
        totalAmount: waterTotal,
        lastText: lastWater ? formatTime(lastWater.time) : '',
        lastAmount: lastWater ? lastWater.amount : null,
      },
      supplement: {
        count: supplements.length,
        names: supplementNames,
        hasAd,
        lastText: supplements.length > 0 ? formatTime(supplements[0].time) : '',
      },
      // 今日醒目提醒（喂水 / AD / 自定义喂养项），历史日期为空数组
      reminders,
      // 每日养育评分（0~100，含各维度得分、加减分明细与建议）
      score: computeScore({
        feedings,
        diapers,
        sleeps,
        exercises,
        temperatures,
        spitUps,
        baths,
        sleepMinutes,
        ongoingMinutes,
      }),
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
