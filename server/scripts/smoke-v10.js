/**
 * 冒烟 v10：AD / D3 吃一种就算补过维生素 D
 * 容器内运行：node scripts/smoke-v10.js
 */
const jwt = require('jsonwebtoken')
const {
  sequelize,
  User,
  Baby,
  BabyMember,
  SupplementRecord,
  CustomFeed,
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
const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** 取今日提醒 */
async function reminders() {
  const r = await api('GET', '/stats/daily')
  return r.data.reminders || []
}

/** 与维生素 D 相关的提醒（合并后的 ad 提醒 + 可能残留的自定义提醒） */
function vitaminDReminders(list) {
  return list.filter(
    (x) => x.type === 'ad' || (x.type === 'custom' && ['AD', 'D3'].includes(x.name))
  )
}

async function main() {
  const user = await User.create({ openid: `smoke10_${Date.now()}`, nickName: '冒烟10' })
  token = jwt.sign({ userId: user.id, openid: `smoke10_${user.id}` }, config.jwtSecret, {
    expiresIn: '1d',
  })

  const baby = await Baby.create({
    userId: user.id,
    name: '冒烟宝宝10',
    gender: 1,
    inviteCode: `SA${String(Date.now()).slice(-4)}`,
  })
  await BabyMember.create({ babyId: baby.id, userId: user.id, role: 'owner', relation: '妈妈' })
  await User.update({ currentBabyId: baby.id }, { where: { id: user.id } })

  // ===== 1. 什么都没喂 → 一条合并提醒 =====
  let list = await reminders()
  let vd = vitaminDReminders(list)
  check('没喂任何维生素 D → 有 1 条提醒', vd.length === 1, vd)
  check('提醒文案说明吃一种就可以', String((vd[0] || {}).text).includes('吃一种'), vd[0])
  check('提醒动作文案包含 AD/D3', String((vd[0] || {}).actionText).includes('AD'), vd[0])

  // ===== 2. 只喂 D3 → 提醒消失（不再要求 AD）=====
  let r = await api('POST', '/records/supplement', {
    name: 'D3',
    time: `${today()} 09:00:00`,
  })
  check('记录 D3', r.code === 0 && r.data.name === 'D3', r)
  const d3Id = r.data.id

  vd = vitaminDReminders(await reminders())
  check('喂了 D3 就不再提醒 AD', vd.length === 0, vd)

  r = await api('GET', '/stats/daily')
  check('hasVitaminD 为 true', r.data.supplement.hasVitaminD === true, r.data.supplement)
  check('hasAd 仍按字面为 false', r.data.supplement.hasAd === false, r.data.supplement)

  // ===== 3. 删掉 D3 → 提醒回来 =====
  await api('DELETE', `/records/supplement/${d3Id}`)
  vd = vitaminDReminders(await reminders())
  check('删掉 D3 后提醒恢复', vd.length === 1, vd)

  // ===== 4. 只喂 AD → 同样算补过 =====
  r = await api('POST', '/records/supplement', { name: 'AD', time: `${today()} 09:10:00` })
  check('记录 AD', r.code === 0, r)
  const adId = r.data.id
  vd = vitaminDReminders(await reminders())
  check('喂了 AD 就不再提醒 D3', vd.length === 0, vd)

  // ===== 5. 历史遗留：D3 曾被存成自定义喂养项 → 不再单独提醒 =====
  r = await api('POST', '/records/custom-feeds', { name: 'D3' })
  check('把 D3 加进自定义喂养项（模拟历史数据）', r.code === 0, r)

  await api('DELETE', `/records/supplement/${adId}`)
  vd = vitaminDReminders(await reminders())
  check('自定义项里的 D3 不会再多出一条提醒', vd.length === 1, vd)
  check('这唯一一条仍是合并提醒（type=ad）', (vd[0] || {}).type === 'ad', vd[0])

  // ===== 6. 其他自定义项照旧逐项提醒 =====
  r = await api('POST', '/records/custom-feeds', { name: '钙' })
  check('添加自定义项「钙」', r.code === 0, r)
  list = await reminders()
  check('「钙」有单独提醒', list.some((x) => x.type === 'custom' && x.name === '钙'), list)

  r = await api('POST', '/records/supplement', { name: '钙', time: `${today()} 10:00:00` })
  check('记录「钙」', r.code === 0 && r.data.name === '钙', r)
  list = await reminders()
  check('记录后「钙」提醒消失', !list.some((x) => x.type === 'custom' && x.name === '钙'), list)

  // ===== 7. 名称归一化：维生素D3 / 维生素AD =====
  r = await api('POST', '/records/supplement', {
    name: '维生素D3',
    time: `${today()} 11:00:00`,
  })
  check('「维生素D3」归一化为 D3', r.code === 0 && r.data.name === 'D3', r)

  r = await api('POST', '/records/supplement', {
    name: '维生素AD',
    time: `${today()} 11:10:00`,
  })
  check('「维生素AD」归一化为 AD', r.code === 0 && r.data.name === 'AD', r)

  vd = vitaminDReminders(await reminders())
  check('归一化后不再有维生素 D 提醒', vd.length === 0, vd)

  // ===== 8. 清理 =====
  await SupplementRecord.destroy({ where: { babyId: baby.id } })
  await CustomFeed.destroy({ where: { babyId: baby.id } })
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
