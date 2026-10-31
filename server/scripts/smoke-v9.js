/**
 * 冒烟 v9：跨夜睡眠按天拆分成两段
 * 容器内运行：node scripts/smoke-v9.js
 */
const jwt = require('jsonwebtoken')
const { sequelize, User, Baby, BabyMember, SleepRecord } = require('../models')
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

function makeToken(userId) {
  return jwt.sign({ userId, openid: `smoke9_${userId}` }, config.jwtSecret, { expiresIn: '1d' })
}

let token = null

async function api(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  return res.json()
}

const p = (n) => String(n).padStart(2, '0')
const ymd = (d) => `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
const today = () => ymd(new Date())
const yesterday = () => {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return ymd(d)
}

const isSleep = (x) => x.kind === 'sleep'

async function main() {
  const user = await User.create({ openid: `smoke9_${Date.now()}`, nickName: '冒烟9' })
  token = makeToken(user.id)

  const baby = await Baby.create({
    userId: user.id,
    name: '冒烟宝宝9',
    gender: 1,
    inviteCode: `S9${String(Date.now()).slice(-4)}`,
  })
  await BabyMember.create({ babyId: baby.id, userId: user.id, role: 'owner', relation: '妈妈' })
  await User.update({ currentBabyId: baby.id }, { where: { id: user.id } })

  // ===== 1. 一夜跨天睡眠 22:00 → 次日 06:00 =====
  let r = await api('POST', '/records/sleep', {
    startTime: `${yesterday()} 22:00:00`,
    endTime: `${today()} 06:00:00`,
  })
  check('补录跨夜睡眠（22:00 → 次日 06:00）', r.code === 0 && r.data.id > 0, r)
  const sleepId = r.data.id

  // ===== 2. 昨天的时间线：只有前一段 22:00 → 24:00 =====
  r = await api('GET', `/records/timeline?date=${yesterday()}`)
  let segs = (r.data.list || []).filter(isSleep)
  check('昨天时间线有睡眠条目', segs.length === 1, segs)
  const out = segs[0] || {}
  check('昨天那段是「入睡」的一半（part=out）', out.part === 'out', out.part)
  check('昨天那段时长 120 分钟', out.duration === 120, out.duration)
  check('昨天那段显示 22:00 → 24:00', out.subtitle === '22:00 → 24:00', out.subtitle)
  check('昨天标注了次日几点起床', String(out.tagText).includes('次日 06:00'), out.tagText)
  check('整夜时长 480 分钟', out.wholeDuration === 480, out.wholeDuration)

  // ===== 3. 今天的时间线：只有后一段 00:00 → 06:00 =====
  r = await api('GET', `/records/timeline?date=${today()}`)
  segs = (r.data.list || []).filter(isSleep)
  check('今天时间线有睡眠条目', segs.length === 1, segs)
  const into = segs[0] || {}
  check('今天那段是「起床」的一半（part=in）', into.part === 'in', into.part)
  check('今天那段时长 360 分钟', into.duration === 360, into.duration)
  check('今天那段显示 00:00 → 06:00', into.subtitle === '00:00 → 06:00', into.subtitle)
  check('今天标注了昨夜几点入睡', String(into.tagText).includes('昨夜 22:00'), into.tagText)
  check('两条记录 id 相同（同一条睡眠）', out.id === into.id, { out: out.id, into: into.id })

  // ===== 4. 统计：两天各算各的 =====
  r = await api('GET', `/stats/daily?date=${yesterday()}`)
  check('昨天睡眠统计 120 分钟', r.data.sleep.minutes === 120, r.data.sleep)
  check('昨天睡眠次数 1 次', r.data.sleep.count === 1, r.data.sleep.count)

  r = await api('GET', `/stats/daily?date=${today()}`)
  check('今天睡眠统计 360 分钟（不含昨夜那段）', r.data.sleep.minutes === 360, r.data.sleep)

  // 评分里的睡眠累计也该是当天那段
  const sleepItem = (r.data.score.items || []).find((i) => i.key === 'sleep') || {}
  check('评分睡眠项按当天 6 小时算', String(sleepItem.detail).includes('6小时'), sleepItem.detail)

  // ===== 5. 同一天再来一段普通睡眠（不跨天）=====
  r = await api('POST', '/records/sleep', {
    startTime: `${today()} 13:00:00`,
    endTime: `${today()} 15:00:00`,
  })
  check('补录白天一小觉 13:00 → 15:00', r.code === 0, r)

  r = await api('GET', `/records/timeline?date=${today()}`)
  segs = (r.data.list || []).filter(isSleep)
  check('今天两条睡眠（跨夜半段 + 白天小觉）', segs.length === 2, segs.map((s) => s.part))
  const daySleep = segs.find((s) => s.part === 'whole') || {}
  check('白天小觉 part=whole、120 分钟', daySleep.part === 'whole' && daySleep.duration === 120, daySleep)
  check('白天小觉不显示跨夜标注', !daySleep.tagText, daySleep.tagText)

  r = await api('GET', `/stats/daily?date=${today()}`)
  check('今天睡眠累计 480 分钟', r.data.sleep.minutes === 480, r.data.sleep.minutes)
  check('今天睡眠次数 2 次', r.data.sleep.count === 2, r.data.sleep.count)

  // ===== 6. 趋势：跨夜睡眠分别落到两天 =====
  r = await api('GET', '/stats/trend?days=3')
  const byDate = {}
  ;(r.data.list || []).forEach((d) => (byDate[d.date] = d.sleepMinutes))
  check('趋势里昨天 120 分钟', byDate[yesterday()] === 120, byDate)
  check('趋势里今天 480 分钟', byDate[today()] === 480, byDate)

  // ===== 7. 修改跨夜睡眠后仍然正确拆分 =====
  r = await api('PUT', `/records/sleep/${sleepId}`, {
    startTime: `${yesterday()} 21:30:00`,
    endTime: `${today()} 05:30:00`,
  })
  check('修改跨夜睡眠起止', r.code === 0, r)

  r = await api('GET', `/stats/daily?date=${yesterday()}`)
  check('修改后昨天 150 分钟', r.data.sleep.minutes === 150, r.data.sleep.minutes)
  r = await api('GET', `/stats/daily?date=${today()}`)
  check('修改后今天 330 + 120 = 450 分钟', r.data.sleep.minutes === 450, r.data.sleep.minutes)

  // ===== 8. 删除后两天都不再显示 =====
  r = await api('DELETE', `/records/sleep/${sleepId}`)
  check('删除跨夜睡眠', r.code === 0, r)

  r = await api('GET', `/records/timeline?date=${yesterday()}`)
  check('删除后昨天无睡眠条目', (r.data.list || []).filter(isSleep).length === 0, r.data.list)
  r = await api('GET', `/records/timeline?date=${today()}`)
  check('删除后今天只剩白天小觉', (r.data.list || []).filter(isSleep).length === 1, r.data.list)

  // ===== 9. 清理 =====
  await SleepRecord.destroy({ where: { babyId: baby.id } })
  await BabyMember.destroy({ where: { babyId: baby.id } })
  await Baby.destroy({ where: { id: baby.id } })
  await User.destroy({ where: { id: user.id } })

  console.log(`\n通过 ${pass} / 失败 ${fail}`)
  await sequelize.close()
  process.exit(fail === 0 ? 0 : 1)
}

main().catch(async (e) => {
  console.error('冒烟异常:', e)
  try {
    await sequelize.close()
  } catch (_) {}
  process.exit(1)
})
