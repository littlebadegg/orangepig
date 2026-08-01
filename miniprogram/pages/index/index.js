/**
 * 首页 Feed 流 — 性能优化重点页面
 *
 * 优化策略：
 * 1. 骨架屏：数据加载前先渲染骨架，消除白屏
 * 2. 分页加载：onReachBottom 触底加载下一页
 * 3. 图片懒加载：image 组件 lazy-load
 * 4. setData 精简：只更新变化的字段，用 path 更新
 * 5. 虚拟列表思路：不在视图区的节点不渲染（列表数据多时考虑）
 */
const postService = require('../../services/post')
const { formatTime, formatNumber } = require('../../utils/format')
const { requestSubscribe, SUBSCRIBE_TRIGGERS } = require('../../utils/subscribe')

Page({
  data: {
    feedList: [],
    page: 1,
    hasMore: true,
    loading: false,
    showSkeleton: true,
    activeChannel: 'recommend',
    channels: [
      { key: 'recommend', label: '推荐' },
      { key: 'latest', label: '最新' },
      { key: 'following', label: '关注' },
    ],
  },

  onLoad() {
    this.loadFeed(true)
  },

  onPullDownRefresh() {
    this.refreshFeed()
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadFeed(false)
    }
  },

  /**
   * 加载 Feed 数据
   * @param {boolean} isRefresh - 是否刷新第一页
   */
  async loadFeed(isRefresh) {
    if (this.data.loading) return

    const page = isRefresh ? 1 : this.data.page + 1
    this.setData({ loading: true })

    try {
      const result = await postService.getFeed(page, this.data.activeChannel)

      // 格式化数据
      const formatted = (result.list || []).map((item) => ({
        ...item,
        timeText: formatTime(item.createTime),
        likeCountText: formatNumber(item.likeCount || 0),
        commentCountText: formatNumber(item.commentCount || 0),
      }))

      const newList = isRefresh
        ? formatted
        : [...this.data.feedList, ...formatted]

      // 精简 setData：合并为一次调用
      this.setData({
        feedList: newList,
        page,
        hasMore: result.list && result.list.length >= 20,
        loading: false,
        showSkeleton: false,
      })

      if (isRefresh) {
        wx.stopPullDownRefresh()
      }
    } catch (err) {
      this.setData({ loading: false, showSkeleton: false })
      wx.showToast({ title: err.message || '加载失败', icon: 'none' })
    }
  },

  /**
   * 刷新 Feed
   */
  async refreshFeed() {
    await this.loadFeed(true)
  },

  /**
   * 切换频道
   */
  onChannelChange(e) {
    const { key } = e.currentTarget.dataset
    if (key === this.data.activeChannel) return

    this.setData({
      activeChannel: key,
      feedList: [],
      showSkeleton: true,
    })
    this.loadFeed(true)
  },

  /**
   * 跳转详情页
   */
  onTapPost(e) {
    const { id } = e.currentTarget.dataset
    wx.navigateTo({
      url: `/pages/detail/detail?id=${id}`,
    })
  },

  /**
   * 跳转发布页（分包）
   */
  onTapPublish() {
    // 检查登录状态
    const app = getApp()
    if (!app.globalData.isLogin) {
      wx.showToast({ title: '请先登录', icon: 'none' })
      return
    }
    wx.navigateTo({
      url: '/subpackages/content-create/pages/publish/publish',
    })
  },

  /**
   * 分享到聊天 — 社交裂变核心
   */
  onShareAppMessage() {
    return {
      title: '来看看这个有趣的内容社区',
      path: '/pages/index/index',
      imageUrl: '',
    }
  },

  /**
   * 分享到朋友圈 — 扩大触达
   */
  onShareTimeline() {
    return {
      title: '橙猪 — 发现有趣的内容',
      query: '',
    }
  },
})
