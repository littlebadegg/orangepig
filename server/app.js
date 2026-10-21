/**
 * Express 应用入口 — 橙猪宝宝记（宝宝喂养记录）
 */
const express = require('express')
const cors = require('cors')
const morgan = require('morgan')
const helmet = require('helmet')

const config = require('./config')
const { sequelize } = require('./models')
const { initDatabase } = require('./utils/db-init')
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
app.use(express.json({ limit: '1mb' }))
app.use(express.urlencoded({ extended: true }))

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
app.use('/api/babies', require('./routes/babies'))
app.use('/api/records', require('./routes/records'))
app.use('/api/stats', require('./routes/stats'))

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
  <title>橙猪宝宝记 API</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #fff7f2; color: #333; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .card { background: #fff; border-radius: 16px; padding: 48px 40px; box-shadow: 0 2px 12px rgba(0,0,0,0.08); text-align: center; max-width: 420px; width: 90%; }
    .logo { font-size: 48px; margin-bottom: 16px; }
    h1 { font-size: 24px; margin-bottom: 8px; }
    .status { display: inline-flex; align-items: center; gap: 6px; background: #e8f5e9; color: #2e7d32; padding: 6px 16px; border-radius: 20px; font-size: 14px; margin: 16px 0 24px; }
    .dot { width: 8px; height: 8px; background: #4caf50; border-radius: 50%; animation: pulse 2s infinite; }
    @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
    .links { display: flex; flex-direction: column; gap: 8px; }
    .links a { color: #ff7a45; text-decoration: none; padding: 10px; border-radius: 8px; background: #fff1e8; transition: background 0.2s; font-size: 14px; }
    .links a:hover { background: #ffe3d1; }
    .api-list { margin-top: 12px; text-align: left; font-size: 12px; color: #888; line-height: 1.9; background: #fafafa; padding: 12px 14px; border-radius: 8px; }
    .footer { margin-top: 24px; font-size: 12px; color: #999; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">🍼</div>
    <h1>橙猪宝宝记 API</h1>
    <div class="status"><span class="dot"></span> 运行中</div>
    <div class="links">
      <a href="/api/health">健康检查 /api/health</a>
      <div class="api-list">
        POST /api/auth/login — 微信登录<br>
        GET&nbsp; /api/babies — 宝宝列表<br>
        POST /api/records/feeding — 记喂养<br>
        POST /api/records/diaper — 记换尿片<br>
        POST /api/records/sleep/start — 开始睡觉<br>
        GET&nbsp; /api/records/timeline — 今日时间线
      </div>
    </div>
    <div class="footer">宝宝喂养记录小程序后端 · ${new Date().getFullYear()}</div>
  </div>
</body>
</html>`)
})

// 404
app.use(notFound)

// 错误处理
app.use(errorHandler)

// 启动服务 — 建表 → 验证连接 → 监听端口
async function start() {
  try {
    // 自动建库建表 + 首次种子数据（幂等，重复启动安全）
    await initDatabase({ seedDemo: config.seedDemo })

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
