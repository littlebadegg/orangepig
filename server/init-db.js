/**
 * 数据库初始化脚本（独立执行）
 *
 * 用法：npm run init-db
 *
 * 一般不需要手动执行 —— 服务启动时会自动初始化。
 * 这个脚本用于：想在启动服务前先把表建好、或重置演示数据的场景。
 */
const { sequelize } = require('./models')
const { initDatabase } = require('./utils/db-init')

async function main() {
  try {
    await initDatabase({ seedDemo: true })
    console.log('[DB] 初始化完成 ✅')
    await sequelize.close()
    process.exit(0)
  } catch (err) {
    console.error('[DB] 初始化失败:', err.message)
    process.exit(1)
  }
}

main()
