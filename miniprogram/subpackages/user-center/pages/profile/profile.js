/**
 * 个人主页 — 用户信息、发布内容、关注/粉丝
 */
const userService = require('../../../../services/user')
const postService = require('../../../../services/post')
const { formatTime, formatNumber } = require('../../../../utils/format')

Page({
  data: {
    userId: null,
    currentUserId: null,
    isMine: false,
    userInfo: null,
    isFollowing: false,
    posts: [],
    page: 1,
    hasMore: true,
    loading: true,
    activeTab: 'posts', // posts | likes
  },

  onLoad(options) {
    const app = getApp()
    const currentUserId = app && app.globalData ? app.globalData.userId : null
    const userId = parseInt(options.userId) || currentUserId

    this.setData({
      userId,
      currentUserId,
      isMine: userId === currentUserId,
    })

    this.loadUserInfo(userId)
    this.loadPosts(userId)
  },

  /**
   * 加载用户信息
   */
  async loadUserInfo(userId) {
    try {
      const info = await userService.getUserInfo(userId)
      this.setData({
        userInfo: info,
        isFollowing: info.isFollowing || false,
      })
    } catch (err) {
      console.error('加载用户信息失败:', err)
    }
  },

  /**
   * 加载用户发布内容
   */
  async loadPosts(userId) {
    if (this.data.loading && this.data.page > 1) return

    this.setData({ loading: true })

    try {
      const result = await postService.getUserPosts(userId, this.data.page)
      const newPosts = (result.list || []).map((p) => ({
        ...p,
        timeText: formatTime(p.createTime),
        likeCountText: formatNumber(p.likeCount || 0),
        commentCountText: formatNumber(p.commentCount || 0),
        firstImage: (p.images && p.images.length > 0) ? p.images[0] : null,
      }))

      this.setData({
        posts: this.data.page === 1 ? newPosts : [...this.data.posts, ...newPosts],
        hasMore: newPosts.length >= 20,
        loading: false,
      })
    } catch (err) {
      console.error('加载发布内容失败:', err)
      this.setData({ loading: false })
    }
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.setData({ page: this.data.page + 1 })
      this.loadPosts(this.data.userId)
    }
  },

  /**
   * 关注 / 取关
   */
  async onToggleFollow() {
    const { userId, isFollowing } = this.data
    const newFollow = !isFollowing

    // 乐观更新
    this.setData({
      isFollowing: newFollow,
      'userInfo.followersCount': (this.data.userInfo.followersCount || 0) + (newFollow ? 1 : -1),
    })

    try {
      await userService.toggleFollow(userId, newFollow)
      wx.showToast({
        title: newFollow ? '已关注' : '已取消',
        icon: 'none',
      })
    } catch (err) {
      // 回滚
      this.setData({
        isFollowing: !newFollow,
        'userInfo.followersCount': (this.data.userInfo.followersCount || 0) + (newFollow ? -1 : 1),
      })
      wx.showToast({ title: '操作失败', icon: 'none' })
    }
  },

  /**
   * 点击帖子 → 跳转详情
   */
  onTapPost(e) {
    const { id } = e.currentTarget.dataset
    wx.navigateTo({ url: `/pages/detail/detail?id=${id}` })
  },

  /**
   * 点击关注/粉丝
   */
  onTapFollow(e) {
    const { type } = e.currentTarget.dataset
    wx.navigateTo({
      url: `/subpackages/social/pages/follows/follows?userId=${this.data.userId}&type=${type}`,
    })
  },

  /**
   * 预览图片
   */
  previewImage(e) {
    const { url, urls } = e.currentTarget.dataset
    wx.previewImage({ current: url, urls })
  },

  /**
   * 分享
   */
  onShareAppMessage() {
    const { userInfo } = this.data
    return {
      title: userInfo ? userInfo.nickName + '的个人主页' : '个人主页',
      path: `/subpackages/user-center/pages/profile/profile?userId=${this.data.userId}`,
    }
  },
})
