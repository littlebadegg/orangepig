/**
 * 错误处理中间件
 */

// 404 处理
function notFound(req, res, next) {
  res.apiError(`路由不存在: ${req.method} ${req.path}`, 404, 404)
}

// 全局错误处理
function errorHandler(err, req, res, next) {
  console.error('[Error]', err.message || err)

  // Multer 文件大小限制
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.apiError('文件大小超过限制', 413, 413)
  }

  // Sequelize 验证错误
  if (err.name === 'SequelizeValidationError') {
    const messages = err.errors.map((e) => e.message)
    return res.apiError(messages.join('; '), 422, 422)
  }

  // Sequelize 唯一约束冲突（重复键）
  if (err.name === 'SequelizeUniqueConstraintError') {
    return res.apiError('数据已存在，请勿重复提交', 409, 409)
  }

  // JWT 错误
  if (err.name === 'JsonWebTokenError') {
    return res.apiError('认证失败，请重新登录', 401, 401)
  }

  // 默认错误
  res.apiError(err.message || '服务器内部错误', -1, 500)
}

module.exports = { errorHandler, notFound }
