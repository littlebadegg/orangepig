/**
 * 前端格式化工具
 */

function pad(n) {
  return String(n).padStart(2, '0')
}

/** 分钟 → "2小时30分" / "45分钟" */
function formatDuration(minutes) {
  const m = Math.max(0, Math.round(minutes || 0))
  if (m < 60) return `${m}分钟`
  const h = Math.floor(m / 60)
  const rest = m % 60
  return rest === 0 ? `${h}小时` : `${h}小时${rest}分`
}

/** 当前时间 "2026-10-21 15:40:30"（提交给后端用） */
function nowString() {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** 今天 "2026-10-21" */
function todayString() {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 时间选择器的值 "HH:mm" */
function timePickerValue(dateStr) {
  if (!dateStr) {
    const d = new Date()
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`
  }
  const d = new Date(String(dateStr).replace(/-/g, '/'))
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** "2026-10-21" + "15:40" → "2026-10-21 15:40:00" */
function composeDateTime(dateStr, timeStr) {
  return `${dateStr} ${timeStr}:00`
}

/**
 * 统计兜底：保证 WXML 用到的二级对象一定存在
 * 后端版本较旧（还没返回 exercise / growth / temperature）时，
 * WXML 里 stats.exercise.count 会抛错并中断整页渲染，
 * 表现为「按钮点了没反应」，所以统一在这里补齐。
 */
function normalizeStats(stats) {
  const s = stats && typeof stats === 'object' ? stats : {}
  return {
    feeding: s.feeding || {},
    diaper: s.diaper || {},
    sleep: s.sleep || {},
    exercise: s.exercise || {},
    temperature: s.temperature || {},
    growth: s.growth || {},
    spitUp: s.spitUp || {},
    bath: s.bath || {},
    water: s.water || {},
    supplement: s.supplement || {},
    // 今日醒目提醒（喂水 / AD / 自定义喂养项），旧后端没有就当没有
    reminders: Array.isArray(s.reminders) ? s.reminders : [],
    // 评分对象：后端旧版本可能没有 score，这里补一个空壳，避免 WXML 访问 .items 报错
    score:
      s.score && typeof s.score === 'object'
        ? {
            ...s.score,
            items: s.score.items || [],
            bonusItems: s.score.bonusItems || [],
            penaltyItems: s.score.penaltyItems || [],
            tips: s.score.tips || [],
          }
        : {
            total: 0,
            level: '待加强',
            base: 0,
            bonus: 0,
            penalty: 0,
            items: [],
            bonusItems: [],
            penaltyItems: [],
            tips: [],
          },
  }
}

/** 性别文案 */
function genderText(gender) {
  if (gender === 1) return '男宝'
  if (gender === 2) return '女宝'
  return '宝宝'
}

/**
 * 宝宝年龄文案（按公历整月算）
 * 20 天 → 「20天」；7个月 → 「7个月」；26个月 → 「2岁2个月」；24个月 → 「2岁」
 * 出生当天显示「0天」，未出生返回 ''
 */
function ageText(birthday) {
  if (!birthday) return ''
  const birth = new Date(String(birthday).replace(/-/g, '/'))
  if (isNaN(birth.getTime())) return ''
  const now = new Date()
  const days = Math.floor((now - birth) / 86400000)
  if (days < 0) return ''
  if (days < 31) return `${days}天`

  let months = (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth())
  // 本月的「生日对应日」还没到，说明整月没满
  if (now.getDate() < birth.getDate()) months -= 1
  if (months < 1) return `${days}天`

  const years = Math.floor(months / 12)
  const rem = months % 12
  if (years >= 1) return rem > 0 ? `${years}岁${rem}个月` : `${years}岁`
  return `${months}个月`
}

module.exports = {
  pad,
  formatDuration,
  nowString,
  todayString,
  timePickerValue,
  composeDateTime,
  normalizeStats,
  genderText,
  ageText,
}
