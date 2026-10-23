/**
 * 家人共享 + 吐奶 / 洗澡 冒烟测试
 *
 * 在容器内运行：docker cp → docker compose exec server node scripts/smoke-sharing.js
 * 自己造两个用户（创建者 + 家人），跑完整流程后打印结果
 */
const jwt = require('jsonwebtoken')
const config = require('../config')
const {
  sequelize,
  User,
  Baby,
  BabyMember,
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
  return jwt.sign({ userId, openid: `smoke_${userId}` }, config.jwtSecret, {
    expiresIn: '1d',
  })
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

async function main() {
  const stamp = Date.now()

  // 造两个用户
  const owner = await User.create({
    openid: `smoke_owner_${stamp}`,
    nickName: '测试妈妈',
  })
  const granny = await User.create({
    openid: `smoke_granny_${stamp}`,
    nickName: '测试奶奶',
  })

  // 造一个宝宝（创建者是 owner）
  const baby = await Baby.create({
    userId: owner.id,
    name: '共享宝宝',
    gender: 1,
    inviteCode: 'SMOKE1',
  })
  await BabyMember.create({
    babyId: baby.id,
    userId: owner.id,
    role: 'owner',
    relation: '妈妈',
  })
  await User.update({ currentBabyId: baby.id }, { where: { id: owner.id } })

  const A = owner.id
  const B = granny.id

  console.log('\n--- 1. 宝宝列表与权限 ---')
  let r = await api('GET', '/babies', A)
  const myBaby = (r.data.list || []).find((b) => b.id === baby.id)
  check('创建者能看到自己的宝宝', !!myBaby)
  check('创建者 isOwner = true', myBaby && myBaby.isOwner === true, myBaby)
  check('成员数为 1', myBaby && myBaby.memberCount === 1, myBaby)

  r = await api('GET', '/babies', B)
  check('未加入时家人看不到宝宝', !(r.data.list || []).some((b) => b.id === baby.id))

  console.log('\n--- 2. 邀请码 ---')
  r = await api('POST', `/babies/${baby.id}/invite`, A)
  const code = r.data && r.data.inviteCode
  check('创建者能拿到邀请码', !!code, r)
  check('返回分享路径', r.data && r.data.path === `/pages/invite/invite?code=${code}`, r.data)

  r = await api('POST', `/babies/${baby.id}/invite`, B)
  check('非创建者不能生成邀请码', r.code !== 0, r)

  r = await api('GET', `/babies/invite-info/${code}`, B)
  check('家人能查到邀请信息', r.code === 0 && r.data.babyName === '共享宝宝', r)
  check('显示邀请人称呼', r.data && r.data.inviterName === '妈妈', r.data)

  r = await api('GET', '/babies/invite-info/BADCOD', B)
  check('错误邀请码报失效', r.code !== 0, r)

  console.log('\n--- 3. 加入 ---')
  r = await api('POST', '/babies/join', B, { code, relation: '奶奶' })
  check('家人凭码加入成功', r.code === 0, r)
  check('加入后自动切到该宝宝', r.data && r.data.currentBabyId === baby.id, r.data)

  r = await api('GET', '/babies', B)
  const shared = (r.data.list || []).find((b) => b.id === baby.id)
  check('加入后能看到宝宝', !!shared)
  check('角色是 member', shared && shared.role === 'member', shared)
  check('isOwner = false', shared && shared.isOwner === false, shared)
  check('成员数变成 2', shared && shared.memberCount === 2, shared)

  r = await api('POST', '/babies/join', B, { code, relation: '奶奶' })
  check('重复加入被拒绝', r.code !== 0, r)

  r = await api('POST', '/babies/join', A, { code, relation: '爸爸' })
  check('创建者不能加入自己的宝宝', r.code !== 0, r)

  console.log('\n--- 4. 家人记录 ---')
  const today = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const timeStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())} 10:00:00`

  r = await api('POST', '/records/spitup', B, { babyId: baby.id, level: 2, time: timeStr })
  check('家人能记吐奶', r.code === 0 && r.data.levelText === '中量', r)
  const spitUpId = r.data && r.data.id

  r = await api('POST', '/records/bath', B, {
    babyId: baby.id,
    duration: 10,
    waterTemp: 38,
    time: timeStr,
  })
  check('家人能记洗澡', r.code === 0 && r.data.waterTemp === 38, r)
  const bathId = r.data && r.data.id

  r = await api('POST', '/records/bath', B, { babyId: baby.id, duration: null, time: timeStr })
  check('洗澡可以不记时长', r.code === 0 && (r.data.duration === null || r.data.duration === undefined), r)

  r = await api('POST', '/records/bath', B, { babyId: baby.id, duration: 999, time: timeStr })
  check('洗澡时长超范围被拒', r.code !== 0, r)

  r = await api('POST', '/records/bath', B, { babyId: baby.id, waterTemp: 80, time: timeStr })
  check('水温超范围被拒', r.code !== 0, r)

  console.log('\n--- 5. 数据共享可见 ---')
  r = await api('GET', `/records/timeline?babyId=${baby.id}`, A)
  const kinds = (r.data.list || []).map((i) => i.kind)
  check('创建者能看到家人记的吐奶', kinds.includes('spitup'), kinds)
  check('创建者能看到家人记的洗澡', kinds.includes('bath'), kinds)
  const spitItem = (r.data.list || []).find((i) => i.kind === 'spitup')
  check('时间线显示记录人是奶奶', spitItem && spitItem.recorder === '奶奶', spitItem)

  r = await api('GET', `/stats/daily?babyId=${baby.id}`, A)
  check('统计含吐奶', r.data.spitUp && r.data.spitUp.count >= 1, r.data.spitUp)
  check('统计含洗澡', r.data.bath && r.data.bath.count >= 1, r.data.bath)
  check('洗澡累计时长正确', r.data.bath.minutes === 10, r.data.bath)

  console.log('\n--- 6. 权限边界 ---')
  r = await api('PUT', `/babies/${baby.id}`, B, { name: '被改名' })
  check('家人不能修改宝宝资料', r.code !== 0, r)

  r = await api('DELETE', `/babies/${baby.id}`, B)
  check('家人不能删除宝宝', r.code !== 0, r)

  r = await api('DELETE', `/babies/${baby.id}/members/${owner.id}`, B)
  check('家人不能移除成员', r.code !== 0, r)

  r = await api('GET', `/babies/${baby.id}/members`, A)
  check('成员列表有 2 人', (r.data.list || []).length === 2, r.data)
  const grannyRow = (r.data.list || []).find((m) => m.userId === B)
  check('家人称呼显示奶奶', grannyRow && grannyRow.name === '奶奶', grannyRow)

  // 家人删自己记的 → 允许；创建者删家人记的 → 允许
  r = await api('DELETE', `/records/bath/${bathId}`, B)
  check('家人能删自己记的', r.code === 0, r)
  r = await api('DELETE', `/records/spitup/${spitUpId}`, A)
  check('创建者能删家人记的', r.code === 0, r)

  console.log('\n--- 7. 退出 ---')
  r = await api('POST', `/babies/${baby.id}/leave`, A)
  check('创建者不能退出', r.code !== 0, r)

  r = await api('POST', `/babies/${baby.id}/leave`, B)
  check('家人能退出', r.code === 0, r)

  r = await api('GET', '/babies', B)
  check('退出后看不到宝宝', !(r.data.list || []).some((b) => b.id === baby.id))

  r = await api('GET', `/records/timeline?babyId=${baby.id}`, B)
  check('退出后不能读时间线', r.code !== 0, r)

  console.log('\n--- 8. 移除成员 ---')
  await BabyMember.create({ babyId: baby.id, userId: B, role: 'member', relation: '奶奶' })
  r = await api('DELETE', `/babies/${baby.id}/members/${B}`, A)
  check('创建者能移除成员', r.code === 0, r)
  r = await api('GET', `/babies/${baby.id}/members`, A)
  check('移除后成员数回到 1', (r.data.list || []).length === 1, r.data.list)

  // 清理
  await SpitUpRecord.destroy({ where: { babyId: baby.id } })
  await BathRecord.destroy({ where: { babyId: baby.id } })
  await BabyMember.destroy({ where: { babyId: baby.id } })
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
