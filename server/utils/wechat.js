/**
 * 微信 API 工具
 * - code2session: 用 wx.login 的 code 换取 openid + session_key
 * - msgSecCheck:  文本内容安全检测
 * - imgSecCheck:  图片内容安全检测
 * - getAccessToken: 获取 access_token（调用安全检测接口需要）
 */

const axios = require('axios')
const config = require('../config')

let accessTokenCache = { token: '', expiresAt: 0 }

/**
 * code 换 session（登录）
 * 文档：https://developers.weixin.qq.com/miniprogram/dev/api-backend/open-api/login/auth.code2Session.html
 */
async function code2session(code) {
  const url = 'https://api.weixin.qq.com/sns/jscode2session'
  const { data } = await axios.get(url, {
    params: {
      appid: config.wx.appid,
      secret: config.wx.secret,
      js_code: code,
      grant_type: 'authorization_code',
    },
  })

  if (data.errcode) {
    throw new Error(`微信登录失败: ${data.errcode} ${data.errmsg}`)
  }

  return {
    openid: data.openid,
    sessionKey: data.session_key,
    unionid: data.unionid || null,
  }
}

/**
 * 获取 access_token（服务端调用其他微信 API 需要）
 */
async function getAccessToken() {
  // 缓存未过期直接返回
  if (accessTokenCache.token && Date.now() < accessTokenCache.expiresAt) {
    return accessTokenCache.token
  }

  const url = 'https://api.weixin.qq.com/cgi-bin/token'
  const { data } = await axios.get(url, {
    params: {
      grant_type: 'client_credential',
      appid: config.wx.appid,
      secret: config.wx.secret,
    },
  })

  if (data.errcode) {
    throw new Error(`获取 access_token 失败: ${data.errcode} ${data.errmsg}`)
  }

  accessTokenCache = {
    token: data.access_token,
    // 提前 5 分钟过期
    expiresAt: Date.now() + (data.expires_in - 300) * 1000,
  }

  return accessTokenCache.token
}

/**
 * 文本内容安全检测
 * 文档：https://developers.weixin.qq.com/miniprogram/dev/api-backend/open-api/sec-check/msg_sec_check.html
 * @returns {Promise<boolean>} true=安全, false=违规
 */
async function msgSecCheck(content) {
  if (!content) return true

  try {
    const token = await getAccessToken()
    const url = `https://api.weixin.qq.com/wxa/msg_sec_check?access_token=${token}`
    const { data } = await axios.post(url, {
      content: content.slice(0, 500),
    })

    if (data.errcode === 0) {
      return true
    }
    if (data.errcode === 87014) {
      return false // 内容违规
    }
    console.warn('[WeChat] msgSecCheck warning:', data.errcode, data.errmsg)
    return true // 其他错误放行，避免接口异常影响体验
  } catch (err) {
    console.warn('[WeChat] msgSecCheck error:', err.message)
    return true // 网络错误放行，不阻塞用户
  }
}

/**
 * 图片内容安全检测
 * @param {string} mediaUrl - 图片 URL
 * @returns {Promise<boolean>}
 */
async function imgSecCheck(mediaUrl) {
  if (!mediaUrl) return true

  try {
    const token = await getAccessToken()
    const url = `https://api.weixin.qq.com/wxa/img_sec_check?access_token=${token}`
    const { data } = await axios.post(url, {
      media_url: mediaUrl,
    })

    if (data.errcode === 0) {
      return true
    }
    if (data.errcode === 87014) {
      return false
    }
    return true
  } catch (err) {
    console.warn('[WeChat] imgSecCheck error:', err.message)
    return true
  }
}

module.exports = {
  code2session,
  getAccessToken,
  msgSecCheck,
  imgSecCheck,
}
