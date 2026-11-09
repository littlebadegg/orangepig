/**
 * 冒烟 v14：24 小时时钟盘接口
 * 前置：服务已启动（本地 3000）
 * 运行：node scripts/smoke-v14.js
 */
const jwt = require('jsonwebtoken')
const {
  sequelize,
  User,
  Baby,
  FeedingRecord,
  DiaperRecord,
  SleepRecord,
  ExerciseRecord,
  BathRecord,
  TemperatureRecord,
  WaterRecord,
  SupplementRecord,
} = require('../models')
const config = require('../config')

const BASE = 'http://127.0.0.1:3000/api'
let pass = 0
let fail = 0

function check(name, cond, extra) {
  if (cond) {
    pass++
    console.log(`✅ ${name}`)
  } else {
    fail++
    console.log(`❌ ${name}${extra !== undefined ? ' — ' + JSON.stringify(extra) : ''}`)
  }
}

async function call(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: res.status, json: await res.json() }
}

const p = (n) => String(n).padStart(2, '0')
const dayStr = (offset) => {
  const d = new Date(Date.now() - offset * 86400000)
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

async function main() {
  const stamp = Date.now()
  const user = await User.create({ openid: `smoke14_${stamp}`, nickName: '冒烟14' })
  const token = jwt.sign({ userId: user.id, openid: user.openid }, config.jwtSecret, { expiresIn: '1d' })

  let r = await call('POST', '/babies', {
    token,
    body: { name: '冒烟时钟宝宝', gender: 1, birthday: '2026-08-01', relation: '妈妈' },
  })
  check('创建宝宝', r.json.code === 0, r.json)
  const babyId = r.json.data.id
  await User.update({ currentBabyId: babyId }, { where: { id: user.id } })

  // 跨夜睡眠：昨晚 22:00 → 今天 06:00
  r = await call('POST', '/records/sleep', {
    token,
    body: { babyId, startTime: `${dayStr(1)} 22:00:00`, endTime: `${dayStr(0)} 06:00:00` },
  })
  check('记录跨夜睡眠 22:00→06:00', r.json.code === 0, r.json)

  // 白天活动
  r = await call('POST', '/records/feeding', { token, body: { babyId, type: 'formula', amount: 150, time: `${dayStr(0)} 08:00:00` } })
  check('记录奶粉 150ml', r.json.code === 0, r.json)
  r = await call('POST', '/records/feeding', { token, body: { babyId, type: 'breast', duration: 15, time: `${dayStr(0)} 12:00:00` } })
  check('记录母乳 15 分钟', r.json.code === 0, r.json)
  r = await call('POST', '/records/diaper', { token, body: { babyId, type: 'both', time: `${dayStr(0)} 09:30:00` } })
  check('记录大小便', r.json.code === 0, r.json)
  r = await call('POST', '/records/exercise', { token, body: { babyId, duration: 5, time: `${dayStr(0)} 10:00:00` } })
  check('记录排气操 5 分钟', r.json.code === 0, r.json)
  r = await call('POST', '/records/bath', { token, body: { babyId, duration: 10, waterTemp: 38, time: `${dayStr(0)} 19:00:00` } })
  check('记录洗澡 10 分钟', r.json.code === 0, r.json)
  r = await call('POST', '/records/temperature', { token, body: { babyId, temperature: 36.8, method: 'ear', time: `${dayStr(0)} 15:00:00` } })
  check('记录体温', r.json.code === 0, r.json)
  r = await call('POST', '/records/water', { token, body: { babyId, amount: 20, time: `${dayStr(0)} 16:00:00` } })
  check('记录喂水', r.json.code === 0, r.json)
  r = await call('POST', '/records/supplement', { token, body: { babyId, name: 'AD', time: `${dayStr(0)} 11:00:00` } })
  check('记录 AD', r.json.code === 0, r.json)

  // ===== 时钟接口 =====
  r = await call('GET', `/stats/clock?babyId=${babyId}&date=${dayStr(0)}`, { token })
  const d = r.json.data || {}
  check('时钟接口返回成功', r.json.code === 0, r.json)
  check('hasData=true', d.hasData === true, d.hasData)
  check('isToday=true', d.isToday === true, d.isToday)
  check('nowMinute 有值', typeof d.nowMinute === 'number' && d.nowMinute >= 0 && d.nowMinute <= 1440, d.nowMinute)

  const segs = d.segments || []
  const sleepSeg = segs.find((s) => s.kind === 'sleep')
  check('睡眠时段存在', !!sleepSeg, segs.map((s) => s.kind))
  check('睡眠从 00:00 开始（跨夜前段）', sleepSeg && sleepSeg.start === 0 && sleepSeg.startText === '00:00', sleepSeg)
  check('睡眠到 06:00 结束', sleepSeg && sleepSeg.end === 360 && sleepSeg.endText === '06:00', sleepSeg)
  check('睡眠 360 分钟 = 6小时', sleepSeg && sleepSeg.minutes === 360 && sleepSeg.minutesText === '6小时', sleepSeg)
  check('跨夜睡眠有标注', sleepSeg && sleepSeg.detail === '昨晚入睡，今天起床', sleepSeg && sleepSeg.detail)
  check('睡眠颜色是绿色', sleepSeg && sleepSeg.color === '#7BC47F', sleepSeg && sleepSeg.color)

  const exSeg = segs.find((s) => s.kind === 'exercise')
  check('排气操时段 10:00-10:05', exSeg && exSeg.start === 600 && exSeg.end === 605, exSeg)
  const bathSeg = segs.find((s) => s.kind === 'bath')
  check('洗澡时段 19:00 开始 10 分钟', bathSeg && bathSeg.start === 1140 && bathSeg.end === 1150, bathSeg)

  const evts = d.events || []
  const kinds = evts.map((e) => e.kind)
  check('事件含奶粉/母乳/尿片/体温/喂水/喂养品', ['formula', 'breast', 'diaper', 'temperature', 'water', 'supplement'].every((k) => kinds.includes(k)), kinds)
  const formulaEvt = evts.find((e) => e.kind === 'formula')
  check('奶粉事件 08:00 150ml', formulaEvt && formulaEvt.minute === 480 && formulaEvt.detail === '150ml', formulaEvt)
  check('奶粉事件外环示意块 08:00 前后 25 分钟', formulaEvt && formulaEvt.exhibitStart === 468 && formulaEvt.exhibitEnd === 493, formulaEvt)
  check('奶粉颜色是蓝色', formulaEvt && formulaEvt.color === '#4A90E2', formulaEvt && formulaEvt.color)
  const diaperEvt = evts.find((e) => e.kind === 'diaper')
  check('尿片事件带大小便文案', diaperEvt && diaperEvt.detail === '大小便', diaperEvt)
  const sortedEvt = evts.every((e, i) => i === 0 || evts[i - 1].minute <= e.minute)
  check('事件按时间升序', sortedEvt, evts.map((e) => e.minute))

  const summary = d.summary || []
  const sleepSum = summary.find((s) => s.kind === 'sleep')
  check('汇总里睡眠 6小时 1 次', sleepSum && sleepSum.minutesText === '6小时' && sleepSum.count === 1, sleepSum)
  const formulaSum = summary.find((s) => s.kind === 'formula')
  check('汇总里奶粉 1 次', formulaSum && formulaSum.count === 1, formulaSum)
  const idleSum = summary.find((s) => s.kind === 'idle')
  check('汇总里有「清醒·未记录」米色项', idleSum && idleSum.color === '#FBEEDC' && idleSum.minutes > 0, idleSum)

  check('覆盖时间 ≥ 375 分钟（睡眠+排气操+洗澡）', d.coverageMinutes >= 375, d.coverageMinutes)
  check('覆盖文案非空', !!d.coverageText, d.coverageText)
  check('占已过时间百分比有值', typeof d.coveragePercentElapsed === 'number' && d.coveragePercentElapsed > 0, d.coveragePercentElapsed)

  const tl = d.timeline || []
  check('时间轴有内容', tl.length >= 8, tl.length)
  const tlSorted = tl.every((t, i) => i === 0 || tl[i - 1].sortKey <= t.sortKey)
  check('时间轴按时间升序', tlSorted, tl.map((t) => t.sortKey))
  check('时间轴首条是睡眠（00:00）', tl[0] && tl[0].kind === 'sleep', tl[0])

  // ===== 空白日期 =====
  r = await call('GET', `/stats/clock?babyId=${babyId}&date=${dayStr(5)}`, { token })
  const de = r.json.data || {}
  check('空白日期返回成功', r.json.code === 0, r.json)
  check('空白日期 hasData=false', de.hasData === false, de.hasData)
  check('空白日期无时段/事件', (de.segments || []).length === 0 && (de.events || []).length === 0, de)
  check('空白日期覆盖率 0', de.coveragePercent === 0, de.coveragePercent)
  check('空白日期不是今天', de.isToday === false, de.isToday)

  // ===== 历史日期的跨夜睡眠只算当天那段 =====
  r = await call('GET', `/stats/clock?babyId=${babyId}&date=${dayStr(1)}`, { token })
  const dy = r.json.data || {}
  const ySleep = (dy.segments || []).find((s) => s.kind === 'sleep')
  check('昨天睡眠 22:00-24:00（只算入睡那段）', ySleep && ySleep.start === 1320 && ySleep.end === 1440 && ySleep.endText === '24:00', ySleep)
  check('昨天跨夜标注「今天入睡，明天起床」', ySleep && ySleep.detail === '今天入睡，明天起床', ySleep && ySleep.detail)
  check('昨天覆盖率按全天算', typeof dy.coveragePercent === 'number' && dy.coveragePercent === 8, dy.coveragePercent)

  // ===== 清理 =====
  await FeedingRecord.destroy({ where: { babyId } })
  await DiaperRecord.destroy({ where: { babyId } })
  await SleepRecord.destroy({ where: { babyId } })
  await ExerciseRecord.destroy({ where: { babyId } })
  await BathRecord.destroy({ where: { babyId } })
  await TemperatureRecord.destroy({ where: { babyId } })
  await WaterRecord.destroy({ where: { babyId } })
  await SupplementRecord.destroy({ where: { babyId } })
  await Baby.destroy({ where: { id: babyId } })
  await User.destroy({ where: { id: user.id } })

  console.log(`\n通过 ${pass} / 失败 ${fail}`)
  await sequelize.close()
  process.exit(fail > 0 ? 1 : 0)
}

main().catch(async (e) => {
  console.error('冒烟异常:', e)
  await sequelize.close().catch(() => {})
  process.exit(1)
})
