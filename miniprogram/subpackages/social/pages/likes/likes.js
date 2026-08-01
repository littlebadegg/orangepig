/**
 * 我的点赞列表页
 */
const postService = require('../../../../services/post')
const { formatTime, formatNumber } = require('../../../../utils/format')

Page({
  data: {
    list: [],
    page: 1,
    hasMore: true,
    loading: false,
  },

  onLoad() {
    this.loadList()
  },

  async loadList() {
    if (this.data.loading || !this.data.hasMore) return

    this.setData({ loading: true })

    try {
      const result = await postService.getLikedPosts(this.data.page)
      const newList = (result.list || []).map((p) => ({
        ...p,
        timeText: formatTime(p.createTime),
        likeCountText: formatNumber(p.likeCount || 0),
        commentCountText: formatNumber(p.commentCount || 0),
        firstImage: (p.images && p.images.length > 0) ? p.images[0] : null,
      }))

      this.setData({
        list: this.data.page === 1 ? newList : [...this.data.list, ...newList],
        hasMore: result.hasMore || false,
        loading: false,
      })
    } catch (err) {
      console.error('加载点赞列表失败:', err)
      this.setData({ loading: false })
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.setData({ page: this.data.page + 1 })
      this.loadList()
    }
  },

  onTapPost(e) {
    const { id } = e.currentTarget.dataset
    wx.navigateTo({ url: `/pages/detail/detail?id=${id}` })
  },

  previewImage(e) {
    const { url, urls } = e.currentTarget.dataset
    wx.previewImage({ current: url, urls })
  },
})
