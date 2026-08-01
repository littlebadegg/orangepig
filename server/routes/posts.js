/**
 * 内容路由 — Feed流、详情、发布、搜索、点赞、评论
 *
 * ⚠️ 路由顺序：静态路径（/feed, /search, /user）必须在 /:id 之前定义
 *    否则 /search 会被 /:id 匹配为 id="search"
 */
const express = require('express')
const { Op } = require('sequelize')
const router = express.Router()

const { auth, optionalAuth } = require('../middleware/auth')
const { msgSecCheck } = require('../utils/wechat')
const { Post, Comment, Like, Follow, User } = require('../models')

const PAGE_SIZE = 20

// ============ 静态路径（必须在 /:id 之前） ============

/**
 * 获取首页 Feed 流
 * GET /api/posts/feed?channel=recommend&page=1
 */
router.get('/feed', optionalAuth, async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1
    const channel = req.query.channel || 'recommend'
    const offset = (page - 1) * PAGE_SIZE

    const where = { status: 1 }

    if (channel === 'following' && req.userId) {
      // 查询关注列表
      const follows = await Follow.findAll({
        where: { follower: req.userId },
        attributes: ['following'],
        raw: true,
      })
      const followingIds = follows.map((f) => f.following)
      where.authorId = { [Op.in]: followingIds }
    }

    const posts = await Post.findAll({
      where,
      order: [['createTime', 'DESC']],
      offset,
      limit: PAGE_SIZE,
      include: [
        { model: User, as: 'author', attributes: ['id', 'nickName', 'avatarUrl'] },
      ],
    })

    // 转为 plain object，添加 liked 字段
    const postList = posts.map((p) => p.toJSON())

    // 查询当前用户是否点赞过这些帖子
    if (req.userId && postList.length > 0) {
      const postIds = postList.map((p) => p.id)
      const likes = await Like.findAll({
        where: {
          userId: req.userId,
          targetId: { [Op.in]: postIds },
          targetType: 'post',
        },
        attributes: ['targetId'],
        raw: true,
      })
      const likedSet = new Set(likes.map((l) => l.targetId))
      postList.forEach((p) => {
        p.liked = likedSet.has(p.id)
      })
    } else {
      postList.forEach((p) => (p.liked = false))
    }

    res.apiSuccess({ list: postList, page, hasMore: postList.length >= PAGE_SIZE })
  } catch (err) {
    next(err)
  }
})

/**
 * 搜索内容
 * GET /api/posts/search?keyword=xxx&page=1
 */
router.get('/search', async (req, res, next) => {
  try {
    const keyword = (req.query.keyword || '').trim()
    const page = parseInt(req.query.page) || 1
    const offset = (page - 1) * PAGE_SIZE

    if (!keyword) {
      return res.apiSuccess({ list: [], page, hasMore: false })
    }

    const posts = await Post.findAll({
      where: {
        status: 1,
        content: { [Op.like]: `%${keyword}%` },
      },
      order: [['createTime', 'DESC']],
      offset,
      limit: PAGE_SIZE,
      include: [
        { model: User, as: 'author', attributes: ['id', 'nickName', 'avatarUrl'] },
      ],
    })

    const postList = posts.map((p) => p.toJSON())
    postList.forEach((p) => (p.liked = false))

    res.apiSuccess({ list: postList, page, hasMore: postList.length >= PAGE_SIZE })
  } catch (err) {
    next(err)
  }
})

/**
 * 获取用户发布的内容
 * GET /api/posts/user?userId=xxx&page=1
 */
router.get('/user', async (req, res, next) => {
  try {
    const userId = parseInt(req.query.userId)
    const page = parseInt(req.query.page) || 1
    const offset = (page - 1) * PAGE_SIZE

    if (!userId) {
      return res.apiError('缺少 userId 参数')
    }

    const posts = await Post.findAll({
      where: { authorId: userId, status: 1 },
      order: [['createTime', 'DESC']],
      offset,
      limit: PAGE_SIZE,
      include: [
        { model: User, as: 'author', attributes: ['id', 'nickName', 'avatarUrl'] },
      ],
    })

    const postList = posts.map((p) => p.toJSON())
    postList.forEach((p) => (p.liked = false))

    res.apiSuccess({ list: postList, page, hasMore: postList.length >= PAGE_SIZE })
  } catch (err) {
    next(err)
  }
})

/**
 * 获取当前用户点赞的内容
 * GET /api/posts/liked?page=1
 */
router.get('/liked', auth, async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1
    const offset = (page - 1) * PAGE_SIZE

    // 先查 likes 表拿到当前用户点赞的 postId
    const likes = await Like.findAll({
      where: { userId: req.userId, targetType: 'post' },
      attributes: ['targetId'],
      raw: true,
      order: [['createTime', 'DESC']],
    })

    const likedIds = likes.map((l) => l.targetId)
    if (likedIds.length === 0) {
      return res.apiSuccess({ list: [], page, hasMore: false })
    }

    // 分页
    const pagedIds = likedIds.slice(offset, offset + PAGE_SIZE)

    const posts = await Post.findAll({
      where: { id: { [Op.in]: pagedIds }, status: 1 },
      include: [
        { model: User, as: 'author', attributes: ['id', 'nickName', 'avatarUrl'] },
      ],
    })

    // 按 likes 表的顺序排列
    const postMap = {}
    posts.forEach((p) => { postMap[p.id] = p.toJSON() })
    const postList = pagedIds
      .map((id) => postMap[id])
      .filter(Boolean)
    postList.forEach((p) => (p.liked = true))

    res.apiSuccess({ list: postList, page, hasMore: likedIds.length > offset + PAGE_SIZE })
  } catch (err) {
    next(err)
  }
})



/**
 * 获取内容详情
 * GET /api/posts/:id
 */
router.get('/:id', optionalAuth, async (req, res, next) => {
  try {
    const postId = parseInt(req.params.id)
    if (isNaN(postId)) {
      return res.apiError('内容不存在', 404, 404)
    }

    const post = await Post.findOne({
      where: { id: postId, status: 1 },
      include: [
        { model: User, as: 'author', attributes: ['id', 'nickName', 'avatarUrl', 'bio'] },
      ],
    })

    if (!post) {
      return res.apiError('内容不存在', 404, 404)
    }

    const postData = post.toJSON()

    // 是否是自己的帖子
    postData.isMine = req.userId === post.authorId

    // 查询当前用户是否点赞
    if (req.userId) {
      const like = await Like.findOne({
        where: { userId: req.userId, targetId: postId, targetType: 'post' },
      })
      postData.liked = !!like

      // 查询是否关注了作者（非自己的帖子）
      if (req.userId !== post.authorId) {
        const follow = await Follow.findOne({
          where: { follower: req.userId, following: post.authorId },
        })
        postData.isFollowing = !!follow
      } else {
        postData.isFollowing = false
      }
    } else {
      postData.liked = false
      postData.isFollowing = false
    }

    res.apiSuccess(postData)
  } catch (err) {
    next(err)
  }
})

/**
 * 发布内容
 * POST /api/posts
 */
router.post('/', auth, async (req, res, next) => {
  try {
    const { content, images } = req.body

    if ((!content || !content.trim()) && (!images || images.length === 0)) {
      return res.apiError('请输入内容或选择图片')
    }

    // 内容安全检测
    if (content) {
      const isSafe = await msgSecCheck(content)
      if (!isSafe) {
        return res.apiError('内容包含违规信息，请修改后重试', 87014)
      }
    }

    const post = await Post.create({
      authorId: req.userId,
      content: content || '',
      images: images || [],
      status: 1,
    })

    // 加载作者信息（等价于 Mongoose 的 populate）
    const author = await User.findByPk(req.userId, {
      attributes: ['id', 'nickName', 'avatarUrl'],
    })
    const postData = post.toJSON()
    postData.author = author.toJSON()
    postData.liked = false

    res.apiSuccess(postData)
  } catch (err) {
    next(err)
  }
})

/**
 * 点赞
 * POST /api/posts/:id/like
 */
router.post('/:id/like', auth, async (req, res, next) => {
  try {
    const postId = parseInt(req.params.id)
    if (isNaN(postId)) {
      return res.apiError('内容不存在', 404, 404)
    }

    const existing = await Like.findOne({
      where: { userId: req.userId, targetId: postId, targetType: 'post' },
    })

    if (existing) {
      return res.apiSuccess({ liked: true })
    }

    await Like.create({
      userId: req.userId,
      targetId: postId,
      targetType: 'post',
    })

    await Post.increment({ likeCount: 1 }, { where: { id: postId } })

    res.apiSuccess({ liked: true })
  } catch (err) {
    next(err)
  }
})

/**
 * 取消点赞
 * POST /api/posts/:id/unlike
 */
router.post('/:id/unlike', auth, async (req, res, next) => {
  try {
    const postId = parseInt(req.params.id)
    if (isNaN(postId)) {
      return res.apiError('内容不存在', 404, 404)
    }

    const deletedCount = await Like.destroy({
      where: { userId: req.userId, targetId: postId, targetType: 'post' },
    })

    if (deletedCount > 0) {
      await Post.increment({ likeCount: -1 }, { where: { id: postId } })
    }

    res.apiSuccess({ liked: false })
  } catch (err) {
    next(err)
  }
})

/**
 * 获取评论列表
 * GET /api/posts/:id/comments?page=1
 */
router.get('/:id/comments', async (req, res, next) => {
  try {
    const postId = parseInt(req.params.id)
    const page = parseInt(req.query.page) || 1
    const offset = (page - 1) * PAGE_SIZE

    const comments = await Comment.findAll({
      where: { postId, status: 1 },
      order: [['createTime', 'ASC']],
      offset,
      limit: PAGE_SIZE,
      include: [
        { model: User, as: 'author', attributes: ['id', 'nickName', 'avatarUrl'] },
        { model: User, as: 'replyToUser', attributes: ['id', 'nickName'] },
      ],
    })

    const commentList = comments.map((c) => {
      const data = c.toJSON()
      // 兼容前端：如果有 replyToUser，映射为 replyTo 对象
      if (data.replyToUser) {
        data.replyTo = { userId: data.replyToUser.id, nickName: data.replyToUser.nickName }
      }
      return data
    })

    res.apiSuccess({ list: commentList, page, hasMore: commentList.length >= PAGE_SIZE })
  } catch (err) {
    next(err)
  }
})

/**
 * 发表评论
 * POST /api/posts/:id/comments
 */
router.post('/:id/comments', auth, async (req, res, next) => {
  try {
    const postId = parseInt(req.params.id)
    const { content, replyTo } = req.body

    if (!content || !content.trim()) {
      return res.apiError('评论内容不能为空')
    }

    const isSafe = await msgSecCheck(content)
    if (!isSafe) {
      return res.apiError('评论包含违规内容', 87014)
    }

    const post = await Post.findByPk(postId)
    if (!post) {
      return res.apiError('内容不存在', 404, 404)
    }

    const comment = await Comment.create({
      postId,
      authorId: req.userId,
      content: content.trim(),
      replyToUserId: replyTo?.userId || null,
      replyToCommentId: replyTo?.commentId || null,
    })

    // 加载作者信息
    const author = await User.findByPk(req.userId, {
      attributes: ['id', 'nickName', 'avatarUrl'],
    })
    const commentData = comment.toJSON()
    commentData.author = author.toJSON()

    // 更新评论计数
    await Post.increment({ commentCount: 1 }, { where: { id: postId } })

    res.apiSuccess(commentData)
  } catch (err) {
    next(err)
  }
})

module.exports = router
