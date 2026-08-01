/**
 * 照片服务 — 相册相关 API 调用
 */

const { get, post, del } = require('../utils/request')

/**
 * 获取相册（按时间分组）
 */
function getAlbum(userId, page = 1) {
  return get('/photos/album', { userId, page })
}

/**
 * 获取按地点分组的照片
 */
function getLocations(userId, page = 1) {
  return get('/photos/locations', { userId, page })
}

/**
 * 获取照片数量
 */
function getPhotoCount(userId) {
  return get('/photos/user-count', { userId })
}

/**
 * 获取照片详情
 */
function getDetail(photoId) {
  return get(`/photos/${photoId}`)
}

/**
 * 上传照片记录（图片上传成功后调用）
 */
function createPhoto(data) {
  return post('/photos', data)
}

/**
 * 删除照片
 */
function deletePhoto(photoId) {
  return del(`/photos/${photoId}`)
}

module.exports = {
  getAlbum,
  getLocations,
  getPhotoCount,
  getDetail,
  createPhoto,
  deletePhoto,
}
