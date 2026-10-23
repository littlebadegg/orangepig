/**
 * 记录修改 + 每日评分 冒烟测试
 * 在容器内运行：docker compose exec server node scripts/smoke-v2.js
 */
const jwt = require('jsonwebtoken')
const config = require('../config')
const {
  sequelize,
  User,
  Baby,
  BabyMember,
  FeedingRecord,
  DiaperRecord,
  SleepRecord,
  ExerciseRecord,
  GrowthRecord,
  TemperatureRecord,
  SpitUpRecord,
  BathRecord,
} = require('../models')

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
  return jwt.sign({ userId, openid: `smoke2_${userId}` }, config.jwtSecret, { expiresIn: '1d' })
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
  const owner = await User.create({ openid: `smoke2_owner_${stamp}`, nickName: '测试爸爸' })
  const granny = await User.create({ openid: `smoke2_granny_${stamp}`, nickName: '测试外婆' })
  const baby = await Baby.create({
    userId: owner.id,
    name: '修改宝宝',
    gender: 1,
    inviteCode: 'SMK002',
  })
  await BabyMember.create({ babyId: baby.id, userId: owner.id, role: 'owner', relation: '爸爸' })
  await BabyMember.create({ babyId: baby.id, userId: granny.id, role: 'member', relation: '外婆' })
  await User.update({ currentBabyId: baby.id }, { where: { id: owner.id } })

  const A = owner.id
  const B = granny.id
  const day = todayStr()
  const t10 = `${day} 10:00:00`

  console.log('\n--- 1. 各类记录创建 ---')
  let r = await api('POST', '/records/feeding', A, { babyId: baby.id, type: 'formula', amount: 120, time: t10 })
  check('创建喂养', r.code === 0, r)
  const feedId = r.data.id

  r = await api('POST', '/records/diaper', A, { babyId: baby.id, type: 'pee', time: t10 })
  check('创建换尿片', r.code === 0, r)
  const diaperId = r.data.id

  r = await api('POST', '/records/exercise', A, { babyId: baby.id, duration: 5, result: 0, time: t10 })
  check('创建排气操', r.code === 0, r)
  const exerciseId = r.data.id

  r = await api('POST', '/records/growth', A, { babyId: baby.id, height: 60, time: t10 })
  check('创建身高', r.code === 0, r)
  const growthId = r.data.id

  r = await api('POST', '/records/temperature', A, { babyId: baby.id, temperature: 36.8, method: 'ear', time: t10 })
  check('创建体温', r.code === 0, r)
  const tempId = r.data.id

  r = await api('POST', '/records/spitup', A, { babyId: baby.id, level: 1, time: t10 })
  check('创建吐奶', r.code === 0, r)
  const spitId = r.data.id

  r = await api('POST', '/records/bath', A, { babyId: baby.id, duration: 10, waterTemp: 38, time: t10 })
  check('创建洗澡', r.code === 0, r)
  const bathId = r.data.id

  r = await api('POST', '/records/sleep/start', A, { babyId: baby.id, time: `${day} 09:00:00` })
  check('开始睡眠', r.code === 0, r)
  const sleepId = r.data.id

  console.log('\n--- 2. 逐项修改 ---')
  r = await api('PUT', `/records/feeding/${feedId}`, A, { amount: 180 })
  check('修改喂养奶量', r.code === 0, r)

  r = await api('PUT', `/records/diaper/${diaperId}`, A, { type: 'both' })
  check('修改尿片类型', r.code === 0, r)

  r = await api('PUT', `/records/exercise/${exerciseId}`, A, { duration: 12, result: 1 })
  check('修改排气操', r.code === 0, r)

  r = await api('PUT', `/records/growth/${growthId}`, A, { height: 62, weight: 6.5 })
  check('修改身高体重', r.code === 0, r)

  r = await api('PUT', `/records/temperature/${tempId}`, A, { temperature: 37.6, method: 'forehead' })
  check('修改体温', r.code === 0, r)

  r = await api('PUT', `/records/spitup/${spitId}`, A, { level: 3 })
  check('修改吐奶量', r.code === 0, r)

  r = await api('PUT', `/records/bath/${bathId}`, A, { duration: 15, waterTemp: 39 })
  check('修改洗澡', r.code === 0, r)

  r = await api('PUT', `/records/sleep/${sleepId}`, A, {
    startTime: `${day} 09:00:00`,
    endTime: `${day} 11:00:00`,
  })
  check('修改睡眠时间', r.code === 0 && r.data, r)

  console.log('\n--- 3. 修改结果核对 ---')
  r = await api('GET', `/records/timeline?babyId=${baby.id}&date=${day}`, A)
  const list = r.data.list || []
  const feed = list.find((i) => i.kind === 'feeding')
  const diaper = list.find((i) => i.kind === 'diaper')
  const exercise = list.find((i) => i.kind === 'exercise')
  const growth = list.find((i) => i.kind === 'growth')
  const temp = list.find((i) => i.kind === 'temperature')
  const spit = list.find((i) => i.kind === 'spitup')
  const bath = list.find((i) => i.kind === 'bath')
  const sleep = list.find((i) => i.kind === 'sleep')

  check('喂养奶量已变 180', feed && Number(feed.amount) === 180, feed)
  check('尿片类型已变 both', diaper && diaper.type === 'both', diaper)
  check('排气操时长已变 12', exercise && exercise.duration === 12, exercise)
  check('身高已变 62', growth && Number(growth.height) === 62, growth)
  check('体重已变 6.5', growth && Number(growth.weight) === 6.5, growth)
  check('体温已变 37.6', temp && Number(temp.temperature) === 37.6, temp)
  check('吐奶已变大量', spit && spit.level === 3, spit)
  check('洗澡时长已变 15', bath && bath.duration === 15, bath)
  check('睡眠时长重算为 120 分钟', sleep && sleep.duration === 120, sleep)

  console.log('\n--- 4. 校验与权限 ---')
  r = await api('PUT', `/records/feeding/${feedId}`, A, { amount: -5 })
  check('奶量为负被拒', r.code !== 0, r)

  r = await api('PUT', `/records/temperature/${tempId}`, A, { temperature: 99 })
  check('体温超范围被拒', r.code !== 0, r)

  r = await api('PUT', `/records/sleep/${sleepId}`, A, {
    startTime: `${day} 12:00:00`,
    endTime: `${day} 11:00:00`,
  })
  check('起床早于入睡被拒', r.code !== 0, r)

  r = await api('PUT', `/records/feeding/${feedId}`, B, { amount: 200 })
  check('家人不能改别人记的', r.code !== 0, r)

  r = await api('PUT', `/records/nosuch/${feedId}`, A, { amount: 1 })
  check('非法类型被拒', r.code !== 0, r)

  console.log('\n--- 5. 每日评分 ---')
  r = await api('GET', `/stats/daily?babyId=${baby.id}&date=${day}`, A)
  const score = r.data && r.data.score
  check('返回 score 对象', !!score, r.data && Object.keys(r.data))
  check('总分在 0~100', score && score.total >= 0 && score.total <= 100, score && score.total)
  check('五个评分维度', score && score.items.length === 5, score && score.items.map((i) => i.key))
  check('有等级文案', score && typeof score.level === 'string' && score.level.length > 0, score && score.level)
  check('发烧进扣分项', score && score.penaltyItems.some((i) => i.label === '体温偏高'), score && score.penaltyItems)
  check('有明细文本', score && score.items.every((i) => typeof i.detail === 'string'), score && score.items)

  console.log('\n--- 6. 删除仍然可用 ---')
  r = await api('DELETE', `/records/bath/${bathId}`, A)
  check('删除洗澡', r.code === 0, r)
  r = await api('DELETE', `/records/spitup/${spitId}`, A)
  check('删除吐奶', r.code === 0, r)

  // 清理
  const ids = { babyId: baby.id }
  await SleepRecord.destroy({ where: ids })
  await FeedingRecord.destroy({ where: ids })
  await DiaperRecord.destroy({ where: ids })
  await ExerciseRecord.destroy({ where: ids })
  await GrowthRecord.destroy({ where: ids })
  await TemperatureRecord.destroy({ where: ids })
  await SpitUpRecord.destroy({ where: ids })
  await BathRecord.destroy({ where: ids })
  await BabyMember.destroy({ where: ids })
  await baby.destroy()
  await owner.destroy()
  await granny.destroy()

  console.log(`\n===== 通过 ${pass} 项，失败 ${fail} 项 =====`)
  await sequelize.close()
  process.exit(fail > 0 ? 1 : 0)
}

main().catch(async (err) => {
  console.error('冒烟脚本异常:', err)
  process.exit(1)
})
