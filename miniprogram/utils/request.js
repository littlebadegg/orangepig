/**
 * HTTP 请求封装 — 统一入口，带 token 鉴权、错误处理、loading 管理
 *
 * 核心设计：
 * 1. 所有 wx.request 走这里，统一加 token / 错误处理 / 日志
 * 2. 401 自动重新登录后重试原请求
 * 3. 支持 showLoading 配置
 * 4. Promise 化，async/await 友好
 */

const { BASE_URL } = require('./config')

let loadingCount = 0

function showLoading() {
  loadingCount++
  if (loadingCount === 1) {
    wx.showLoading({ title: '加载中', mask: true })
  }
}

function hideLoading() {
  loadingCount = Math.max(0, loadingCount - 1)
  if (loadingCount === 0) {
    wx.hideLoading()
  }
}

function getToken() {
  return wx.getStorageSync('access_token') || ''
}

/**
 * 核心请求方法
 * @param {Object} options - { url, method, data, showLoading, retry, header }
 * @returns {Promise<any>} 返回 res.data.data（业务数据）
 */
function request(options) {
  const {
    url,
    method = 'GET',
    data = {},
    showLoading: shouldShowLoading = false,
    retry = 0,
    header = {},
  } = options

  const execute = (attempt) => {
    if (shouldShowLoading) showLoading()

    const token = getToken()
    const requestHeader = {
      'Content-Type': 'application/json',
      ...header,
    }
    if (token) {
      requestHeader['Authorization'] = 'Bearer ' + token
    }

    return new Promise((resolve, reject) => {
      wx.request({
        url: `${BASE_URL}${url}`,
        method,
        data,
        header: requestHeader,
        success: (res) => {
          if (shouldShowLoading) hideLoading()

          const body = res.data && typeof res.data === 'object' ? res.data : {}

          if (res.statusCode === 401) {
            wx.removeStorageSync('access_token')
            const app = getApp()
            if (app && app.silentLogin) {
              app
                .silentLogin()
                .then(() => {
                  if (attempt < 1) {
                    execute(attempt + 1).then(resolve).catch(reject)
                  } else {
                    reject({ code: 401, message: '登录已过期，请重试' })
                  }
                })
                .catch(() => reject({ code: 401, message: '请重新登录' }))
            } else {
              reject({ code: 401, message: '请重新登录' })
            }
            return
          }

          if (res.statusCode >= 200 && res.statusCode < 300) {
            if (body.code === 0) {
              resolve(body.data)
            } else {
              reject({ code: body.code || -1, message: body.message || '请求失败' })
            }
            return
          }

          if (attempt < retry) {
            setTimeout(() => {
              execute(attempt + 1).then(resolve).catch(reject)
            }, 500 * (attempt + 1))
            return
          }
          reject({ code: res.statusCode, message: body.message || `请求失败(${res.statusCode})` })
        },
        fail: (err) => {
          if (shouldShowLoading) hideLoading()
          if (attempt < retry) {
            setTimeout(() => {
              execute(attempt + 1).then(resolve).catch(reject)
            }, 500 * (attempt + 1))
            return
          }
          reject({ code: -1, message: '网络异常，请检查网络后重试', detail: err })
        },
      })
    })
  }

  return execute(0)
}

function get(url, data, options = {}) {
  return request({ url, method: 'GET', data, ...options })
}

function post(url, data, options = {}) {
  return request({ url, method: 'POST', data, ...options })
}

function put(url, data, options = {}) {
  return request({ url, method: 'PUT', data, ...options })
}

function del(url, data, options = {}) {
  return request({ url, method: 'DELETE', data, ...options })
}

module.exports = {
  request,
  get,
  post,
  put,
  del,
  getToken,
}
