/**
 * 内容服务 — 所有内容相关的 API 调用（REST 版本）
 */

const { get, post } = require('../utils/request')

/**
 * 获取首页 Feed 流
 * @param {number} page - 页码
 * @param {string} channel - 频道（recommend/latest/following）
 */
function getFeed(page = 1, channel = 'recommend') {
  return get('/posts/feed', { page, channel })
}

/**
 * 获取内容详情
 * @param {string} postId
 */
function getDetail(postId) {
  return get(`/posts/${postId}`)
}

/**
 * 发布内容
 * @param {Object} postData - { content, images }
 */
function publish(postData) {
  return post('/posts', postData, { showLoading: true })
}

/**
 * 点赞 / 取消点赞
 */
function toggleLike(postId, isLike) {
  if (isLike) {
    return post(`/posts/${postId}/like`)
  } else {
    return post(`/posts/${postId}/unlike`)
  }
}

/**
 * 获取评论列表
 */
function getComments(postId, page = 1) {
  return get(`/posts/${postId}/comments`, { page })
}

/**
 * 发表评论
 */
function addComment(postId, content, replyTo = null) {
  return post(`/posts/${postId}/comments`, { content, replyTo }, { showLoading: true })
}

/**
 * 搜索内容
 */
function search(keyword, page = 1) {
  return get('/posts/search', { keyword, page })
}

/**
 * 获取用户发布的内容
 */
function getUserPosts(userId, page = 1) {
  return get('/posts/user', { userId, page })
}

/**
 * 获取当前用户点赞的内容
 */
function getLikedPosts(page = 1) {
  return get('/posts/liked', { page })
}

module.exports = {
  getFeed,
  getDetail,
  publish,
  toggleLike,
  getComments,
  addComment,
  search,
  getUserPosts,
  getLikedPosts,
}
