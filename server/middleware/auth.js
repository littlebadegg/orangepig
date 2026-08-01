/**
 * JWT 认证中间件
 *
 * 用法：
 *   const { auth, optionalAuth } = require('../middleware/auth')
 *   router.post('/posts', auth, createPost)         // 必须登录
 *   router.get('/posts/:id', optionalAuth, getDetail) // 可选登录（登录了返回是否点赞）
 */
const jwt = require('jsonwebtoken')
const config = require('../config')

function auth(req, res, next) {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.apiError('请先登录', 401, 401)
  }

  const token = authHeader.split(' ')[1]
  try {
    const decoded = jwt.verify(token, config.jwtSecret)
    // MySQL 主键为整数，统一转为整数类型
    req.userId = parseInt(decoded.userId)
    req.openid = decoded.openid
    next()
  } catch (err) {
    return res.apiError('登录已过期，请重新登录', 401, 401)
  }
}

function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    req.userId = null
    req.openid = null
    return next()
  }

  const token = authHeader.split(' ')[1]
  try {
    const decoded = jwt.verify(token, config.jwtSecret)
    req.userId = parseInt(decoded.userId)
    req.openid = decoded.openid
  } catch (err) {
    req.userId = null
    req.openid = null
  }
  next()
}

module.exports = { auth, optionalAuth }
