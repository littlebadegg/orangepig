/**
 * EXIF 解析工具 — 从图片文件中提取拍摄时间和 GPS 坐标
 *
 * 使用 exifreader 库读取 JPEG/HEIC 照片的 EXIF 元数据：
 * - DateTimeOriginal: 拍摄时间
 * - GPSLatitude / GPSLongitude: 拍摄地点坐标
 *
 * 逆地理编码使用 BigDataCloud 免费 API（无需 key），将坐标转为可读地址
 */
const ExifReader = require('exifreader')
const path = require('path')
const fs = require('fs')
const axios = require('axios')

const config = require('../config')

/**
 * 从上传的图片文件中提取 EXIF 信息
 * @param {string} filename - 文件名（不含路径，位于 uploads 目录下）
 * @returns {Promise<{photoTime: string|null, latitude: number|null, longitude: number|null, location: string}>}
 */
async function extractExif(filename) {
  const filePath = path.join(__dirname, '..', config.upload.dir, filename)

  // 检查文件是否存在
  if (!fs.existsSync(filePath)) {
    return { photoTime: null, latitude: null, longitude: null, location: '' }
  }

  try {
    // ⚠️ exifreader 用 Buffer 加载才有效，文件路径方式返回空
    const buffer = fs.readFileSync(filePath)
    const tags = ExifReader.load(buffer)
    const tagNames = Object.keys(tags)

    console.log(`[EXIF] 文件: ${filename}, 标签数: ${tagNames.length}`)

    // 1. 提取拍摄时间
    const photoTime = extractDateTime(tags)
    if (photoTime) {
      console.log(`[EXIF] ✅ 拍摄时间: ${photoTime}`)
    } else {
      console.log(`[EXIF] ❌ 无拍摄时间 (DateTimeOriginal/DateTime 标签不存在)`)
    }

    // 2. 提取 GPS 坐标
    const { latitude, longitude } = extractGPS(tags)
    if (latitude !== null) {
      console.log(`[EXIF] ✅ GPS: ${latitude}, ${longitude}`)
    } else {
      console.log(`[EXIF] ❌ 无 GPS 坐标`)
    }

    // 3. 逆地理编码获取可读地址
    let location = ''
    if (latitude !== null && longitude !== null) {
      location = await reverseGeocode(latitude, longitude)
      console.log(`[EXIF] ✅ 地址: ${location}`)
    }

    const hasExif = photoTime !== null || latitude !== null
    return { photoTime, latitude, longitude, location, exifUsed: hasExif }
  } catch (err) {
    // PNG、GIF、WebP 等格式没有 EXIF，或解析失败 — 不阻塞流程
    console.warn(`[EXIF] 解析失败 (${filename}):`, err.message)
    return { photoTime: null, latitude: null, longitude: null, location: '', exifUsed: false }
  }
}

/**
 * 从 EXIF 标签提取拍摄时间
 * 支持 DateTimeOriginal 和 DateTime 两个字段
 *
 * ⚠️ EXIF 时间是本地墙上钟时间（无时区信息）。
 * 不用 new Date() + toISOString()，因为 toISOString() 会转成 UTC，
 * Sequelize 读取时又按 UTC 解释，可能导致跨天偏移。
 * 直接返回 "YYYY-MM-DD HH:MM:SS" 格式字符串，MySQL DATETIME 原样存储。
 */
function extractDateTime(tags) {
  const dtTag = tags.DateTimeOriginal || tags.DateTime
  if (!dtTag || !dtTag.description) return null

  // EXIF 时间格式: "2024:06:15 10:30:25" 或 "2024-06-15 10:30:25"
  const desc = dtTag.description
  const match = desc.match(/(\d{4})[:\-](\d{2})[:\-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/)
  if (match) {
    const y = match[1]
    const m = match[2]
    const d = match[3]
    const h = match[4]
    const mi = match[5]
    const s = match[6]
    // 直接格式化为字符串，不经过 Date 对象，避免时区转换
    return `${y}-${m}-${d} ${h}:${mi}:${s}`
  }

  // 尝试只匹配日期部分 "2024:06:15"
  const dateOnlyMatch = desc.match(/(\d{4})[:\-](\d{2})[:\-](\d{2})/)
  if (dateOnlyMatch) {
    return `${dateOnlyMatch[1]}-${dateOnlyMatch[2]}-${dateOnlyMatch[3]} 00:00:00`
  }

  return null
}

/**
 * 从 EXIF 标签提取 GPS 坐标
 * exifreader 的 description 已经是十进制度数（自动从 DMS 转换）
 * 例如: GPSLatitude.description = 22.543055555555558
 */
function extractGPS(tags) {
  let latitude = null
  let longitude = null

  if (tags.GPSLatitude && tags.GPSLongitude) {
    // description 已经是十进制度数
    const latDesc = parseFloat(tags.GPSLatitude.description)
    const lngDesc = parseFloat(tags.GPSLongitude.description)

    if (!isNaN(latDesc) && !isNaN(lngDesc)) {
      // ref 的 value 是 ["N"] / ["S"] / ["E"] / ["W"]
      const latRef = tags.GPSLatitudeRef?.value?.[0] || 'N'
      const lngRef = tags.GPSLongitudeRef?.value?.[0] || 'E'

      latitude = latRef === 'S' ? -latDesc : latDesc
      longitude = lngRef === 'W' ? -lngDesc : lngDesc
    }
  }

  return { latitude, longitude }
}

/**
 * 逆地理编码 — 将 GPS 坐标转为可读地址
 * 使用 BigDataCloud 免费 API（无需 key，支持中文）
 * 返回格式: "广东省 深圳市 南山区"
 */
async function reverseGeocode(latitude, longitude) {
  try {
    const res = await axios.get('https://api.bigdatacloud.net/data/reverse-geocode-client', {
      params: {
        latitude,
        longitude,
        localityLanguage: 'zh',
      },
      timeout: 3000,
    })

    const data = res.data
    const parts = []

    // 组装地址: 省 市 区
    if (data.principalSubdivision) parts.push(data.principalSubdivision)
    if (data.city && data.city !== data.principalSubdivision) parts.push(data.city)
    if (data.locality && data.locality !== data.city) parts.push(data.locality)

    if (parts.length > 0) {
      return parts.join(' ')
    }

    // 退化方案: 用坐标格式
    return formatCoordinate(latitude, longitude)
  } catch (err) {
    // 逆地理编码失败不阻塞，用坐标格式
    return formatCoordinate(latitude, longitude)
  }
}

/**
 * 格式化坐标为可读字符串
 */
function formatCoordinate(lat, lng) {
  const latStr = Math.abs(lat).toFixed(4) + '°' + (lat >= 0 ? 'N' : 'S')
  const lngStr = Math.abs(lng).toFixed(4) + '°' + (lng >= 0 ? 'E' : 'W')
  return `${latStr}, ${lngStr}`
}

module.exports = { extractExif, reverseGeocode }
