/**
 * 统计页 — 今日概览 + 近 7 天趋势
 */
const babyService = require('../../services/baby')
const recordService = require('../../services/record')
const { todayString, genderText } = require('../../utils/format')

Page({
  data: {
    currentBabyId: null,
    currentBaby: null,
    babySubtitle: '',
    stats: null,
    trend: [],
    days: 7,
    loading: true,
  },

  onShow() {
    this.refresh()
  },

  onPullDownRefresh() {
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

      this.setData({ stats, trend })
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
})
