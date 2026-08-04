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

// 首页 — 服务状态页
app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>橙猪 API</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; color: #333; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .card { background: #fff; border-radius: 16px; padding: 48px 40px; box-shadow: 0 2px 12px rgba(0,0,0,0.08); text-align: center; max-width: 400px; width: 90%; }
    .logo { font-size: 48px; margin-bottom: 16px; }
    h1 { font-size: 24px; margin-bottom: 8px; }
    .status { display: inline-flex; align-items: center; gap: 6px; background: #e8f5e9; color: #2e7d32; padding: 6px 16px; border-radius: 20px; font-size: 14px; margin: 16px 0 24px; }
    .dot { width: 8px; height: 8px; background: #4caf50; border-radius: 50%; animation: pulse 2s infinite; }
    @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
    .links { display: flex; flex-direction: column; gap: 8px; }
    .links a { color: #1976d2; text-decoration: none; padding: 10px; border-radius: 8px; background: #f5f5f5; transition: background 0.2s; font-size: 14px; }
    .links a:hover { background: #e3f2fd; }
    .footer { margin-top: 24px; font-size: 12px; color: #999; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">🐷</div>
    <h1>橙猪 API 服务</h1>
    <div class="status"><span class="dot"></span> 运行中</div>
    <div class="links">
      <a href="/api/health">健康检查 /api/health</a>
      <a href="/api/posts">内容列表 /api/posts</a>
      <a href="/api/photos/album">相册 /api/photos/album</a>
    </div>
    <div class="footer">橙猪小程序后端 · ${new Date().getFullYear()}</div>
  </div>
</body>
</html>`)
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
