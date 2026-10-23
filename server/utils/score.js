/**
 * 每日养育评分
 *
 * 设计原则：
 * 1. 满分 100，五个基础维度按「达标度」线性给分
 * 2. 加分项最多 +10，扣分项按风险叠加，最终 clamp 到 0~100
 * 3. 所有阈值集中在这里，方便以后按宝宝月龄调整
 *
 * 基础分（100）：
 *   喂养 30  —— 每天 6 次为满分
 *   睡眠 25  —— 累计 12 小时为满分
 *   尿片 20  —— 每天 6 次为满分
 *   排气操 10 —— 至少 1 次且 ≥5 分钟满分，做了但不足 5 分钟给 6 分
 *   体温 15  —— 正常 15 / 低热 8 / 中度 3 / 高热 0 / 未测 10（不惩罚未测）
 *
 * 加分（≤ +10）：洗澡 +3、记录覆盖 ≥5 类 +4、吐奶很少 +3
 * 扣分：体温 ≥37.3 再 -5、吐奶 ≥3 次 -5、吐奶中/大量 -3
 */
const { formatDuration } = require('./time')

const clamp = (v, min, max) => Math.min(Math.max(v, min), max)

// 目标值（可按月龄调整）
const TARGET = {
  feedingCount: 6,
  sleepMinutes: 12 * 60,
  diaperCount: 6,
  exerciseMinutes: 5,
}

function computeScore({
  feedings = [],
  diapers = [],
  sleeps = [],
  exercises = [],
  temperatures = [],
  spitUps = [],
  baths = [],
  sleepMinutes = 0,
  ongoingMinutes = 0,
} = {}) {
  const items = []

  // ---------- 喂养 ----------
  const feedCount = feedings.length
  const totalAmount = feedings
    .filter((f) => f.type === 'formula')
    .reduce((sum, f) => sum + (f.amount || 0), 0)
  const breastMinutes = feedings
    .filter((f) => f.type === 'breast')
    .reduce((sum, f) => sum + (f.duration || 0), 0)

  const feedParts = []
  if (feedCount > 0) {
    feedParts.push(`喂养 ${feedCount} 次`)
    if (totalAmount > 0) feedParts.push(`${totalAmount}ml`)
    if (breastMinutes > 0) feedParts.push(`母乳 ${breastMinutes} 分钟`)
  }
  items.push({
    key: 'feeding',
    label: '喂养',
    icon: '🍼',
    max: 30,
    score: Math.round(clamp(feedCount / TARGET.feedingCount, 0, 1) * 30),
    detail: feedParts.join(' · ') || '今天还没记录喂养',
  })

  // ---------- 睡眠 ----------
  const totalSleep = sleepMinutes + ongoingMinutes
  items.push({
    key: 'sleep',
    label: '睡眠',
    icon: '😴',
    max: 25,
    score: Math.round(clamp(totalSleep / TARGET.sleepMinutes, 0, 1) * 25),
    detail: totalSleep > 0 ? `累计 ${formatDuration(totalSleep)}` : '今天还没记录睡眠',
  })

  // ---------- 尿片 ----------
  items.push({
    key: 'diaper',
    label: '尿片',
    icon: '🧷',
    max: 20,
    score: Math.round(clamp(diapers.length / TARGET.diaperCount, 0, 1) * 20),
    detail: diapers.length > 0 ? `更换 ${diapers.length} 次` : '今天还没记录换尿片',
  })

  // ---------- 排气操 ----------
  let exerciseScore = 0
  if (exercises.length > 0) {
    const maxDuration = Math.max(...exercises.map((e) => e.duration || 0))
    exerciseScore = maxDuration >= TARGET.exerciseMinutes ? 10 : 6
  }
  items.push({
    key: 'exercise',
    label: '排气操',
    icon: '🤸',
    max: 10,
    score: exerciseScore,
    detail: exercises.length > 0 ? `做了 ${exercises.length} 次` : '今天还没做排气操',
  })

  // ---------- 体温 ----------
  const temps = temperatures
    .map((t) => parseFloat(t.temperature))
    .filter((v) => !isNaN(v))
  // temperatures 查询按时间倒序，第一条即最近一次
  const latestTemp = temps.length > 0 ? temps[0] : null

  let tempScore = 10
  let tempDetail = '今天还没测体温'
  if (latestTemp !== null) {
    if (latestTemp < 37.3) {
      tempScore = 15
      tempDetail = `最近 ${latestTemp}℃ · 正常`
    } else if (latestTemp < 38) {
      tempScore = 8
      tempDetail = `最近 ${latestTemp}℃ · 低热`
    } else if (latestTemp < 39) {
      tempScore = 3
      tempDetail = `最近 ${latestTemp}℃ · 中度发热`
    } else {
      tempScore = 0
      tempDetail = `最近 ${latestTemp}℃ · 高热`
    }
  }
  items.push({
    key: 'temperature',
    label: '体温',
    icon: '🌡️',
    max: 15,
    score: tempScore,
    detail: tempDetail,
  })

  const base = items.reduce((sum, i) => sum + i.score, 0)

  // 一天什么都没记时不给任何分（未测体温的 10 分、没吐奶的 3 分都不该算）
  const hasAnyRecord =
    feedings.length +
      diapers.length +
      sleeps.length +
      exercises.length +
      temperatures.length +
      spitUps.length +
      baths.length >
    0

  // ---------- 加分 ----------
  const bonusItems = []
  if (hasAnyRecord && baths.length > 0) {
    bonusItems.push({ label: '今天洗了澡', value: 3 })
  }
  const kinds = [
    feedings.length,
    diapers.length,
    sleeps.length,
    exercises.length,
    temperatures.length,
    spitUps.length,
    baths.length,
  ].filter((n) => n > 0).length
  if (hasAnyRecord && kinds >= 5) {
    bonusItems.push({ label: `记录很完整（${kinds} 类）`, value: 4 })
  }
  if (hasAnyRecord && (spitUps.length === 0 || (spitUps.length === 1 && spitUps[0].level === 1))) {
    bonusItems.push({ label: '今天吐奶很少', value: 3 })
  }
  const bonus = Math.min(
    bonusItems.reduce((sum, i) => sum + i.value, 0),
    10
  )

  // ---------- 扣分 ----------
  const penaltyItems = []
  if (latestTemp !== null && latestTemp >= 37.3) {
    penaltyItems.push({ label: '体温偏高', value: -5 })
  }
  if (spitUps.length >= 3) {
    penaltyItems.push({ label: `吐奶 ${spitUps.length} 次`, value: -5 })
  } else if (spitUps.some((s) => s.level >= 2)) {
    penaltyItems.push({ label: '吐奶量偏多', value: -3 })
  }
  const penalty = penaltyItems.reduce((sum, i) => sum + i.value, 0)

  const total = hasAnyRecord ? Math.round(clamp(base + bonus + penalty, 0, 100)) : 0

  let level = '待加强'
  if (total >= 90) level = '优秀'
  else if (total >= 80) level = '良好'
  else if (total >= 60) level = '一般'

  // ---------- 建议：挑达标度最低的两项 ----------
  const tips = []

  if (!hasAnyRecord) {
    tips.push('今天还没有记录，先记一条，评分会更准确')
  } else {
    const adviceMap = {
      feeding: '喂养次数偏少，可以按需增加喂养',
      sleep: '睡眠时长偏少，注意营造安静的睡眠环境',
      diaper: '尿片更换偏少，建议每 2~3 小时检查一次',
      exercise: '可以做一次排气操，帮助宝宝排气',
      temperature: '体温偏高，注意观察精神状态，必要时就医',
    }
    items
      .filter((i) => i.score < i.max)
      .sort((a, b) => a.score / a.max - b.score / b.max)
      .slice(0, 2)
      .forEach((i) => {
        if (adviceMap[i.key]) tips.push(adviceMap[i.key])
      })
  }

  return {
    total,
    level,
    base,
    bonus,
    penalty,
    items,
    bonusItems,
    penaltyItems,
    tips,
  }
}

module.exports = { computeScore, TARGET }
