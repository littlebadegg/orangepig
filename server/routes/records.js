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
 * POST   /api/records/water        — 记一次喂水（毫升选填）
 * POST   /api/records/supplement   — 记一次喂养品（AD / D3 / 自定义名）
 * GET    /api/records/custom-feeds    — 自定义喂养项列表
 * POST   /api/records/custom-feeds    — 添加自定义喂养项（当天没喂会醒目提醒）
 * DELETE /api/records/custom-feeds/:id — 删除自定义喂养项
 * GET    /api/records/timeline     — 某天的时间线（默认今天）
 * PUT    /api/records/:type/:id    — 修改记录
 * DELETE /api/records/:type/:id    — 删除记录
 *        type: feeding|diaper|sleep|exercise|growth|temperature|spitup|bath|water|supplement
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
  formatDateTime,
  formatTime,
  formatDate,
  formatDuration,
  diffMinutes,
  startOfDay,
  endOfDay,
  safeDate,
} = require('../utils/time')

const { resolveBaby, buildRecorderMap, isBabyOwner, findOwnBaby } = require('../utils/baby')
const { sleepOverlapWhere, sleepSegmentsOfDay } = require('../utils/sleep')

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
// 吐奶量：1 少量 / 2 中量 / 3 大量
const SPIT_UP_LABEL = { 1: '少量', 2: '中量', 3: '大量' }

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
    // 注意：睡眠是「宝宝的状态」，不归属某个记录人 ——
    // 爸爸按了「睡觉」，妈妈/奶奶同样可以按「起床」，所以这里不限制 userId
    let record = null
    if (id) {
      record = await SleepRecord.findOne({
        where: { id, babyId: baby.id, status: 1 },
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

// ============ 吐奶记录 ============

/**
 * 记一次吐奶
 * body: { babyId, level(1少量|2中量|3大量), time, note }
 */
router.post('/spitup', auth, async (req, res, next) => {
  try {
    const { note } = req.body
    const baby = await resolveBaby(req)
    if (!baby) {
      return res.apiError('请先选择宝宝', 400, 400)
    }

    const rawLevel = parseInt(req.body.level)
    const level = [1, 2, 3].includes(rawLevel) ? rawLevel : 1
    const time = parseTime(req.body.time)

    const record = await SpitUpRecord.create({
      babyId: baby.id,
      userId: req.userId,
      level,
      time,
      note: note || '',
    })

    res.apiSuccess({
      id: record.id,
      level: record.level,
      levelText: SPIT_UP_LABEL[record.level] || '',
      timeText: formatTime(record.time),
      timeFull: formatDateTime(record.time),
    })
  } catch (err) {
    next(err)
  }
})

// ============ 洗澡记录 ============

/**
 * 记一次洗澡
 * body: { babyId, duration(分钟,选填), waterTemp(℃,选填), time, note }
 */
router.post('/bath', auth, async (req, res, next) => {
  try {
    const { note } = req.body
    const baby = await resolveBaby(req)
    if (!baby) {
      return res.apiError('请先选择宝宝', 400, 400)
    }

    // 时长选填：不传 / 传空 / 传 null 都表示「只记洗了，不记多久」
    const rawDuration = req.body.duration
    const duration =
      rawDuration !== undefined && rawDuration !== null && rawDuration !== ''
        ? parseInt(rawDuration)
        : null
    if (duration !== null && (isNaN(duration) || duration <= 0 || duration > 120)) {
      return res.apiError('洗澡时长请填写 1~120 之间的数值（分钟）', 400, 400)
    }

    const waterTemp = toNum(req.body.waterTemp)
    if (waterTemp !== null && (waterTemp < 20 || waterTemp > 45)) {
      return res.apiError('水温请填写 20~45 之间的数值（℃）', 400, 400)
    }

    const time = parseTime(req.body.time)

    const record = await BathRecord.create({
      babyId: baby.id,
      userId: req.userId,
      duration,
      waterTemp,
      time,
      note: note || '',
    })

    res.apiSuccess({
      id: record.id,
      duration: record.duration,
      durationText: record.duration ? formatDuration(record.duration) : '',
      waterTemp: toNum(record.waterTemp),
      timeText: formatTime(record.time),
      timeFull: formatDateTime(record.time),
    })
  } catch (err) {
    next(err)
  }
})

// ============ 喂水记录 ============

/**
 * 记一次喂水
 * body: { babyId, amount(毫升,选填), time, note }
 */
router.post('/water', auth, async (req, res, next) => {
  try {
    const { note } = req.body
    const baby = await resolveBaby(req)
    if (!baby) {
      return res.apiError('请先选择宝宝', 400, 400)
    }

    const amount =
      req.body.amount !== undefined && req.body.amount !== ''
        ? parseInt(req.body.amount)
        : null
    if (amount !== null && (isNaN(amount) || amount <= 0 || amount > 500)) {
      return res.apiError('水量请填写 1~500 之间的数值（ml）', 400, 400)
    }

    const time = parseTime(req.body.time)

    const record = await WaterRecord.create({
      babyId: baby.id,
      userId: req.userId,
      amount,
      time,
      note: note || '',
    })

    res.apiSuccess({
      id: record.id,
      amount: record.amount,
      timeText: formatTime(record.time),
      timeFull: formatDateTime(record.time),
    })
  } catch (err) {
    next(err)
  }
})

// ============ 喂养品记录（AD / D3 / 自定义） ============

/** 名称归一化：前后空格 + 最长 30 字；「维生素AD」统一成 AD */
function normalizeSupplementName(raw) {
  let name = String(raw || '').trim().slice(0, 30)
  if (!name) return ''
  if (name === '维生素AD' || name === '维生素AD滴剂' || name.toLowerCase() === 'ad') {
    name = 'AD'
  }
  return name
}

/**
 * 记一次喂养品
 * body: { babyId, name(AD|D3|自定义), time, note }
 */
router.post('/supplement', auth, async (req, res, next) => {
  try {
    const { note } = req.body
    const baby = await resolveBaby(req)
    if (!baby) {
      return res.apiError('请先选择宝宝', 400, 400)
    }

    const name = normalizeSupplementName(req.body.name)
    if (!name) {
      return res.apiError('请选择或输入喂的什么（如 AD）', 400, 400)
    }

    const time = parseTime(req.body.time)

    const record = await SupplementRecord.create({
      babyId: baby.id,
      userId: req.userId,
      name,
      time,
      note: note || '',
    })

    res.apiSuccess({
      id: record.id,
      name: record.name,
      timeText: formatTime(record.time),
      timeFull: formatDateTime(record.time),
    })
  } catch (err) {
    next(err)
  }
})

// ============ 自定义喂养项配置 ============

/**
 * 自定义喂养项列表（宝宝维度）
 * GET /api/records/custom-feeds
 */
router.get('/custom-feeds', auth, async (req, res, next) => {
  try {
    const baby = await resolveBaby(req)
    if (!baby) {
      return res.apiError('请先选择宝宝', 400, 400)
    }

    const list = await CustomFeed.findAll({
      where: { babyId: baby.id, status: 1 },
      order: [['id', 'ASC']],
    })

    res.apiSuccess({
      list: list.map((c) => ({ id: c.id, name: c.name })),
    })
  } catch (err) {
    next(err)
  }
})

/**
 * 添加自定义喂养项（之后每天没喂会在首页醒目提醒）
 * body: { name }
 */
router.post('/custom-feeds', auth, async (req, res, next) => {
  try {
    const baby = await resolveBaby(req)
    if (!baby) {
      return res.apiError('请先选择宝宝', 400, 400)
    }

    const name = normalizeSupplementName(req.body.name)
    if (!name) {
      return res.apiError('请输入喂养项名称', 400, 400)
    }

    const existing = await CustomFeed.findOne({
      where: { babyId: baby.id, name, status: 1 },
    })
    if (existing) {
      return res.apiSuccess({ id: existing.id, name: existing.name, existed: true })
    }

    const item = await CustomFeed.create({ babyId: baby.id, name })
    res.apiSuccess({ id: item.id, name: item.name, existed: false })
  } catch (err) {
    next(err)
  }
})

/**
 * 删除自定义喂养项（软删，之后不再提醒）
 * DELETE /api/records/custom-feeds/:id
 */
router.delete('/custom-feeds/:id', auth, async (req, res, next) => {
  try {
    const baby = await resolveBaby(req)
    if (!baby) {
      return res.apiError('请先选择宝宝', 400, 400)
    }

    const item = await CustomFeed.findOne({
      where: { id: req.params.id, babyId: baby.id, status: 1 },
    })
    if (!item) {
      return res.apiError('喂养项不存在', 404, 404)
    }

    await item.update({ status: 0 })
    res.apiSuccess({ id: item.id })
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

    const [feedings, diapers, sleeps, exercises, growths, temperatures, spitUps, baths, waters, supplements, recorderMap] =
      await Promise.all([
        FeedingRecord.findAll({
          where: { babyId: baby.id, time: { [Op.between]: [from, to] }, status: 1 },
          raw: true,
        }),
        DiaperRecord.findAll({
          where: { babyId: baby.id, time: { [Op.between]: [from, to] }, status: 1 },
          raw: true,
        }),
        // 跨天的睡眠两天都要能查到（再按天切分成两段展示）
        SleepRecord.findAll({
          where: sleepOverlapWhere(baby.id, from, to),
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
        SpitUpRecord.findAll({
          where: { babyId: baby.id, time: { [Op.between]: [from, to] }, status: 1 },
          raw: true,
        }),
        BathRecord.findAll({
          where: { babyId: baby.id, time: { [Op.between]: [from, to] }, status: 1 },
          raw: true,
        }),
        WaterRecord.findAll({
          where: { babyId: baby.id, time: { [Op.between]: [from, to] }, status: 1 },
          raw: true,
        }),
        SupplementRecord.findAll({
          where: { babyId: baby.id, time: { [Op.between]: [from, to] }, status: 1 },
          raw: true,
        }),
        // 谁记的 —— 家人一起记的时候能看出这条是谁录的
        buildRecorderMap(baby.id),
      ])

    const list = []

    // 记录人昵称：家人一起记的时候能看出这条是谁录的
    const recorder = (r) => recorderMap[r.userId] || ''

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
        recorder: recorder(r),
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
        recorder: recorder(r),
        timeText: formatTime(r.time),
        timeFull: formatDateTime(r.time),
        sortKey: t,
      })
    })

    // 睡眠：跨夜的拆成两段，昨天那段算昨天、今天那段算今天
    sleepSegmentsOfDay(sleeps, from, to).forEach((seg) => {
      const r = seg.row
      const t = seg.start.getTime()
      const whole = r.duration || diffMinutes(r.startTime, r.endTime)
      // 跨夜的另一半：carryIn 说明是昨夜入睡的，carryOut 说明睡到明天才起
      const otherTime = seg.carryIn ? formatTime(r.startTime) : formatTime(r.endTime)
      const tagText = seg.carryIn
        ? `昨夜 ${otherTime} 入睡 · 整夜 ${formatDuration(whole)}`
        : seg.carryOut
          ? `次日 ${otherTime} 起床 · 整夜 ${formatDuration(whole)}`
          : ''
      const segEndText = seg.carryOut ? '24:00' : formatTime(seg.end)

      list.push({
        id: r.id,
        kind: 'sleep',
        icon: '😴',
        // 同一段睡眠在两天的记录里各占一条，用 part 区分，避免列表 key 冲突
        part: seg.carryIn ? 'in' : seg.carryOut ? 'out' : 'whole',
        title: `睡了 ${formatDuration(seg.minutes)}`,
        subtitle: `${formatTime(seg.start)} → ${segEndText}`,
        tagText,
        crossNight: seg.carryIn || seg.carryOut,
        // 当天这段的时长（统计用这个，不是整夜时长）
        duration: seg.minutes,
        durationText: formatDuration(seg.minutes),
        wholeDuration: whole,
        wholeDurationText: formatDuration(whole),
        // 编辑时改的是整条睡眠记录，所以要带上完整起止
        startHM: formatTime(r.startTime),
        endHM: formatTime(r.endTime),
        startAt: formatDateTime(r.startTime),
        endAt: formatDateTime(r.endTime),
        note: r.note || '',
        recorder: recorder(r),
        timeText: formatTime(seg.start),
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
        recorder: recorder(r),
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
        recorder: recorder(r),
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
        recorder: recorder(r),
        timeText: formatTime(r.time),
        timeFull: formatDateTime(r.time),
        sortKey: t,
      })
    })

    spitUps.forEach((r) => {
      const t = new Date(r.time).getTime()
      const levelText = SPIT_UP_LABEL[r.level] || '少量'
      list.push({
        id: r.id,
        kind: 'spitup',
        icon: '🤮',
        title: `吐奶 · ${levelText}`,
        subtitle: '吐奶',
        level: r.level,
        note: r.note || '',
        recorder: recorder(r),
        timeText: formatTime(r.time),
        timeFull: formatDateTime(r.time),
        sortKey: t,
      })
    })

    baths.forEach((r) => {
      const t = new Date(r.time).getTime()
      const temp = toNum(r.waterTemp)
      const parts = []
      if (r.duration) parts.push(`${r.duration}分钟`)
      if (temp !== null) parts.push(`${temp}℃`)
      list.push({
        id: r.id,
        kind: 'bath',
        icon: '🛁',
        title: `洗澡${parts.length > 0 ? ' · ' + parts.join(' · ') : ''}`,
        subtitle: '洗澡',
        duration: r.duration,
        waterTemp: temp,
        note: r.note || '',
        recorder: recorder(r),
        timeText: formatTime(r.time),
        timeFull: formatDateTime(r.time),
        sortKey: t,
      })
    })

    waters.forEach((r) => {
      const t = new Date(r.time).getTime()
      list.push({
        id: r.id,
        kind: 'water',
        icon: '🚰',
        title: r.amount ? `喂水 ${r.amount}ml` : '喂水',
        subtitle: '喂水',
        amount: r.amount,
        note: r.note || '',
        recorder: recorder(r),
        timeText: formatTime(r.time),
        timeFull: formatDateTime(r.time),
        sortKey: t,
      })
    })

    supplements.forEach((r) => {
      const t = new Date(r.time).getTime()
      const label = r.name === 'AD' ? '维生素AD' : r.name
      list.push({
        id: r.id,
        kind: 'supplement',
        icon: '💊',
        title: label,
        subtitle: '喂养品',
        name: r.name,
        note: r.note || '',
        recorder: recorder(r),
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

// ============ 修改 ============

/**
 * 修改记录
 * PUT /api/records/:type/:id
 * body 里只传需要改的字段；校验规则与创建时保持一致
 */
router.put('/:type/:id', auth, async (req, res, next) => {
  try {
    const { type, id } = req.params
    const modelMap = {
      feeding: FeedingRecord,
      diaper: DiaperRecord,
      sleep: SleepRecord,
      exercise: ExerciseRecord,
      growth: GrowthRecord,
      temperature: TemperatureRecord,
      spitup: SpitUpRecord,
      bath: BathRecord,
      water: WaterRecord,
      supplement: SupplementRecord,
    }
    const Model = modelMap[type]
    if (!Model) {
      return res.apiError('记录类型不正确', 400, 400)
    }

    const record = await Model.findOne({ where: { id, status: 1 } })
    if (!record) {
      return res.apiError('记录不存在', 404, 404)
    }

    // 权限与删除一致：创建者能改整只宝宝，家人只能改自己记的
    const baby = await findOwnBaby(record.babyId, req.userId)
    if (!baby) {
      return res.apiError('记录不存在', 404, 404)
    }
    const owner = await isBabyOwner(record.babyId, req.userId)
    // 睡眠是宝宝的状态（谁都能帮着按起床），所以允许家人修改；
    // 其余记录仍只允许本人（或宝宝创建者）修改
    if (record.userId !== req.userId && !owner && type !== 'sleep') {
      return res.apiError('家人只能修改自己记录的内容', 403, 403)
    }

    const body = req.body || {}
    const patch = {}

    // 备注通用
    if (body.note !== undefined) {
      patch.note = String(body.note || '').slice(0, 200)
    }

    switch (type) {
      case 'feeding': {
        const feedType =
          body.type === 'breast' || body.type === 'formula' ? body.type : record.type
        patch.type = feedType
        if (feedType === 'formula') {
          const amount =
            body.amount !== undefined && body.amount !== ''
              ? parseInt(body.amount)
              : parseInt(record.amount)
          if (!amount || amount <= 0 || amount > 2000) {
            return res.apiError('请输入奶量（毫升）', 400, 400)
          }
          patch.amount = amount
          patch.duration = null
        } else {
          const duration =
            body.duration !== undefined && body.duration !== ''
              ? parseInt(body.duration)
              : parseInt(record.duration)
          if (!duration || duration <= 0 || duration > 180) {
            return res.apiError('请输入喂奶时长（分钟）', 400, 400)
          }
          patch.duration = duration
          patch.amount = null
        }
        break
      }

      case 'diaper': {
        patch.type = ['pee', 'poo', 'both'].includes(body.type) ? body.type : record.type
        break
      }

      case 'exercise': {
        const duration =
          body.duration !== undefined && body.duration !== ''
            ? parseInt(body.duration)
            : parseInt(record.duration)
        if (!duration || duration <= 0 || duration > 120) {
          return res.apiError('请选择做操时长', 400, 400)
        }
        patch.duration = duration
        if (body.result !== undefined) {
          const raw = parseInt(body.result)
          patch.result = [1, 2].includes(raw) ? raw : 0
        }
        break
      }

      case 'growth': {
        const height = body.height !== undefined ? toNum(body.height) : toNum(record.height)
        const weight = body.weight !== undefined ? toNum(body.weight) : toNum(record.weight)
        if (height === null && weight === null) {
          return res.apiError('请至少填写身高或体重', 400, 400)
        }
        if (height !== null && (height <= 0 || height > 120)) {
          return res.apiError('身高请填写 1~120 之间的数值（cm）', 400, 400)
        }
        if (weight !== null && (weight <= 0 || weight > 30)) {
          return res.apiError('体重请填写 0.5~30 之间的数值（kg）', 400, 400)
        }
        patch.height = height
        patch.weight = weight
        break
      }

      case 'temperature': {
        const temp =
          body.temperature !== undefined && body.temperature !== ''
            ? toNum(body.temperature)
            : toNum(record.temperature)
        if (temp === null || temp < 35 || temp > 43) {
          return res.apiError('体温请填写 35~43 之间的数值（℃）', 400, 400)
        }
        patch.temperature = temp
        if (body.method !== undefined) {
          patch.method = Object.keys(TEMP_METHOD_LABEL).includes(body.method)
            ? body.method
            : record.method
        }
        break
      }

      case 'spitup': {
        const raw = parseInt(body.level)
        patch.level = [1, 2, 3].includes(raw) ? raw : record.level
        break
      }

      case 'water': {
        if (body.amount !== undefined) {
          const raw = body.amount
          if (raw === null || raw === '' || parseInt(raw) === 0) {
            patch.amount = null
          } else {
            const a = parseInt(raw)
            if (isNaN(a) || a <= 0 || a > 500) {
              return res.apiError('水量请填写 1~500 之间的数值（ml）', 400, 400)
            }
            patch.amount = a
          }
        }
        break
      }

      case 'supplement': {
        if (body.name !== undefined) {
          const name = normalizeSupplementName(body.name)
          if (!name) {
            return res.apiError('请选择或输入喂的什么（如 AD）', 400, 400)
          }
          patch.name = name
        }
        break
      }

      case 'bath': {
        if (body.duration !== undefined) {
          const raw = body.duration
          if (raw === null || raw === '' || parseInt(raw) === 0) {
            patch.duration = null
          } else {
            const d = parseInt(raw)
            if (isNaN(d) || d <= 0 || d > 120) {
              return res.apiError('洗澡时长请填写 1~120 之间的数值（分钟）', 400, 400)
            }
            patch.duration = d
          }
        }
        if (body.waterTemp !== undefined) {
          const w = toNum(body.waterTemp)
          if (w !== null && (w < 20 || w > 45)) {
            return res.apiError('水温请填写 20~45 之间的数值（℃）', 400, 400)
          }
          patch.waterTemp = w
        }
        break
      }

      case 'sleep': {
        const start = body.startTime ? parseTime(body.startTime) : new Date(record.startTime)
        const end = body.endTime
          ? parseTime(body.endTime)
          : record.endTime
            ? new Date(record.endTime)
            : new Date()
        if (end.getTime() <= start.getTime()) {
          return res.apiError('起床时间要晚于入睡时间', 400, 400)
        }
        patch.startTime = start
        patch.endTime = end
        patch.duration = diffMinutes(start, end)
        patch.recordStatus = 1
        break
      }

      default:
        return res.apiError('记录类型不正确', 400, 400)
    }

    // 除睡眠外，统一 time 字段
    if (type !== 'sleep' && body.time !== undefined && body.time !== '') {
      patch.time = parseTime(body.time)
    }

    await record.update(patch)
    res.apiSuccess({ id: record.id, kind: type })
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
      spitup: SpitUpRecord,
      bath: BathRecord,
      water: WaterRecord,
      supplement: SupplementRecord,
    }
    const Model = modelMap[type]
    if (!Model) {
      return res.apiError('记录类型不正确', 400, 400)
    }

    const record = await Model.findOne({ where: { id, status: 1 } })
    if (!record) {
      return res.apiError('记录不存在', 404, 404)
    }

    // 得先确认这个宝宝跟自己有关系
    const baby = await findOwnBaby(record.babyId, req.userId)
    if (!baby) {
      return res.apiError('记录不存在', 404, 404)
    }

    // 创建者能删宝宝的全部记录；被邀请的家人只能删自己记的那条
    // 睡眠例外：任何家人都能删（谁按的起床谁负责收拾）
    const owner = await isBabyOwner(record.babyId, req.userId)
    if (record.userId !== req.userId && !owner && type !== 'sleep') {
      return res.apiError('家人只能删除自己记录的内容', 403, 403)
    }

    await record.update({ status: 0 })
    res.apiSuccess({ id: record.id })
  } catch (err) {
    next(err)
  }
})

module.exports = router
