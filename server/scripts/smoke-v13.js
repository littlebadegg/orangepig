/**
 * 冒烟 v13：母乳时长统计 + 每日与上一天对比
 * 前置：服务已启动（本地 3000）
 * 运行：node scripts/smoke-v13.js
 */
const jwt = require('jsonwebtoken')
const { sequelize, User, Baby, FeedingRecord, DiaperRecord, SleepRecord } = require('../models')
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
  const user = await User.create({ openid: `smoke13_${stamp}`, nickName: '冒烟13' })
  const token = jwt.sign({ userId: user.id, openid: user.openid }, config.jwtSecret, { expiresIn: '1d' })

  let r = await call('POST', '/babies', {
    token,
    body: { name: '冒烟对比宝宝', gender: 1, birthday: '2026-09-01', relation: '妈妈' },
  })
  check('创建宝宝', r.json.code === 0, r.json)
  const babyId = r.json.data.id
  await User.update({ currentBabyId: babyId }, { where: { id: user.id } })

  // 昨天：1 顿奶粉 100ml + 1 尿片
  r = await call('POST', '/records/feeding', {
    token,
    body: { babyId, type: 'formula', amount: 100, time: `${dayStr(1)} 09:00:00` },
  })
  check('昨天记 1 顿奶粉 100ml', r.json.code === 0, r.json)
  r = await call('POST', '/records/diaper', {
    token,
    body: { babyId, type: 'pee', time: `${dayStr(1)} 10:00:00` },
  })
  check('昨天记 1 次小便', r.json.code === 0, r.json)

  // 今天：2 顿奶粉 150+150、母乳 2 次 10+15 分钟、2 尿片、一段睡眠
  r = await call('POST', '/records/feeding', { token, body: { babyId, type: 'formula', amount: 150, time: `${dayStr(0)} 08:00:00` } })
  check('今天记奶粉 150ml', r.json.code === 0, r.json)
  r = await call('POST', '/records/feeding', { token, body: { babyId, type: 'formula', amount: 150, time: `${dayStr(0)} 11:30:00` } })
  check('今天再记奶粉 150ml', r.json.code === 0, r.json)
  r = await call('POST', '/records/feeding', { token, body: { babyId, type: 'breast', duration: 10, time: `${dayStr(0)} 09:30:00` } })
  check('今天记母乳 10 分钟', r.json.code === 0, r.json)
  r = await call('POST', '/records/feeding', { token, body: { babyId, type: 'breast', duration: 15, time: `${dayStr(0)} 12:30:00` } })
  check('今天记母乳 15 分钟', r.json.code === 0, r.json)
  r = await call('POST', '/records/diaper', { token, body: { babyId, type: 'pee', time: `${dayStr(0)} 10:00:00` } })
  check('今天记小便', r.json.code === 0, r.json)
  r = await call('POST', '/records/diaper', { token, body: { babyId, type: 'poo', time: `${dayStr(0)} 13:00:00` } })
  check('今天记大便', r.json.code === 0, r.json)
  r = await call('POST', '/records/sleep', {
    token,
    body: { babyId, startTime: `${dayStr(0)} 12:00:00`, endTime: `${dayStr(0)} 14:30:00` },
  })
  check('今天记一段睡眠 2.5 小时', r.json.code === 0, r.json)

  // ===== 今日 daily =====
  r = await call('GET', `/stats/daily?babyId=${babyId}&date=${dayStr(0)}`, { token })
  const d = r.json.data || {}
  check('今日 daily 返回成功', r.json.code === 0, r.json)
  check('母乳时长 25 分钟', d.feeding && d.feeding.breastMinutes === 25, d.feeding)
  check('母乳文案 25分钟', d.feeding && d.feeding.breastMinutesText === '25分钟', d.feeding)
  check('奶粉 300ml', d.feeding && d.feeding.totalAmount === 300, d.feeding)
  check('对比对象是昨天', d.compare && d.compare.prevDate === dayStr(1), d.compare)
  check('对比 5 项（含母乳）', d.compare && d.compare.items.length === 5, d.compare && d.compare.items.map((i) => i.key))
  const byKey = {}
  if (d.compare) d.compare.items.forEach((i) => (byKey[i.key] = i))
  check('奶粉对比 +200ml', byKey.amount && byKey.amount.dir === 'up' && byKey.amount.text === '+200ml', byKey.amount)
  check('喂养次数对比 +3次（4次 vs 1次）', byKey.feeding && byKey.feeding.dir === 'up' && byKey.feeding.text === '+3次', byKey.feeding)
  check('母乳对比 +25分钟', byKey.breast && byKey.breast.dir === 'up' && byKey.breast.text === '+25分钟', byKey.breast)
  check('尿片对比 +1次', byKey.diaper && byKey.diaper.dir === 'up' && byKey.diaper.text === '+1次', byKey.diaper)
  check('睡眠对比 +150分钟口径', byKey.sleep && byKey.sleep.dir === 'up' && byKey.sleep.text === '+2小时30分', byKey.sleep)
  check('对比项带当前值', byKey.amount && byKey.amount.value === '300ml', byKey.amount)

  // ===== 昨天 daily（对比前天，前天无数据）=====
  r = await call('GET', `/stats/daily?babyId=${babyId}&date=${dayStr(1)}`, { token })
  const d1 = r.json.data || {}
  check('昨日 daily 返回成功', r.json.code === 0, r.json)
  check('昨日对比对象是前天', d1.compare && d1.compare.prevDate === dayStr(2), d1.compare)
  const prev1 = {}
  if (d1.compare) d1.compare.items.forEach((i) => (prev1[i.key] = i))
  check('昨日无母乳 → 不展示母乳对比项', !prev1.breast, d1.compare && d1.compare.items.map((i) => i.key))
  check('昨日奶粉对比 +100ml', prev1.amount && prev1.amount.dir === 'up' && prev1.amount.text === '+100ml', prev1.amount)
  check('昨日睡眠对比无差值持平?', prev1.sleep && (prev1.sleep.dir === 'up' || prev1.sleep.dir === 'flat'), prev1.sleep)

  // ===== 空宝宝：全持平 =====
  r = await call('POST', '/babies', { token, body: { name: '冒烟空宝宝', gender: 2, birthday: '2026-10-01', relation: '妈妈' } })
  const emptyId = r.json.data.id
  r = await call('GET', `/stats/daily?babyId=${emptyId}&date=${dayStr(0)}`, { token })
  const de = r.json.data || {}
  check('空宝宝 daily 成功', r.json.code === 0, r.json)
  const flatOk =
    de.compare &&
    de.compare.items.every((i) => i.dir === 'flat' && i.text === '持平')
  check('空宝宝各项对比持平', flatOk, de.compare)
  check('空宝宝母乳不展示', de.compare && !de.compare.items.some((i) => i.key === 'breast'), de.compare && de.compare.items.map((i) => i.key))

  // ===== trend 母乳时长 =====
  r = await call('GET', `/stats/trend?babyId=${babyId}&days=7`, { token })
  const list = (r.json.data && r.json.data.list) || []
  check('trend 返回成功', r.json.code === 0, r.json)
  const todayRow = list.find((i) => i.date === dayStr(0))
  const yestRow = list.find((i) => i.date === dayStr(1))
  check('趋势今天母乳 25分钟', todayRow && todayRow.breastText === '25分钟', todayRow)
  check('趋势昨天母乳为空', yestRow && (yestRow.breastText === '' || yestRow.breastText === undefined), yestRow)
  check('趋势今天奶粉 300ml', todayRow && todayRow.totalAmount === 300, todayRow)

  // ===== 清理 =====
  await FeedingRecord.destroy({ where: { babyId: [babyId, emptyId] } })
  await DiaperRecord.destroy({ where: { babyId: [babyId, emptyId] } })
  await SleepRecord.destroy({ where: { babyId: [babyId, emptyId] } })
  await Baby.destroy({ where: { id: [babyId, emptyId] } })
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
