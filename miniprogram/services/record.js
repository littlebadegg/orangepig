/**
 * 记录 + 统计接口
 */
const { get, post, put, del } = require('../utils/request')

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

/** 记一次吐奶 { babyId, level(1少量|2中量|3大量), time, note } */
function addSpitUp(data) {
  return post('/records/spitup', data)
}

/** 记一次洗澡 { babyId, duration, waterTemp, time, note } */
function addBath(data) {
  return post('/records/bath', data)
}

/** 记一次喂水 { babyId, amount(选填), time, note } */
function addWater(data) {
  return post('/records/water', data)
}

/** 记一次喂养品 { babyId, name(AD|D3|自定义), time, note } */
function addSupplement(data) {
  return post('/records/supplement', data)
}

/** 自定义喂养项列表 */
function listCustomFeeds() {
  return get('/records/custom-feeds', {})
}

/** 添加自定义喂养项 { name } */
function addCustomFeed(name) {
  return post('/records/custom-feeds', { name })
}

/** 删除自定义喂养项 */
function removeCustomFeed(id) {
  return del(`/records/custom-feeds/${id}`)
}

/** 某天时间线 */
function timeline(babyId, date) {
  return get('/records/timeline', { babyId, date })
}

/** 删除记录 type: feeding|diaper|sleep|exercise|growth|temperature|spitup|bath */
function remove(type, id) {
  return del(`/records/${type}/${id}`)
}

/** 修改记录（只传需要改的字段） */
function update(type, id, data) {
  return put(`/records/${type}/${id}`, data)
}

/** 某天概览统计 */
function dailyStats(babyId, date) {
  return get('/stats/daily', { babyId, date })
}

/** 近 N 天趋势 */
function trend(babyId, days) {
  return get('/stats/trend', { babyId, days })
}

/** 养育小贴士（按宝宝天数） */
function getTips(babyId) {
  return get('/tips', { babyId })
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
  addSpitUp,
  addBath,
  addWater,
  addSupplement,
  listCustomFeeds,
  addCustomFeed,
  removeCustomFeed,
  timeline,
  remove,
  update,
  dailyStats,
  trend,
  getTips,
}
