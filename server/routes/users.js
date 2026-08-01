/**
 * 用户路由 — 用户信息、关注关系
 * GET  /api/users/info        — 获取用户信息
 * POST /api/users/profile      — 更新资料
 * POST /api/users/:id/follow   — 关注
 * POST /api/users/:id/unfollow — 取消关注
 * GET  /api/users/follow-list  — 关注/粉丝列表
 */
const express = require('express')
const router = express.Router()

const { auth, optionalAuth } = require('../middleware/auth')
const { User, Follow, Post } = require('../models')

/**
 * 获取用户信息（含发布数、照片数等统计）
 * GET /api/users/info?userId=xxx
 */
router.get('/info', optionalAuth, async (req, res, next) => {
  try {
    const userId = parseInt(req.query.userId)
    if (!userId) {
      return res.apiError('缺少 userId 参数')
    }

    const user = await User.findByPk(userId)
    if (!user) {
      return res.apiError('用户不存在', 404, 404)
    }

    // 统计发布数
    const postCount = await Post.count({ where: { authorId: userId, status: 1 } })

    // 检查当前用户是否关注了该用户
    let isFollowing = false
    if (req.userId && req.userId !== userId) {
      const follow = await Follow.findOne({
        where: { follower: req.userId, following: userId },
      })
      isFollowing = !!follow
    }

    res.apiSuccess({
      id: user.id,
      nickName: user.nickName,
      avatarUrl: user.avatarUrl,
      bio: user.bio,
      gender: user.gender,
      followingCount: user.followingCount,
      followersCount: user.followersCount,
      postCount,
      isFollowing,
      isMine: req.userId === userId,
    })
  } catch (err) {
    next(err)
  }
})

/**
 * 更新用户资料
 * POST /api/users/profile
 */
router.post('/profile', auth, async (req, res, next) => {
  try {
    const { nickName, avatarUrl, bio, gender } = req.body
    const updateData = {}
    if (nickName) updateData.nickName = nickName
    if (avatarUrl !== undefined) updateData.avatarUrl = avatarUrl
    if (bio !== undefined) updateData.bio = bio
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
      bio: user.bio,
      gender: user.gender,
    })
  } catch (err) {
    next(err)
  }
})

/**
 * 关注用户
 * POST /api/users/:id/follow
 */
router.post('/:id/follow', auth, async (req, res, next) => {
  try {
    const targetUserId = parseInt(req.params.id)

    if (targetUserId === req.userId) {
      return res.apiError('不能关注自己')
    }

    const targetUser = await User.findByPk(targetUserId)
    if (!targetUser) {
      return res.apiError('用户不存在', 404, 404)
    }

    const existing = await Follow.findOne({
      where: { follower: req.userId, following: targetUserId },
    })

    if (existing) {
      return res.apiSuccess({ followed: true })
    }

    await Follow.create({
      follower: req.userId,
      following: targetUserId,
    })

    // 更新计数
    await User.increment({ followingCount: 1 }, { where: { id: req.userId } })
    await User.increment({ followersCount: 1 }, { where: { id: targetUserId } })

    res.apiSuccess({ followed: true })
  } catch (err) {
    next(err)
  }
})

/**
 * 取消关注
 * POST /api/users/:id/unfollow
 */
router.post('/:id/unfollow', auth, async (req, res, next) => {
  try {
    const targetUserId = parseInt(req.params.id)

    const deletedCount = await Follow.destroy({
      where: { follower: req.userId, following: targetUserId },
    })

    if (deletedCount > 0) {
      await User.increment({ followingCount: -1 }, { where: { id: req.userId } })
      await User.increment({ followersCount: -1 }, { where: { id: targetUserId } })
    }

    res.apiSuccess({ followed: false })
  } catch (err) {
    next(err)
  }
})

/**
 * 获取关注列表 / 粉丝列表
 * GET /api/users/follow-list?userId=xxx&type=following|followers&page=1
 */
router.get('/follow-list', async (req, res, next) => {
  try {
    const userId = parseInt(req.query.userId)
    const type = req.query.type || 'following'
    const page = parseInt(req.query.page) || 1
    const pageSize = 20
    const offset = (page - 1) * pageSize

    if (!userId) {
      return res.apiError('缺少 userId 参数')
    }

    let where
    let includeAs
    if (type === 'following') {
      where = { follower: userId }
      includeAs = 'followingUser'
    } else {
      where = { following: userId }
      includeAs = 'followerUser'
    }

    const follows = await Follow.findAll({
      where,
      order: [['createTime', 'DESC']],
      offset,
      limit: pageSize,
      include: [
        { model: User, as: includeAs, attributes: ['id', 'nickName', 'avatarUrl', 'bio'] },
      ],
    })

    const list = follows.map((f) => {
      const userData = f[includeAs]
      return {
        id: userData.id,
        nickName: userData.nickName,
        avatarUrl: userData.avatarUrl,
        bio: userData.bio,
      }
    })

    res.apiSuccess({ list, page, hasMore: list.length >= pageSize })
  } catch (err) {
    next(err)
  }
})

module.exports = router
