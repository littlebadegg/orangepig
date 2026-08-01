/**
 * 图片上传路由
 * POST /api/upload/image
 *
 * 前端用 wx.uploadFile 上传，字段名为 'file'
 * 返回图片访问 URL
 */
const express = require('express')
const multer = require('multer')
const path = require('path')
const router = express.Router()

const config = require('../config')
const { auth } = require('../middleware/auth')
const { imgSecCheck } = require('../utils/wechat')

// Multer 存储配置
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '..', config.upload.dir))
  },
  filename: (req, file, cb) => {
    // 文件名：日期目录 + 时间戳 + 随机数 + 原始扩展名
    const ext = path.extname(file.originalname) || '.jpg'
    const date = new Date()
    const dateStr = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`
    const filename = `post_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`
    cb(null, filename)
  },
})

const upload = multer({
  storage,
  limits: {
    fileSize: config.upload.maxFileSize,
  },
  fileFilter: (req, file, cb) => {
    // 只允许图片
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('仅支持 JPG/PNG/WebP/GIF 格式'))
    }
  },
})

/**
 * 上传图片
 * POST /api/upload/image
 */
router.post('/image', auth, (req, res, next) => {
  upload.single('file')(req, res, async (err) => {
    if (err) {
      return res.apiError(err.message || '上传失败', -1, 400)
    }

    if (!req.file) {
      return res.apiError('请选择文件')
    }

    try {
      // 构建图片访问 URL
      const imageUrl = `${config.staticBaseUrl}/uploads/${req.file.filename}`

      // 异步内容安全检测（不阻塞响应，违规后续人工处理）
      imgSecCheck(imageUrl).then((isSafe) => {
        if (!isSafe) {
          console.warn(`[Upload] 图片可能违规: ${req.file.filename}`)
          // TODO: 标记图片状态，等待人工审核
        }
      })

      res.apiSuccess({
        url: imageUrl,
        filename: req.file.filename,
        size: req.file.size,
      })
    } catch (err) {
      next(err)
    }
  })
})

module.exports = router
