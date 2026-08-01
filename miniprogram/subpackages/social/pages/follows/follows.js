/**
 * 关注 / 粉丝列表页
 */
const userService = require('../../../../services/user')
const { formatTime } = require('../../../../utils/format')

Page({
  data: {
    userId: null,
    type: 'following', // following | followers
    list: [],
    page: 1,
    hasMore: true,
    loading: false,
    currentUserId: null,
  },

  onLoad(options) {
    const app = getApp()
    const currentUserId = app && app.globalData ? app.globalData.userId : null

    this.setData({
      userId: parseInt(options.userId) || currentUserId,
      type: options.type || 'following',
      currentUserId,
    })

    // 设置标题
    wx.setNavigationBarTitle({
      title: this.data.type === 'following' ? '关注列表' : '粉丝列表',
    })

    this.loadList()
  },

  /**
   * 加载列表
   */
  async loadList() {
    if (this.data.loading || !this.data.hasMore) return

    this.setData({ loading: true })

    try {
      const result = await userService.getFollowList(
        this.data.userId,
        this.data.type,
        this.data.page
      )

      const newList = (result.list || []).map((u) => ({
        ...u,
        timeText: formatTime(u.createTime),
        // 检查当前用户是否关注了这个人（仅粉丝列表需要）
        isFollowing: this.data.type === 'followers' ? false : true,
      }))

      this.setData({
        list: this.data.page === 1 ? newList : [...this.data.list, ...newList],
        hasMore: newList.length >= 20,
        loading: false,
      })

      // 如果是粉丝列表，检查当前用户是否关注了每个粉丝
      if (this.data.type === 'followers' && this.data.currentUserId) {
        this.checkFollowStatus()
      }
    } catch (err) {
      console.error('加载关注列表失败:', err)
      this.setData({ loading: false })
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  /**
   * 检查当前用户对粉丝列表中每个人的关注状态
   */
  async checkFollowStatus() {
    const { list, currentUserId } = this.data
    if (!currentUserId) return

    for (let i = 0; i < list.length; i++) {
      try {
        const info = await userService.getUserInfo(list[i].id)
        if (info.isFollowing !== undefined) {
          this.setData({
            [`list[${i}].isFollowing`]: info.isFollowing,
          })
        }
      } catch (e) {
        // 静默失败
      }
    }
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.setData({ page: this.data.page + 1 })
      this.loadList()
    }
  },

  /**
   * 关注 / 取关
   */
  async onToggleFollow(e) {
    const { userId, index } = e.currentTarget.dataset
    const item = this.data.list[index]
    const newFollow = !item.isFollowing

    // 乐观更新
    this.setData({
      [`list[${index}].isFollowing`]: newFollow,
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
        [`list[${index}].isFollowing`]: !newFollow,
      })
      wx.showToast({ title: '操作失败', icon: 'none' })
    }
  },

  /**
   * 点击用户 → 跳转个人主页
   */
  onTapUser(e) {
    const { userId } = e.currentTarget.dataset
    if (userId === this.data.currentUserId) return
    wx.navigateTo({
      url: `/subpackages/user-center/pages/profile/profile?userId=${userId}`,
    })
  },
})
