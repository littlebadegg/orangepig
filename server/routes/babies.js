/**
 * 宝宝管理路由
 *
 * GET    /api/babies                  — 我的宝宝列表（自己创建的 + 被邀请加入的）
 * POST   /api/babies                  — 添加宝宝
 * PUT    /api/babies/:id              — 修改宝宝信息（仅创建者）
 * DELETE /api/babies/:id              — 删除宝宝（仅创建者）
 * POST   /api/babies/:id/select       — 切换当前宝宝
 * POST   /api/babies/:id/invite       — 生成邀请码（仅创建者）
 * POST   /api/babies/join             — 凭邀请码加入宝宝
 * GET    /api/babies/:id/members      — 家庭成员列表
 * PUT    /api/babies/:id/members/:uid — 修改成员称呼
 * DELETE /api/babies/:id/members/:uid — 移除成员（仅创建者）
 * POST   /api/babies/:id/leave        — 退出这个宝宝
 */
const express = require('express')
const { Op } = require('sequelize')
const router = express.Router()

const { auth } = require('../middleware/auth')
const { Baby, User, BabyMember } = require('../models')
const {
  findOwnBaby,
  isBabyOwner,
  accessibleBabyIds,
  getMemberRole,
} = require('../utils/baby')

/** 邀请码字符集（去掉 0/O/1/I 这种容易看错的） */
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CODE_LEN = 6

async function generateInviteCode() {
  for (let i = 0; i < 10; i++) {
    let code = ''
    for (let j = 0; j < CODE_LEN; j++) {
      code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
    }
    const exists = await Baby.findOne({ where: { inviteCode: code } })
    if (!exists) return code
  }
  // 极端情况兜底
  return Date.now().toString(36).toUpperCase().slice(-CODE_LEN)
}

/** 宝宝成员数 */
async function countMembers(babyId) {
  return BabyMember.count({ where: { babyId, status: 1 } })
}

/**
 * 宝宝列表：自己创建的 + 被邀请加入的
 */
router.get('/', auth, async (req, res, next) => {
  try {
    const ids = await accessibleBabyIds(req.userId)
    const babies = ids.length
      ? await Baby.findAll({
          where: { id: { [Op.in]: ids }, status: 1 },
          order: [['id', 'ASC']],
          raw: true,
        })
      : []

    const user = await User.findByPk(req.userId)
    let currentBabyId = user ? user.currentBabyId : null

    // 当前宝宝失效（被删/退出）时自动回落到第一个
    if (!currentBabyId || !babies.some((b) => b.id === currentBabyId)) {
      currentBabyId = babies.length > 0 ? babies[0].id : null
      if (user && currentBabyId) {
        await User.update({ currentBabyId }, { where: { id: req.userId } })
      }
    }

    const list = await Promise.all(
      babies.map(async (b) => {
        const role = await getMemberRole(b.id, req.userId)
        return {
          id: b.id,
          name: b.name,
          gender: b.gender,
          birthday: b.birthday || '',
          avatarUrl: b.avatarUrl || '',
          role: role ? role.role : 'member',
          isOwner: b.userId === req.userId,
          memberCount: await countMembers(b.id),
        }
      })
    )

    res.apiSuccess({ list, currentBabyId })
  } catch (err) {
    next(err)
  }
})

/**
 * 添加宝宝（同时把自己写成 owner 成员）
 */
router.post('/', auth, async (req, res, next) => {
  try {
    const { name, gender, birthday, relation } = req.body

    if (!name || !String(name).trim()) {
      return res.apiError('请输入宝宝昵称', 400, 400)
    }

    const baby = await Baby.create({
      userId: req.userId,
      name: String(name).trim().slice(0, 30),
      gender: parseInt(gender) || 0,
      birthday: birthday || null,
      inviteCode: await generateInviteCode(),
    })

    await BabyMember.create({
      babyId: baby.id,
      userId: req.userId,
      role: 'owner',
      relation: relation ? String(relation).trim().slice(0, 20) : '',
    })

    // 第一个宝宝自动设为当前宝宝
    const ids = await accessibleBabyIds(req.userId)
    if (ids.length === 1) {
      await User.update({ currentBabyId: baby.id }, { where: { id: req.userId } })
    }

    res.apiSuccess({
      id: baby.id,
      name: baby.name,
      gender: baby.gender,
      birthday: baby.birthday || '',
      inviteCode: baby.inviteCode,
    })
  } catch (err) {
    next(err)
  }
})

/**
 * 修改宝宝信息（仅创建者）
 */
router.put('/:id', auth, async (req, res, next) => {
  try {
    if (!(await isBabyOwner(req.params.id, req.userId))) {
      return res.apiError('只有创建者可以修改宝宝信息', 403, 403)
    }

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
 * 删除宝宝（仅创建者，软删除宝宝 + 成员关系）
 */
router.delete('/:id', auth, async (req, res, next) => {
  try {
    if (!(await isBabyOwner(req.params.id, req.userId))) {
      return res.apiError('只有创建者可以删除宝宝', 403, 403)
    }

    const baby = await findOwnBaby(req.params.id, req.userId)
    if (!baby) {
      return res.apiError('宝宝不存在', 404, 404)
    }

    await baby.update({ status: 0 })
    await BabyMember.update({ status: 0 }, { where: { babyId: baby.id } })

    // 所有把这个宝宝设为当前的用户，回落到别的宝宝
    const affected = await User.findAll({
      where: { currentBabyId: baby.id },
      attributes: ['id'],
      raw: true,
    })
    for (const u of affected) {
      const ids = await accessibleBabyIds(u.id)
      const nextId = ids.filter((i) => i !== baby.id)[0] || null
      await User.update({ currentBabyId: nextId }, { where: { id: u.id } })
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

// ============ 家人共享 ============

/**
 * 生成 / 获取邀请码（仅创建者）
 * 重复调用返回同一个码，方便反复邀请
 */
router.post('/:id/invite', auth, async (req, res, next) => {
  try {
    if (!(await isBabyOwner(req.params.id, req.userId))) {
      return res.apiError('只有创建者可以邀请家人', 403, 403)
    }

    const baby = await findOwnBaby(req.params.id, req.userId)
    if (!baby) {
      return res.apiError('宝宝不存在', 404, 404)
    }

    let code = baby.inviteCode
    if (!code) {
      code = await generateInviteCode()
      await baby.update({ inviteCode: code })
    }

    res.apiSuccess({
      babyId: baby.id,
      babyName: baby.name,
      inviteCode: code,
      path: `/pages/invite/invite?code=${code}`,
    })
  } catch (err) {
    next(err)
  }
})

/**
 * 邀请码详情（家人打开分享卡片时先看一眼是谁邀请的）
 * 返回宝宝名 + 邀请人称呼 + 自己是否已经加入
 */
router.get('/invite-info/:code', auth, async (req, res, next) => {
  try {
    const code = String(req.params.code || '').trim().toUpperCase()
    const baby = await Baby.findOne({ where: { inviteCode: code, status: 1 } })
    if (!baby) {
      return res.apiError('邀请码不存在或已失效', 404, 404)
    }

    const [owner, ownerMember] = await Promise.all([
      User.findByPk(baby.userId, { attributes: ['id', 'nickName'] }),
      BabyMember.findOne({
        where: { babyId: baby.id, userId: baby.userId, status: 1 },
        raw: true,
      }),
    ])

    const mine = await BabyMember.findOne({
      where: { babyId: baby.id, userId: req.userId, status: 1 },
    })

    res.apiSuccess({
      babyId: baby.id,
      babyName: baby.name,
      babyGender: baby.gender,
      isMine: baby.userId === req.userId,
      alreadyJoined: !!mine,
      inviterName: (ownerMember && ownerMember.relation) || (owner && owner.nickName) || '家人',
    })
  } catch (err) {
    next(err)
  }
})

/**
 * 凭邀请码加入宝宝
 * body: { code, relation } — relation 是「你是宝宝的谁」，如 妈妈/奶奶
 */
router.post('/join', auth, async (req, res, next) => {
  try {
    const code = String(req.body.code || '').trim().toUpperCase()
    if (!code) {
      return res.apiError('请输入邀请码', 400, 400)
    }

    const baby = await Baby.findOne({ where: { inviteCode: code, status: 1 } })
    if (!baby) {
      return res.apiError('邀请码不存在或已失效', 404, 404)
    }

    if (baby.userId === req.userId) {
      return res.apiError('这是你自己创建的宝宝', 400, 400)
    }

    const exist = await BabyMember.findOne({
      where: { babyId: baby.id, userId: req.userId },
    })
    if (exist && exist.status === 1) {
      return res.apiError('你已经在宝宝的家人列表里了', 400, 400)
    }

    if (exist) {
      // 之前退出过，重新加入
      await exist.update({
        status: 1,
        role: 'member',
        relation: req.body.relation ? String(req.body.relation).trim().slice(0, 20) : exist.relation,
      })
    } else {
      await BabyMember.create({
        babyId: baby.id,
        userId: req.userId,
        role: 'member',
        relation: req.body.relation ? String(req.body.relation).trim().slice(0, 20) : '',
      })
    }

    // 加入后直接切到这个宝宝
    await User.update({ currentBabyId: baby.id }, { where: { id: req.userId } })

    res.apiSuccess({
      id: baby.id,
      name: baby.name,
      gender: baby.gender,
      birthday: baby.birthday || '',
      currentBabyId: baby.id,
    })
  } catch (err) {
    next(err)
  }
})

/**
 * 家庭成员列表
 */
router.get('/:id/members', auth, async (req, res, next) => {
  try {
    const baby = await findOwnBaby(req.params.id, req.userId)
    if (!baby) {
      return res.apiError('宝宝不存在', 404, 404)
    }

    const members = await BabyMember.findAll({
      where: { babyId: baby.id, status: 1 },
      order: [['id', 'ASC']],
      raw: true,
    })

    const users = await User.findAll({
      where: { id: { [Op.in]: members.map((m) => m.userId) } },
      attributes: ['id', 'nickName', 'avatarUrl'],
      raw: true,
    })

    const list = members.map((m) => {
      const u = users.find((x) => x.id === m.userId) || {}
      const isSelf = m.userId === req.userId
      return {
        userId: m.userId,
        role: m.role,
        isOwner: m.role === 'owner',
        isSelf,
        // 有称呼就显示称呼，否则退回微信昵称
        name: m.relation || u.nickName || '家人',
        relation: m.relation || '',
        nickName: u.nickName || '',
        avatarUrl: u.avatarUrl || '',
        joinedAt: m.createTime,
      }
    })

    res.apiSuccess({
      babyId: baby.id,
      babyName: baby.name,
      inviteCode: baby.inviteCode || '',
      isOwner: baby.userId === req.userId,
      list,
    })
  } catch (err) {
    next(err)
  }
})

/**
 * 修改成员称呼（创建者可以改所有人，成员只能改自己）
 */
router.put('/:id/members/:userId', auth, async (req, res, next) => {
  try {
    const baby = await findOwnBaby(req.params.id, req.userId)
    if (!baby) {
      return res.apiError('宝宝不存在', 404, 404)
    }

    const targetId = parseInt(req.params.userId)
    const isOwner = await isBabyOwner(baby.id, req.userId)
    if (!isOwner && targetId !== req.userId) {
      return res.apiError('只能修改自己的称呼', 403, 403)
    }

    const member = await BabyMember.findOne({
      where: { babyId: baby.id, userId: targetId, status: 1 },
    })
    if (!member) {
      return res.apiError('成员不存在', 404, 404)
    }

    await member.update({
      relation: String(req.body.relation || '').trim().slice(0, 20),
    })

    res.apiSuccess({ userId: targetId, relation: member.relation })
  } catch (err) {
    next(err)
  }
})

/**
 * 移除成员（仅创建者，不能移除自己）
 */
router.delete('/:id/members/:userId', auth, async (req, res, next) => {
  try {
    if (!(await isBabyOwner(req.params.id, req.userId))) {
      return res.apiError('只有创建者可以移除成员', 403, 403)
    }

    const targetId = parseInt(req.params.userId)
    if (targetId === req.userId) {
      return res.apiError('不能移除自己', 400, 400)
    }

    const member = await BabyMember.findOne({
      where: { babyId: req.params.id, userId: targetId, status: 1 },
    })
    if (!member) {
      return res.apiError('成员不存在', 404, 404)
    }

    await member.update({ status: 0 })

    // 被移除的人如果正选着这个宝宝，帮他换一个
    const target = await User.findByPk(targetId)
    if (target && target.currentBabyId === member.babyId) {
      const ids = await accessibleBabyIds(targetId)
      await User.update(
        { currentBabyId: ids.filter((i) => i !== member.babyId)[0] || null },
        { where: { id: targetId } }
      )
    }

    res.apiSuccess({ userId: targetId })
  } catch (err) {
    next(err)
  }
})

/**
 * 退出这个宝宝（创建者不能退出，只能删除宝宝）
 */
router.post('/:id/leave', auth, async (req, res, next) => {
  try {
    if (await isBabyOwner(req.params.id, req.userId)) {
      return res.apiError('创建者不能退出，可以在宝宝管理里删除', 400, 400)
    }

    const member = await BabyMember.findOne({
      where: { babyId: req.params.id, userId: req.userId, status: 1 },
    })
    if (!member) {
      return res.apiError('你不在这个宝宝的家人列表里', 404, 404)
    }

    await member.update({ status: 0 })

    const user = await User.findByPk(req.userId)
    if (user && user.currentBabyId === member.babyId) {
      const ids = await accessibleBabyIds(req.userId)
      await User.update(
        { currentBabyId: ids.filter((i) => i !== member.babyId)[0] || null },
        { where: { id: req.userId } }
      )
    }

    res.apiSuccess({ babyId: member.babyId })
  } catch (err) {
    next(err)
  }
})

module.exports = router
