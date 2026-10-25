/**
 * 登录页 — 微信一键登录
 *
 * 流程：自主阅读协议 → 主动勾选 → 点「微信一键登录」→ wx.login 拿 code
 *      → 后端 /api/auth/login 换 openid 并签发 JWT → 进主页
 * 已有 token 时直接进主页，不再重复登录。
 *
 * 合规要求：
 * - 协议默认【不勾选】，由用户自主阅读后自行决定是否同意
 * - 《用户服务协议》《隐私政策》均可点击查看全文（站内页面，不依赖外部链接）
 */
const { post } = require('../../utils/request')

Page({
  data: {
    agreed: false,
    logging: false,
  },

  onLoad() {
    try {
      const token = wx.getStorageSync('access_token')
      if (token) {
        this.redirectHome()
      }
    } catch (err) {
      console.error('[login] onLoad 异常', err)
    }
  },

  /** 进主页（统一入口，带兜底：失败时提示重进，避免白屏卡死） */
  redirectHome() {
    wx.nextTick(() => {
      wx.reLaunch({
        url: '/pages/record/record',
        fail: (err) => {
          console.error('[login] 跳转主页失败', err)
          wx.showToast({ title: '页面加载失败，请重新打开小程序', icon: 'none' })
        },
      })
    })
  },

  /** 勾选/取消勾选协议（点在勾选框上才切换） */
  toggleAgree() {
    this.setData({ agreed: !this.data.agreed })
  },

  /** 查看《用户服务协议》全文 */
  openUserAgreement() {
    wx.navigateTo({ url: '/pages/agreement/agreement?type=user' })
  },

  /** 查看《隐私政策》全文 */
  openPrivacyAgreement() {
    wx.navigateTo({ url: '/pages/agreement/agreement?type=privacy' })
  },

  async onLogin() {
    if (!this.data.agreed) {
      // 未同意协议：弹窗引导用户自主阅读并选择，不默认替用户勾选
      wx.showModal({
        title: '服务协议及隐私保护',
        content:
          '请阅读并同意以下协议《用户服务协议》《隐私政策》后，才能继续使用本服务。',
        confirmText: '同意',
        cancelText: '不同意',
        success: (res) => {
          if (res.confirm) {
            // 用户在弹窗中主动点了「同意」——这是用户的自主选择
            this.setData({ agreed: true })
            wx.navigateTo({ url: '/pages/agreement/agreement?type=privacy' })
          }
        },
      })
      return
    }
    if (this.data.logging) return

    this.setData({ logging: true })
    try {
      const code = await new Promise((resolve, reject) => {
        wx.login({
          success: (res) => (res.code ? resolve(res.code) : reject({ message: '获取登录凭证失败' })),
          fail: () => reject({ message: '获取登录凭证失败' }),
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
      setTimeout(() => this.redirectHome(), 400)
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '登录失败，请重试', icon: 'none' })
    } finally {
      this.setData({ logging: false })
    }
  },
})
