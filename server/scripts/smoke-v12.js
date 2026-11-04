/**
 * 冒烟 v12：操作日志埋点 + 后台宝宝画像
 * 前置：服务以 ADMIN_PASSWORD=smoke-admin-pwd 启动
 * 容器内运行：node scripts/smoke-v12.js
 */
const jwt = require('jsonwebtoken')
const {
  sequelize,
  User,
  Baby,
  BabyMember,
  FeedingRecord,
  DiaperRecord,
  ActivityLog,
} = require('../models')
const config = require('../config')

const BASE = 'http://127.0.0.1:3000/api'
// 口令从环境变量或临时文件读，避免出现在命令行里
const fs = require('fs')
function readAdminPwd() {
  if (process.env.ADMIN_PASSWORD) return process.env.ADMIN_PASSWORD
  try {
    return fs.readFileSync('/tmp/orangepig-admin-test.txt', 'utf8').trim()
  } catch (e) {
    return ''
  }
}
const ADMIN_PWD = readAdminPwd()
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

async function call(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: res.status, json: await res.json() }
}

const p = (n) => String(n).padStart(2, '0')
const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const stamp = Date.now()
  const mama = await User.create({ openid: `smoke12_m_${stamp}`, nickName: '冒烟12妈妈' })
  const papa = await User.create({ openid: `smoke12_p_${stamp}`, nickName: '冒烟12爸爸' })
  const mamaToken = jwt.sign({ userId: mama.id, openid: mama.openid }, config.jwtSecret, { expiresIn: '1d' })
  const papaToken = jwt.sign({ userId: papa.id, openid: papa.openid }, config.jwtSecret, { expiresIn: '1d' })

  // ===== 1. 建宝宝（妈妈，走接口，验证 baby_create 埋点）=====
  let r = await call('POST', '/babies', {
    token: mamaToken,
    body: { name: '冒烟画像宝宝', gender: 1, birthday: '2026-06-01', relation: '妈妈' },
  })
  check('妈妈创建宝宝', r.json.code === 0, r.json)
  const babyId = r.json.data.id
  await User.update({ currentBabyId: babyId }, { where: { id: mama.id } })
  await User.update({ currentBabyId: babyId }, { where: { id: papa.id } })

  // 爸爸加入
  const babyRow = await Baby.findByPk(babyId, { raw: true })
  r = await call('POST', '/babies/join', {
    token: papaToken,
    body: { code: babyRow.inviteCode, relation: '爸爸' },
  })
  check('爸爸凭邀请码加入', r.json.code === 0, r.json)

  await sleep(300)

  // ===== 2. 记录埋点 =====
  r = await call('POST', '/records/feeding', {
    token: mamaToken,
    body: { babyId, type: 'formula', amount: 180, time: `${today()} 08:00:00` },
  })
  check('妈妈记一条喂奶', r.json.code === 0, r.json)
  const feedingId = r.json.data.id

  r = await call('POST', '/records/diaper', {
    token: papaToken,
    body: { babyId, type: 'pee', time: `${today()} 09:00:00` },
  })
  check('爸爸记一条换尿片', r.json.code === 0, r.json)

  r = await call('PUT', `/records/feeding/${feedingId}`, {
    token: papaToken,
    body: { amount: 200 },
  })
  check('爸爸修改妈妈的记录（权限放开）', r.json.code === 0, r.json)

  await sleep(500)

  let logs = await ActivityLog.findAll({ where: { babyId }, raw: true })
  check('创建宝宝有日志', logs.some((l) => l.action === 'baby_create'), logs.map((l) => l.action))
  check('加入宝宝有日志', logs.some((l) => l.action === 'member_join'), logs.map((l) => l.action))
  const createLog = logs.find((l) => l.action === 'record_create' && l.targetType === 'feeding')
  check('新增喂奶有日志', !!createLog, logs.map((l) => l.action))
  check('日志带摘要（奶粉 180ml）', !!createLog && /180/.test(createLog.detail || ''), createLog && createLog.detail)
  check('修改记录记为 record_update', logs.some((l) => l.action === 'record_update' && l.targetType === 'feeding'), logs.map((l) => l.action))
  check('日志记录操作人', createLog && Number(createLog.userId) === mama.id, createLog && createLog.userId)

  // ===== 3. 查看埋点 + 去重 =====
  r = await call('GET', `/records/timeline?date=${today()}`, { token: mamaToken })
  check('查看今日时间线', r.json.code === 0, r.json)
  await sleep(300)
  r = await call('GET', `/records/timeline?date=${today()}`, { token: mamaToken })
  await sleep(300)

  logs = await ActivityLog.findAll({ where: { babyId, action: 'view_timeline' }, raw: true })
  check('查看记录有埋点', logs.length >= 1, logs.length)
  check('30 分钟内重复查看只记一次', logs.length === 1, logs.length)
  check('埋点带查看日期', logs[0] && logs[0].viewDate === today(), logs[0] && logs[0].viewDate)

  // 昨天（历史日期）另记一条
  const y = new Date(Date.now() - 86400000)
  const yesterday = `${y.getFullYear()}-${p(y.getMonth() + 1)}-${p(y.getDate())}`
  await call('GET', `/records/timeline?date=${yesterday}`, { token: mamaToken })
  await sleep(300)
  logs = await ActivityLog.findAll({ where: { babyId, action: 'view_timeline' }, raw: true })
  check('回看历史日期单独记一条', logs.length === 2, logs.length)

  // ===== 4. 后台鉴权 =====
  r = await call('GET', '/admin/babies')
  check('未登录访问后台接口被拒', r.status === 401, r.status)

  r = await call('POST', '/admin/login', { body: { password: 'wrong-pwd' } })
  check('错误口令登录失败', r.status === 401 && r.json.code !== 0, r.json)

  r = await call('POST', '/admin/login', { body: { password: ADMIN_PWD } })
  check('正确口令登录成功', r.json.code === 0 && !!r.json.data.token, r.json)
  const adminToken = r.json.data.token

  r = await call('GET', '/admin/babies', { token: mamaToken })
  check('小程序用户 token 不能进后台', r.status === 403, r.status)

  // ===== 5. 宝宝列表 =====
  r = await call('GET', '/admin/babies', { token: adminToken })
  check('后台能查到宝宝列表', r.json.code === 0 && !!(r.json.data && r.json.data.list), r.json)
  const listed = ((r.json.data && r.json.data.list) || []).find((b) => b.id === babyId)
  check('后台能查到这个宝宝', !!listed, r.json.data && r.json.data.list && r.json.data.list.length)
  check('成员数为 2', listed && listed.memberCount === 2, listed && listed.memberCount)
  check('带最近活跃时间', listed && !!listed.lastActiveAt, listed && listed.lastActiveAt)
  check('成员带称呼', listed && listed.members.some((m) => m.relation === '妈妈') && listed.members.some((m) => m.relation === '爸爸'), listed && listed.members)

  // ===== 6. 画像 =====
  r = await call('GET', `/admin/portrait?babyId=${babyId}&days=7`, { token: adminToken })
  const d = r.json.data
  check('画像接口返回成功', r.json.code === 0 && !!d, r.json)
  if (!d) throw new Error('画像接口无数据，后续用例无法执行')

  check('概览：今日奶量 200ml', d.overview.todayMilkMl === 200, d.overview)
  check('概览：今日喂养 1 次', d.overview.todayFeedingCount === 1, d.overview)
  check('概览：今日尿片 1 次', d.overview.todayDiaperCount === 1, d.overview)

  check('成员 2 人', d.members.length === 2, d.members.length)
  const mamaStat = d.members.find((m) => m.userId === mama.id)
  const papaStat = d.members.find((m) => m.userId === papa.id)
  check('妈妈记录 1 条（喂奶）', mamaStat && mamaStat.range === 1 && mamaStat.byKind.feeding === 1, mamaStat)
  check('爸爸记录 1 条（尿片）', papaStat && papaStat.range === 1 && papaStat.byKind.diaper === 1, papaStat)
  check('活跃度按条数排序稳定', d.members.every((m, i, arr) => i === 0 || arr[i - 1].range >= m.range), d.members.map((m) => m.range))

  check('24 小时分布 24 根柱子', d.rhythm.hourHist.length === 24, d.rhythm.hourHist.length)
  const h8 = d.rhythm.hourHist[8]
  check('08:00 有 1 次喂养', h8 && h8.count === 1, h8)
  check('平均每顿奶量 200ml', d.rhythm.avgMilkMl === 200, d.rhythm.avgMilkMl)
  check('趋势 7 天', d.trend.length === 7, d.trend.length)
  const todayTrend = d.trend[d.trend.length - 1]
  check('趋势最后一天是今天', todayTrend && todayTrend.date === today(), todayTrend && todayTrend.date)
  check('趋势今天奶量 200', todayTrend && todayTrend.milkMl === 200, todayTrend)

  const logTexts = d.logs.map((l) => l.text)
  check('画像里有登录/查看/记录三类日志', d.logs.some((l) => l.action === 'record_create') && d.logs.some((l) => l.action === 'view_timeline') && d.logs.some((l) => l.action === 'member_join'), logTexts)
  check('日志文案可读（含「新增喂奶」）', logTexts.some((t) => t.indexOf('新增喂奶') === 0), logTexts.slice(0, 6))
  check('日志带记录人昵称', d.logs.every((l) => !!l.userName), d.logs.slice(0, 3))

  // ===== 7. 操作流水分页 =====
  r = await call('GET', `/admin/activity?babyId=${babyId}&limit=10`, { token: adminToken })
  check('操作流水可查', r.json.code === 0 && r.json.data.total > 0, r.json.data && r.json.data.total)
  r = await call('GET', `/admin/activity?babyId=${babyId}&action=record_create`, { token: adminToken })
  check('操作流水可按动作过滤', r.json.code === 0 && r.json.data.list.every((l) => l.action === 'record_create'), r.json.data && r.json.data.list.map((l) => l.action))

  // ===== 8. 清理 =====
  await ActivityLog.destroy({ where: { babyId } })
  await FeedingRecord.destroy({ where: { babyId } })
  await DiaperRecord.destroy({ where: { babyId } })
  await BabyMember.destroy({ where: { babyId } })
  await Baby.destroy({ where: { id: babyId } })
  await ActivityLog.destroy({ where: { userId: [mama.id, papa.id] } })
  await User.destroy({ where: { id: [mama.id, papa.id] } })

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
