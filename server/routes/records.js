/**
 * 记录路由 — 喂养、换尿片、睡眠、排气操、身高体重、体温、今日时间线
 *
 * POST   /api/records/feeding      — 记一次喂养（奶粉毫升 / 母乳时长）
 * POST   /api/records/diaper       — 记一次换尿片（拉尿 / 拉屎 / 都有）
 * POST   /api/records/sleep/start  — 开始睡觉
 * POST   /api/records/sleep/end    — 起床结束（自动计算时长）
 * POST   /api/records/sleep        — 补录一段睡眠（起止时间都给）
 * POST   /api/records/exercise     — 记一次排气操（时长分钟 + 是否排气）
 * POST   /api/records/growth       — 记一次身高 / 体重
 * POST   /api/records/temperature  — 记一次体温
 * GET    /api/records/timeline     — 某天的时间线（默认今天）
 * DELETE /api/records/:type/:id    — 删除记录
 *        type: feeding|diaper|sleep|exercise|growth|temperature
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
} = require('../models')
const {
  formatDateTime,
  formatTime,
  formatDate,
  formatDuration,
  diffMinutes,
  startOfDay,
  endOfDay,
  safeDate,
} = require('../utils/time')

const { resolveBaby } = require('../utils/baby')

// ============ 展示文案 ============
const DIAPER_LABEL = { pee: '小便', poo: '大便', both: '大小便' }
const DIAPER_ICON = { pee: '💧', poo: '💩', both: '💩' }

const EXERCISE_RESULT_LABEL = { 0: '', 1: '有排气', 2: '没排气' }
const TEMP_METHOD_LABEL = {
  ear: '耳温',
  forehead: '额温',
  armpit: '腋温',
  oral: '口温',
}

/**
 * 解析时间：前端传 "YYYY-MM-DD HH:mm:ss"，缺省取当前时间
 */
function parseTime(input) {
  if (!input) return new Date()
  const d = new Date(input)
  return isNaN(d.getTime()) ? new Date() : d
}

/**
 * MySQL DECIMAL 字段取回来是字符串，统一转成数字
 * 非法值返回 null，避免把 NaN 写进响应
 */
function toNum(value) {
  if (value === null || value === undefined || value === '') return null
  const n = parseFloat(value)
  return isNaN(n) ? null : n
}

// ============ 喂养记录 ============

/**
 * 记一次喂养
 * body: { babyId, type: formula|breast, amount, duration, time, note }
 */
router.post('/feeding', auth, async (req, res, next) => {
  try {
    const { babyId, type, note } = req.body
    const baby = await resolveBaby(req)
    if (!baby) {
      return res.apiError('请先选择宝宝', 400, 400)
    }

    const feedType = type === 'breast' ? 'breast' : 'formula'
    let amount = req.body.amount !== undefined && req.body.amount !== '' ? parseInt(req.body.amount) : null
    let duration = req.body.duration !== undefined && req.body.duration !== '' ? parseInt(req.body.duration) : null

    if (feedType === 'formula' && (!amount || amount <= 0)) {
      return res.apiError('请输入奶量（毫升）', 400, 400)
    }
    if (feedType === 'breast' && (!duration || duration <= 0)) {
      return res.apiError('请输入喂奶时长（分钟）', 400, 400)
    }
    // 奶粉不记时长、母乳不记奶量，避免展示混乱
    if (feedType === 'formula') duration = null
    if (feedType === 'breast') amount = null

    const time = parseTime(req.body.time)

    const record = await FeedingRecord.create({
      babyId: baby.id,
      userId: req.userId,
      type: feedType,
      amount,
      duration,
      time,
      note: note || '',
    })

    res.apiSuccess({
      id: record.id,
      type: record.type,
      amount: record.amount,
      duration: record.duration,
      timeText: formatTime(record.time),
      timeFull: formatDateTime(record.time),
    })
  } catch (err) {
    next(err)
  }
})

// ============ 换尿片记录 ============

/**
 * 记一次换尿片
 * body: { babyId, type: pee|poo|both, time, note }
 */
router.post('/diaper', auth, async (req, res, next) => {
  try {
    const { babyId, note } = req.body
    const baby = await resolveBaby(req)
    if (!baby) {
      return res.apiError('请先选择宝宝', 400, 400)
    }

    const diaperType = ['pee', 'poo', 'both'].includes(req.body.type) ? req.body.type : 'pee'
    const time = parseTime(req.body.time)

    const record = await DiaperRecord.create({
      babyId: baby.id,
      userId: req.userId,
      type: diaperType,
      time,
      note: note || '',
    })

    res.apiSuccess({
      id: record.id,
      type: record.type,
      typeText: DIAPER_LABEL[record.type],
      timeText: formatTime(record.time),
      timeFull: formatDateTime(record.time),
    })
  } catch (err) {
    next(err)
  }
})

// ============ 睡眠记录 ============

/**
 * 开始睡觉
 * body: { babyId, time }
 */
router.post('/sleep/start', auth, async (req, res, next) => {
  try {
    const { babyId } = req.body
    const baby = await resolveBaby(req)
    if (!baby) {
      return res.apiError('请先选择宝宝', 400, 400)
    }

    // 已有进行中的睡眠，直接返回它（避免重复开启）
    const ongoing = await SleepRecord.findOne({
      where: { babyId: baby.id, recordStatus: 0, status: 1 },
    })
    if (ongoing) {
      return res.apiSuccess({
        id: ongoing.id,
        startAt: formatDateTime(ongoing.startTime),
        startText: formatTime(ongoing.startTime),
        alreadyRunning: true,
      })
    }

    const record = await SleepRecord.create({
      babyId: baby.id,
      userId: req.userId,
      startTime: parseTime(req.body.time),
      recordStatus: 0,
    })

    res.apiSuccess({
      id: record.id,
      startAt: formatDateTime(record.startTime),
      startText: formatTime(record.startTime),
      alreadyRunning: false,
    })
  } catch (err) {
    next(err)
  }
})

/**
 * 起床结束
 * body: { babyId, id, time }
 */
router.post('/sleep/end', auth, async (req, res, next) => {
  try {
    const { babyId, id } = req.body
    const baby = await resolveBaby(req)
    if (!baby) {
      return res.apiError('请先选择宝宝', 400, 400)
    }

    // 优先用传入 id，其次自动找该宝宝进行中的睡眠
    let record = null
    if (id) {
      record = await SleepRecord.findOne({
        where: { id, babyId: baby.id, userId: req.userId, status: 1 },
      })
    } else {
      record = await SleepRecord.findOne({
        where: { babyId: baby.id, recordStatus: 0, status: 1 },
      })
    }

    if (!record) {
      return res.apiError('没有正在进行的睡眠记录', 400, 400)
    }
    if (record.recordStatus === 1) {
      return res.apiError('这次睡眠已经结束过了', 400, 400)
    }

    const endTime = parseTime(req.body.time)
    // 结束时间早于开始时间时，用结束时间兜底为当前时间
    const finalEnd = endTime.getTime() > new Date(record.startTime).getTime() ? endTime : new Date()
    const duration = diffMinutes(record.startTime, finalEnd)

    await record.update({
      endTime: finalEnd,
      duration,
      recordStatus: 1,
    })

    res.apiSuccess({
      id: record.id,
      startText: formatTime(record.startTime),
      endText: formatTime(record.endTime),
      duration,
      durationText: formatDuration(duration),
    })
  } catch (err) {
    next(err)
  }
})

/**
 * 补录一段睡眠（起止时间都给）
 * body: { babyId, startTime, endTime, note }
 */
router.post('/sleep', auth, async (req, res, next) => {
  try {
    const { babyId, note } = req.body
    const baby = await resolveBaby(req)
    if (!baby) {
      return res.apiError('请先选择宝宝', 400, 400)
    }

    const { startTime, endTime } = req.body
    if (!startTime || !endTime) {
      return res.apiError('请填写入睡和起床时间', 400, 400)
    }

    const start = parseTime(startTime)
    const end = parseTime(endTime)
    if (end.getTime() <= start.getTime()) {
      return res.apiError('起床时间要晚于入睡时间', 400, 400)
    }

    const duration = diffMinutes(start, end)
    const record = await SleepRecord.create({
      babyId: baby.id,
      userId: req.userId,
      startTime: start,
      endTime: end,
      duration,
      note: note || '',
      recordStatus: 1,
    })

    res.apiSuccess({
      id: record.id,
      startText: formatTime(record.startTime),
      endText: formatTime(record.endTime),
      duration,
      durationText: formatDuration(duration),
    })
  } catch (err) {
    next(err)
  }
})

// ============ 排气操记录 ============

/**
 * 记一次排气操
 * body: { babyId, duration(分钟), result(0未记|1有排气|2没排气), time, note }
 */
router.post('/exercise', auth, async (req, res, next) => {
  try {
    const { babyId, note } = req.body
    const baby = await resolveBaby(req)
    if (!baby) {
      return res.apiError('请先选择宝宝', 400, 400)
    }

    const duration =
      req.body.duration !== undefined && req.body.duration !== ''
        ? parseInt(req.body.duration)
        : null
    if (!duration || duration <= 0) {
      return res.apiError('请选择做操时长', 400, 400)
    }
    if (duration > 120) {
      return res.apiError('时长看起来不太对，请重新选择', 400, 400)
    }

    // result 只认 0/1/2
    const rawResult = parseInt(req.body.result)
    const result = [1, 2].includes(rawResult) ? rawResult : 0

    const time = parseTime(req.body.time)

    const record = await ExerciseRecord.create({
      babyId: baby.id,
      userId: req.userId,
      duration,
      result,
      time,
      note: note || '',
    })

    res.apiSuccess({
      id: record.id,
      duration: record.duration,
      result: record.result,
      resultText: EXERCISE_RESULT_LABEL[record.result] || '',
      timeText: formatTime(record.time),
      timeFull: formatDateTime(record.time),
    })
  } catch (err) {
    next(err)
  }
})

// ============ 身高体重记录 ============

/**
 * 记一次身高 / 体重
 * body: { babyId, height(cm), weight(kg), time, note }
 * 两个字段至少填一个
 */
router.post('/growth', auth, async (req, res, next) => {
  try {
    const { babyId, note } = req.body
    const baby = await resolveBaby(req)
    if (!baby) {
      return res.apiError('请先选择宝宝', 400, 400)
    }

    const height = toNum(req.body.height)
    const weight = toNum(req.body.weight)

    if (height === null && weight === null) {
      return res.apiError('请至少填写身高或体重', 400, 400)
    }
    // 合理性校验：新生儿一般 40~120cm、1~30kg
    if (height !== null && (height <= 0 || height > 120)) {
      return res.apiError('身高请填写 1~120 之间的数值（cm）', 400, 400)
    }
    if (weight !== null && (weight <= 0 || weight > 30)) {
      return res.apiError('体重请填写 0.5~30 之间的数值（kg）', 400, 400)
    }

    const time = parseTime(req.body.time)

    const record = await GrowthRecord.create({
      babyId: baby.id,
      userId: req.userId,
      height,
      weight,
      time,
      note: note || '',
    })

    res.apiSuccess({
      id: record.id,
      height: toNum(record.height),
      weight: toNum(record.weight),
      timeText: formatTime(record.time),
      timeFull: formatDateTime(record.time),
    })
  } catch (err) {
    next(err)
  }
})

// ============ 体温记录 ============

/**
 * 记一次体温
 * body: { babyId, temperature(℃), method(ear|forehead|armpit|oral), time, note }
 */
router.post('/temperature', auth, async (req, res, next) => {
  try {
    const { babyId, note } = req.body
    const baby = await resolveBaby(req)
    if (!baby) {
      return res.apiError('请先选择宝宝', 400, 400)
    }

    const temperature = toNum(req.body.temperature)
    if (temperature === null) {
      return res.apiError('请输入体温', 400, 400)
    }
    // 35~43℃ 之外基本是输错了
    if (temperature < 35 || temperature > 43) {
      return res.apiError('体温请填写 35~43 之间的数值（℃）', 400, 400)
    }

    const method = Object.keys(TEMP_METHOD_LABEL).includes(req.body.method)
      ? req.body.method
      : 'ear'
    const time = parseTime(req.body.time)

    const record = await TemperatureRecord.create({
      babyId: baby.id,
      userId: req.userId,
      temperature,
      method,
      time,
      note: note || '',
    })

    res.apiSuccess({
      id: record.id,
      temperature: toNum(record.temperature),
      method: record.method,
      methodText: TEMP_METHOD_LABEL[record.method] || '',
      isFever: toNum(record.temperature) >= 37.3,
      timeText: formatTime(record.time),
      timeFull: formatDateTime(record.time),
    })
  } catch (err) {
    next(err)
  }
})

// ============ 时间线 ============

/**
 * 某天的时间线
 * GET /api/records/timeline?babyId=1&date=2026-10-21
 */
router.get('/timeline', auth, async (req, res, next) => {
  try {
    const baby = await resolveBaby(req)
    if (!baby) {
      return res.apiError('请先选择宝宝', 400, 400)
    }

    const day = safeDate(req.query.date)
    const from = startOfDay(day)
    const to = endOfDay(day)

    const [feedings, diapers, sleeps, exercises, growths, temperatures] = await Promise.all([
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
      ExerciseRecord.findAll({
        where: { babyId: baby.id, time: { [Op.between]: [from, to] }, status: 1 },
        raw: true,
      }),
      GrowthRecord.findAll({
        where: { babyId: baby.id, time: { [Op.between]: [from, to] }, status: 1 },
        raw: true,
      }),
      TemperatureRecord.findAll({
        where: { babyId: baby.id, time: { [Op.between]: [from, to] }, status: 1 },
        raw: true,
      }),
    ])

    const list = []

    feedings.forEach((r) => {
      const t = new Date(r.time).getTime()
      list.push({
        id: r.id,
        kind: 'feeding',
        type: r.type,
        icon: r.type === 'formula' ? '🍼' : '🤱',
        title: r.type === 'formula' ? `奶粉 ${r.amount}ml` : `母乳 ${r.duration}分钟`,
        subtitle: r.type === 'formula' ? '奶瓶喂养' : '亲喂',
        amount: r.amount,
        duration: r.duration,
        note: r.note || '',
        timeText: formatTime(r.time),
        timeFull: formatDateTime(r.time),
        sortKey: t,
      })
    })

    diapers.forEach((r) => {
      const t = new Date(r.time).getTime()
      list.push({
        id: r.id,
        kind: 'diaper',
        type: r.type,
        icon: DIAPER_ICON[r.type] || '💧',
        title: DIAPER_LABEL[r.type] || '换尿片',
        subtitle: '换尿片',
        note: r.note || '',
        timeText: formatTime(r.time),
        timeFull: formatDateTime(r.time),
        sortKey: t,
      })
    })

    sleeps.forEach((r) => {
      const t = new Date(r.startTime).getTime()
      list.push({
        id: r.id,
        kind: 'sleep',
        icon: '😴',
        title: `睡了 ${formatDuration(r.duration)}`,
        subtitle: `${formatTime(r.startTime)} → ${formatTime(r.endTime)}`,
        duration: r.duration,
        durationText: formatDuration(r.duration),
        note: r.note || '',
        timeText: formatTime(r.startTime),
        timeFull: formatDateTime(r.startTime),
        sortKey: t,
      })
    })

    exercises.forEach((r) => {
      const t = new Date(r.time).getTime()
      const resultText = EXERCISE_RESULT_LABEL[r.result] || ''
      list.push({
        id: r.id,
        kind: 'exercise',
        icon: '🤸',
        title: `排气操 ${r.duration}分钟`,
        subtitle: resultText ? `做操 · ${resultText}` : '做操',
        duration: r.duration,
        result: r.result,
        note: r.note || '',
        timeText: formatTime(r.time),
        timeFull: formatDateTime(r.time),
        sortKey: t,
      })
    })

    growths.forEach((r) => {
      const t = new Date(r.time).getTime()
      const height = toNum(r.height)
      const weight = toNum(r.weight)
      const parts = []
      if (height !== null) parts.push(`身高 ${height}cm`)
      if (weight !== null) parts.push(`体重 ${weight}kg`)
      list.push({
        id: r.id,
        kind: 'growth',
        icon: '📏',
        title: parts.join(' · ') || '生长记录',
        subtitle: '身高体重',
        height,
        weight,
        note: r.note || '',
        timeText: formatTime(r.time),
        timeFull: formatDateTime(r.time),
        sortKey: t,
      })
    })

    temperatures.forEach((r) => {
      const t = new Date(r.time).getTime()
      const temp = toNum(r.temperature)
      const isFever = temp !== null && temp >= 37.3
      list.push({
        id: r.id,
        kind: 'temperature',
        icon: isFever ? '🤒' : '🌡️',
        title: `${temp}℃`,
        subtitle: `${TEMP_METHOD_LABEL[r.method] || '体温'}${isFever ? ' · 偏高' : ''}`,
        temperature: temp,
        method: r.method,
        isFever,
        note: r.note || '',
        timeText: formatTime(r.time),
        timeFull: formatDateTime(r.time),
        sortKey: t,
      })
    })

    // 最新的排最上面
    list.sort((a, b) => b.sortKey - a.sortKey)

    // 正在进行的睡眠（可能跨天，不限制日期）
    const ongoing = await SleepRecord.findOne({
      where: { babyId: baby.id, recordStatus: 0, status: 1 },
      raw: true,
    })

    res.apiSuccess({
      date: formatDate(day),
      list,
      ongoing: ongoing
        ? {
            id: ongoing.id,
            startText: formatTime(ongoing.startTime),
            startFull: formatDateTime(ongoing.startTime),
            elapsedMinutes: diffMinutes(ongoing.startTime, new Date()),
            elapsedText: formatDuration(diffMinutes(ongoing.startTime, new Date())),
          }
        : null,
    })
  } catch (err) {
    next(err)
  }
})

// ============ 删除 ============

/**
 * 删除记录
 * DELETE /api/records/:type/:id
 */
router.delete('/:type/:id', auth, async (req, res, next) => {
  try {
    const { type, id } = req.params
    const modelMap = {
      feeding: FeedingRecord,
      diaper: DiaperRecord,
      sleep: SleepRecord,
      exercise: ExerciseRecord,
      growth: GrowthRecord,
      temperature: TemperatureRecord,
    }
    const Model = modelMap[type]
    if (!Model) {
      return res.apiError('记录类型不正确', 400, 400)
    }

    const record = await Model.findOne({ where: { id, userId: req.userId, status: 1 } })
    if (!record) {
      return res.apiError('记录不存在', 404, 404)
    }

    await record.update({ status: 0 })
    res.apiSuccess({ id: record.id })
  } catch (err) {
    next(err)
  }
})

module.exports = router
