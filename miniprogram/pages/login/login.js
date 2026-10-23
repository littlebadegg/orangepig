/**
 * 登录页 — 微信一键登录
 *
 * 流程：勾选协议 → 点「微信一键登录」→ wx.login 拿 code
 *      → 后端 /api/auth/login 换 openid 并签发 JWT → 进主页
 * 已有 token 时直接进主页，不再重复登录。
 */
const { post } = require('../../utils/request')

Page({
  data: {
    agreed: true,
    logging: false,
  },

  onLoad() {
    const token = wx.getStorageSync('access_token')
    if (token) {
      // 已登录，直接进主页
      wx.reLaunch({ url: '/pages/record/record' })
    }
  },

  toggleAgree() {
    this.setData({ agreed: !this.data.agreed })
  },

  async onLogin() {
    if (!this.data.agreed) {
      wx.showToast({ title: '请先同意用户协议', icon: 'none' })
      return
    }
    if (this.data.logging) return

    this.setData({ logging: true })
    try {
      const code = await new Promise((resolve, reject) => {
        wx.login({
          success: (res) => (res.code ? resolve(res.code) : reject({ message: '获取登录凭证失败' })),
          fail: reject,
        })
      })

      const result = await post('/auth/login', { code })
      wx.setStorageSync('access_token', result.token)

      const app = getApp()
      if (app) {
        app.globalData.userId = result.userId
        app.globalData.isLogin = true
      }

      wx.showToast({ title: '登录成功', icon: 'success' })
      setTimeout(() => wx.reLaunch({ url: '/pages/record/record' }), 400)
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '登录失败，请重试', icon: 'none' })
    } finally {
      this.setData({ logging: false })
    }
  },
})
