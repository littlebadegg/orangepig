/**
 * 时间处理工具
 *
 * ⚠️ 全部按东八区本地时间格式化（容器 TZ=Asia/Shanghai）
 *   数据库存的也是本地时间字符串，读写一致，不需要 UTC 转换
 */

function pad(n) {
  return String(n).padStart(2, '0')
}

function toDate(input) {
  if (input instanceof Date) return input
  return new Date(input)
}

/** "2026-10-21 10:30:00" */
function formatDateTime(input) {
  const d = toDate(input)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** "10:30" */
function formatTime(input) {
  const d = toDate(input)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** "2026-10-21" */
function formatDate(input) {
  const d = toDate(input)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 当天 00:00:00 */
function startOfDay(input) {
  const d = toDate(input)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0)
}

/** 当天 23:59:59 */
function endOfDay(input) {
  const d = toDate(input)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)
}

/**
 * 安全解析日期 — 非法输入（如 "today"、"abc"、空串）一律回退到当前时间
 * 避免 Invalid Date 传到 MySQL 报 "Incorrect DATETIME value"
 */
function safeDate(input) {
  if (input instanceof Date) {
    return isNaN(input.getTime()) ? new Date() : input
  }
  if (!input || typeof input !== 'string') return new Date()
  const d = new Date(input)
  return isNaN(d.getTime()) ? new Date() : d
}

/** N 天前的 00:00:00 */
function startOfDaysAgo(days) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0)
}

/** 分钟 → "2小时30分" / "45分钟" */
function formatDuration(minutes) {
  if (minutes === null || minutes === undefined) return ''
  const m = Math.max(0, Math.round(minutes))
  if (m < 60) return `${m}分钟`
  const h = Math.floor(m / 60)
  const rest = m % 60
  return rest === 0 ? `${h}小时` : `${h}小时${rest}分`
}

/** 两个时间点相差的分钟数 */
function diffMinutes(start, end) {
  return Math.round((toDate(end).getTime() - toDate(start).getTime()) / 60000)
}

module.exports = {
  formatDateTime,
  formatTime,
  formatDate,
  startOfDay,
  endOfDay,
  startOfDaysAgo,
  formatDuration,
  diffMinutes,
  safeDate,
}
