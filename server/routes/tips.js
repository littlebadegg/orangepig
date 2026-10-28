/**
 * 养育小贴士路由
 *
 * GET /api/tips?babyId=1 — 按宝宝当前天数返回适用的月龄段小贴士
 */
const express = require('express')
const { Op } = require('sequelize')
const router = express.Router()

const { auth } = require('../middleware/auth')
const { CareTip } = require('../models')
const { resolveBaby } = require('../utils/baby')

const CATEGORY_META = {
  feeding: { icon: '🍼', label: '喂养' },
  water: { icon: '🚰', label: '喂水' },
  supplement: { icon: '💊', label: '营养' },
  sleep: { icon: '😴', label: '睡眠' },
  outdoor: { icon: '🌤️', label: '户外' },
  growth: { icon: '📏', label: '生长' },
  development: { icon: '🧸', label: '发育' },
  health: { icon: '❤️', label: '健康' },
}

router.get('/', auth, async (req, res, next) => {
  try {
    const baby = await resolveBaby(req)
    if (!baby) {
      return res.apiError('请先选择宝宝', 400, 400)
    }

    // 宝宝出生后第几天（0 = 出生当天）；没有生日就取不到，返回空
    let ageDays = null
    if (baby.birthday) {
      const birth = new Date(baby.birthday)
      birth.setHours(0, 0, 0, 0)
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      ageDays = Math.max(0, Math.round((today - birth) / 86400000))
    }

    if (ageDays === null) {
      return res.apiSuccess({ ageDays: null, stageText: '', groups: [] })
    }

    const tips = await CareTip.findAll({
      where: {
        status: 1,
        minDays: { [Op.lte]: ageDays },
        maxDays: { [Op.gte]: ageDays },
      },
      order: [
        ['category', 'ASC'],
        ['sortOrder', 'ASC'],
      ],
      raw: true,
    })

    // 按类目分组
    const groupMap = {}
    tips.forEach((t) => {
      if (!groupMap[t.category]) {
        const meta = CATEGORY_META[t.category] || { icon: '💡', label: '小贴士' }
        groupMap[t.category] = { category: t.category, icon: meta.icon, label: meta.label, items: [] }
      }
      groupMap[t.category].items.push({ id: t.id, title: t.title, content: t.content })
    })

    const groups = Object.values(groupMap)
    const stageText =
      ageDays < 29
        ? '新生儿'
        : ageDays < 90
          ? `${Math.floor(ageDays / 30) + 1}月龄内`
          : ageDays < 366
            ? `${Math.floor(ageDays / 30)}月龄`
            : `${(ageDays / 365).toFixed(1)}岁`

    res.apiSuccess({ ageDays, stageText, groups })
  } catch (err) {
    next(err)
  }
})

module.exports = router
