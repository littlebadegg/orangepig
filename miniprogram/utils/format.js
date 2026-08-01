/**
 * 格式化工具
 */

/**
 * 时间格式化 — 相对时间 + 绝对时间
 */
function formatTime(timestamp) {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  const now = Date.now()
  const diff = now - timestamp

  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前'
  if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前'
  if (diff < 604800000) return Math.floor(diff / 86400000) + '天前'

  const month = date.getMonth() + 1
  const day = date.getDate()
  return `${month}月${day}日`
}

/**
 * 数字格式化 — 1.2万 / 350
 */
function formatNumber(num) {
  if (num === undefined || num === null) return '0'
  if (num < 10000) return String(num)
  if (num < 100000000) return (num / 10000).toFixed(1).replace(/\.0$/, '') + '万'
  return (num / 100000000).toFixed(1).replace(/\.0$/, '') + '亿'
}

/**
 * 内容摘要 — 截断长文本
 */
function truncate(text, maxLen = 50) {
  if (!text) return ''
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen) + '...'
}

/**
 * 防抖
 */
function debounce(fn, delay = 300) {
  let timer = null
  return function (...args) {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => fn.apply(this, args), delay)
  }
}

/**
 * 节流
 */
function throttle(fn, interval = 300) {
  let lastTime = 0
  return function (...args) {
    const now = Date.now()
    if (now - lastTime >= interval) {
      lastTime = now
      fn.apply(this, args)
    }
  }
}

module.exports = {
  formatTime,
  formatNumber,
  truncate,
  debounce,
  throttle,
}
