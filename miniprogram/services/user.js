/**
 * 用户服务 — 用户信息、关注关系（REST 版本）
 */

const { get, post } = require('../utils/request')

/**
 * 获取用户信息（含发布数、是否关注等）
 */
function getUserInfo(userId) {
  return get('/users/info', { userId })
}

/**
 * 更新用户资料
 */
function updateProfile(profile) {
  return post('/users/profile', profile, { showLoading: true })
}

/**
 * 关注 / 取消关注
 */
function toggleFollow(targetUserId, isFollow) {
  if (isFollow) {
    return post(`/users/${targetUserId}/follow`)
  } else {
    return post(`/users/${targetUserId}/unfollow`)
  }
}

/**
 * 获取关注列表 / 粉丝列表
 */
function getFollowList(userId, type = 'following', page = 1) {
  return get('/users/follow-list', { userId, type, page })
}

module.exports = {
  getUserInfo,
  updateProfile,
  toggleFollow,
  getFollowList,
}
