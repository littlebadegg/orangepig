/**
 * 操作日志工具 — 给后台「宝宝画像」提供行为数据
 *
 * 设计原则：
 * 1. 埋点绝不能影响业务：写日志失败只打 warn，不抛错、不阻塞响应
 * 2. 查看类（打开首页/切换日期）非常高频 → 同一人同一宝宝同一日期 30 分钟内只记一次
 * 3. action 用字符串常量，避免各处拼错
 */
const { ActivityLog } = require('../models')

const ACTION = {
  LOGIN: 'login',
  VIEW_TIMELINE: 'view_timeline',
  RECORD_CREATE: 'record_create',
  RECORD_UPDATE: 'record_update',
  RECORD_DELETE: 'record_delete',
  BABY_CREATE: 'baby_create',
  BABY_SWITCH: 'baby_switch',
  BABY_UPDATE: 'baby_update',
  BABY_DELETE: 'baby_delete',
  MEMBER_JOIN: 'member_join',
  MEMBER_REMOVE: 'member_remove',
  RELATION_UPDATE: 'relation_update',
}

/** 记录类型中文名 */
const KIND_LABEL = {
  feeding: '喂奶',
  diaper: '换尿片',
  sleep: '睡觉',
  exercise: '排气操',
  growth: '身高体重',
  temperature: '体温',
  spitup: '吐奶',
  bath: '洗澡',
  water: '喂水',
  supplement: '喂养品',
  'custom-feeds': '自定义喂养项',
}

/** 查看类去重窗口 */
const VIEW_DEDUPE_MS = 30 * 60 * 1000
const viewSeen = new Map()

/** 取客户端 IP（Nginx 转发后真实 IP 在 X-Forwarded-For 第一位） */
function clientIp(req) {
  if (!req) return null
  const xff = req.headers && req.headers['x-forwarded-for']
  if (xff) return String(xff).split(',')[0].trim().slice(0, 64)
  return String(req.ip || (req.socket && req.socket.remoteAddress) || '').slice(0, 64) || null
}

/**
 * 记一条操作日志（fire-and-forget）
 * @param {Object} opts
 * @param {Object} [opts.req] Express 请求（取 ip / ua）
 * @param {number} [opts.userId] 操作人
 * @param {number} [opts.babyId] 相关宝宝
 * @param {string} opts.action ACTION 常量
 * @param {string} [opts.targetType] 记录类型
 * @param {number} [opts.targetId]
 * @param {string} [opts.viewDate] 查看的日期 YYYY-MM-DD
 * @param {string} [opts.detail] 可读摘要
 * @param {boolean} [opts.dedupe] 是否按「人+宝宝+日期+动作」去重（查看类用）
 */
function logActivity(opts = {}) {
  const {
    req,
    userId = null,
    babyId = null,
    action,
    targetType = null,
    targetId = null,
    viewDate = null,
    detail = null,
    dedupe = false,
  } = opts

  if (!action) return

  if (dedupe) {
    const key = `${userId || 0}:${babyId || 0}:${action}:${viewDate || ''}`
    const now = Date.now()
    const prev = viewSeen.get(key)
    if (prev && now - prev < VIEW_DEDUPE_MS) return
    viewSeen.set(key, now)
    // 顺手清理过期键，避免长期运行内存增长
    if (viewSeen.size > 500) {
      for (const [k, t] of viewSeen) {
        if (now - t > VIEW_DEDUPE_MS) viewSeen.delete(k)
      }
    }
  }

  ActivityLog.create({
    userId,
    babyId,
    action,
    targetType,
    targetId,
    viewDate,
    detail: detail ? String(detail).slice(0, 200) : null,
    ip: clientIp(req),
    ua: req ? String((req.headers && req.headers['user-agent']) || '').slice(0, 200) || null : null,
  }).catch((err) => {
    console.warn('[activity] 写操作日志失败:', err.message)
  })
}

/** 把一条日志翻成人话（后台展示用） */
function actionText(log, todayStr) {
  const label = KIND_LABEL[log.targetType] || ''
  const extra = log.detail ? ` · ${log.detail}` : ''
  switch (log.action) {
    case ACTION.LOGIN:
      return '登录小程序'
    case ACTION.VIEW_TIMELINE:
      if (!log.viewDate) return '打开首页'
      return log.viewDate === todayStr ? '查看今日记录' : `回看 ${log.viewDate} 的记录`
    case ACTION.RECORD_CREATE:
      return `新增${label}${extra}`
    case ACTION.RECORD_UPDATE:
      return `修改${label}${extra}`
    case ACTION.RECORD_DELETE:
      return `删除${label}${extra}`
    case ACTION.BABY_CREATE:
      return '添加宝宝'
    case ACTION.BABY_SWITCH:
      return '切换宝宝'
    case ACTION.BABY_UPDATE:
      return '修改宝宝资料'
    case ACTION.BABY_DELETE:
      return '删除宝宝'
    case ACTION.MEMBER_JOIN:
      return '通过邀请码加入'
    case ACTION.MEMBER_REMOVE:
      return '移除家庭成员'
    case ACTION.RELATION_UPDATE:
      return '修改自己的称呼'
    default:
      return log.action
  }
}

/** 记录摘要（写埋点时存下来，后台直接展示） */
function summarizeRecord(kind, body = {}) {
  try {
    switch (kind) {
      case 'feeding': {
        const amount = Number(body.amount)
        if (body.type === 'breast' || (!amount && body.duration)) {
          return body.duration ? `母乳 ${body.duration} 分钟` : '母乳'
        }
        return amount > 0 ? `${body.type === 'formula' ? '奶粉' : '奶'} ${amount}ml` : ''
      }
      case 'diaper':
        return { pee: '小便', poo: '大便', both: '大小便' }[body.type] || ''
      case 'sleep':
        return body.duration ? `${body.duration} 分钟` : ''
      case 'exercise':
        return body.duration ? `${body.duration} 分钟` : ''
      case 'growth': {
        const parts = []
        if (body.height) parts.push(`${body.height}cm`)
        if (body.weight) parts.push(`${body.weight}kg`)
        return parts.join(' / ')
      }
      case 'temperature':
        return body.temperature ? `${body.temperature}℃` : ''
      case 'spitup':
        return { 1: '少量', 2: '中量', 3: '大量' }[Number(body.level)] || ''
      case 'bath':
        return body.duration ? `${body.duration} 分钟` : ''
      case 'water':
        return Number(body.amount) > 0 ? `${body.amount}ml` : ''
      case 'supplement':
        return body.name ? String(body.name).slice(0, 20) : ''
      default:
        return ''
    }
  } catch (e) {
    return ''
  }
}

module.exports = {
  ACTION,
  KIND_LABEL,
  logActivity,
  actionText,
  summarizeRecord,
  clientIp,
}
