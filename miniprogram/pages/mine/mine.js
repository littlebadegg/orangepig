/**
 * 我的页面 — 用户中心入口
 */
const userService = require('../../services/user')
const photoService = require('../../services/photo')
const postService = require('../../services/post')
const { formatNumber } = require('../../utils/format')

Page({
  data: {
    userInfo: null,
    isLogin: false,
    userId: null,
    stats: {
      postCount: 0,
      photoCount: 0,
      followingCount: 0,
      followersCount: 0,
    },
    menuList: [
      { key: 'album', label: '我的相册', icon: '📷' },
      { key: 'posts', label: '我的发布', icon: '📝' },
      { key: 'follows', label: '我的关注', icon: '👥' },
      { key: 'likes', label: '我的点赞', icon: '❤' },
    ],
  },

  onShow() {
    const app = getApp()
    if (app && app.globalData) {
      this.setData({
        userInfo: app.globalData.userInfo,
        isLogin: app.globalData.isLogin,
        userId: app.globalData.userId,
      })

      if (app.globalData.userId) {
        this.loadUserData(app.globalData.userId)
      }
    }
  },

  /**
   * 加载用户数据（统计信息）
   */
  async loadUserData(userId) {
    try {
      const [userInfo, photoResult] = await Promise.all([
        userService.getUserInfo(userId),
        photoService.getPhotoCount(userId).catch(() => ({ count: 0 })),
      ])

      this.setData({
        stats: {
          postCount: userInfo.postCount || 0,
          photoCount: photoResult.count || 0,
          followingCount: userInfo.followingCount || 0,
          followersCount: userInfo.followersCount || 0,
        },
      })
    } catch (err) {
      console.error('加载用户数据失败:', err)
    }
  },

  /**
   * 点击菜单
   */
  onTapMenu(e) {
    const { key } = e.currentTarget.dataset
    if (!this.data.isLogin) {
      wx.showToast({ title: '请先登录', icon: 'none' })
      return
    }

    switch (key) {
      case 'album':
        // 切换到相册 tab
        wx.switchTab({ url: '/pages/search/search' })
        break
      case 'posts':
        wx.navigateTo({
          url: `/subpackages/user-center/pages/profile/profile?userId=${this.data.userId}`,
        })
        break
      case 'follows':
        wx.navigateTo({
          url: `/subpackages/social/pages/follows/follows?userId=${this.data.userId}&type=following`,
        })
        break
      case 'likes':
        wx.navigateTo({
          url: '/subpackages/social/pages/likes/likes',
        })
        break
    }
  },

  /**
   * 点击关注/粉丝
   */
  onTapFollow(e) {
    const { type } = e.currentTarget.dataset
    if (!this.data.isLogin) {
      wx.showToast({ title: '请先登录', icon: 'none' })
      return
    }
    wx.navigateTo({
      url: `/subpackages/social/pages/follows/follows?userId=${this.data.userId}&type=${type}`,
    })
  },

  /**
   * 点击设置
   */
  onTapSettings() {
    wx.navigateTo({
      url: '/subpackages/user-center/pages/settings/settings',
    })
  },
})
