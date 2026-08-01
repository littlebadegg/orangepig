/**
 * App 入口 — 全局生命周期、登录、全局数据
 *
 * 非云开发版本：
 * - 静默登录走后端 /api/auth/login 接口
 * - token 存 localStorage，请求头自动携带
 * - 图片上传走后端 /api/upload/image 接口
 */
const { post } = require('./utils/request')

App({
  globalData: {
    userInfo: null,
    userId: null,
    isLogin: false,
    systemInfo: null,
    statusBarHeight: 0,
    navBarHeight: 0,
  },

  onLaunch() {
    // 获取系统信息（导航栏适配用）
    const systemInfo = wx.getSystemInfoSync()
    this.globalData.systemInfo = systemInfo
    this.globalData.statusBarHeight = systemInfo.statusBarHeight

    // 计算导航栏高度
    const menuButton = wx.getMenuButtonBoundingClientRect()
    this.globalData.navBarHeight =
      (menuButton.top - systemInfo.statusBarHeight) * 2 + menuButton.height

    // 静默登录
    this.silentLogin()
  },

  onShow() {
    // 检查登录态是否过期
    if (this.globalData.isLogin) {
      wx.checkSession({
        success: () => {
          // session 未过期，检查 token 是否有效
          const token = wx.getStorageSync('access_token')
          if (!token) {
            this.silentLogin()
          }
        },
        fail: () => {
          // session 过期，重新登录
          this.globalData.isLogin = false
          this.globalData.userInfo = null
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
            const result = await post('/auth/login', {
              code: res.code,
            })
            // 存储 token
            wx.setStorageSync('access_token', result.token)
            if (result.refreshToken) {
              wx.setStorageSync('refresh_token', result.refreshToken)
            }
            this.globalData.userId = result.userId
            this.globalData.userInfo = result.userInfo || null
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

  /**
   * 获取用户信息 — 需要用户主动点击按钮触发
   * 符合微信隐私规范：不在进入时弹窗，由用户操作触发
   */
  getUserProfile() {
    return new Promise((resolve, reject) => {
      wx.getUserProfile({
        desc: '用于完善个人资料',
        success: (res) => {
          const { userInfo } = res
          this.globalData.userInfo = userInfo
          // 同步到后端
          post('/auth/profile', {
            nickName: userInfo.nickName,
            avatarUrl: userInfo.avatarUrl,
            gender: userInfo.gender,
          }).catch(() => {})
          resolve(userInfo)
        },
        fail: reject,
      })
    })
  },
})
