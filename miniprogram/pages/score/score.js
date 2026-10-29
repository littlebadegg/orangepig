/**
 * 养育评分页 — 独立 tab
 *
 * 展示今日 100 分制评分：总分 / 等级 / 五个维度得分 / 加减分 / 改进建议。
 * 数据来自 /api/stats/daily 的 score 字段，评分规则集中在后端 server/utils/score.js。
 */
const babyService = require('../../services/baby')
const recordService = require('../../services/record')
const { todayString, normalizeStats } = require('../../utils/format')

/** 今天的「X月X日」 */
function todayCN() {
  const d = new Date()
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

Page({
  data: {
    loading: true,
    guest: false,
    babies: [],
    currentBabyId: null,
    currentBaby: null,
    dateText: todayCN(),
    score: null,
  },

  onShow() {
    // 游客模式：未登录不请求后端，展示登录引导
    if (!wx.getStorageSync('access_token')) {
      this.setData({ guest: true, loading: false, score: null, currentBaby: null })
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

      this.setData({ babies, currentBabyId, currentBaby })

      if (!currentBabyId) {
        this.setData({ loading: false, score: null })
        return
      }

      const stats = normalizeStats(await recordService.dailyStats(currentBabyId, todayString()))
      this.setData({ loading: false, score: stats.score || null })
    } catch (err) {
      console.error('[score] 加载失败:', err)
      wx.showToast({ title: err.message || '加载失败', icon: 'none' })
      this.setData({ loading: false })
    }
  },

  goMine() {
    wx.switchTab({ url: '/pages/mine/mine' })
  },

  /** 游客模式去登录 */
  goLogin() {
    wx.navigateTo({ url: '/pages/login/login' })
  },
})
