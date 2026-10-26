/**
 * 记录人显示兜底验证：
 *   没填称谓的创建者 → 「宝宝昵称的家长」
 *   没填称谓的成员   → 「宝宝昵称的家人」
 *   填了称谓的成员   → 「宝宝昵称的称谓」
 * 在容器内运行：docker compose exec server node scripts/smoke-v5.js
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
  return jwt.sign({ userId, openid: `smoke5_${userId}` }, config.jwtSecret, { expiresIn: '1d' })
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
  // 三个用户都不暴露微信昵称（模拟真实的「橙猪用户_xxx」默认昵称）
  const u1 = await User.create({ openid: `s5_a_${stamp}`, nickName: '橙猪用户8848' }) // owner 不填称谓
  const u2 = await User.create({ openid: `s5_b_${stamp}`, nickName: '橙猪用户9527' }) // 成员不填称谓
  const u3 = await User.create({ openid: `s5_c_${stamp}`, nickName: '橙猪用户0001' }) // 成员填「奶奶」
  const baby = await Baby.create({
    userId: u1.id,
    name: '兜底宝宝',
    gender: 1,
    inviteCode: `S5${String(stamp).slice(-4)}`,
  })
  await BabyMember.create({ babyId: baby.id, userId: u1.id, role: 'owner', relation: '' })
  await BabyMember.create({ babyId: baby.id, userId: u2.id, role: 'member', relation: '' })
  await BabyMember.create({ babyId: baby.id, userId: u3.id, role: 'member', relation: '奶奶' })
  await User.update({ currentBabyId: baby.id }, { where: { id: u1.id } })

  const day = todayStr()
  const mk = (uid) => api('POST', '/records/diaper', uid, { babyId: baby.id, type: 'pee', time: `${day} 10:00:00` })
  await mk(u1.id)
  await mk(u2.id)
  await mk(u3.id)

  const r = await api('GET', `/records/timeline?babyId=${baby.id}&date=${day}`, u1.id)
  const recorders = (r.data.list || []).map((x) => x.recorder)
  check('创建者（未填称谓）→ 兜底宝宝的家长', recorders.includes('兜底宝宝的家长'), recorders)
  check('成员（未填称谓）→ 兜底宝宝的家人', recorders.includes('兜底宝宝的家人'), recorders)
  check('成员（填了奶奶）→ 兜底宝宝的奶奶', recorders.includes('兜底宝宝的奶奶'), recorders)
  check('完全不出现微信昵称编号', !recorders.some((x) => x && x.includes('橙猪用户')), recorders)

  const m = await api('GET', `/babies/${baby.id}/members`, u1.id)
  const names = (m.data.list || m.data || []).map((x) => x.name).filter(Boolean)
  check('成员列表同样不露出编号昵称', !names.some((x) => x && x.includes('橙猪用户')), names)

  await BabyMember.destroy({ where: { babyId: baby.id } })
  await baby.destroy()
  await User.destroy({ where: { id: [u1.id, u2.id, u3.id] } })

  console.log(`\n===== 结果: ${pass} 通过 / ${fail} 失败 =====`)
  process.exit(fail > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error('冒烟脚本异常:', err)
  process.exit(1)
})
