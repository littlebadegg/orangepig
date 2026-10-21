/**
 * 数据库自动初始化
 *
 * 服务启动时调用一次，实现「拉代码 → docker compose up → 直接用」：
 * 1. 确保数据库存在
 * 2. 清理旧版本遗留表（社交 / 相册）
 * 3. 建/更新表结构
 * 4. 首次运行时插入演示数据
 *
 * 幂等：重复执行不会重复插数据，也不会破坏已有数据
 */
const { Sequelize } = require('sequelize')
const config = require('../config')
const {
  sequelize,
  User,
  Baby,
  FeedingRecord,
  DiaperRecord,
  SleepRecord,
  ExerciseRecord,
  GrowthRecord,
  TemperatureRecord,
} = require('../models')

/** 连接 MySQL 实例（不指定库名）创建数据库 */
async function ensureDatabase() {
  const root = new Sequelize('', config.mysql.username, config.mysql.password, {
    host: config.mysql.host,
    port: config.mysql.port,
    dialect: 'mysql',
    timezone: '+08:00',
    logging: false,
  })
  try {
    await root.query(
      `CREATE DATABASE IF NOT EXISTS \`${config.mysql.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    )
    console.log(`[DB] 数据库 ${config.mysql.database} 已就绪`)
  } catch (err) {
    // 无建库权限时跳过，用已有库
    console.warn('[DB] 建库跳过（无权限）:', err.message)
  } finally {
    await root.close()
  }
}

/** 删除旧版本遗留表 */
async function dropLegacyTables() {
  const legacy = ['photos', 'likes', 'comments', 'follows', 'posts']
  for (const table of legacy) {
    try {
      await sequelize.query(`DROP TABLE IF EXISTS \`${table}\``)
    } catch (e) {
      // 表不存在或无权限，忽略
    }
  }
}

/** 插入演示数据（仅在首次运行时） */
async function seed() {
  const babyCount = await Baby.count()
  if (babyCount > 0) return

  let user = await User.findOne({ order: [['id', 'ASC']] })
  if (!user) {
    user = await User.create({
      openid: 'demo_openid_' + Date.now(),
      nickName: '演示家长',
    })
  }

  const baby = await Baby.create({
    userId: user.id,
    name: '小橙子',
    gender: 1,
    birthday: '2026-02-10',
  })
  await User.update({ currentBabyId: baby.id }, { where: { id: user.id } })

  const now = new Date()
  const at = (h, m) =>
    new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0)

  await FeedingRecord.bulkCreate([
    { babyId: baby.id, userId: user.id, type: 'formula', amount: 120, time: at(6, 30) },
    { babyId: baby.id, userId: user.id, type: 'formula', amount: 150, time: at(9, 30) },
    { babyId: baby.id, userId: user.id, type: 'breast', duration: 20, time: at(12, 10) },
    { babyId: baby.id, userId: user.id, type: 'formula', amount: 180, time: at(15, 40) },
  ])

  await DiaperRecord.bulkCreate([
    { babyId: baby.id, userId: user.id, type: 'pee', time: at(7, 0) },
    { babyId: baby.id, userId: user.id, type: 'poo', time: at(10, 15) },
    { babyId: baby.id, userId: user.id, type: 'both', time: at(14, 0) },
    { babyId: baby.id, userId: user.id, type: 'pee', time: at(17, 20) },
  ])

  await SleepRecord.bulkCreate([
    {
      babyId: baby.id,
      userId: user.id,
      startTime: at(8, 0),
      endTime: at(9, 30),
      duration: 90,
      recordStatus: 1,
    },
    {
      babyId: baby.id,
      userId: user.id,
      startTime: at(13, 0),
      endTime: at(14, 30),
      duration: 90,
      recordStatus: 1,
    },
  ])

  await ExerciseRecord.bulkCreate([
    { babyId: baby.id, userId: user.id, duration: 5, result: 1, time: at(9, 0) },
    { babyId: baby.id, userId: user.id, duration: 10, result: 1, time: at(16, 10) },
  ])

  await TemperatureRecord.bulkCreate([
    { babyId: baby.id, userId: user.id, temperature: 36.8, method: 'ear', time: at(7, 30) },
    { babyId: baby.id, userId: user.id, temperature: 37.0, method: 'ear', time: at(19, 0) },
  ])

  // 身高体重测得少，给两条不同日期的，方便看「最近一次」
  const daysAgo = (n) =>
    new Date(now.getFullYear(), now.getMonth(), now.getDate() - n, 10, 0, 0)

  await GrowthRecord.bulkCreate([
    {
      babyId: baby.id,
      userId: user.id,
      height: 62.5,
      weight: 6.8,
      time: daysAgo(15),
    },
    {
      babyId: baby.id,
      userId: user.id,
      height: 64.0,
      weight: 7.2,
      time: at(10, 0),
    },
  ])

  console.log(`[DB] 演示数据已创建：宝宝「${baby.name}」`)
}

/**
 * 执行初始化（幂等）
 * @param {Object} opts
 * @param {boolean} opts.seedDemo - 是否插入演示数据，默认 true
 */
async function initDatabase(opts = {}) {
  const { seedDemo = true } = opts

  await ensureDatabase()
  await sequelize.authenticate()
  console.log('[DB] MySQL connected')

  await dropLegacyTables()
  // alter: true — 补齐旧表新增列（如 users.current_baby_id）
  await sequelize.sync({ alter: true })
  console.log('[DB] 数据表已同步')

  if (seedDemo) {
    await seed()
  }
}

module.exports = { initDatabase, ensureDatabase, dropLegacyTables, seed }
