/**
 * 冒烟：称谓必填 + 可修改 + 上次换尿片
 * 容器内运行：node scripts/smoke-v6.js
 */
const jwt = require('jsonwebtoken')
const {
  sequelize,
  User,
  Baby,
  BabyMember,
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
  return jwt.sign(
    { userId, openid: `smoke6_${userId}` },
    config.jwtSecret,
    { expiresIn: '1d' }
  )
}

async function api(method, url, token, data) {
  const res = await fetch(BASE + url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: data ? JSON.stringify(data) : undefined,
  })
  return res.json()
}

async function makeUser(tag) {
  return User.create({ openid: `smoke6_${tag}_${Date.now()}`, nickName: `冒烟${tag}` })
}

async function main() {
  const owner = await makeUser('owner')
  const member = await makeUser('member')
  const t1 = makeToken(owner.id)
  const t2 = makeToken(member.id)

  // ---- 1. 创建宝宝：不带称谓 → 400 ----
  let r = await api('post', '/babies', t1, { name: '称谓必填', gender: 1 })
  check('创建宝宝不带称谓被拒', r.code === 400, r)

  // ---- 2. 带称谓 → 成功，列表返回 myRelation ----
  r = await api('post', '/babies', t1, {
    name: '称谓必填',
    gender: 1,
    relation: '爸爸',
  })
  check('创建宝宝带称谓成功', r.code === 0 && r.data.id, r)
  const babyId = r.data.id

  r = await api('get', '/babies', t1)
  const mine = (r.data.list || []).find((b) => b.id === babyId)
  check('列表返回 myRelation=爸爸', mine && mine.myRelation === '爸爸', mine)
  check('列表返回 myRelationText', mine && mine.myRelationText === '爸爸', mine)

  // ---- 3. 加入：不带称谓 → 400 ----
  const baby = await Baby.findByPk(babyId)
  r = await api('post', '/babies/join', t2, { code: baby.inviteCode })
  check('凭码加入不带称谓被拒', r.code === 400, r)

  // ---- 4. 带称谓加入 → 成功 ----
  r = await api('post', '/babies/join', t2, {
    code: baby.inviteCode,
    relation: '奶奶',
  })
  check('凭码加入带称谓成功', r.code === 0, r)

  // ---- 5. 成员改自己的称谓（my-relation）----
  r = await api('put', `/babies/${babyId}/my-relation`, t2, { relation: '外婆' })
  check('成员修改自己的称谓', r.code === 0 && r.data.relation === '外婆', r)

  r = await api('get', `/babies/${babyId}/members`, t1)
  const grand = (r.data.list || []).find((m) => m.userId === member.id)
  check('成员列表显示新称谓', grand && grand.relation === '外婆', grand)

  // ---- 6. owner 也能补充自己的称谓 ----
  r = await api('put', `/babies/${babyId}/my-relation`, t1, { relation: '爹地' })
  check('owner 修改自己的称谓', r.code === 0 && r.data.relation === '爹地', r)

  // ---- 7. 空称谓被拒 ----
  r = await api('put', `/babies/${babyId}/my-relation`, t1, { relation: '   ' })
  check('称谓不能改成空', r.code === 400, r)

  // ---- 8. 记一条尿片 → daily 返回 lastDiaper ----
  r = await api('post', '/records/diaper', t1, {
    babyId,
    type: 'both',
    time: '2026-10-26 09:30:00',
  })
  check('记录尿片成功', r.code === 0, r)

  r = await api('get', '/stats/daily', t1)
  const d = r.data && r.data.diaper
  check(
    'daily 返回 lastDiaper',
    d && d.lastDiaper && d.lastDiaper.timeText === '09:30' && d.lastDiaper.typeText === '大小便',
    d
  )
  check('lastDiaper 有 agoText', d && d.lastDiaper && !!d.lastDiaper.agoText, d)

  // ---- 清理 ----
  const { Op } = require('sequelize')
  await DiaperRecord.destroy({ where: { babyId } })
  await BabyMember.destroy({ where: { babyId } })
  await Baby.destroy({ where: { id: babyId } })
  await User.destroy({ where: { openid: { [Op.like]: 'smoke6_%' } } })

  console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
  await sequelize.close()
  process.exit(fail ? 1 : 0)
}

main().catch(async (err) => {
  console.error('冒烟异常:', err.message)
  await sequelize.close().catch(() => {})
  process.exit(1)
})
