/**
 * 首页 — 一键记录（喂养 / 换尿片 / 睡觉）+ 今日时间线
 */
const babyService = require('../../services/baby')
const recordService = require('../../services/record')
const { nowString, todayString, formatDuration, genderText, normalizeStats } = require('../../utils/format')
const { recordDemo } = require('../../utils/demo-data')

// 快捷选项
const AMOUNT_PRESETS = [60, 90, 120, 150, 180, 210]
const DURATION_PRESETS = [10, 15, 20, 30]
// 排气操时长（分钟）
const EXERCISE_PRESETS = [3, 5, 10, 15]
// 洗澡时长（分钟）
const BATH_PRESETS = [5, 10, 15, 20]
// 喂水量预设（毫升）
const WATER_PRESETS = [10, 20, 30, 50]
// 吐奶量文案
const SPIT_UP_TEXT = { 1: '少量', 2: '中量', 3: '大量' }
// 体温快捷值（℃）
const TEMP_PRESETS = [36.5, 37.0, 37.5, 38.0]
// 体温测量方式
const TEMP_METHODS = [
  { value: 'ear', label: '耳温' },
  { value: 'forehead', label: '额温' },
  { value: 'armpit', label: '腋温' },
]
// 发烧阈值（与后端一致）
const FEVER_THRESHOLD = 37.3

/** 当前时间的 HH:mm */
function currentHM() {
  const now = new Date()
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
}

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

    // 查看日期（可切换到历史日期回看记录与评分）
    viewDate: '',
    viewDateText: '',
    dateStart: '2024-01-01',
    isToday: true,

    // 养育小贴士（按宝宝天数）
    tips: [],
    stageText: '',
    babyAgeDays: null,
    tipsExpanded: false,

    // 自定义喂养项
    customFeeds: [],

    // 喂水弹窗
    showWater: false,
    waterAmount: 20,
    waterCustomAmount: '',

    // 喂养品弹窗（AD / D3 / 自定义）
    showSupplement: false,
    supplementName: 'AD',
    supplementCustomName: '',
    supplementOptions: [{ name: 'AD', label: '维生素AD' }],

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

    // 排气操弹窗
    showExercise: false,
    exerciseDuration: 5,
    exerciseResult: 0, // 0 不记 | 1 有排气 | 2 没排气

    // 身高体重弹窗
    showGrowth: false,
    height: '',
    weight: '',

    // 体温弹窗
    showTemperature: false,
    temperature: 36.8,
    customTemperature: '',
    tempMethod: 'ear',

    // 吐奶弹窗
    showSpitUp: false,
    spitUpLevel: 1, // 1 少量 | 2 中量 | 3 大量

    // 洗澡弹窗
    showBath: false,
    bathDuration: 10,
    bathWaterTemp: '',

    // 编辑态：editingId 不为空时，弹窗走「修改」而不是「新增」
    editingId: null,
    editingKind: '',

    // 睡眠编辑弹窗（睡眠没有普通弹窗，单独一个）
    showSleepEdit: false,
    sleepStart: '',
    sleepEnd: '',
    // 入睡日期：跨夜记录编辑时不能默认成「今天」
    sleepBaseDate: '',

    amountPresets: AMOUNT_PRESETS,
    durationPresets: DURATION_PRESETS,
    exercisePresets: EXERCISE_PRESETS,
    bathPresets: BATH_PRESETS,
    tempPresets: TEMP_PRESETS,
    tempMethods: TEMP_METHODS,
    waterPresets: WATER_PRESETS,
    loading: true,
    submitting: false,
    // 游客模式：未登录先浏览示例数据，登录由用户主动触发（微信审核合规要求）
    guest: false,
    // 今日记录折叠：默认只展示前 5 条
    showAllRecords: false,
  },

  /** 默认展示条数 */
  previewCount: 5,

  timer: null,

  onLoad() {
    this.setData({ timeValue: currentHM(), viewDate: todayString(), todayEnd: todayString() })
    // 游客模式：未登录直接进首页浏览示例数据，不强制跳登录页（微信审核合规要求）
    if (!wx.getStorageSync('access_token')) {
      this.enterGuest()
    }
  },

  onShow() {
    // 游客模式（无 token）下不请求后端；从登录页登录成功后 reLaunch 回来会重新走 onLoad
    if (!wx.getStorageSync('access_token')) return
    if (this.data.guest) this.setData({ guest: false })
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
    if (this.data.guest || !wx.getStorageSync('access_token')) {
      wx.stopPullDownRefresh()
      return
    }
    this.refresh().then(() => wx.stopPullDownRefresh())
  },

  // ============ 游客模式 ============

  /** 未登录：加载本地演示数据，让用户先浏览体验功能 */
  enterGuest() {
    const demo = recordDemo()
    this.setData({
      guest: true,
      loading: false,
      babies: [],
      currentBabyId: null,
      currentBaby: demo.currentBaby,
      babySubtitle: demo.babySubtitle,
      stats: normalizeStats(demo.stats),
      list: demo.list.map((item) => ({ ...item, key: `demo_${item.id}` })),
      ongoing: null,
      tips: demo.tips,
      stageText: demo.stageText,
      viewDateText: '今日记录',
      isToday: true,
      customFeeds: [],
      supplementOptions: [{ name: 'AD', label: '维生素AD' }],
    })
  },

  /** 游客点保存/操作类动作 → 引导登录（不强制，可继续浏览） */
  needLogin() {
    wx.showModal({
      title: '需要登录',
      content: '登录后即可记录自家宝宝，现在去登录吗？',
      confirmText: '去登录',
      cancelText: '再逛逛',
      success: (res) => {
        if (res.confirm) this.goLogin()
      },
    })
  },

  /** 跳登录页（用户主动登录） */
  goLogin() {
    wx.navigateTo({ url: '/pages/login/login' })
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
      await Promise.all([this.loadRecords(), this.loadTips(), this.loadCustomFeeds()])
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

    const date = this.data.viewDate || todayString()
    const isToday = date === todayString()

    try {
      const [timeline, stats] = await Promise.all([
        recordService.timeline(babyId, date),
        recordService.dailyStats(babyId, date),
      ])

      const list = (timeline.list || []).map((item) => ({
        ...item,
        // 跨夜睡眠在两天各有一条，用 part 区分 key
        key: `${item.kind}_${item.id}_${item.part || ''}`,
      }))

      const parts = date.split('-')
      this.setData({
        list,
        ongoing: isToday ? timeline.ongoing || null : null,
        stats: normalizeStats(stats),
        isToday,
        viewDate: date,
        viewDateText: isToday
          ? '今日记录'
          : `${parseInt(parts[0])}年${parseInt(parts[1])}月${parseInt(parts[2])}日`,
      })
      this.updateElapsed()
    } catch (err) {
      console.error('[record] 加载记录失败:', err)
    }
  },

  // ============ 查看日期切换 ============

  onDateChange(e) {
    const date = e.detail.value
    if (date === this.data.viewDate) return
    this.setData({ viewDate: date })
    this.loadRecords()
  },

  goToday() {
    if (this.data.isToday) return
    this.setData({ viewDate: todayString() })
    this.loadRecords()
  },

  // ============ 养育小贴士 ============

  async loadTips() {
    const babyId = this.data.currentBabyId
    if (!babyId) return
    try {
      const data = await recordService.getTips(babyId)
      this.setData({
        tips: data.groups || [],
        stageText: data.stageText || '',
        babyAgeDays: data.ageDays,
      })
    } catch (err) {
      // tips 加载失败不影响主流程
      console.error('[record] 加载小贴士失败:', err)
    }
  },

  onToggleTips() {
    this.setData({ tipsExpanded: !this.data.tipsExpanded })
  },

  // ============ 自定义喂养项 ============

  async loadCustomFeeds() {
    try {
      const data = await recordService.listCustomFeeds()
      const customFeeds = data.list || []
      this.setData({
        customFeeds,
        supplementOptions: [{ name: 'AD', label: '维生素AD' }].concat(
          customFeeds.map((c) => ({ name: c.name, label: c.name }))
        ),
      })
    } catch (err) {
      console.error('[record] 加载自定义喂养项失败:', err)
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

  /** 去评分 tab 看完整评分 */
  goScore() {
    wx.switchTab({ url: '/pages/score/score' })
  },

  onSwitchBaby() {
    if (this.data.guest) {
      this.needLogin()
      return
    }
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
    this.setData({
      showFeeding: true,
      editingId: null,
      editingKind: '',
      customAmount: '',
      amount: 120,
      duration: 20,
      timeValue: currentHM(),
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
    if (this.data.guest) { this.needLogin(); return }
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

    const isEdit = !!this.data.editingId
    const editingId = this.data.editingId
    this.setData({ submitting: true })
    try {
      const payload = {
        babyId: currentBabyId,
        type: feedingType,
        amount: feedingType === 'formula' ? finalAmount : null,
        duration: feedingType === 'breast' ? duration : null,
        time: `${todayString()} ${timeValue}:00`,
      }
      if (isEdit) {
        await recordService.update('feeding', editingId, payload)
      } else {
        await recordService.addFeeding(payload)
      }
      this.setData({ showFeeding: false, editingId: null, editingKind: '' })
      wx.showToast({
        title: isEdit
          ? '已保存修改'
          : feedingType === 'formula'
            ? `已记录 ${finalAmount}ml`
            : `已记录 ${duration}分钟`,
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
    this.setData({
      showDiaper: true,
      editingId: null,
      editingKind: '',
      diaperType: 'pee',
      timeValue: currentHM(),
    })
  },

  closeDiaper() {
    this.setData({ showDiaper: false })
  },

  setDiaperType(e) {
    this.setData({ diaperType: e.currentTarget.dataset.type })
  },

  async submitDiaper() {
    if (this.data.guest) { this.needLogin(); return }
    const { diaperType, timeValue, currentBabyId } = this.data
    const labelMap = { pee: '小便', poo: '大便', both: '大小便' }

    const isEdit = !!this.data.editingId
    const editingId = this.data.editingId
    this.setData({ submitting: true })
    try {
      const payload = {
        babyId: currentBabyId,
        type: diaperType,
        time: `${todayString()} ${timeValue}:00`,
      }
      if (isEdit) {
        await recordService.update('diaper', editingId, payload)
      } else {
        await recordService.addDiaper(payload)
      }
      this.setData({ showDiaper: false, editingId: null, editingKind: '' })
      wx.showToast({
        title: isEdit ? '已保存修改' : `已记录${labelMap[diaperType]}`,
        icon: 'none',
      })
      await this.loadRecords()
    } catch (err) {
      wx.showToast({ title: err.message || '记录失败', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  },

  // ============ 排气操 ============

  openExercise() {
    console.log('[record] openExercise →', this.data.currentBabyId)
    if (!this.checkBaby()) return
    this.setData({
      showExercise: true,
      editingId: null,
      editingKind: '',
      exerciseDuration: 5,
      exerciseResult: 0,
      timeValue: currentHM(),
    })
  },

  closeExercise() {
    this.setData({ showExercise: false })
  },

  setExerciseDuration(e) {
    this.setData({ exerciseDuration: parseInt(e.currentTarget.dataset.value) })
  },

  setExerciseResult(e) {
    this.setData({ exerciseResult: parseInt(e.currentTarget.dataset.value) })
  },

  async submitExercise() {
    if (this.data.guest) { this.needLogin(); return }
    const { exerciseDuration, exerciseResult, timeValue, currentBabyId } = this.data

    if (!exerciseDuration || exerciseDuration <= 0) {
      wx.showToast({ title: '请选择做操时长', icon: 'none' })
      return
    }

    const isEdit = !!this.data.editingId
    const editingId = this.data.editingId
    this.setData({ submitting: true })
    try {
      const payload = {
        babyId: currentBabyId,
        duration: exerciseDuration,
        result: exerciseResult,
        time: `${todayString()} ${timeValue}:00`,
      }
      if (isEdit) {
        await recordService.update('exercise', editingId, payload)
      } else {
        await recordService.addExercise(payload)
      }
      this.setData({ showExercise: false, editingId: null, editingKind: '' })
      wx.showToast({
        title: isEdit ? '已保存修改' : `已记录 ${exerciseDuration}分钟`,
        icon: 'none',
      })
      await this.loadRecords()
    } catch (err) {
      console.error('[record] submitExercise 失败:', err)
      wx.showToast({ title: err.message || '记录失败', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  },

  // ============ 身高体重 ============

  openGrowth() {
    console.log('[record] openGrowth →', this.data.currentBabyId)
    if (!this.checkBaby()) return
    const { stats } = this.data
    const g = stats && stats.growth ? stats.growth : null

    this.setData({
      showGrowth: true,
      editingId: null,
      editingKind: '',
      // 带出上次数值，方便对比着微调
      height: g && g.height !== null && g.height !== undefined ? String(g.height) : '',
      weight: g && g.weight !== null && g.weight !== undefined ? String(g.weight) : '',
      timeValue: currentHM(),
    })
  },

  closeGrowth() {
    this.setData({ showGrowth: false })
  },

  onHeightInput(e) {
    this.setData({ height: e.detail.value })
  },

  onWeightInput(e) {
    this.setData({ weight: e.detail.value })
  },

  async submitGrowth() {
    if (this.data.guest) { this.needLogin(); return }
    const { height, weight, timeValue, currentBabyId } = this.data

    const h = height === '' ? null : parseFloat(height)
    const w = weight === '' ? null : parseFloat(weight)

    if (h === null && w === null) {
      wx.showToast({ title: '请至少填写身高或体重', icon: 'none' })
      return
    }
    if (h !== null && (isNaN(h) || h <= 0 || h > 120)) {
      wx.showToast({ title: '身高请填 1~120 cm', icon: 'none' })
      return
    }
    if (w !== null && (isNaN(w) || w <= 0 || w > 30)) {
      wx.showToast({ title: '体重请填 0.5~30 kg', icon: 'none' })
      return
    }

    const isEdit = !!this.data.editingId
    const editingId = this.data.editingId
    this.setData({ submitting: true })
    try {
      const payload = {
        babyId: currentBabyId,
        height: h,
        weight: w,
        time: `${todayString()} ${timeValue}:00`,
      }
      if (isEdit) {
        await recordService.update('growth', editingId, payload)
      } else {
        await recordService.addGrowth(payload)
      }
      this.setData({ showGrowth: false, editingId: null, editingKind: '' })

      const parts = []
      if (h !== null) parts.push(`${h}cm`)
      if (w !== null) parts.push(`${w}kg`)
      wx.showToast({
        title: isEdit ? '已保存修改' : `已记录 ${parts.join(' · ')}`,
        icon: 'none',
      })
      await this.loadRecords()
    } catch (err) {
      console.error('[record] submitGrowth 失败:', err)
      wx.showToast({ title: err.message || '记录失败', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  },

  // ============ 体温 ============

  openTemperature() {
    console.log('[record] openTemperature →', this.data.currentBabyId)
    if (!this.checkBaby()) return
    this.setData({
      showTemperature: true,
      editingId: null,
      editingKind: '',
      temperature: 36.8,
      customTemperature: '',
      tempMethod: 'ear',
      timeValue: currentHM(),
    })
  },

  closeTemperature() {
    this.setData({ showTemperature: false })
  },

  setTemperature(e) {
    this.setData({ temperature: parseFloat(e.currentTarget.dataset.value), customTemperature: '' })
  },

  onTempInput(e) {
    this.setData({ customTemperature: e.detail.value })
  },

  setTempMethod(e) {
    this.setData({ tempMethod: e.currentTarget.dataset.value })
  },

  async submitTemperature() {
    if (this.data.guest) { this.needLogin(); return }
    const { temperature, customTemperature, tempMethod, timeValue, currentBabyId } = this.data

    const t = customTemperature ? parseFloat(customTemperature) : temperature
    if (isNaN(t) || t < 35 || t > 43) {
      wx.showToast({ title: '体温请填 35~43 ℃', icon: 'none' })
      return
    }

    const isEdit = !!this.data.editingId
    const editingId = this.data.editingId
    this.setData({ submitting: true })
    try {
      const payload = {
        babyId: currentBabyId,
        temperature: t,
        method: tempMethod,
        time: `${todayString()} ${timeValue}:00`,
      }
      if (isEdit) {
        await recordService.update('temperature', editingId, payload)
      } else {
        await recordService.addTemperature(payload)
      }
      this.setData({ showTemperature: false, editingId: null, editingKind: '' })
      wx.showToast({
        title: isEdit
          ? '已保存修改'
          : t >= FEVER_THRESHOLD
            ? `已记录 ${t}℃ · 偏高`
            : `已记录 ${t}℃`,
        icon: 'none',
      })
      await this.loadRecords()
    } catch (err) {
      console.error('[record] submitTemperature 失败:', err)
      wx.showToast({ title: err.message || '记录失败', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  },

  // ============ 吐奶 ============

  openSpitUp() {
    if (!this.checkBaby()) return
    this.setData({
      showSpitUp: true,
      editingId: null,
      editingKind: '',
      spitUpLevel: 1,
      timeValue: currentHM(),
    })
  },

  closeSpitUp() {
    this.setData({ showSpitUp: false })
  },

  setSpitUpLevel(e) {
    this.setData({ spitUpLevel: parseInt(e.currentTarget.dataset.level) })
  },

  async submitSpitUp() {
    if (this.data.guest) { this.needLogin(); return }
    const { spitUpLevel, timeValue, currentBabyId } = this.data

    const isEdit = !!this.data.editingId
    const editingId = this.data.editingId
    this.setData({ submitting: true })
    try {
      const payload = {
        babyId: currentBabyId,
        level: spitUpLevel,
        time: `${todayString()} ${timeValue}:00`,
      }
      if (isEdit) {
        await recordService.update('spitup', editingId, payload)
      } else {
        await recordService.addSpitUp(payload)
      }
      this.setData({ showSpitUp: false, editingId: null, editingKind: '' })
      wx.showToast({
        title: isEdit ? '已保存修改' : `已记录吐奶 · ${SPIT_UP_TEXT[spitUpLevel]}`,
        icon: 'none',
      })
      await this.loadRecords()
    } catch (err) {
      wx.showToast({ title: err.message || '记录失败', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  },

  // ============ 洗澡 ============

  openBath() {
    if (!this.checkBaby()) return
    const { stats } = this.data
    const lastTemp = stats && stats.bath ? stats.bath.lastWaterTemp : null

    this.setData({
      showBath: true,
      editingId: null,
      editingKind: '',
      bathDuration: 10,
      // 带上次的洗澡水温，一般每次都差不多
      bathWaterTemp: lastTemp !== null && lastTemp !== undefined ? String(lastTemp) : '',
      timeValue: currentHM(),
    })
  },

  closeBath() {
    this.setData({ showBath: false })
  },

  setBathDuration(e) {
    this.setData({ bathDuration: parseInt(e.currentTarget.dataset.value) })
  },

  onBathTempInput(e) {
    this.setData({ bathWaterTemp: e.detail.value })
  },

  async submitBath() {
    if (this.data.guest) { this.needLogin(); return }
    const { bathDuration, bathWaterTemp, timeValue, currentBabyId } = this.data

    const temp = bathWaterTemp === '' ? null : parseFloat(bathWaterTemp)
    if (temp !== null && (isNaN(temp) || temp < 20 || temp > 45)) {
      wx.showToast({ title: '水温请填 20~45 ℃', icon: 'none' })
      return
    }

    const isEdit = !!this.data.editingId
    const editingId = this.data.editingId
    this.setData({ submitting: true })
    try {
      const payload = {
        babyId: currentBabyId,
        // 0 表示「不记时长」，后端存 null
        duration: bathDuration > 0 ? bathDuration : null,
        waterTemp: temp,
        time: `${todayString()} ${timeValue}:00`,
      }
      if (isEdit) {
        await recordService.update('bath', editingId, payload)
      } else {
        await recordService.addBath(payload)
      }
      this.setData({ showBath: false, editingId: null, editingKind: '' })
      wx.showToast({
        title: isEdit
          ? '已保存修改'
          : bathDuration > 0
            ? `已记录洗澡 ${bathDuration}分钟`
            : '已记录洗澡',
        icon: 'none',
      })
      await this.loadRecords()
    } catch (err) {
      wx.showToast({ title: err.message || '记录失败', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  },

  // ============ 喂水 ============

  openWater() {
    if (!this.checkBaby()) return
    this.setData({
      showWater: true,
      editingId: null,
      editingKind: '',
      waterAmount: 20,
      waterCustomAmount: '',
      timeValue: currentHM(),
    })
  },

  closeWater() {
    this.setData({ showWater: false })
  },

  setWaterAmount(e) {
    const v = parseInt(e.currentTarget.dataset.value)
    this.setData({ waterAmount: v, waterCustomAmount: '' })
  },

  onWaterAmountInput(e) {
    this.setData({ waterCustomAmount: e.detail.value })
  },

  async submitWater() {
    if (this.data.guest) { this.needLogin(); return }
    const { waterAmount, waterCustomAmount, timeValue, currentBabyId } = this.data

    // 输入框优先；都没填就是「只记喝了水，不记毫升」
    const amount = waterCustomAmount
      ? parseInt(waterCustomAmount)
      : waterCustomAmount === '' && waterAmount === 0
        ? null
        : waterAmount
    if (amount !== null && (isNaN(amount) || amount <= 0 || amount > 500)) {
      wx.showToast({ title: '水量请填 1~500 ml', icon: 'none' })
      return
    }

    const isEdit = !!this.data.editingId
    const editingId = this.data.editingId
    this.setData({ submitting: true })
    try {
      const payload = {
        babyId: currentBabyId,
        amount,
        time: `${todayString()} ${timeValue}:00`,
      }
      if (isEdit) {
        await recordService.update('water', editingId, payload)
      } else {
        await recordService.addWater(payload)
      }
      this.setData({ showWater: false, editingId: null, editingKind: '' })
      wx.showToast({
        title: isEdit ? '已保存修改' : amount ? `已记录喂水 ${amount}ml` : '已记录喂水',
        icon: 'none',
      })
      await this.loadRecords()
    } catch (err) {
      wx.showToast({ title: err.message || '记录失败', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  },

  // ============ 喂养品（AD / D3 / 自定义） ============

  openSupplement() {
    if (!this.checkBaby()) return
    this.setData({
      showSupplement: true,
      editingId: null,
      editingKind: '',
      supplementName: 'AD',
      supplementCustomName: '',
      timeValue: currentHM(),
    })
  },

  closeSupplement() {
    this.setData({ showSupplement: false })
  },

  setSupplementName(e) {
    this.setData({ supplementName: e.currentTarget.dataset.name, supplementCustomName: '' })
  },

  onSupplementNameInput(e) {
    this.setData({ supplementCustomName: e.detail.value })
  },

  async submitSupplement() {
    if (this.data.guest) { this.needLogin(); return }
    const { supplementName, supplementCustomName, timeValue, currentBabyId } = this.data

    const name = (supplementCustomName || supplementName || '').trim()
    if (!name) {
      wx.showToast({ title: '请选择或输入喂的什么', icon: 'none' })
      return
    }

    const isEdit = !!this.data.editingId
    const editingId = this.data.editingId
    this.setData({ submitting: true })
    try {
      // 新名称（不在现有选项里）顺手存为自定义喂养项，之后每天没喂会提醒
      const knownNames = this.data.supplementOptions.map((o) => o.name)
      if (!isEdit && !knownNames.includes(name) && name !== '维生素AD') {
        try {
          await recordService.addCustomFeed(name)
          await this.loadCustomFeeds()
        } catch (e) {
          // 自定义项保存失败不阻塞记录
          console.error('[record] 保存自定义喂养项失败:', e)
        }
      }

      const payload = {
        babyId: currentBabyId,
        name,
        time: `${todayString()} ${timeValue}:00`,
      }
      if (isEdit) {
        await recordService.update('supplement', editingId, payload)
      } else {
        await recordService.addSupplement(payload)
      }
      this.setData({ showSupplement: false, editingId: null, editingKind: '' })
      wx.showToast({ title: isEdit ? '已保存修改' : `已记录${name === 'AD' ? '维生素AD' : name}`, icon: 'none' })
      await this.loadRecords()
    } catch (err) {
      wx.showToast({ title: err.message || '记录失败', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  },

  /** 删除自定义喂养项（不再每天提醒） */
  onRemoveCustomFeed(e) {
    const { name } = e.currentTarget.dataset
    const item = (this.data.customFeeds || []).find((c) => c.name === name)
    if (!item) return
    wx.showModal({
      title: '删除喂养项',
      content: `删除「${name}」后，以后不再每天提醒，历史记录保留。确定删除吗？`,
      success: async (res) => {
        if (!res.confirm) return
        try {
          await recordService.removeCustomFeed(item.id)
          wx.showToast({ title: '已删除', icon: 'none' })
          await this.loadCustomFeeds()
        } catch (err) {
          wx.showToast({ title: err.message || '删除失败', icon: 'none' })
        }
      },
    })
  },

  /** 点提醒条 → 快捷打开对应的记录弹窗 */
  onReminderTap(e) {
    const { action } = e.currentTarget.dataset
    if (action === 'water') {
      this.openWater()
    } else if (action === 'supplement') {
      const name = e.currentTarget.dataset.name
      this.setData({ supplementName: name || 'AD', supplementCustomName: '' })
      if (!this.checkBaby()) return
      this.setData({
        showSupplement: true,
        editingId: null,
        editingKind: '',
        timeValue: currentHM(),
      })
    }
  },

  // ============ 睡觉 ============

  async onSleepTap() {
    if (this.data.guest) {
      this.needLogin()
      return
    }
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

  // ============ 编辑记录 ============

  /**
   * 点时间线某条记录 → 打开对应弹窗并预填
   * 睡眠单独用 showSleepEdit（只有起止时间两个 picker）
   */
  onEditRecord(e) {
    const { kind, id } = e.currentTarget.dataset
    const item = (this.data.list || []).find(
      (r) => r.kind === kind && String(r.id) === String(id)
    )
    if (!item) return

    const hm = item.timeText || currentHM()

    if (kind === 'sleep') {
      // 跨夜睡眠拆成两条展示，但改的是同一条记录，所以用完整起止时间
      const parts = String(item.subtitle || '').split('→')
      const startHM = item.startHM || (parts[0] || hm).trim()
      const endHM = item.endHM || (parts[1] || hm).trim().replace('24:00', '00:00')
      this.setData({
        showSleepEdit: true,
        editingId: id,
        editingKind: kind,
        sleepStart: startHM,
        sleepEnd: endHM,
        // 这条睡眠的入睡日期（跨夜时结束日期会自动落到次日）
        sleepBaseDate: (item.startAt || '').slice(0, 10) || this.data.viewDate || todayString(),
      })
      return
    }

    switch (kind) {
      case 'feeding':
        this.setData({
          showFeeding: true,
          editingId: id,
          editingKind: kind,
          feedingType: item.type,
          amount: item.type === 'formula' ? item.amount : 120,
          customAmount: '',
          duration: item.type === 'breast' ? item.duration : 20,
          timeValue: hm,
        })
        break
      case 'diaper':
        this.setData({
          showDiaper: true,
          editingId: id,
          editingKind: kind,
          diaperType: item.type,
          timeValue: hm,
        })
        break
      case 'exercise':
        this.setData({
          showExercise: true,
          editingId: id,
          editingKind: kind,
          exerciseDuration: item.duration || 5,
          exerciseResult: item.result || 0,
          timeValue: hm,
        })
        break
      case 'growth':
        this.setData({
          showGrowth: true,
          editingId: id,
          editingKind: kind,
          height: item.height !== null && item.height !== undefined ? String(item.height) : '',
          weight: item.weight !== null && item.weight !== undefined ? String(item.weight) : '',
          timeValue: hm,
        })
        break
      case 'temperature':
        this.setData({
          showTemperature: true,
          editingId: id,
          editingKind: kind,
          temperature: item.temperature,
          customTemperature: '',
          tempMethod: item.method || 'ear',
          timeValue: hm,
        })
        break
      case 'spitup':
        this.setData({
          showSpitUp: true,
          editingId: id,
          editingKind: kind,
          spitUpLevel: item.level || 1,
          timeValue: hm,
        })
        break
      case 'bath':
        this.setData({
          showBath: true,
          editingId: id,
          editingKind: kind,
          bathDuration: item.duration || 0,
          bathWaterTemp:
            item.waterTemp !== null && item.waterTemp !== undefined
              ? String(item.waterTemp)
              : '',
          timeValue: hm,
        })
        break
      case 'water':
        this.setData({
          showWater: true,
          editingId: id,
          editingKind: kind,
          waterAmount: item.amount || 0,
          waterCustomAmount: '',
          timeValue: hm,
        })
        break
      case 'supplement':
        this.setData({
          showSupplement: true,
          editingId: id,
          editingKind: kind,
          supplementName: item.name || 'AD',
          supplementCustomName: '',
          timeValue: hm,
        })
        break
      default:
        break
    }
  },

  // ============ 睡眠编辑 ============

  closeSleepEdit() {
    this.setData({ showSleepEdit: false, editingId: null, editingKind: '', sleepBaseDate: '' })
  },

  onSleepStartChange(e) {
    this.setData({ sleepStart: e.detail.value })
  },

  onSleepEndChange(e) {
    this.setData({ sleepEnd: e.detail.value })
  },

  async submitSleepEdit() {
    if (this.data.guest) { this.needLogin(); return }
    const { sleepStart, sleepEnd, editingId } = this.data
    if (!sleepStart || !sleepEnd) {
      wx.showToast({ title: '请选择起止时间', icon: 'none' })
      return
    }

    // 以这条睡眠的入睡日期为基准（跨夜记录不能默认按今天算）
    const base = this.data.sleepBaseDate || this.data.viewDate || todayString()
    const start = `${base} ${sleepStart}:00`
    let end = `${base} ${sleepEnd}:00`

    // 结束时间不晚于开始时间 → 视为跨夜，落到第二天
    if (sleepEnd <= sleepStart) {
      const d = new Date(`${base} 00:00:00`.replace(/-/g, '/'))
      d.setDate(d.getDate() + 1)
      const next = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
        d.getDate()
      ).padStart(2, '0')}`
      end = `${next} ${sleepEnd}:00`
    }

    this.setData({ submitting: true })
    try {
      await recordService.update('sleep', editingId, { startTime: start, endTime: end })
      this.setData({ showSleepEdit: false, editingId: null, editingKind: '', sleepBaseDate: '' })
      wx.showToast({ title: '已保存修改', icon: 'none' })
      await this.loadRecords()
    } catch (err) {
      wx.showToast({ title: err.message || '保存失败', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  },

  // ============ 今日记录折叠 ============

  onToggleRecords() {
    this.setData({ showAllRecords: !this.data.showAllRecords })
    wx.pageScrollTo({ duration: 0 })
  },

  // ============ 删除记录 ============

  onDeleteRecord(e) {
    if (this.data.guest) {
      this.needLogin()
      return
    }
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
    // 游客模式放行弹窗浏览（体验功能），提交时再引导登录
    if (this.data.guest) return true
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
