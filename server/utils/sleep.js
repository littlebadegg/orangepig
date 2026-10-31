/**
 * 睡眠记录按天切分
 *
 * 一条睡眠可能跨天（22:00 入睡 → 次日 06:00 起床）。
 * 时间线和统计都只算「当天的那一段」，所以要按天切开：
 *   - 入睡当天：22:00 → 24:00
 *   - 次日：00:00 → 06:00
 *
 * 这样每天的睡眠时长加起来才是真实累计，不会把整夜时长都算给入睡那天。
 */
const { Op } = require('sequelize')
const { endOfDay, startOfDay } = require('./time')

/** 睡眠记录与某天有交集的查询条件（跨天的睡眠两天都能查到） */
function sleepOverlapWhere(babyId, from, to) {
  return {
    babyId,
    startTime: { [Op.lte]: to },
    endTime: { [Op.gte]: from },
    recordStatus: 1,
    status: 1,
  }
}

/**
 * 取一段睡眠在 [from, to] 窗口内的交集片段
 * @param {Date|string} startTime 入睡时间
 * @param {Date|string|null} endTime 起床时间（null = 还在睡，按当前时间算）
 * @param {Date} from 窗口开始
 * @param {Date} to 窗口结束
 * @returns {null|{start:Date,end:Date,minutes:number,carryIn:boolean,carryOut:boolean}}
 *   carryIn  这段是「昨天入睡、今天还没醒」的前半段
 *   carryOut 这段是「今天入睡、明天才醒」的后半段
 */
function clipSleep(startTime, endTime, from, to) {
  const s = new Date(startTime)
  const e = endTime ? new Date(endTime) : new Date()
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return null

  const start = s.getTime() > from.getTime() ? s : from
  const end = e.getTime() < to.getTime() ? e : to
  if (end.getTime() <= start.getTime()) return null

  return {
    start,
    end,
    minutes: Math.round((end.getTime() - start.getTime()) / 60000),
    carryIn: s.getTime() < from.getTime(),
    carryOut: e.getTime() > to.getTime(),
  }
}

/**
 * 一批睡眠记录 → 某一天的片段列表
 * @param {Array} rows 睡眠记录（raw）
 * @param {Date} from 当天 00:00:00
 * @param {Date} to 当天 23:59:59
 * @returns {Array<{row:object,start:Date,end:Date,minutes:number,carryIn:boolean,carryOut:boolean}>}
 */
function sleepSegmentsOfDay(rows, from, to) {
  const out = []
  for (const row of rows) {
    const seg = clipSleep(row.startTime, row.endTime, from, to)
    if (!seg) continue
    out.push({ row, ...seg })
  }
  return out
}

/** 当天睡眠总分钟数（跨天只算当天那段） */
function sleepMinutesOfDay(rows, day) {
  return sleepSegmentsOfDay(rows, startOfDay(day), endOfDay(day)).reduce(
    (sum, s) => sum + s.minutes,
    0
  )
}

module.exports = {
  sleepOverlapWhere,
  clipSleep,
  sleepSegmentsOfDay,
  sleepMinutesOfDay,
}
