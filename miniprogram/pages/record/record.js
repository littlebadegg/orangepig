/**
 * 首页 — 一键记录（喂养 / 换尿片 / 睡觉）+ 今日时间线
 */
const babyService = require('../../services/baby')
const recordService = require('../../services/record')
const { nowString, todayString, formatDuration, genderText } = require('../../utils/format')

// 快捷选项
const AMOUNT_PRESETS = [60, 90, 120, 150, 180, 210]
const DURATION_PRESETS = [10, 15, 20, 30]

Page({
  data: {
    // 宝宝
    babies: [],
    currentBabyId: null,
    currentBaby: null,
    babySubtitle: '',

    // 今日数据
    stats: null,
    list: [],
    ongoing: null,
    sleepElapsed: '',

    // 喂奶弹窗
    showFeeding: false,
    feedingType: 'formula', // formula 奶粉 | breast 母乳
    amount: 120,
    customAmount: '',
    duration: 20,
    timeValue: '',

    // 换尿片弹窗
    showDiaper: false,
    diaperType: 'pee', // pee 小便 | poo 大便 | both 都有

    amountPresets: AMOUNT_PRESETS,
    durationPresets: DURATION_PRESETS,
    loading: true,
    submitting: false,
  },

  timer: null,

  onLoad() {
    const now = new Date()
    this.setData({
      timeValue: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
    })
  },

  onShow() {
    this.refresh()
    this.startTimer()
  },

  onHide() {
    this.stopTimer()
  },

  onUnload() {
    this.stopTimer()
  },

  onPullDownRefresh() {
    this.refresh().then(() => wx.stopPullDownRefresh())
  },

  // ============ 数据加载 ============

  async refresh() {
    try {
      const babyData = await babyService.list()
      const babies = babyData.list || []
      const currentBabyId =
        babyData.currentBabyId || (babies.length > 0 ? babies[0].id : null)
      const currentBaby = babies.find((b) => b.id === currentBabyId) || null

      const babySubtitle = currentBaby
        ? `${genderText(currentBaby.gender)}${currentBaby.birthday ? ' · ' + currentBaby.birthday : ''}`
        : '去「我的」添加一个宝宝'

      this.setData({ babies, currentBabyId, currentBaby, babySubtitle })

      if (!currentBabyId) {
        this.setData({ loading: false, list: [], stats: null, ongoing: null })
        return
      }
      await this.loadRecords()
    } catch (err) {
      console.error('[record] 加载失败:', err)
      wx.showToast({ title: err.message || '加载失败', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },

  async loadRecords() {
    const babyId = this.data.currentBabyId
    if (!babyId) return

    try {
      const [timeline, stats] = await Promise.all([
        recordService.timeline(babyId, todayString()),
        recordService.dailyStats(babyId, todayString()),
      ])

      const list = (timeline.list || []).map((item) => ({
        ...item,
        key: `${item.kind}_${item.id}`,
      }))

      this.setData({
        list,
        ongoing: timeline.ongoing || null,
        stats,
      })
      this.updateElapsed()
    } catch (err) {
      console.error('[record] 加载记录失败:', err)
    }
  },

  // ============ 计时器（睡眠中） ============

  startTimer() {
    this.stopTimer()
    this.timer = setInterval(() => this.updateElapsed(), 30000)
  },

  stopTimer() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  },

  updateElapsed() {
    const { ongoing } = this.data
    if (!ongoing || !ongoing.startFull) {
      if (this.data.sleepElapsed) this.setData({ sleepElapsed: '' })
      return
    }
    const start = new Date(String(ongoing.startFull).replace(/-/g, '/')).getTime()
    const minutes = Math.max(0, Math.round((Date.now() - start) / 60000))
    this.setData({ sleepElapsed: formatDuration(minutes) })
  },

  // ============ 切换宝宝 ============

  onSwitchBaby() {
    const { babies } = this.data
    if (!babies || babies.length === 0) {
      wx.showToast({ title: '还没有宝宝，去「我的」添加', icon: 'none' })
      return
    }
    if (babies.length === 1) {
      wx.showToast({ title: '目前只有一个宝宝', icon: 'none' })
      return
    }

    wx.showActionSheet({
      itemList: babies.map((b) => b.name),
      success: async (res) => {
        const baby = babies[res.tapIndex]
        try {
          await babyService.select(baby.id)
          this.setData({ currentBabyId: baby.id })
          await this.refresh()
          wx.showToast({ title: `已切换到${baby.name}`, icon: 'none' })
        } catch (err) {
          wx.showToast({ title: err.message || '切换失败', icon: 'none' })
        }
      },
      fail: () => {},
    })
  },

  // ============ 喂奶 ============

  openFeeding() {
    if (!this.checkBaby()) return
    const now = new Date()
    this.setData({
      showFeeding: true,
      customAmount: '',
      amount: 120,
      duration: 20,
      timeValue: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
    })
  },

  closeFeeding() {
    this.setData({ showFeeding: false })
  },

  setFeedingType(e) {
    this.setData({ feedingType: e.currentTarget.dataset.type })
  },

  setAmount(e) {
    this.setData({ amount: parseInt(e.currentTarget.dataset.value), customAmount: '' })
  },

  setDuration(e) {
    this.setData({ duration: parseInt(e.currentTarget.dataset.value) })
  },

  onAmountInput(e) {
    this.setData({ customAmount: e.detail.value })
  },

  onTimeChange(e) {
    this.setData({ timeValue: e.detail.value })
  },

  async submitFeeding() {
    const { feedingType, amount, customAmount, duration, timeValue, currentBabyId } = this.data

    const finalAmount = customAmount ? parseInt(customAmount) : amount
    if (feedingType === 'formula' && (!finalAmount || finalAmount <= 0)) {
      wx.showToast({ title: '请输入奶量', icon: 'none' })
      return
    }
    if (feedingType === 'breast' && (!duration || duration <= 0)) {
      wx.showToast({ title: '请选择喂奶时长', icon: 'none' })
      return
    }

    this.setData({ submitting: true })
    try {
      await recordService.addFeeding({
        babyId: currentBabyId,
        type: feedingType,
        amount: feedingType === 'formula' ? finalAmount : null,
        duration: feedingType === 'breast' ? duration : null,
        time: `${todayString()} ${timeValue}:00`,
      })
      this.setData({ showFeeding: false })
      wx.showToast({
        title:
          feedingType === 'formula' ? `已记录 ${finalAmount}ml` : `已记录 ${duration}分钟`,
        icon: 'none',
      })
      await this.loadRecords()
    } catch (err) {
      wx.showToast({ title: err.message || '记录失败', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  },

  // ============ 换尿片 ============

  openDiaper() {
    if (!this.checkBaby()) return
    const now = new Date()
    this.setData({
      showDiaper: true,
      diaperType: 'pee',
      timeValue: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
    })
  },

  closeDiaper() {
    this.setData({ showDiaper: false })
  },

  setDiaperType(e) {
    this.setData({ diaperType: e.currentTarget.dataset.type })
  },

  async submitDiaper() {
    const { diaperType, timeValue, currentBabyId } = this.data
    const labelMap = { pee: '小便', poo: '大便', both: '大小便' }

    this.setData({ submitting: true })
    try {
      await recordService.addDiaper({
        babyId: currentBabyId,
        type: diaperType,
        time: `${todayString()} ${timeValue}:00`,
      })
      this.setData({ showDiaper: false })
      wx.showToast({ title: `已记录${labelMap[diaperType]}`, icon: 'none' })
      await this.loadRecords()
    } catch (err) {
      wx.showToast({ title: err.message || '记录失败', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  },

  // ============ 睡觉 ============

  async onSleepTap() {
    if (!this.checkBaby()) return
    const { ongoing, currentBabyId } = this.data

    if (ongoing) {
      // 起床
      wx.showModal({
        title: '起床啦',
        content: `宝宝睡了 ${this.data.sleepElapsed || '一会儿'}，确定结束这次睡眠吗？`,
        success: async (res) => {
          if (!res.confirm) return
          try {
            await recordService.endSleep(currentBabyId, ongoing.id)
            wx.showToast({ title: '已记录睡眠', icon: 'none' })
            await this.loadRecords()
          } catch (err) {
            wx.showToast({ title: err.message || '结束失败', icon: 'none' })
          }
        },
      })
      return
    }

    // 开始睡觉
    try {
      await recordService.startSleep(currentBabyId)
      wx.showToast({ title: '宝宝开始睡觉啦 😴', icon: 'none' })
      await this.loadRecords()
    } catch (err) {
      wx.showToast({ title: err.message || '记录失败', icon: 'none' })
    }
  },

  // ============ 删除记录 ============

  onDeleteRecord(e) {
    const { kind, id } = e.currentTarget.dataset
    wx.showModal({
      title: '删除记录',
      content: '确定删除这条记录吗？',
      success: async (res) => {
        if (!res.confirm) return
        try {
          await recordService.remove(kind, id)
          wx.showToast({ title: '已删除', icon: 'none' })
          await this.loadRecords()
        } catch (err) {
          wx.showToast({ title: err.message || '删除失败', icon: 'none' })
        }
      },
    })
  },

  // ============ 工具 ============

  checkBaby() {
    if (!this.data.currentBabyId) {
      wx.showToast({ title: '请先添加宝宝', icon: 'none' })
      return false
    }
    return true
  },

  goMine() {
    wx.switchTab({ url: '/pages/mine/mine' })
  },
})
