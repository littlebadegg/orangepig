/**
 * App 入口 — 全局生命周期、静默登录、全局数据
 *
 * 非云开发版本：
 * - 静默登录走后端 /api/auth/login 接口（wx.login 换 openid）
 * - token 存 localStorage，请求头自动携带
 * - 不涉及头像昵称授权，避免隐私合规麻烦
 */
const { post } = require('./utils/request')

App({
  globalData: {
    userId: null,
    isLogin: false,
    systemInfo: null,
    statusBarHeight: 0,
    navBarHeight: 0,
  },

  onLaunch() {
    // 获取系统信息（导航栏适配用）
    try {
      const systemInfo = wx.getSystemInfoSync()
      this.globalData.systemInfo = systemInfo
      this.globalData.statusBarHeight = systemInfo.statusBarHeight

      const menuButton = wx.getMenuButtonBoundingClientRect()
      this.globalData.navBarHeight =
        (menuButton.top - systemInfo.statusBarHeight) * 2 + menuButton.height
    } catch (e) {
      // 忽略：部分环境取不到
    }

    // 首次登录由 pages/login 引导（微信一键登录）；
    // 这里不再自动静默登录，避免和登录页重复。
    // silentLogin 仍保留，供 401 时自动续期使用。
  },

  onShow() {
    // 检查登录态是否过期
    if (this.globalData.isLogin) {
      wx.checkSession({
        success: () => {
          const token = wx.getStorageSync('access_token')
          if (!token) this.silentLogin()
        },
        fail: () => {
          this.globalData.isLogin = false
          this.silentLogin()
        },
      })
    }
  },

  /**
   * 静默登录
   * 流程：wx.login 获取 code → 后端用 code 换 openid → 返回 token
   * 用户无感知，仅获取身份标识，不弹任何授权框
   *
   * @returns {Promise} 登录完成后 resolve
   */
  silentLogin() {
    return new Promise((resolve, reject) => {
      wx.login({
        success: async (res) => {
          if (!res.code) {
            reject({ message: '获取登录凭证失败' })
            return
          }
          try {
            const result = await post('/auth/login', { code: res.code })
            wx.setStorageSync('access_token', result.token)
            this.globalData.userId = result.userId
            this.globalData.isLogin = true
            resolve(result)
          } catch (err) {
            console.error('登录失败:', err)
            reject(err)
          }
        },
        fail: (err) => {
          console.error('wx.login 失败:', err)
          reject(err)
        },
      })
    })
  },

  /** 退出登录：清掉 token，回到登录页 */
  logout() {
    wx.removeStorageSync('access_token')
    this.globalData.userId = null
    this.globalData.isLogin = false
    wx.reLaunch({ url: '/pages/login/login' })
  },
})
