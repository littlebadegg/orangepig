/**
 * 数据库初始化脚本
 *
 * 用法：
 *   node init-db.js
 *
 * 功能：
 *   1. 创建 orangepig 数据库（如果不存在）
 *   2. 同步所有表结构（sequelize.sync）
 *   3. 可选：插入测试数据
 */
require('dotenv').config()
const mysql = require('mysql2/promise')
const config = require('./config')

async function initDatabase() {
  // Step 1: 创建数据库（不指定 database 名连接 MySQL）
  const connection = await mysql.createConnection({
    host: config.mysql.host,
    port: config.mysql.port,
    user: config.mysql.username,
    password: config.mysql.password,
  })

  const dbName = config.mysql.database
  await connection.execute(
    `CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  )
  console.log(`[Init] 数据库 "${dbName}" 已就绪`)
  await connection.end()

  // Step 2: 同步表结构
  const { sequelize, User, Post, Comment, Like, Follow, Photo } = require('./models')
  await sequelize.authenticate()
  console.log('[Init] MySQL 连接成功')

  // force: false 不会删除已有数据
  await sequelize.sync({ force: false })
  console.log('[Init] 表结构同步完成')

  // Step 3: 插入测试数据（仅当 users 表为空时）
  const userCount = await User.count()
  if (userCount === 0) {
    console.log('[Init] 插入测试数据...')

    const testUser = await User.create({
      openid: 'test_openid_001',
      nickName: '橙猪体验官',
      avatarUrl: '',
      bio: '欢迎来到橙猪社区',
    })

    const testUser2 = await User.create({
      openid: 'test_openid_002',
      nickName: '美食探店家',
      avatarUrl: '',
      bio: '分享生活中的美好',
    })

    const staticBase = config.staticBaseUrl || 'http://localhost:3000'

    // 帖子1：带图片
    await Post.create({
      authorId: testUser.id,
      content: '欢迎来到橙猪！这是一个内容社交小程序，快来发布你的第一条内容吧~',
      images: [`${staticBase}/uploads/test_img_01.jpg`],
      status: 1,
    })

    // 帖子2：带多张图片
    await Post.create({
      authorId: testUser2.id,
      content: '今天分享一组测试图片，看看效果如何！橙猪社区正在成长中...',
      images: [
        `${staticBase}/uploads/test_img_01.jpg`,
        `${staticBase}/uploads/test_img_02.jpg`,
        `${staticBase}/uploads/test_img_03.jpg`,
      ],
      status: 1,
    })

    // 帖子3：纯文字
    await Post.create({
      authorId: testUser.id,
      content: '纯文字内容也可以发布哦，分享你的想法和故事。',
      images: [],
      status: 1,
    })

    console.log(`[Init] 测试用户已创建: ${testUser.nickName}, ${testUser2.nickName}`)
    console.log('[Init] 3条测试帖子已创建（含图片）')

    // 测试照片数据 — 相册功能
    const now = new Date()
    const yesterday = new Date(now.getTime() - 86400000)
    const lastWeek = new Date(now.getTime() - 7 * 86400000)
    const lastMonth = new Date(now.getTime() - 30 * 86400000)

    const testPhotos = [
      {
        userId: testUser.id,
        imageUrl: `${staticBase}/uploads/test_img_01.jpg`,
        title: '今日份的天空',
        location: '深圳·南山',
        latitude: 22.5431,
        longitude: 113.9412,
        photoTime: now,
      },
      {
        userId: testUser.id,
        imageUrl: `${staticBase}/uploads/test_img_02.jpg`,
        title: '街角的咖啡店',
        location: '深圳·南山',
        latitude: 22.5431,
        longitude: 113.9412,
        photoTime: now,
      },
      {
        userId: testUser.id,
        imageUrl: `${staticBase}/uploads/test_img_03.jpg`,
        title: '昨天的日落',
        location: '深圳·福田',
        latitude: 22.5410,
        longitude: 114.0579,
        photoTime: yesterday,
      },
      {
        userId: testUser.id,
        imageUrl: `${staticBase}/uploads/test_img_01.jpg`,
        title: '上周的旅行',
        location: '广州·天河',
        latitude: 23.1351,
        longitude: 113.3247,
        photoTime: lastWeek,
      },
      {
        userId: testUser.id,
        imageUrl: `${staticBase}/uploads/test_img_02.jpg`,
        title: '一个月前',
        location: '广州·天河',
        latitude: 23.1351,
        longitude: 113.3247,
        photoTime: lastMonth,
      },
      {
        userId: testUser2.id,
        imageUrl: `${staticBase}/uploads/test_img_03.jpg`,
        title: '美食记录',
        location: '深圳·罗湖',
        latitude: 22.5552,
        longitude: 114.1393,
        photoTime: yesterday,
      },
    ]

    for (const p of testPhotos) {
      await Photo.create(p)
    }
    console.log(`[Init] ${testPhotos.length} 张测试照片已创建（含时间地点信息）`)

    // 测试关注关系
    await Follow.create({ follower: testUser.id, following: testUser2.id })
    await User.increment({ followingCount: 1 }, { where: { id: testUser.id } })
    await User.increment({ followersCount: 1 }, { where: { id: testUser2.id } })
    console.log('[Init] 测试关注关系已创建')
  } else {
    console.log(`[Init] 已有 ${userCount} 个用户，跳过测试数据`)
  }

  console.log('[Init] 数据库初始化完成！')
  process.exit(0)
}

initDatabase().catch((err) => {
  console.error('[Init] 初始化失败:', err.message)
  process.exit(1)
})
