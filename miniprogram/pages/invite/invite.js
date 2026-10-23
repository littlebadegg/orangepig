/**
 * 邀请接收页 — 家人点开分享卡片后先落到这里，确认后加入
 * path: /pages/invite/invite?code=XXXXXX
 */
const babyService = require('../../services/baby')

const RELATION_OPTIONS = ['妈妈', '爸爸', '爷爷', '奶奶', '外公', '外婆', '月嫂', '其他家人']

Page({
  data: {
    code: '',
    loading: true,
    error: '',
    babyId: null,
    babyName: '',
    inviterName: '',
    alreadyJoined: false,
    isMine: false,
    relationOptions: RELATION_OPTIONS,
    relationIndex: 1,
    submitting: false,
  },

  onLoad(options) {
    const code = String((options && options.code) || '').trim().toUpperCase()
    this.setData({ code })

    if (!code) {
      this.setData({ loading: false, error: '邀请码不存在' })
      return
    }

    this.ensureLogin().then(() => this.loadInfo())
  },

  /** 等登录完成，避免第一个请求 401 */
  ensureLogin() {
    const app = getApp()
    if (app && app.globalData.isLogin) return Promise.resolve()
    if (app && app.silentLogin) {
      return app.silentLogin().catch(() => {})
    }
    return Promise.resolve()
  },

  async loadInfo() {
    try {
      const info = await babyService.inviteInfo(this.data.code)
      this.setData({
        loading: false,
        babyId: info.babyId,
        babyName: info.babyName,
        inviterName: info.inviterName,
        alreadyJoined: info.alreadyJoined,
        isMine: info.isMine,
      })
    } catch (err) {
      this.setData({ loading: false, error: err.message || '邀请码已失效' })
    }
  },

  onRelationChange(e) {
    this.setData({ relationIndex: parseInt(e.detail.value) })
  },

  async onJoin() {
    const { code, relationIndex } = this.data
    this.setData({ submitting: true })
    try {
      const baby = await babyService.join({
        code,
        relation: RELATION_OPTIONS[relationIndex] || '',
      })
      wx.showToast({ title: `已加入 ${baby.name}`, icon: 'none' })
      setTimeout(() => {
        wx.switchTab({ url: '/pages/record/record' })
      }, 800)
    } catch (err) {
      this.setData({ submitting: false })
      wx.showToast({ title: err.message || '加入失败', icon: 'none' })
    }
  },

  goRecord() {
    wx.switchTab({ url: '/pages/record/record' })
  },

  goMine() {
    wx.switchTab({ url: '/pages/mine/mine' })
  },

  onShareAppMessage() {
    return {
      title: `一起来记录${this.data.babyName || '宝宝'}的日常`,
      path: `/pages/invite/invite?code=${this.data.code}`,
    }
  },
})
