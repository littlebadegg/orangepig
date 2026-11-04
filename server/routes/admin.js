/**
 * 网页后台路由 — 宝宝画像
 *
 * 鉴权：管理员口令（环境变量 ADMIN_PASSWORD）换 admin JWT，与小程序用户 token 隔离（payload 带 role=admin）
 *
 * POST /api/admin/login           — 口令登录，返回 adminToken
 * GET  /api/admin/session         — 校验 token 是否有效
 * GET  /api/admin/babies          — 全部宝宝（含成员数、最近活跃）
 * GET  /api/admin/portrait        — 宝宝画像：活跃度排行 + 登录查看日志 + 作息规律 + 喂养趋势
 * GET  /api/admin/activity        — 操作流水（分页）
 */
const express = require('express')
const jwt = require('jsonwebtoken')
const crypto = require('crypto')
const { Op, fn, literal } = require('sequelize')
const router = express.Router()

const config = require('../config')
const {
  User,
  Baby,
  BabyMember,
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
  ActivityLog,
} = require('../models')
const {
  startOfDay,
  endOfDay,
  formatDate,
  formatTime,
  diffMinutes,
} = require('../utils/time')
const { sleepOverlapWhere, clipSleep } = require('../utils/sleep')
const { ACTION, KIND_LABEL, actionText } = require('../utils/activity')

// ============ 鉴权 ============

/** 登录失败限流：同一 IP 10 分钟内最多 8 次 */
const loginFails = new Map()
const FAIL_WINDOW_MS = 10 * 60 * 1000
const FAIL_LIMIT = 8

function checkLoginRate(ip) {
  const now = Date.now()
  const rec = loginFails.get(ip)
  if (!rec || now > rec.resetAt) return { blocked: false }
  return { blocked: rec.count >= FAIL_LIMIT, retryAfter: Math.ceil((rec.resetAt - now) / 1000) }
}

function markLoginFail(ip) {
  const now = Date.now()
  const rec = loginFails.get(ip)
  if (!rec || now > rec.resetAt) {
    loginFails.set(ip, { count: 1, resetAt: now + FAIL_WINDOW_MS })
    return
  }
  rec.count += 1
  if (loginFails.size > 500) {
    for (const [k, v] of loginFails) if (now > v.resetAt) loginFails.delete(k)
  }
}

/** 口令比较（定长比较，避免时序侧信道） */
function safeEqual(a, b) {
  const ba = Buffer.from(String(a))
  const bb = Buffer.from(String(b))
  if (ba.length !== bb.length) return false
  return crypto.timingSafeEqual(ba, bb)
}

/** 管理员鉴权中间件 */
function adminAuth(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) return res.apiError('未登录', 401, 401)
  try {
    const payload = jwt.verify(token, config.jwtSecret)
    if (payload.role !== 'admin') return res.apiError('无权限', 403, 403)
    req.admin = payload
    next()
  } catch (e) {
    return res.apiError('登录已过期，请重新登录', 401, 401)
  }
}

// ============ 登录 ============

router.post('/login', (req, res) => {
  if (!config.adminPassword) {
    return res.apiError('后台未启用：服务端未配置 ADMIN_PASSWORD', 503, 503)
  }

  const ip = String(req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim()
  const rate = checkLoginRate(ip)
  if (rate.blocked) {
    return res.apiError(`尝试次数过多，请 ${Math.ceil(rate.retryAfter / 60)} 分钟后再试`, 429, 429)
  }

  const password = String((req.body || {}).password || '')
  if (!password || !safeEqual(password, config.adminPassword)) {
    markLoginFail(ip)
    return res.apiError('口令不正确', 401, 401)
  }

  loginFails.delete(ip)
  const token = jwt.sign({ role: 'admin' }, config.jwtSecret, {
    expiresIn: config.adminTokenExpiresIn,
  })
  res.apiSuccess({ token, expiresIn: config.adminTokenExpiresIn })
})

router.get('/session', adminAuth, (req, res) => {
  res.apiSuccess({ ok: true, expiresIn: config.adminTokenExpiresIn })
})

// ============ 宝宝列表 ============

router.get('/babies', adminAuth, async (req, res, next) => {
  try {
    const babies = await Baby.findAll({
      where: { status: 1 },
      order: [['id', 'DESC']],
      raw: true,
    })

    // 一次查出所有宝宝的成员与最近活跃，避免 N+1
    const babyIds = babies.map((b) => b.id)
    const [members, lastActives] = await Promise.all([
      BabyMember.findAll({
        where: { babyId: { [Op.in]: babyIds }, status: 1 },
        raw: true,
      }),
      babyIds.length
        ? ActivityLog.findAll({
            // createdAt 映射到 created_at 列；用 literal 避免别名（ActivityLog）解析问题
            attributes: ['babyId', [fn('MAX', literal('created_at')), 'lastAt']],
            where: { babyId: { [Op.in]: babyIds } },
            group: [literal('baby_id')],
            raw: true,
          })
        : Promise.resolve([]),
    ])

    const userCache = new Map()
    const users = await User.findAll({
      where: { id: { [Op.in]: [...new Set(members.map((m) => m.userId))] } },
      attributes: ['id', 'nickName'],
      raw: true,
    })
    users.forEach((u) => userCache.set(u.id, u.nickName))

    const memberMap = new Map()
    members.forEach((m) => {
      if (!memberMap.has(m.babyId)) memberMap.set(m.babyId, [])
      memberMap.get(m.babyId).push(m)
    })
    const lastMap = new Map(lastActives.map((x) => [Number(x.babyId), x.lastAt]))

    const today = formatDate(new Date())
    const list = babies.map((b) => {
      const ms = memberMap.get(b.id) || []
      const owner = ms.find((m) => m.role === 'owner')
      const ageDays = b.birthday
        ? Math.max(0, Math.floor((startOfDay(new Date()) - new Date(String(b.birthday).replace(/-/g, '/'))) / 86400000))
        : null
      return {
        id: b.id,
        name: b.name,
        gender: b.gender,
        birthday: b.birthday,
        ageDays,
        ownerName: owner ? userCache.get(owner.userId) || '' : userCache.get(b.userId) || '',
        memberCount: ms.length,
        members: ms.map((m) => ({
          userId: m.userId,
          name: userCache.get(m.userId) || '',
          relation: m.relation || (m.role === 'owner' ? '家长' : '家人'),
          role: m.role,
        })),
        lastActiveAt: lastMap.get(b.id) || null,
        today,
      }
    })

    res.apiSuccess({ list })
  } catch (err) {
    next(err)
  }
})

// ============ 宝宝画像 ============

router.get('/portrait', adminAuth, async (req, res, next) => {
  try {
    const babyId = Number(req.query.babyId)
    if (!babyId) return res.apiError('缺少 babyId', 400, 400)

    const days = Math.min(30, Math.max(1, Number(req.query.days) || 7))

    const baby = await Baby.findOne({ where: { id: babyId, status: 1 }, raw: true })
    if (!baby) return res.apiError('宝宝不存在', 404, 404)

    const todayStart = startOfDay(new Date())
    const rangeStart = startOfDay(new Date(todayStart.getTime() - (days - 1) * 86400000))
    const rangeEnd = endOfDay(new Date())

    const [
      members,
      feedings,
      diapers,
      sleeps,
      exercises,
      baths,
      waters,
      supplements,
      logs,
    ] = await Promise.all([
      BabyMember.findAll({ where: { babyId, status: 1 }, raw: true }),
      FeedingRecord.findAll({ where: { babyId, time: { [Op.between]: [rangeStart, rangeEnd] }, status: 1 }, raw: true }),
      DiaperRecord.findAll({ where: { babyId, time: { [Op.between]: [rangeStart, rangeEnd] }, status: 1 }, raw: true }),
      SleepRecord.findAll({ where: sleepOverlapWhere(babyId, rangeStart, rangeEnd), raw: true }),
      ExerciseRecord.findAll({ where: { babyId, time: { [Op.between]: [rangeStart, rangeEnd] }, status: 1 }, raw: true }),
      BathRecord.findAll({ where: { babyId, time: { [Op.between]: [rangeStart, rangeEnd] }, status: 1 }, raw: true }),
      WaterRecord.findAll({ where: { babyId, time: { [Op.between]: [rangeStart, rangeEnd] }, status: 1 }, raw: true }),
      SupplementRecord.findAll({ where: { babyId, time: { [Op.between]: [rangeStart, rangeEnd] }, status: 1 }, raw: true }),
      ActivityLog.findAll({
        where: { babyId, createdAt: { [Op.gte]: rangeStart } },
        order: [['createdAt', 'DESC']],
        limit: 300,
        raw: true,
      }),
    ])

    // -------- 成员信息 --------
    const userIds = [...new Set(members.map((m) => m.userId))]
    const users = await User.findAll({
      where: { id: { [Op.in]: userIds } },
      attributes: ['id', 'nickName', 'avatarUrl'],
      raw: true,
    })
    const userMap = new Map(users.map((u) => [u.id, u]))

    const nameOf = (userId) => {
      const m = members.find((x) => x.userId === userId)
      const u = userMap.get(userId)
      const nick = (u && u.nickName) || `用户${userId}`
      if (m && m.relation) return `${nick}（${m.relation}）`
      return nick
    }

    // -------- 活跃度：按人统计记录数（真实数据，不受日志上线时间影响） --------
    const statMap = new Map()
    const ensureStat = (userId) => {
      if (!statMap.has(userId)) {
        statMap.set(userId, {
          userId,
          today: 0,
          range: 0,
          byKind: {},
          lastRecordAt: null,
          lastActiveAt: null,
          lastLoginAt: null,
          loginCount: 0,
          viewCount: 0,
        })
      }
      return statMap.get(userId)
    }
    members.forEach((m) => ensureStat(m.userId))

    const addRecords = (rows, kind, timeField = 'time') => {
      rows.forEach((r) => {
        const s = ensureStat(r.userId)
        s.byKind[kind] = (s.byKind[kind] || 0) + 1
        s.range += 1
        const t = new Date(r[timeField])
        if (t >= todayStart) s.today += 1
        const createdAt = r.createdAt ? new Date(r.createdAt) : t
        if (!s.lastRecordAt || createdAt > new Date(s.lastRecordAt)) {
          s.lastRecordAt = createdAt.toISOString()
        }
      })
    }

    addRecords(feedings, 'feeding')
    addRecords(diapers, 'diaper')
    addRecords(sleeps, 'sleep', 'startTime')
    addRecords(exercises, 'exercise')
    addRecords(baths, 'bath')
    addRecords(waters, 'water')
    addRecords(supplements, 'supplement')

    // 日志维度：登录次数、查看次数、最近活跃
    logs.forEach((l) => {
      const s = ensureStat(l.userId)
      const at = new Date(l.createdAt)
      if (!s.lastActiveAt || at > new Date(s.lastActiveAt)) s.lastActiveAt = at.toISOString()
      if (l.action === ACTION.LOGIN) {
        s.loginCount += 1
        if (!s.lastLoginAt || at > new Date(s.lastLoginAt)) s.lastLoginAt = at.toISOString()
      }
      if (l.action === ACTION.VIEW_TIMELINE) s.viewCount += 1
    })

    const memberList = members
      .map((m) => {
        const s = statMap.get(m.userId)
        const u = userMap.get(m.userId) || {}
        return {
          userId: m.userId,
          name: u.nickName || '',
          relation: m.relation || (m.role === 'owner' ? '家长' : '家人'),
          role: m.role,
          avatarUrl: u.avatarUrl || '',
          today: s.today,
          range: s.range,
          byKind: s.byKind,
          lastRecordAt: s.lastRecordAt,
          lastActiveAt: s.lastActiveAt,
          lastLoginAt: s.lastLoginAt,
          loginCount: s.loginCount,
          viewCount: s.viewCount,
        }
      })
      .sort((a, b) => b.range - a.range || b.today - a.today)

    // -------- 今日概览 --------
    const todayFeeds = feedings.filter((f) => new Date(f.time) >= todayStart)
    const todayDiapers = diapers.filter((d) => new Date(d.time) >= todayStart)
    const todayWaters = waters.filter((w) => new Date(w.time) >= todayStart)
    const todaySupplements = supplements.filter((s) => new Date(s.time) >= todayStart)

    let todaySleepMin = 0
    sleeps.forEach((s) => {
      // clipSleep(入睡, 起床, 窗口起, 窗口止) → 只算落在今天的那一段
      const seg = clipSleep(s.startTime, s.endTime, todayStart, endOfDay(new Date()))
      if (seg) todaySleepMin += seg.minutes
    })

    const sumAmount = (arr) => arr.reduce((sum, f) => sum + (Number(f.amount) || 0), 0)

    const overview = {
      todayFeedingCount: todayFeeds.length,
      todayMilkMl: sumAmount(todayFeeds),
      todayDiaperCount: todayDiapers.length,
      todaySleepMinutes: todaySleepMin,
      todayWaterMl: todayWaters.reduce((s, w) => s + (Number(w.amount) || 0), 0),
      todaySupplementNames: [...new Set(todaySupplements.map((s) => s.name))],
      memberCount: members.length,
      activeTodayCount: memberList.filter((m) => m.today > 0).length,
    }

    // -------- 作息规律 --------
    // 24 小时喂奶分布
    const hourHist = Array.from({ length: 24 }, (_, i) => ({ hour: i, count: 0 }))
    feedings.forEach((f) => {
      const h = new Date(f.time).getHours()
      hourHist[h].count += 1
    })

    // 平均喂奶间隔（同一天内相邻两顿，间隔超过 8 小时视为跨夜不计）
    const byDay = new Map()
    feedings.forEach((f) => {
      const key = formatDate(new Date(f.time))
      if (!byDay.has(key)) byDay.set(key, [])
      byDay.get(key).push(new Date(f.time).getTime())
    })
    const intervals = []
    byDay.forEach((times) => {
      times.sort((a, b) => a - b)
      for (let i = 1; i < times.length; i++) {
        const gap = Math.round((times[i] - times[i - 1]) / 60000)
        if (gap > 0 && gap <= 480) intervals.push(gap)
      }
    })
    const avgIntervalMin = intervals.length
      ? Math.round(intervals.reduce((a, b) => a + b, 0) / intervals.length)
      : null

    // 夜间（20:00-06:00）睡眠段数 → 平均夜醒/夜奶节奏；最长连续睡眠
    let nightSleepCount = 0
    let longestSleepMin = 0
    sleeps.forEach((s) => {
      const start = new Date(s.startTime)
      const end = s.endTime ? new Date(s.endTime) : new Date()
      const sh = start.getHours()
      if (sh >= 20 || sh < 6) nightSleepCount += 1
      const minutes = s.duration || diffMinutes(start, end)
      if (minutes > longestSleepMin) longestSleepMin = minutes
    })

    // 每顿平均奶量
    const formulaFeeds = feedings.filter((f) => Number(f.amount) > 0)
    const avgMilkMl = formulaFeeds.length
      ? Math.round(formulaFeeds.reduce((s, f) => s + Number(f.amount), 0) / formulaFeeds.length)
      : null

    const rhythm = {
      hourHist,
      peakHours: hourHist
        .filter((x) => x.count > 0)
        .sort((a, b) => b.count - a.count)
        .slice(0, 3)
        .map((x) => `${x.hour}:00`),
      avgIntervalMinutes: avgIntervalMin,
      avgIntervalText: avgIntervalMin ? `${Math.floor(avgIntervalMin / 60)}小时${avgIntervalMin % 60}分` : '—',
      nightSleepCount,
      nightSleepPerDay: Number((nightSleepCount / days).toFixed(1)),
      longestSleepText: longestSleepMin
        ? `${Math.floor(longestSleepMin / 60)}小时${longestSleepMin % 60}分`
        : '—',
      avgMilkMl,
      feedingPerDay: Number((feedings.length / days).toFixed(1)),
    }

    // -------- 近 N 天趋势 --------
    const trend = []
    for (let i = days - 1; i >= 0; i--) {
      const dayStart = startOfDay(new Date(todayStart.getTime() - i * 86400000))
      const dayEnd = endOfDay(dayStart)
      const dayFeeds = feedings.filter((f) => {
        const t = new Date(f.time)
        return t >= dayStart && t <= dayEnd
      })
      const dayDiapers = diapers.filter((d) => {
        const t = new Date(d.time)
        return t >= dayStart && t <= dayEnd
      })
      let sleepMin = 0
      sleeps.forEach((s) => {
        const seg = clipSleep(s.startTime, s.endTime, dayStart, dayEnd)
        if (seg) sleepMin += seg.minutes
      })
      trend.push({
        date: formatDate(dayStart),
        label: `${dayStart.getMonth() + 1}/${dayStart.getDate()}`,
        milkMl: sumAmount(dayFeeds),
        feedingCount: dayFeeds.length,
        diaperCount: dayDiapers.length,
        sleepHours: Number((sleepMin / 60).toFixed(1)),
      })
    }

    // -------- 操作流水 --------
    const logList = logs.slice(0, 60).map((l) => ({
      id: Number(l.id),
      userId: l.userId,
      userName: nameOf(l.userId),
      action: l.action,
      text: actionText(l, formatDate(new Date())),
      targetType: l.targetType,
      targetLabel: KIND_LABEL[l.targetType] || '',
      viewDate: l.viewDate,
      detail: l.detail,
      ip: l.ip,
      at: l.createdAt,
      timeText: formatTime(l.createdAt),
      dateText: formatDate(new Date(l.createdAt)),
    }))

    // -------- 宝宝档案 --------
    const ageDays = baby.birthday
      ? Math.max(
          0,
          Math.floor(
            (todayStart - new Date(String(baby.birthday).replace(/-/g, '/'))) / 86400000
          )
        )
      : null

    res.apiSuccess({
      baby: {
        id: baby.id,
        name: baby.name,
        gender: baby.gender,
        birthday: baby.birthday,
        ageDays,
        createdAt: baby.createdAt,
      },
      range: { days, from: formatDate(rangeStart), to: formatDate(rangeEnd) },
      overview,
      members: memberList,
      rhythm,
      trend,
      logs: logList,
    })
  } catch (err) {
    next(err)
  }
})

// ============ 操作流水（分页） ============

router.get('/activity', adminAuth, async (req, res, next) => {
  try {
    const babyId = Number(req.query.babyId) || null
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50))
    const offset = Math.max(0, Number(req.query.offset) || 0)
    const action = req.query.action ? String(req.query.action) : ''

    const where = {}
    if (babyId) where.babyId = babyId
    if (action) where.action = action

    const { rows, count } = await ActivityLog.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit,
      offset,
      raw: true,
    })

    const userIds = [...new Set(rows.map((r) => r.userId).filter(Boolean))]
    const users = userIds.length
      ? await User.findAll({ where: { id: { [Op.in]: userIds } }, attributes: ['id', 'nickName'], raw: true })
      : []
    const userMap = new Map(users.map((u) => [u.id, u.nickName]))

    const todayStr = formatDate(new Date())
    res.apiSuccess({
      total: count,
      list: rows.map((l) => ({
        id: Number(l.id),
        userId: l.userId,
        userName: userMap.get(l.userId) || `用户${l.userId}`,
        action: l.action,
        text: actionText(l, todayStr),
        viewDate: l.viewDate,
        detail: l.detail,
        ip: l.ip,
        at: l.createdAt,
      })),
    })
  } catch (err) {
    next(err)
  }
})

// 便于排查：后台是否已启用
router.get('/status', (req, res) => {
  res.apiSuccess({ enabled: !!config.adminPassword })
})

module.exports = router
