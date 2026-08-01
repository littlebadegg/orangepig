/**
 * Express 应用入口
 */
const express = require('express')
const cors = require('cors')
const morgan = require('morgan')
const helmet = require('helmet')
const path = require('path')

const config = require('./config')
const { sequelize } = require('./models')
const { errorHandler, notFound } = require('./middleware/error')

// 创建 Express 应用
const app = express()

// 安全中间件
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}))

// CORS — 允许跨域（小程序请求不受同源策略限制，但开发时方便调试）
app.use(cors())

// 日志
app.use(morgan('dev'))

// body 解析
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))

// 静态文件服务（上传的图片）
app.use('/uploads', express.static(path.join(__dirname, config.upload.dir)))

// 统一响应格式：{ code, message, data }
app.use((req, res, next) => {
  res.apiSuccess = (data = null, message = 'ok') => {
    res.json({ code: 0, message, data })
  }
  res.apiError = (message = '请求失败', code = -1, httpStatus = 400) => {
    res.status(httpStatus).json({ code, message, data: null })
  }
  next()
})

// 路由注册
app.use('/api/auth', require('./routes/auth'))
app.use('/api/posts', require('./routes/posts'))
app.use('/api/users', require('./routes/users'))
app.use('/api/upload', require('./routes/upload'))
app.use('/api/photos', require('./routes/photos'))

// 健康检查
app.get('/api/health', (req, res) => {
  res.apiSuccess({ status: 'ok', timestamp: Date.now() })
})

// 404
app.use(notFound)

// 错误处理
app.use(errorHandler)

// 启动服务 — 先验证数据库连接，再启动 HTTP 服务
async function start() {
  try {
    // 验证 MySQL 连接
    await sequelize.authenticate()
    console.log('[DB] MySQL connected')

    // 开发环境自动建表（生产环境请用 migrations）
    if (process.env.NODE_ENV !== 'production') {
      await sequelize.sync()
      console.log('[DB] Tables synced (dev mode)')
    }

    app.listen(config.port, () => {
      console.log(`[Server] running at http://localhost:${config.port}`)
      console.log(`[Server] API base: http://localhost:${config.port}/api`)
      console.log(`[Server] Health:   http://localhost:${config.port}/api/health`)
    })
  } catch (err) {
    console.error('[DB] MySQL connection failed:', err.message)
    console.error('[DB] 请确保 MySQL 已启动，或修改 .env 中的数据库配置')
    process.exit(1)
  }
}

start()
