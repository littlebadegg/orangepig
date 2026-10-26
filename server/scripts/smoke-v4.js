/**
 * 首页改版冒烟测试：
 *   1. 记录人显示「宝宝昵称 + 家人称号」
 *   2. 家人可以帮别人按「起床」（结束别人开始的睡眠）
 *   3. 家人可改/删睡眠记录，但其他类型仍只能改自己的
 * 在容器内运行：docker compose exec server node scripts/smoke-v4.js
 */
const jwt = require('jsonwebtoken')
const config = require('../config')
const { User, Baby, BabyMember } = require('../models')

const BASE = 'http://127.0.0.1:3000/api'
let pass = 0
let fail = 0

function check(name, ok, extra) {
  if (ok) {
    pass++
    console.log(`✅ ${name}`)
  } else {
    fail++
    console.log(`❌ ${name}`, extra !== undefined ? JSON.stringify(extra) : '')
  }
}

function token(userId) {
  return jwt.sign({ userId, openid: `smoke4_${userId}` }, config.jwtSecret, { expiresIn: '1d' })
}

async function api(method, path, userId, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(userId ? { Authorization: `Bearer ${token(userId)}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  return res.json()
}

function todayStr() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

async function main() {
  const stamp = Date.now()
  const daddy = await User.create({ openid: `smoke4_dad_${stamp}`, nickName: '测试爸爸' })
  const mommy = await User.create({ openid: `smoke4_mom_${stamp}`, nickName: '测试妈妈' })
  const baby = await Baby.create({
    userId: daddy.id,
    name: '小冒烟',
    gender: 1,
    inviteCode: `SM${String(stamp).slice(-4)}`,
  })
  await BabyMember.create({ babyId: baby.id, userId: daddy.id, role: 'owner', relation: '爸爸' })
  await BabyMember.create({ babyId: baby.id, userId: mommy.id, role: 'member', relation: '妈妈' })
  await User.update({ currentBabyId: baby.id }, { where: { id: daddy.id } })
  await User.update({ currentBabyId: baby.id }, { where: { id: mommy.id } })

  const DAD = daddy.id
  const MOM = mommy.id
  const day = todayStr()

  console.log('\n--- 1. 记录人显示「宝宝昵称 + 称谓」 ---')
  let r = await api('POST', '/records/feeding', DAD, {
    babyId: baby.id,
    type: 'formula',
    amount: 120,
    time: `${day} 09:00:00`,
  })
  check('爸爸记一次喂奶', r.code === 0, r)
  const feedId = r.data.id

  r = await api('GET', `/records/timeline?babyId=${baby.id}&date=${day}`, MOM)
  const feedItem = (r.data.list || []).find((x) => x.id === feedId)
  check('时间线返回记录人 = 小冒烟的爸爸', feedItem && feedItem.recorder === '小冒烟的爸爸', feedItem && feedItem.recorder)

  r = await api('POST', '/records/diaper', MOM, {
    babyId: baby.id,
    type: 'pee',
    time: `${day} 09:30:00`,
  })
  check('妈妈记一次尿片', r.code === 0, r)
  const diaperId = r.data.id
  r = await api('GET', `/records/timeline?babyId=${baby.id}&date=${day}`, DAD)
  const diaperItem = (r.data.list || []).find((x) => x.id === diaperId)
  check('时间线返回记录人 = 小冒烟的妈妈', diaperItem && diaperItem.recorder === '小冒烟的妈妈', diaperItem && diaperItem.recorder)

  console.log('\n--- 2. 家人可以帮按「起床」 ---')
  r = await api('POST', '/records/sleep/start', DAD, { babyId: baby.id })
  check('爸爸按「睡觉」', r.code === 0, r)
  const sleepId = r.data.id

  r = await api('POST', '/records/sleep/end', MOM, { babyId: baby.id, id: sleepId })
  check('妈妈按「起床」结束爸爸开始的睡眠', r.code === 0, r)
  check('时长已计算', r.code === 0 && r.data.duration >= 0, r.data)

  r = await api('POST', '/records/sleep/start', MOM, { babyId: baby.id })
  check('妈妈再按一次「睡觉」', r.code === 0, r)
  const sleepId2 = r.data.id
  r = await api('POST', '/records/sleep/end', DAD, { babyId: baby.id, id: sleepId2 })
  check('爸爸也能结束妈妈开始的睡眠', r.code === 0, r)

  console.log('\n--- 3. 睡眠家人可改可删，其他类型仍限本人 ---')
  r = await api('PUT', `/records/sleep/${sleepId}`, MOM, {
    babyId: baby.id,
    startTime: `${day} 08:00:00`,
    endTime: `${day} 09:00:00`,
  })
  check('妈妈修改爸爸记的睡眠', r.code === 0, r)

  r = await api('PUT', `/records/feeding/${feedId}`, MOM, { babyId: baby.id, amount: 150 })
  check('妈妈修改爸爸记的喂奶 → 拒绝', r.code !== 0 && r.code === 403, r)

  r = await api('PUT', `/records/feeding/${feedId}`, DAD, { babyId: baby.id, amount: 150 })
  check('爸爸修改自己的喂奶 → 允许', r.code === 0, r)

  r = await api('DELETE', `/records/sleep/${sleepId}`, MOM, null)
  check('妈妈删除睡眠记录 → 允许', r.code === 0, r)

  r = await api('DELETE', `/records/feeding/${feedId}`, MOM, null)
  check('妈妈删除爸爸的喂奶 → 拒绝', r.code !== 0 && r.code === 403, r)

  console.log('\n--- 4. 评分正常返回 ---')
  r = await api('GET', `/stats/daily?babyId=${baby.id}&date=${day}`, DAD)
  check('daily 返回 score', r.code === 0 && r.data.score && typeof r.data.score.total === 'number', r.data && r.data.score)
  check('score.items 有 5 个维度', r.data.score.items.length === 5, r.data.score.items.length)

  // 清理
  await BabyMember.destroy({ where: { babyId: baby.id } })
  await baby.destroy()
  await User.destroy({ where: { id: [DAD, MOM] } })

  console.log(`\n===== 结果: ${pass} 通过 / ${fail} 失败 =====`)
  process.exit(fail > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error('冒烟脚本异常:', err)
  process.exit(1)
})
