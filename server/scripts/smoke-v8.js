/**
 * 冒烟 v8：喂水 / 喂养品 / 提醒 / 历史日期 / 养育小贴士
 * 容器内运行：node scripts/smoke-v8.js
 */
const jwt = require('jsonwebtoken')
const {
  sequelize,
  User,
  Baby,
  BabyMember,
  WaterRecord,
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

function makeToken(userId) {
  return jwt.sign({ userId, openid: `smoke8_${userId}` }, config.jwtSecret, { expiresIn: '1d' })
}

let token = null

async function api(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  return res.json()
}

const today = () => {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

async function main() {
  const user = await User.create({ openid: `smoke8_${Date.now()}`, nickName: '冒烟8' })
  token = makeToken(user.id)

  // 生日设为 60 天前 → 应命中 1~3 月龄 tips
  const birth = new Date()
  birth.setDate(birth.getDate() - 60)
  const p = (n) => String(n).padStart(2, '0')
  const birthday = `${birth.getFullYear()}-${p(birth.getMonth() + 1)}-${p(birth.getDate())}`

  const baby = await Baby.create({
    userId: user.id,
    name: '冒烟宝宝8',
    gender: 1,
    birthday,
    inviteCode: `S8${String(Date.now()).slice(-4)}`,
  })
  await BabyMember.create({ babyId: baby.id, userId: user.id, role: 'owner', relation: '妈妈' })
  await User.update({ currentBabyId: baby.id }, { where: { id: user.id } })

  // ===== 1. 喂水记录 =====
  let r = await api('POST', '/records/water', { amount: 20, time: `${today()} 09:00:00` })
  check('记录喂水 20ml', r.code === 0 && r.data.id > 0, r)

  r = await api('POST', '/records/water', { time: `${today()} 10:00:00` })
  check('喂水不记毫升（只记喝了水）', r.code === 0 && r.data.amount === null, r)

  r = await api('PUT', `/records/water/${r.data.id}`, { amount: 30 })
  check('修改喂水量', r.code === 0, r)

  // ===== 2. 喂养品记录 =====
  r = await api('POST', '/records/supplement', { name: 'AD', time: `${today()} 08:00:00` })
  check('记录维生素AD', r.code === 0 && r.data.name === 'AD', r)

  r = await api('POST', '/records/supplement', { name: '维生素AD', time: `${today()} 08:30:00` })
  check('「维生素AD」归一化为 AD', r.code === 0 && r.data.name === 'AD', r)

  r = await api('POST', '/records/supplement', { name: 'D3', time: `${today()} 11:00:00` })
  check('记录自定义喂养品 D3', r.code === 0 && r.data.name === 'D3', r)

  // ===== 3. 自定义喂养项 =====
  r = await api('POST', '/records/custom-feeds', { name: '钙' })
  check('添加自定义喂养项「钙」', r.code === 0 && r.data.id > 0, r)
  const customId = r.data.id

  r = await api('POST', '/records/custom-feeds', { name: '钙' })
  check('重复添加不报错（幂等）', r.code === 0 && r.data.existed === true, r)

  r = await api('GET', '/records/custom-feeds')
  check('自定义喂养项列表', r.code === 0 && r.data.list.some((c) => c.name === '钙'), r)

  // ===== 4. 提醒逻辑（今天已喂 AD + 没喂两顿奶 + 没记录钙）=====
  r = await api('GET', '/stats/daily')
  const reminders = (r.data && r.data.reminders) || []
  check('AD 已喂 → 无 AD 提醒', !reminders.some((x) => x.type === 'ad'), reminders)
  check('没喂够两顿奶 → 无喂水提醒', !reminders.some((x) => x.type === 'water'), reminders)
  check('自定义项「钙」没喂 → 有提醒', reminders.some((x) => x.type === 'custom' && x.name === '钙'), reminders)

  // 喂第二顿奶 → 触发喂水提醒（已喂水20+30ml 应不触发？规则：有水记录即不提醒）
  await api('POST', '/records/feeding', { type: 'formula', amount: 120, time: `${today()} 07:30:00` })
  await api('POST', '/records/feeding', { type: 'formula', amount: 150, time: `${today()} 11:30:00` })
  r = await api('GET', '/stats/daily')
  check('两顿奶 + 已喂水 → 无喂水提醒', !((r.data.reminders || []).some((x) => x.type === 'water')), r.data.reminders)
  check('stats 含 water 统计', r.data.water && r.data.water.count >= 2 && r.data.water.totalAmount === 50, r.data.water)
  check('stats 含 supplement 统计 + hasAd', r.data.supplement && r.data.supplement.hasAd === true, r.data.supplement)

  // 删掉喂水记录 → 触发喂水提醒
  const waters = await WaterRecord.findAll({ where: {}, raw: true })
  await api('DELETE', `/records/water/${waters[waters.length - 1].id}`)
  await api('DELETE', `/records/water/${waters[waters.length - 2].id}`)
  r = await api('GET', '/stats/daily')
  check('两顿奶 + 没喂水 → 必须喂水提醒', (r.data.reminders || []).some((x) => x.type === 'water' && x.level === 'urgent'), r.data.reminders)

  // 记录钙 → 自定义提醒消失
  await api('POST', '/records/supplement', { name: '钙', time: `${today()} 12:00:00` })
  r = await api('GET', '/stats/daily')
  check('记录钙后自定义提醒消失', !((r.data.reminders || []).some((x) => x.type === 'custom' && x.name === '钙')), r.data.reminders)

  // 补一条喂水（前面删光了），供时间线检查
  await api('POST', '/records/water', { amount: 40, time: `${today()} 13:00:00` })

  // ===== 5. 时间线 =====
  r = await api('GET', `/records/timeline?date=${today()}`)
  const kinds = (r.data.list || []).map((x) => x.kind)
  check('时间线包含 water', kinds.includes('water'), kinds)
  check('时间线包含 supplement', kinds.includes('supplement'), kinds)
  const adItem = (r.data.list || []).find((x) => x.kind === 'supplement' && x.name === 'AD')
  check('时间线 AD 显示「维生素AD」', adItem && adItem.title === '维生素AD', adItem)

  // ===== 6. 历史日期 =====
  const d = new Date()
  d.setDate(d.getDate() - 2)
  const past = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
  await SupplementRecord.create({
    babyId: baby.id,
    userId: user.id,
    name: 'AD',
    time: `${past} 09:00:00`,
  })
  r = await api('GET', `/records/timeline?date=${past}`)
  check('历史日期时间线有记录', r.code === 0 && r.data.list.length === 1, r.data)

  r = await api('GET', `/stats/daily?date=${past}`)
  check('历史日期无提醒（reminders 为空）', r.code === 0 && Array.isArray(r.data.reminders) && r.data.reminders.length === 0, r.data.reminders)
  check('历史日期有评分', r.data.score && typeof r.data.score.total === 'number', r.data.score)

  // ===== 7. 小贴士 =====
  r = await api('GET', '/tips')
  check('tips 返回天数（60天）', r.code === 0 && r.data.ageDays >= 59 && r.data.ageDays <= 61, r.data)
  check('tips 命中 1~3 月龄内容', (r.data.groups || []).some((g) =>
    g.items.some((i) => i.content.includes('600~800ml'))
  ), r.data.groups)
  check('tips 分组含喂养/睡眠', (r.data.groups || []).some((g) => g.category === 'feeding') && (r.data.groups || []).some((g) => g.category === 'sleep'), r.data.groups)

  // 无生日宝宝 → 空 tips 不报错
  const baby2 = await Baby.create({
    userId: user.id,
    name: '无生日宝宝',
    inviteCode: `S8B${String(Date.now()).slice(-3)}`,
  })
  await User.update({ currentBabyId: baby2.id }, { where: { id: user.id } })
  r = await api('GET', '/tips')
  check('无生日宝宝 tips 为空不报错', r.code === 0 && r.data.groups.length === 0, r)

  // 多宝宝显式参数解析：babyId 指向宝宝2 时不能串到宝宝1
  r = await api('GET', `/records/timeline?babyId=${baby2.id}&date=${today()}`)
  check('显式 babyId 解析到正确宝宝', r.code === 0 && r.data.list.length === 0, r.data)

  // ===== 8. 删除自定义喂养项 =====
  await User.update({ currentBabyId: baby.id }, { where: { id: user.id } })
  r = await api('DELETE', `/records/custom-feeds/${customId}`)
  check('删除自定义喂养项', r.code === 0, r)
  r = await api('GET', '/records/custom-feeds')
  check('删除后列表不再包含', !(r.data.list || []).some((c) => c.name === '钙'), r.data)

  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`)
  await sequelize.close()
  process.exit(fail > 0 ? 1 : 0)
}

main().catch(async (err) => {
  console.error('冒烟异常:', err)
  await sequelize.close()
  process.exit(1)
})
