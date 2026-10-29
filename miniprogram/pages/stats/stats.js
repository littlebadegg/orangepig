/**
 * 统计页 — 今日概览 + 近 7 天趋势
 */
const babyService = require('../../services/baby')
const recordService = require('../../services/record')
const { todayString, genderText, normalizeStats } = require('../../utils/format')

Page({
  data: {
    currentBabyId: null,
    currentBaby: null,
    babySubtitle: '',
    stats: null,
    trend: [],
    days: 7,
    loading: true,
    guest: false,
  },

  onShow() {
    // 游客模式：未登录不请求后端，展示登录引导
    if (!wx.getStorageSync('access_token')) {
      this.setData({ guest: true, loading: false, stats: null, trend: [] })
      return
    }
    this.refresh()
  },

  onPullDownRefresh() {
    if (this.data.guest || !wx.getStorageSync('access_token')) {
      wx.stopPullDownRefresh()
      return
    }
    this.refresh().then(() => wx.stopPullDownRefresh())
  },

  async refresh() {
    try {
      const babyData = await babyService.list()
      const babies = babyData.list || []
      const currentBabyId =
        babyData.currentBabyId || (babies.length > 0 ? babies[0].id : null)
      const currentBaby = babies.find((b) => b.id === currentBabyId) || null

      this.setData({
        currentBabyId,
        currentBaby,
        babySubtitle: currentBaby ? genderText(currentBaby.gender) : '',
      })

      if (!currentBabyId) {
        this.setData({ loading: false, stats: null, trend: [] })
        return
      }

      const [stats, trendData] = await Promise.all([
        recordService.dailyStats(currentBabyId, todayString()),
        recordService.trend(currentBabyId, this.data.days),
      ])

      const list = trendData.list || []
      const maxAmount = list.reduce((max, i) => Math.max(max, i.totalAmount || 0), 0) || 1
      const trend = list.map((item) => ({
        ...item,
        barWidth: Math.max(4, Math.round(((item.totalAmount || 0) / maxAmount) * 100)),
      }))

      this.setData({ stats: normalizeStats(stats), trend })
    } catch (err) {
      console.error('[stats] 加载失败:', err)
      wx.showToast({ title: err.message || '加载失败', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },

  goRecord() {
    wx.switchTab({ url: '/pages/record/record' })
  },

  /** 游客模式去登录 */
  goLogin() {
    wx.navigateTo({ url: '/pages/login/login' })
  },
})
