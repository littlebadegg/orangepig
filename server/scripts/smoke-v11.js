/**
 * 冒烟 v11：家人可修改/删除任意成员的记录 + 年龄文案
 * 容器内运行：node scripts/smoke-v11.js
 */
const jwt = require('jsonwebtoken')
const {
  sequelize,
  User,
  Baby,
  BabyMember,
  FeedingRecord,
  DiaperRecord,
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

const tokens = {}

async function apiAs(userId, method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { Authorization: `Bearer ${tokens[userId]}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  return res.json()
}

const p = (n) => String(n).padStart(2, '0')
const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// ===== 本地验证 ageText（复制自 miniprogram/utils/format.js，保持同步） =====
function ageText(birthday) {
  if (!birthday) return ''
  const birth = new Date(String(birthday).replace(/-/g, '/'))
  if (isNaN(birth.getTime())) return ''
  const now = new Date()
  const days = Math.floor((now - birth) / 86400000)
  if (days < 0) return ''
  if (days < 31) return `${days}天`
  let months = (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth())
  if (now.getDate() < birth.getDate()) months -= 1
  if (months < 1) return `${days}天`
  const years = Math.floor(months / 12)
  const rem = months % 12
  if (years >= 1) return rem > 0 ? `${years}岁${rem}个月` : `${years}岁`
  return `${months}个月`
}

async function main() {
  // ===== 年龄文案 =====
  check('空生日 → 空文案', ageText('') === '')
  check('非法生日 → 空文案', ageText('abc') === '')
  check('未来生日 → 空文案', ageText('2030-01-01') === '')
  check('今天出生 → 0天', ageText(today()) === '0天')
  check('20天前 → 20天', (() => {
    const d = new Date(); d.setDate(d.getDate() - 20)
    return ageText(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`)
  })() === '20天')
  check('恰好整月（1个月）', (() => {
    const d = new Date(); d.setMonth(d.getMonth() - 1)
    return ageText(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`)
  })() === '1个月')
  check('2岁整 → 2岁', (() => {
    const d = new Date(); d.setFullYear(d.getFullYear() - 2)
    return ageText(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`)
  })() === '2岁')
  check('2岁多3个月 → 2岁3个月', (() => {
    const d = new Date(); d.setFullYear(d.getFullYear() - 2); d.setMonth(d.getMonth() - 3)
    return ageText(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`)
  })() === '2岁3个月')

  // ===== 家人修改/删除权限 =====
  // 妈妈（owner）建宝宝 + 记录；爸爸（家人）修改/删除妈妈的记录
  const mama = await User.create({ openid: `smoke11_m_${Date.now()}`, nickName: '冒烟11妈妈' })
  const papa = await User.create({ openid: `smoke11_p_${Date.now()}`, nickName: '冒烟11爸爸' })
  tokens[mama.id] = jwt.sign({ userId: mama.id, openid: mama.openid }, config.jwtSecret, { expiresIn: '1d' })
  tokens[papa.id] = jwt.sign({ userId: papa.id, openid: papa.openid }, config.jwtSecret, { expiresIn: '1d' })

  const baby = await Baby.create({
    userId: mama.id,
    name: '冒烟宝宝11',
    gender: 1,
    birthday: '2026-05-10',
    inviteCode: `SB${String(Date.now()).slice(-4)}`,
  })
  await BabyMember.create({ babyId: baby.id, userId: mama.id, role: 'owner', relation: '妈妈' })
  await BabyMember.create({ babyId: baby.id, userId: papa.id, role: 'member', relation: '爸爸' })
  await User.update({ currentBabyId: baby.id }, { where: { id: mama.id } })
  await User.update({ currentBabyId: baby.id }, { where: { id: papa.id } })

  // 妈妈记一条喂奶
  let r = await apiAs(mama.id, 'POST', '/records/feeding', {
    type: 1, amount: 150, time: `${today()} 08:00:00`,
  })
  check('妈妈记一条喂奶', r.code === 0, r)
  const feedingId = r.data.id

  // 爸爸修改妈妈的记录 → 应允许（PUT 返回 {id, kind}，改完从时间线核对数值）
  r = await apiAs(papa.id, 'PUT', `/records/feeding/${feedingId}`, { amount: 180 })
  check('爸爸可以修改妈妈记的喂奶', r.code === 0, r)
  const after = await FeedingRecord.findByPk(feedingId, { raw: true })
  check('修改已生效（amount=180）', after && Number(after.amount) === 180, after && after.amount)

  // 爸爸记一条换尿片
  r = await apiAs(papa.id, 'POST', '/records/diaper', { type: 'pee', time: `${today()} 09:00:00` })
  check('爸爸记一条换尿片', r.code === 0, r)
  const diaperId = r.data.id

  // 妈妈删除爸爸的记录 → 应允许
  r = await apiAs(mama.id, 'DELETE', `/records/diaper/${diaperId}`)
  check('妈妈可以删除爸爸记的换尿片', r.code === 0, r)
  const gone = await DiaperRecord.findOne({ where: { id: diaperId }, raw: true })
  check('删除后 status=0（软删除生效）', gone && Number(gone.status) === 0, gone)

  // 时间线记录人仍正常（爸爸看妈妈的记录显示「XX的妈妈记的」之类）
  r = await apiAs(papa.id, 'GET', '/records/timeline')
  const item = (r.data.list || []).find((x) => x.kind === 'feeding' && x.id === feedingId)
  check('时间线仍显示记录人', item && String(item.recorder || '').length > 0, item)

  // 陌生人（无关用户）仍应被拒
  const stranger = await User.create({ openid: `smoke11_s_${Date.now()}`, nickName: '冒烟11路人' })
  tokens[stranger.id] = jwt.sign({ userId: stranger.id, openid: stranger.openid }, config.jwtSecret, { expiresIn: '1d' })
  r = await apiAs(stranger.id, 'PUT', `/records/feeding/${feedingId}`, { amount: 999 })
  check('无关用户修改被拒（404 记录不存在）', r.code !== 0, r)
  r = await apiAs(stranger.id, 'DELETE', `/records/feeding/${feedingId}`)
  check('无关用户删除被拒', r.code !== 0, r)

  // ===== 清理 =====
  await FeedingRecord.destroy({ where: { babyId: baby.id } })
  await DiaperRecord.destroy({ where: { babyId: baby.id } })
  await BabyMember.destroy({ where: { babyId: baby.id } })
  await Baby.destroy({ where: { id: baby.id } })
  await User.destroy({ where: { id: mama.id } })
  await User.destroy({ where: { id: papa.id } })
  await User.destroy({ where: { id: stranger.id } })

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
