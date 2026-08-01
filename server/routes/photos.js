/**
 * 照片路由 — 相册功能：上传、浏览、按时间/地点分类
 *
 * POST   /api/photos           — 创建照片记录（上传图片后调用）
 * GET    /api/photos/album      — 按时间分组的相册
 * GET    /api/photos/locations   — 按地点分组的照片
 * GET    /api/photos/user-count  — 用户照片数量
 * GET    /api/photos/:id         — 照片详情
 * DELETE /api/photos/:id         — 删除照片
 *
 * ⚠️ 静态路径必须在 /:id 之前定义
 */
const express = require('express')
const { Op, literal } = require('sequelize')
const router = express.Router()

const { auth, optionalAuth } = require('../middleware/auth')
const { Photo, User } = require('../models')
const { extractExif, reverseGeocode } = require('../utils/exif')

// ============ 静态路径（必须在 /:id 之前） ============

/**
 * 按时间分组的相册
 * GET /api/photos/album?userId=xxx&page=1
 * 返回按日期分组（年月日）的照片列表
 */
router.get('/album', async (req, res, next) => {
  try {
    const userId = parseInt(req.query.userId)
    const page = parseInt(req.query.page) || 1
    const pageSize = 200 // 相册一次加载较多
    const offset = (page - 1) * pageSize

    if (!userId) {
      return res.apiError('缺少 userId 参数')
    }

    const photos = await Photo.findAll({
      where: { userId, status: 1 },
      order: [['photoTime', 'DESC']],
      offset,
      limit: pageSize,
    })

    // 按日期分组
    const groups = {}
    const groupOrder = []
    photos.forEach((p) => {
      const pt = p.photoTime || p.createTime
      const date = new Date(pt)
      const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

      if (!groups[dateKey]) {
        groups[dateKey] = {
          date: dateKey,
          dateText: formatPhotoDate(date),
          photos: [],
        }
        groupOrder.push(dateKey)
      }
      groups[dateKey].photos.push({
        id: p.id,
        imageUrl: p.imageUrl,
        title: p.title,
        location: p.location,
        latitude: p.latitude,
        longitude: p.longitude,
        photoTime: p.photoTime,
        createTime: p.createTime,
      })
    })

    const groupList = groupOrder.map((key) => groups[key])

    res.apiSuccess({
      groups: groupList,
      page,
      hasMore: photos.length >= pageSize,
    })
  } catch (err) {
    next(err)
  }
})

/**
 * 按地点分组的照片
 * GET /api/photos/locations?userId=xxx&page=1
 */
router.get('/locations', async (req, res, next) => {
  try {
    const userId = parseInt(req.query.userId)
    const page = parseInt(req.query.page) || 1
    const pageSize = 500
    const offset = (page - 1) * pageSize

    if (!userId) {
      return res.apiError('缺少 userId 参数')
    }

    const photos = await Photo.findAll({
      where: {
        userId,
        status: 1,
        location: { [Op.ne]: '' },
      },
      order: [['photoTime', 'DESC']],
      offset,
      limit: pageSize,
    })

    // 按地点分组
    const groups = {}
    const groupOrder = []
    photos.forEach((p) => {
      const locKey = p.location

      if (!groups[locKey]) {
        groups[locKey] = {
          location: locKey,
          latitude: p.latitude,
          longitude: p.longitude,
          photoCount: 0,
          photos: [],
        }
        groupOrder.push(locKey)
      }
      groups[locKey].photoCount++
      groups[locKey].photos.push({
        id: p.id,
        imageUrl: p.imageUrl,
        title: p.title,
        photoTime: p.photoTime,
      })
    })

    const groupList = groupOrder.map((key) => groups[key])

    res.apiSuccess({
      groups: groupList,
      page,
      hasMore: photos.length >= pageSize,
    })
  } catch (err) {
    next(err)
  }
})

/**
 * 获取用户照片数量
 * GET /api/photos/user-count?userId=xxx
 */
router.get('/user-count', async (req, res, next) => {
  try {
    const userId = parseInt(req.query.userId)
    if (!userId) {
      return res.apiError('缺少 userId 参数')
    }

    const count = await Photo.count({
      where: { userId, status: 1 },
    })

    res.apiSuccess({ count })
  } catch (err) {
    next(err)
  }
})

// ============ 动态路径（/:id） ============

/**
 * 照片详情
 * GET /api/photos/:id
 */
router.get('/:id', async (req, res, next) => {
  try {
    const photoId = parseInt(req.params.id)
    if (isNaN(photoId)) {
      return res.apiError('照片不存在', 404, 404)
    }

    const photo = await Photo.findOne({
      where: { id: photoId, status: 1 },
      include: [
        { model: User, as: 'user', attributes: ['id', 'nickName', 'avatarUrl'] },
      ],
    })

    if (!photo) {
      return res.apiError('照片不存在', 404, 404)
    }

    res.apiSuccess(photo)
  } catch (err) {
    next(err)
  }
})

/**
 * 创建照片记录
 * POST /api/photos
 * body: { imageUrl, title, location, latitude, longitude, photoTime }
 *
 * 数据优先级：
 * 时间：EXIF 拍摄时间 > 前端传入 > 当前时间
 * 位置：EXIF GPS（照片拍摄位置）> wx.getLocation（当前位置兜底）> 无
 *
 * 即：优先用照片自身的拍摄信息，照片没有位置时才用上传时的当前位置
 */
router.post('/', auth, async (req, res, next) => {
  try {
    const { imageUrl, title, location, latitude, longitude, photoTime } = req.body

    if (!imageUrl) {
      return res.apiError('图片地址不能为空')
    }

    console.log(`[Photos] 创建照片: imageUrl=${imageUrl}, 前端传入: lat=${latitude}, lng=${longitude}, loc=${location}, time=${photoTime}`)

    // 从 imageUrl 中提取文件名，读取上传的图片文件解析 EXIF
    let exifData = { photoTime: null, latitude: null, longitude: null, location: '', exifUsed: false, hasGps: false }
    try {
      const filename = imageUrl.split('/uploads/').pop()
      if (filename) {
        exifData = await extractExif(filename)
      }
    } catch (e) {
      console.warn('[Photos] EXIF 提取失败，使用请求参数:', e.message)
    }

    // 数据优先级：
    // 时间：EXIF 拍摄时间 > 前端传入 > 当前时间
    // 位置：EXIF GPS（拍摄位置）> 前端 wx.getLocation（当前位置兜底）> 无
    const finalPhotoTime = exifData.photoTime || photoTime || new Date()
    const finalLatitude = exifData.hasGps ? exifData.latitude : (latitude || null)
    const finalLongitude = exifData.hasGps ? exifData.longitude : (longitude || null)

    // 地址：EXIF 地址（拍摄位置逆地理编码）> 前端坐标逆地理编码（当前位置兜底）
    let finalLocation = exifData.location || ''
    if (!finalLocation && finalLatitude !== null && finalLongitude !== null) {
      finalLocation = await reverseGeocode(finalLatitude, finalLongitude)
    }

    // 判断数据来源
    const locationSource = exifData.hasGps ? 'exif' : (latitude ? 'gps' : 'none')
    const timeSource = exifData.photoTime ? 'exif' : (photoTime ? 'manual' : 'default')

    console.log(`[Photos] 来源: time=${timeSource}, location=${locationSource}`)
    console.log(`[Photos] 最终值: time=${finalPhotoTime}, lat=${finalLatitude}, lng=${finalLongitude}, loc=${finalLocation}`)

    const photo = await Photo.create({
      userId: req.userId,
      imageUrl,
      title: title || '',
      location: finalLocation,
      latitude: finalLatitude,
      longitude: finalLongitude,
      photoTime: finalPhotoTime,
      status: 1,
    })

    res.apiSuccess({
      id: photo.id,
      imageUrl: photo.imageUrl,
      title: photo.title,
      location: photo.location,
      latitude: photo.latitude,
      longitude: photo.longitude,
      photoTime: photo.photoTime,
      exifUsed: exifData.exifUsed,
      source: locationSource,
      timeSource,
      createTime: photo.createTime,
    })
  } catch (err) {
    next(err)
  }
})

/**
 * 删除照片
 * DELETE /api/photos/:id
 */
router.delete('/:id', auth, async (req, res, next) => {
  try {
    const photoId = parseInt(req.params.id)
    if (isNaN(photoId)) {
      return res.apiError('照片不存在', 404, 404)
    }

    const photo = await Photo.findOne({
      where: { id: photoId, userId: req.userId },
    })

    if (!photo) {
      return res.apiError('照片不存在或无权操作', 404, 404)
    }

    // 软删除
    await photo.update({ status: 0 })

    res.apiSuccess({ deleted: true })
  } catch (err) {
    next(err)
  }
})

// ============ 工具函数 ============

function formatPhotoDate(date) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const diff = today - target

  if (diff === 0) return '今天'
  if (diff === 86400000) return '昨天'
  if (diff === 86400000 * 2) return '前天'

  const y = date.getFullYear()
  const m = date.getMonth() + 1
  const d = date.getDate()

  if (y === now.getFullYear()) {
    return `${m}月${d}日`
  }
  return `${y}年${m}月${d}日`
}

module.exports = router
