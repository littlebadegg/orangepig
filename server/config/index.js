/**
 * 配置管理 — 统一读取环境变量
 */
require('dotenv').config()

module.exports = {
  port: process.env.PORT || 3000,
  mysql: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 3306,
    database: process.env.DB_NAME || 'orangepig',
    username: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    pool: {
      max: parseInt(process.env.DB_POOL_MAX) || 10,
      min: parseInt(process.env.DB_POOL_MIN) || 0,
      acquire: parseInt(process.env.DB_POOL_ACQUIRE) || 30000,
      idle: parseInt(process.env.DB_POOL_IDLE) || 10000,
    },
  },
  jwtSecret: process.env.JWT_SECRET || 'default-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  wx: {
    appid: process.env.WX_APPID || '',
    secret: process.env.WX_SECRET || '',
  },
  // 启动时是否自动插入演示数据（生产环境可设 SEED_DEMO=false 关闭）
  seedDemo: process.env.SEED_DEMO !== 'false',
}
