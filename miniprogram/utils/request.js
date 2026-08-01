/**
 * HTTP 请求封装 — 统一入口，带 token 鉴权、错误处理、重试、loading 管理
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

/**
 * 获取 token
 */
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

    // 组装请求头
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

          // 统一解析响应体（在所有分支中可用）
          const body = (res.data && typeof res.data === 'object') ? res.data : {}

          // HTTP 状态码处理
          if (res.statusCode === 401) {
            // token 过期，清除并重新登录
            wx.removeStorageSync('access_token')
            wx.removeStorageSync('refresh_token')
            const app = getApp()
            if (app && app.silentLogin) {
              app.silentLogin().then(() => {
                // 重新登录成功后重试原请求
                if (attempt < 1) {
                  execute(attempt + 1).then(resolve).catch(reject)
                } else {
                  reject({ code: 401, message: '登录已过期，请重试' })
                }
              })
            } else {
              reject({ code: 401, message: '请重新登录' })
            }
            return
          }

          if (res.statusCode >= 200 && res.statusCode < 300) {
            // 业务状态码处理
            if (body.code === 0) {
              resolve(body.data)
            } else {
              reject({ code: body.code || -1, message: body.message || '请求失败' })
            }
            return
          }

          // 其他 HTTP 错误（404/500 等）
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
          // 网络错误重试
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

/**
 * 便捷方法
 */
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

/**
 * 上传文件（图片）到自己的服务器
 * @param {string} filePath - 本地临时文件路径
 * @param {string} url - 上传接口地址（可选，默认用 config 里的 UPLOAD_URL）
 * @param {string} name - 文件字段名（默认 'file'）
 * @returns {Promise<string>} 返回图片 URL
 */
function uploadFile(filePath, url, name = 'file') {
  const { UPLOAD_URL } = require('./config')
  const token = getToken()
  const header = {}
  if (token) {
    header['Authorization'] = 'Bearer ' + token
  }

  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: url || UPLOAD_URL,
      filePath,
      name,
      header,
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const body = JSON.parse(res.data)
            if (body.code === 0) {
              resolve(body.data.url)
            } else {
              reject({ code: body.code, message: body.message || '上传失败' })
            }
          } catch (e) {
            reject({ code: -1, message: '上传响应解析失败' })
          }
        } else {
          reject({ code: res.statusCode, message: '上传失败' })
        }
      },
      fail: (err) => {
        reject({ code: -1, message: '上传失败，请检查网络', detail: err })
      },
    })
  })
}

/**
 * 批量上传图片
 * @param {string[]} filePaths - 本地文件路径数组
 * @returns {Promise<string[]>} 返回图片 URL 数组
 */
function uploadFiles(filePaths) {
  return Promise.all(filePaths.map((path) => uploadFile(path)))
}

module.exports = {
  request,
  get,
  post,
  put,
  del,
  uploadFile,
  uploadFiles,
  getToken,
}
