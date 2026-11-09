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
const { sleepOverlapWhere, sleepSegmentsOfDay, clipSleep } = require('../utils/sleep')
const { isVitaminDName } = require('../utils/supplement')
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

/** 生成「与上一天对比」的差值文案 */
function deltaOf(cur, prev, unit) {
  const d = cur - prev
  if (d === 0) return { dir: 'flat', text: '持平' }
  if (d > 0) return { dir: 'up', text: `+${d}${unit}` }
  return { dir: 'down', text: `${d}${unit}` }
}

/** 时长版差值文案（分钟 → +30分钟 / -1小时15分） */
function deltaOfDuration(cur, prev) {
  const d = cur - prev
  if (d === 0) return { dir: 'flat', text: '持平' }
  if (d > 0) return { dir: 'up', text: `+${formatDuration(d)}` }
  return { dir: 'down', text: `-${formatDuration(-d)}` }
}

/**
 * 某天的核心汇总（喂养次数 / 奶粉量 / 母乳时长 / 尿片 / 睡眠）
 * daily 的「与上一天对比」用它查前一天，避免重复写查询
 */
async function daySummary(babyId, day) {
  const from = startOfDay(day)
  const to = endOfDay(day)
  const [feedings, diapers, sleeps] = await Promise.all([
    FeedingRecord.findAll({
      where: { babyId, time: { [Op.between]: [from, to] }, status: 1 },
      raw: true,
    }),
    DiaperRecord.findAll({
      where: { babyId, time: { [Op.between]: [from, to] }, status: 1 },
      raw: true,
    }),
    SleepRecord.findAll({
      where: sleepOverlapWhere(babyId, from, to),
      raw: true,
    }),
  ])
  const sleepSegs = sleepSegmentsOfDay(sleeps, from, to)
  return {
    feedingCount: feedings.length,
    totalAmount: feedings
      .filter((f) => f.type === 'formula')
      .reduce((sum, f) => sum + (f.amount || 0), 0),
    breastMinutes: feedings
      .filter((f) => f.type === 'breast')
      .reduce((sum, f) => sum + (f.duration || 0), 0),
    diaperCount: diapers.length,
    sleepMinutes: sleepSegs.reduce((sum, s) => sum + s.minutes, 0),
  }
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
      // 跨天的睡眠拆到各天统计，所以按「与区间有交集」查
      SleepRecord.findAll({
        where: sleepOverlapWhere(baby.id, from, to),
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

    // 睡眠（跨夜只算当天那段；进行中的那段同样按天裁剪）
    const sleepSegs = sleepSegmentsOfDay(sleeps, from, to)
    const sleepMinutes = sleepSegs.reduce((sum, s) => sum + s.minutes, 0)
    const ongoing = await SleepRecord.findOne({
      where: { babyId: baby.id, recordStatus: 0, status: 1 },
      raw: true,
    })
    const ongoingSeg = ongoing ? clipSleep(ongoing.startTime, null, from, to) : null
    const ongoingMinutes = ongoingSeg ? ongoingSeg.minutes : 0

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
    // AD 和 D3 属于同一类，吃一种就算喂过了
    const hasAd = supplementNames.includes('AD')
    const hasVitaminD = supplementNames.some((n) => isVitaminDName(n))

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

      // 2. 今天维生素 AD / D3 都还没喂（吃一种就够，合并成一条提醒）
      if (!hasVitaminD) {
        reminders.push({
          type: 'ad',
          level: 'urgent',
          icon: '💊',
          text: '今天的维生素AD / D3 还没喂，吃一种就可以',
          action: 'supplement',
          actionText: '去喂AD/D3',
        })
      }

      // 3. 自定义喂养项今天没喂的逐个提醒
      const customFeeds = await CustomFeed.findAll({
        where: { babyId: baby.id, status: 1 },
        order: [['id', 'ASC']],
        raw: true,
      })
      customFeeds.forEach((c) => {
        // AD / D3 已经在上面合并提醒过，不再单独提醒
        if (isVitaminDName(c.name)) return
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

    // ========== 与上一天对比 ==========
    // 核心维度取同口径：奶粉奶量 / 喂养次数 / 母乳时长 / 尿片 / 睡眠（今天含进行中那段）
    const prevDay = new Date(day.getTime() - 86400000)
    const prev = await daySummary(baby.id, prevDay)
    const compareItems = [
      {
        key: 'amount',
        icon: '🍼',
        label: '奶粉奶量',
        value: `${totalAmount}ml`,
        ...deltaOf(totalAmount, prev.totalAmount, 'ml'),
      },
      {
        key: 'feeding',
        icon: '🍼',
        label: '喂养次数',
        value: `${feedings.length}次`,
        ...deltaOf(feedings.length, prev.feedingCount, '次'),
      },
    ]
    // 母乳：两天都没喂就不展示这项
    if (breastMinutes > 0 || prev.breastMinutes > 0) {
      compareItems.push({
        key: 'breast',
        icon: '🤱',
        label: '母乳时长',
        value: formatDuration(breastMinutes),
        ...deltaOfDuration(breastMinutes, prev.breastMinutes),
      })
    }
    compareItems.push(
      {
        key: 'diaper',
        icon: '🧷',
        label: '换尿片',
        value: `${diapers.length}次`,
        ...deltaOf(diapers.length, prev.diaperCount, '次'),
      },
      {
        key: 'sleep',
        icon: '😴',
        label: '睡眠',
        value: formatDuration(sleepMinutes + ongoingMinutes),
        ...deltaOfDuration(sleepMinutes + ongoingMinutes, prev.sleepMinutes),
      }
    )

    res.apiSuccess({
      date: formatDate(day),
      feeding: {
        count: feedings.length,
        formulaCount: formulaList.length,
        breastCount: breastList.length,
        totalAmount,
        avgAmount: formulaList.length > 0 ? Math.round(totalAmount / formulaList.length) : 0,
        breastMinutes,
        breastMinutesText: breastMinutes > 0 ? formatDuration(breastMinutes) : '',
        lastFeeding,
      },
      diaper: {
        count: diapers.length,
        peeCount: diapers.filter((d) => d.type === 'pee' || d.type === 'both').length,
        pooCount: diapers.filter((d) => d.type === 'poo' || d.type === 'both').length,
        lastDiaper,
      },
      sleep: {
        count: sleepSegs.length,
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
        // AD / D3 吃一种就算补过维生素 D
        hasVitaminD,
        lastText: supplements.length > 0 ? formatTime(supplements[0].time) : '',
      },
      // 今日醒目提醒（喂水 / AD / 自定义喂养项），历史日期为空数组
      reminders,
      // 与上一天对比（prevDate 为对比的那天，items 为各维度差值）
      compare: {
        prevDate: formatDate(prevDay),
        items: compareItems,
      },
      // 每日养育评分（0~100，含各维度得分、加减分明细与建议）
      score: computeScore({
        feedings,
        diapers,
        sleeps: sleepSegs,
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
 * 24 小时时钟盘：颜色与文案统一在这里定义，前端图例直接用
 * 睡眠绿 / 奶粉蓝 / 母乳浅蓝 / 尿片黄 / 排气操橙 / 洗澡青 / 体温红 / 吐奶紫 / 喂水薄荷 / 喂养品粉
 */
const CLOCK_META = {
  sleep: { label: '睡觉', icon: '😴', color: '#7BC47F' },
  formula: { label: '奶粉', icon: '🍼', color: '#4A90E2' },
  breast: { label: '母乳', icon: '🤱', color: '#8ECAE6' },
  diaper: { label: '换尿片', icon: '🧷', color: '#F2C14E' },
  exercise: { label: '排气操', icon: '🤸', color: '#FF9F43' },
  bath: { label: '洗澡', icon: '🛁', color: '#4ECDC4' },
  temperature: { label: '体温', icon: '🌡️', color: '#E76F51' },
  spitup: { label: '吐奶', icon: '🤮', color: '#9B7EDE' },
  water: { label: '喂水', icon: '🚰', color: '#76C7C0' },
  supplement: { label: '喂养品', icon: '💊', color: '#D98CB3' },
}

/**
 * 事件在外环上的「示意宽度」（分钟）
 * 瞬时事件本身没有时长，画弧时用固定宽度体现到环上
 */
const CLOCK_EXHIBIT_MIN = {
  formula: 25,
  breast: 25,
  diaper: 12,
  temperature: 6,
  spitup: 6,
  water: 6,
  supplement: 6,
}

const DIAPER_TEXT = { pee: '小便', poo: '大便', both: '大小便' }

/** 某时刻在当天第几分钟（0~1440） */
function minuteOf(date, dayStart) {
  const m = Math.round((new Date(date).getTime() - dayStart.getTime()) / 60000)
  return Math.max(0, Math.min(1440, m))
}

/** 分钟数 → HH:mm（1440 显示 24:00） */
function minuteText(min) {
  const m = Math.max(0, Math.min(1440, Math.round(min)))
  if (m === 1440) return '24:00'
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/** 合并区间求覆盖分钟数（睡眠/排气操/洗澡可能重叠） */
function unionMinutes(ranges) {
  if (!ranges.length) return 0
  const sorted = [...ranges].sort((a, b) => a.start - b.start)
  let total = 0
  let curStart = sorted[0].start
  let curEnd = sorted[0].end
  for (let i = 1; i < sorted.length; i++) {
    const r = sorted[i]
    if (r.start <= curEnd) {
      curEnd = Math.max(curEnd, r.end)
    } else {
      total += curEnd - curStart
      curStart = r.start
      curEnd = r.end
    }
  }
  total += curEnd - curStart
  return total
}

/**
 * 一天的 24 小时时钟盘数据
 * GET /api/stats/clock?babyId=1&date=2026-11-08
 */
router.get('/clock', auth, async (req, res, next) => {
  try {
    const baby = await resolveBaby(req)
    if (!baby) {
      return res.apiError('请先选择宝宝', 400, 400)
    }

    const day = safeDate(req.query.date)
    const from = startOfDay(day)
    const to = endOfDay(day)

    const [sleeps, exercises, baths, feedings, diapers, temperatures, spitUps, waters, supplements] =
      await Promise.all([
        SleepRecord.findAll({ where: sleepOverlapWhere(baby.id, from, to), raw: true }),
        ExerciseRecord.findAll({
          where: { babyId: baby.id, time: { [Op.between]: [from, to] }, status: 1 },
          raw: true,
        }),
        BathRecord.findAll({
          where: { babyId: baby.id, time: { [Op.between]: [from, to] }, status: 1 },
          raw: true,
        }),
        FeedingRecord.findAll({
          where: { babyId: baby.id, time: { [Op.between]: [from, to] }, status: 1 },
          raw: true,
        }),
        DiaperRecord.findAll({
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
        WaterRecord.findAll({
          where: { babyId: baby.id, time: { [Op.between]: [from, to] }, status: 1 },
          raw: true,
        }),
        SupplementRecord.findAll({
          where: { babyId: baby.id, time: { [Op.between]: [from, to] }, status: 1 },
          raw: true,
        }),
      ])

    // ===== 时段（有时长的活动，画成扇形）=====
    const segments = []
    const pushSegment = (kind, startMin, endMin, detail, icon) => {
      const s = Math.max(0, Math.min(1440, Math.round(startMin)))
      const e = Math.max(0, Math.min(1440, Math.round(endMin)))
      if (e <= s) return
      const meta = CLOCK_META[kind]
      segments.push({
        kind,
        label: meta.label,
        icon: icon || meta.icon,
        color: meta.color,
        start: s,
        end: e,
        startText: minuteText(s),
        endText: minuteText(e),
        minutes: e - s,
        minutesText: formatDuration(e - s),
        detail: detail || '',
      })
    }

    // 睡眠（跨夜只画当天那段；进行中的画到当前时刻）
    sleepSegmentsOfDay(sleeps, from, to).forEach((seg) => {
      pushSegment(
        'sleep',
        minuteOf(seg.start, from),
        minuteOf(seg.end, from),
        seg.carryIn ? '昨晚入睡，今天起床' : seg.carryOut ? '今天入睡，明天起床' : ''
      )
    })

    exercises.forEach((e) => {
      const start = minuteOf(e.time, from)
      pushSegment('exercise', start, start + (e.duration || 0), e.duration ? `${e.duration}分钟` : '', '🤸')
    })

    baths.forEach((b) => {
      const start = minuteOf(b.time, from)
      pushSegment('bath', start, start + (b.duration || 0), b.duration ? `${b.duration}分钟` : '', '🛁')
    })

    // ===== 事件（瞬时动作：外环画示意色块 + 内轨道画圆点）=====
    const events = []
    const pushEvent = (kind, time, detail, icon) => {
      const meta = CLOCK_META[kind]
      const minute = minuteOf(time, from)
      // 外环示意宽度：喂奶 25 分钟，尿片 12 分钟，其余 6 分钟
      const w = CLOCK_EXHIBIT_MIN[kind] || 8
      events.push({
        kind,
        label: meta.label,
        icon: icon || meta.icon,
        color: meta.color,
        minute,
        timeText: formatTime(time),
        detail: detail || '',
        exhibitStart: Math.max(0, Math.min(1440, Math.round(minute - w / 2))),
        exhibitEnd: Math.max(0, Math.min(1440, Math.round(minute + w / 2))),
      })
    }

    feedings.forEach((f) => {
      if (f.type === 'formula') {
        pushEvent('formula', f.time, f.amount ? `${f.amount}ml` : '')
      } else {
        pushEvent('breast', f.time, f.duration ? `${f.duration}分钟` : '')
      }
    })
    diapers.forEach((d) => pushEvent('diaper', d.time, DIAPER_TEXT[d.type] || ''))
    temperatures.forEach((t) => {
      const v = toNum(t.temperature)
      pushEvent('temperature', t.time, v !== null ? `${v}℃` : '')
    })
    spitUps.forEach((s) => pushEvent('spitup', s.time, SPIT_UP_LABEL[s.level] || ''))
    waters.forEach((w) => pushEvent('water', w.time, w.amount ? `${w.amount}ml` : ''))
    supplements.forEach((s) => pushEvent('supplement', s.time, s.name || ''))

    events.sort((a, b) => a.minute - b.minute)
    segments.sort((a, b) => a.start - b.start)

    // ===== 各类汇总（时长 + 次数）=====
    const summaryMap = {}
    const ensureSummary = (kind) => {
      if (!summaryMap[kind]) {
        const meta = CLOCK_META[kind]
        summaryMap[kind] = {
          kind,
          label: meta.label,
          icon: meta.icon,
          color: meta.color,
          minutes: 0,
          count: 0,
          minutesText: '',
        }
      }
      return summaryMap[kind]
    }
    segments.forEach((s) => {
      const item = ensureSummary(s.kind)
      item.minutes += s.minutes
      item.count += 1
    })
    events.forEach((e) => {
      ensureSummary(e.kind).count += 1
    })
    const summary = Object.values(summaryMap)
      .map((i) => ({ ...i, minutesText: i.minutes > 0 ? formatDuration(i.minutes) : '' }))
      .sort((a, b) => b.minutes - a.minutes || b.count - a.count)

    // ===== 覆盖度（只算有时长的活动，去重）=====
    const coverageMinutes = unionMinutes(segments.map((s) => ({ start: s.start, end: s.end })))
    const nowMinute = minuteOf(new Date(), from)
    const isToday = formatDate(day) === formatDate(new Date())
    const elapsedMinutes = isToday ? Math.max(1, nowMinute) : 1440

    // 清醒且没有专门记录的时间也上色（暖米色），保证整圈都有颜色
    const idleMinutes = Math.max(0, elapsedMinutes - coverageMinutes)
    if (idleMinutes > 0) {
      summary.push({
        kind: 'idle',
        label: '清醒·未记录',
        icon: '🌤️',
        color: '#FBEEDC',
        minutes: idleMinutes,
        count: 0,
        minutesText: formatDuration(idleMinutes),
      })
    }

    // ===== 时间轴（时段 + 事件合并，按时间排序）=====
    const timeline = [
      ...segments.map((s) => ({
        type: 'segment',
        kind: s.kind,
        label: s.label,
        icon: s.icon,
        color: s.color,
        sortKey: s.start,
        timeText: `${s.startText} - ${s.endText}`,
        title: `${s.label}${s.detail ? ' · ' + s.detail : ''}`,
        durationText: s.minutesText,
      })),
      ...events.map((e) => ({
        type: 'event',
        kind: e.kind,
        label: e.label,
        icon: e.icon,
        color: e.color,
        sortKey: e.minute,
        timeText: e.timeText,
        title: `${e.label}${e.detail ? ' · ' + e.detail : ''}`,
        durationText: '',
      })),
    ].sort((a, b) => a.sortKey - b.sortKey)

    res.apiSuccess({
      date: formatDate(day),
      isToday,
      nowMinute: isToday ? nowMinute : null,
      segments,
      events,
      summary,
      timeline,
      coverageMinutes,
      coverageText: formatDuration(coverageMinutes),
      // 占全天比例（历史日期看这个）
      coveragePercent: Math.round((coverageMinutes / 1440) * 100),
      // 今天还没过完，用「占已过时间」更有意义
      elapsedMinutes,
      coveragePercentElapsed: Math.min(
        100,
        Math.round((coverageMinutes / elapsedMinutes) * 100)
      ),
      unrecordedMinutes: Math.max(0, elapsedMinutes - coverageMinutes),
      unrecordedText: formatDuration(Math.max(0, elapsedMinutes - coverageMinutes)),
      hasData: segments.length > 0 || events.length > 0,
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
      // 跨天的睡眠拆到各天统计，所以按「与区间有交集」查
      SleepRecord.findAll({
        where: sleepOverlapWhere(baby.id, from, to),
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
        breastMinutes: 0,
        diaperCount: 0,
        sleepMinutes: 0,
      }
    }

    feedings.forEach((f) => {
      const key = formatDate(f.time)
      if (!byDate[key]) return
      byDate[key].feedingCount++
      if (f.type === 'formula') byDate[key].totalAmount += f.amount || 0
      if (f.type === 'breast') byDate[key].breastMinutes += f.duration || 0
    })

    diapers.forEach((d) => {
      const key = formatDate(d.time)
      if (byDate[key]) byDate[key].diaperCount++
    })

    // 睡眠：跨天的要拆到各天，不能整夜都算给入睡那天
    Object.keys(byDate).forEach((key) => {
      const [y, m, d] = key.split('-').map(Number)
      const dayFrom = new Date(y, m - 1, d, 0, 0, 0, 0)
      const dayTo = endOfDay(dayFrom)
      byDate[key].sleepMinutes = sleeps.reduce((sum, s) => {
        const seg = clipSleep(s.startTime, s.endTime, dayFrom, dayTo)
        return sum + (seg ? seg.minutes : 0)
      }, 0)
    })

    const list = Object.keys(byDate)
      .sort()
      .map((k) => ({
        ...byDate[k],
        sleepText: formatDuration(byDate[k].sleepMinutes),
        breastText:
          byDate[k].breastMinutes > 0 ? formatDuration(byDate[k].breastMinutes) : '',
      }))

    res.apiSuccess({ days, list })
  } catch (err) {
    next(err)
  }
})

module.exports = router
