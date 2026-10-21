/**
 * 记录 + 统计接口
 */
const { get, post, del } = require('../utils/request')

/** 记一次喂养 { babyId, type, amount, duration, time, note } */
function addFeeding(data) {
  return post('/records/feeding', data)
}

/** 记一次换尿片 { babyId, type, time, note } */
function addDiaper(data) {
  return post('/records/diaper', data)
}

/** 开始睡觉 */
function startSleep(babyId) {
  return post('/records/sleep/start', { babyId })
}

/** 起床结束 */
function endSleep(babyId, id) {
  return post('/records/sleep/end', { babyId, id })
}

/** 补录睡眠 { babyId, startTime, endTime } */
function addSleep(data) {
  return post('/records/sleep', data)
}

/** 记一次排气操 { babyId, duration, result, time, note } */
function addExercise(data) {
  return post('/records/exercise', data)
}

/** 记一次身高/体重 { babyId, height, weight, time, note } */
function addGrowth(data) {
  return post('/records/growth', data)
}

/** 记一次体温 { babyId, temperature, method, time, note } */
function addTemperature(data) {
  return post('/records/temperature', data)
}

/** 某天时间线 */
function timeline(babyId, date) {
  return get('/records/timeline', { babyId, date })
}

/** 删除记录 type: feeding|diaper|sleep */
function remove(type, id) {
  return del(`/records/${type}/${id}`)
}

/** 某天概览统计 */
function dailyStats(babyId, date) {
  return get('/stats/daily', { babyId, date })
}

/** 近 N 天趋势 */
function trend(babyId, days) {
  return get('/stats/trend', { babyId, days })
}

module.exports = {
  addFeeding,
  addDiaper,
  startSleep,
  endSleep,
  addSleep,
  addExercise,
  addGrowth,
  addTemperature,
  timeline,
  remove,
  dailyStats,
  trend,
}
