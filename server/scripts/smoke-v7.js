/**
 * 冒烟：跨天「距上次」兜底
 * 昨天 23:50 的喂养 + 换尿片，今天无任何记录 → daily 仍返回 lastFeeding / lastDiaper
 * 容器内运行：node scripts/smoke-v7.js
 */
const jwt = require('jsonwebtoken')
const { Op } = require('sequelize')
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
    console.log(`❌ ${name}${extra ? ' — ' + JSON.stringify(extra) : ''}`)
  }
}

function makeToken(userId) {
  return jwt.sign({ userId, openid: `smoke7_${userId}` }, config.jwtSecret, { expiresIn: '1d' })
}

async function api(path) {
  const res = await fetch(BASE + path, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return res.json()
}

let token = null

async function main() {
  const user = await User.create({ openid: `smoke7_${Date.now()}`, nickName: '冒烟7' })
  token = makeToken(user.id)

  const baby = await Baby.create({
    userId: user.id,
    name: '跨天宝宝',
    gender: 1,
    inviteCode: `S7${String(Date.now()).slice(-4)}`,
  })
  await BabyMember.create({ babyId: baby.id, userId: user.id, role: 'owner', relation: '爸爸' })
  await User.update({ currentBabyId: baby.id }, { where: { id: user.id } })

  // 昨天 23:50 的喂养 + 尿片（今天没有任何记录）
  const d = new Date()
  d.setDate(d.getDate() - 1)
  const p = (n) => String(n).padStart(2, '0')
  const yesterday = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`

  await FeedingRecord.create({
    babyId: baby.id,
    userId: user.id,
    type: 'formula',
    amount: 150,
    time: `${yesterday} 23:50:00`,
    status: 1,
  })
  await DiaperRecord.create({
    babyId: baby.id,
    userId: user.id,
    type: 'poo',
    time: `${yesterday} 23:40:00`,
    status: 1,
  })

  // 今天 daily
  const r = await api('/stats/daily')
  const s = r.data || {}
  check('跨天：lastFeeding 存在', s.feeding && s.feeding.lastFeeding, s.feeding)
  check(
    '跨天：喂养显示昨晚 23:50',
    s.feeding.lastFeeding && s.feeding.lastFeeding.timeText === '23:50',
    s.feeding.lastFeeding
  )
  check(
    '跨天：喂养 agoText 为 X天X小时前',
    s.feeding.lastFeeding && /天/.test(s.feeding.lastFeeding.agoText || ''),
    s.feeding.lastFeeding
  )
  check('跨天：lastDiaper 存在', s.diaper && s.diaper.lastDiaper, s.diaper)
  check(
    '跨天：尿片显示昨晚 23:40 · 大便',
    s.diaper.lastDiaper && s.diaper.lastDiaper.timeText === '23:40' && s.diaper.lastDiaper.typeText === '大便',
    s.diaper.lastDiaper
  )

  // 今天有记录时仍取今天的
  await DiaperRecord.create({
    babyId: baby.id,
    userId: user.id,
    type: 'pee',
    time: `${yesterday.replace(/^\d{4}/, String(new Date().getFullYear()))} 08:00:00`.replace(
      new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0') + '-' + String(new Date().getDate()).padStart(2, '0'),
      new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0') + '-' + String(new Date().getDate()).padStart(2, '0')
    ),
    status: 1,
  })
  // 上面时间构造容易出错，直接用今天日期重建
  await DiaperRecord.destroy({ where: { babyId: baby.id, type: 'pee' } })
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${p(today.getMonth() + 1)}-${p(today.getDate())}`
  await DiaperRecord.create({
    babyId: baby.id,
    userId: user.id,
    type: 'pee',
    time: `${todayStr} 08:00:00`,
    status: 1,
  })

  const r2 = await api('/stats/daily')
  const d2 = r2.data && r2.data.diaper
  check(
    '今天有记录：lastDiaper 取今天的 08:00',
    d2.lastDiaper && d2.lastDiaper.timeText === '08:00',
    d2.lastDiaper
  )

  // 清理
  await DiaperRecord.destroy({ where: { babyId: baby.id } })
  await FeedingRecord.destroy({ where: { babyId: baby.id } })
  await BabyMember.destroy({ where: { babyId: baby.id } })
  await Baby.destroy({ where: { id: baby.id } })
  await User.destroy({ where: { openid: { [Op.like]: 'smoke7_%' } } })

  console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
  await sequelize.close()
  process.exit(fail ? 1 : 0)
}

main().catch(async (err) => {
  console.error('冒烟异常:', err.message)
  await sequelize.close().catch(() => {})
  process.exit(1)
})
