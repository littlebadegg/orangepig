/**
 * 宝宝管理路由
 *
 * GET    /api/babies            — 我的宝宝列表（含当前选中的宝宝）
 * POST   /api/babies            — 添加宝宝
 * PUT    /api/babies/:id        — 修改宝宝信息
 * DELETE /api/babies/:id        — 删除宝宝（软删除）
 * POST   /api/babies/:id/select — 切换当前宝宝
 */
const express = require('express')
const router = express.Router()

const { auth } = require('../middleware/auth')
const { Baby, User } = require('../models')

/**
 * 校验宝宝归属当前用户
 * @returns {Baby|null}
 */
async function findOwnBaby(babyId, userId) {
  return Baby.findOne({ where: { id: babyId, userId, status: 1 } })
}

/**
 * 宝宝列表
 */
router.get('/', auth, async (req, res, next) => {
  try {
    const babies = await Baby.findAll({
      where: { userId: req.userId, status: 1 },
      order: [['id', 'ASC']],
      raw: true,
    })

    const user = await User.findByPk(req.userId)
    let currentBabyId = user ? user.currentBabyId : null

    // 当前宝宝失效（被删）时自动回落到第一个
    if (!currentBabyId || !babies.some((b) => b.id === currentBabyId)) {
      currentBabyId = babies.length > 0 ? babies[0].id : null
      if (user && currentBabyId) {
        await User.update({ currentBabyId }, { where: { id: req.userId } })
      }
    }

    res.apiSuccess({
      list: babies.map((b) => ({
        id: b.id,
        name: b.name,
        gender: b.gender,
        birthday: b.birthday || '',
        avatarUrl: b.avatarUrl || '',
      })),
      currentBabyId,
    })
  } catch (err) {
    next(err)
  }
})

/**
 * 添加宝宝
 * body: { name, gender, birthday }
 */
router.post('/', auth, async (req, res, next) => {
  try {
    const { name, gender, birthday } = req.body

    if (!name || !String(name).trim()) {
      return res.apiError('请输入宝宝昵称', 400, 400)
    }

    const baby = await Baby.create({
      userId: req.userId,
      name: String(name).trim().slice(0, 30),
      gender: parseInt(gender) || 0,
      birthday: birthday || null,
    })

    // 第一个宝宝自动设为当前宝宝
    const count = await Baby.count({ where: { userId: req.userId, status: 1 } })
    if (count === 1) {
      await User.update({ currentBabyId: baby.id }, { where: { id: req.userId } })
    }

    res.apiSuccess({
      id: baby.id,
      name: baby.name,
      gender: baby.gender,
      birthday: baby.birthday || '',
    })
  } catch (err) {
    next(err)
  }
})

/**
 * 修改宝宝信息
 */
router.put('/:id', auth, async (req, res, next) => {
  try {
    const baby = await findOwnBaby(req.params.id, req.userId)
    if (!baby) {
      return res.apiError('宝宝不存在', 404, 404)
    }

    const { name, gender, birthday } = req.body
    const updateData = {}
    if (name !== undefined) updateData.name = String(name).trim().slice(0, 30)
    if (gender !== undefined) updateData.gender = parseInt(gender)
    if (birthday !== undefined) updateData.birthday = birthday || null

    await baby.update(updateData)

    res.apiSuccess({
      id: baby.id,
      name: baby.name,
      gender: baby.gender,
      birthday: baby.birthday || '',
    })
  } catch (err) {
    next(err)
  }
})

/**
 * 删除宝宝（软删除）
 */
router.delete('/:id', auth, async (req, res, next) => {
  try {
    const baby = await findOwnBaby(req.params.id, req.userId)
    if (!baby) {
      return res.apiError('宝宝不存在', 404, 404)
    }

    await baby.update({ status: 0 })

    // 如果删的是当前宝宝，回落到第一个可用宝宝
    const user = await User.findByPk(req.userId)
    if (user && user.currentBabyId === baby.id) {
      const next = await Baby.findOne({
        where: { userId: req.userId, status: 1 },
        order: [['id', 'ASC']],
      })
      await User.update(
        { currentBabyId: next ? next.id : null },
        { where: { id: req.userId } }
      )
    }

    res.apiSuccess({ id: baby.id })
  } catch (err) {
    next(err)
  }
})

/**
 * 切换当前宝宝
 */
router.post('/:id/select', auth, async (req, res, next) => {
  try {
    const baby = await findOwnBaby(req.params.id, req.userId)
    if (!baby) {
      return res.apiError('宝宝不存在', 404, 404)
    }

    await User.update({ currentBabyId: baby.id }, { where: { id: req.userId } })

    res.apiSuccess({ currentBabyId: baby.id })
  } catch (err) {
    next(err)
  }
})

module.exports = router
