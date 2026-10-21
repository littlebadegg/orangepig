/**
 * 认证路由 — 微信登录、用户资料
 *
 * POST /api/auth/login   — 微信登录（code 换 openid，签发 JWT）
 * POST /api/auth/profile — 更新用户资料
 * GET  /api/auth/me      — 获取当前登录用户信息
 */
const express = require('express')
const jwt = require('jsonwebtoken')
const router = express.Router()

const config = require('../config')
const { auth } = require('../middleware/auth')
const { code2session, msgSecCheck } = require('../utils/wechat')
const { User } = require('../models')

/**
 * 微信登录
 * 前端 wx.login 拿到 code → 调这个接口 → 后端用 code 换 openid → 返回 JWT token
 */
router.post('/login', async (req, res, next) => {
  try {
    const { code } = req.body
    if (!code) {
      return res.apiError('缺少 code 参数', 400, 400)
    }

    // 用 code 换 openid
    const sessionInfo = await code2session(code)
    const { openid, unionid } = sessionInfo

    // 查找或创建用户
    let user = await User.findOne({ where: { openid } })
    let isNewUser = false
    if (!user) {
      user = await User.create({
        openid,
        unionid: unionid || null,
        nickName: '宝宝家长',
      })
      isNewUser = true
    }

    // 签发 JWT（MySQL 主键为整数）
    const token = jwt.sign(
      { userId: user.id, openid: user.openid },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn }
    )

    res.apiSuccess({
      token,
      userId: user.id,
      userInfo: {
        id: user.id,
        nickName: user.nickName,
        avatarUrl: user.avatarUrl,
      },
      currentBabyId: user.currentBabyId || null,
      isNewUser,
    })
  } catch (err) {
    next(err)
  }
})

/**
 * 更新用户资料
 */
router.post('/profile', auth, async (req, res, next) => {
  try {
    const { nickName, avatarUrl, gender } = req.body

    // 内容安全检测（昵称）
    if (nickName) {
      const isSafe = await msgSecCheck(nickName)
      if (!isSafe) {
        return res.apiError('昵称包含违规内容，请修改', 87014)
      }
    }

    const updateData = {}
    if (nickName) updateData.nickName = nickName
    if (avatarUrl !== undefined) updateData.avatarUrl = avatarUrl
    if (gender !== undefined) updateData.gender = gender

    await User.update(updateData, { where: { id: req.userId } })
    const user = await User.findByPk(req.userId)

    if (!user) {
      return res.apiError('用户不存在', 404, 404)
    }

    res.apiSuccess({
      id: user.id,
      nickName: user.nickName,
      avatarUrl: user.avatarUrl,
    })
  } catch (err) {
    next(err)
  }
})

/**
 * 获取当前登录用户信息
 */
router.get('/me', auth, async (req, res, next) => {
  try {
    const user = await User.findByPk(req.userId)
    if (!user) {
      return res.apiError('用户不存在', 404, 404)
    }

    res.apiSuccess({
      id: user.id,
      nickName: user.nickName,
      avatarUrl: user.avatarUrl,
      currentBabyId: user.currentBabyId || null,
    })
  } catch (err) {
    next(err)
  }
})

module.exports = router
