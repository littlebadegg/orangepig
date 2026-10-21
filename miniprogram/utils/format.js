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

/** 性别文案 */
function genderText(gender) {
  if (gender === 1) return '男宝'
  if (gender === 2) return '女宝'
  return '宝宝'
}

module.exports = {
  pad,
  formatDuration,
  nowString,
  todayString,
  timePickerValue,
  composeDateTime,
  genderText,
}
