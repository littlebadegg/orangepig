/**
 * 宝宝解析工具
 *
 * 统一处理「当前操作针对哪个宝宝」，避免各路由重复实现导致逻辑不一致。
 *
 * 宝宝可见范围（共享后）：
 *   1. 自己创建的宝宝（babies.user_id = 自己）
 *   2. 被邀请加入的宝宝（baby_members 里 status=1 的记录）
 *
 * 优先级：
 *   1. 请求参数 babyId（POST 取 body，GET 取 query）
 *   2. 用户当前选中的宝宝 currentBabyId
 *   3. 可见范围里的第一个宝宝（并顺手设为选中，省得下次再走一遍）
 */
const { Op } = require('sequelize')
const { Baby, User, BabyMember } = require('../models')

/**
 * 当前用户能访问的宝宝 id 列表（自己创建的 + 被邀请的）
 * @returns {Promise<number[]>}
 */
async function accessibleBabyIds(userId) {
  if (!userId) return []

  const [owned, joined] = await Promise.all([
    Baby.findAll({
      where: { userId, status: 1 },
      attributes: ['id'],
      raw: true,
    }),
    BabyMember.findAll({
      where: { userId, status: 1 },
      attributes: ['babyId'],
      raw: true,
    }),
  ])

  const ids = owned.map((b) => b.id).concat(joined.map((m) => m.babyId))
  return [...new Set(ids)]
}

/**
 * 取一个当前用户有权访问的宝宝
 * @returns {Promise<Baby|null>}
 */
async function findOwnBaby(babyId, userId) {
  if (!babyId || !userId) return null
  const ids = await accessibleBabyIds(userId)
  if (ids.length === 0) return null
  return Baby.findOne({ where: { id: babyId, status: 1, id: { [Op.in]: ids } } })
}

/**
 * 是不是宝宝的创建者（只有 owner 能改资料 / 删宝宝 / 管成员）
 * @returns {Promise<boolean>}
 */
async function isBabyOwner(babyId, userId) {
  if (!babyId || !userId) return false
  const baby = await Baby.findOne({ where: { id: babyId, userId, status: 1 } })
  return !!baby
}

/**
 * 当前用户在这个宝宝里的身份
 * @returns {Promise<{ role: 'owner'|'member', relation: string }|null>}
 */
async function getMemberRole(babyId, userId) {
  if (!babyId || !userId) return null
  const member = await BabyMember.findOne({
    where: { babyId, userId, status: 1 },
    raw: true,
  })
  if (member) return { role: member.role, relation: member.relation || '' }

  // 老数据可能没有成员记录，按创建者处理
  if (await isBabyOwner(babyId, userId)) return { role: 'owner', relation: '' }
  return null
}

/**
 * 解析当前请求的宝宝
 * @param {object} req - Express req，需带 req.userId（auth 中间件注入）
 * @returns {Promise<Baby|null>} 找不到返回 null
 */
async function resolveBaby(req) {
  if (!req.userId) return null

  // 1. 显式参数优先
  const wanted =
    (req.body && req.body.babyId) || (req.query && req.query.babyId) || null
  if (wanted) {
    const baby = await findOwnBaby(wanted, req.userId)
    if (baby) return baby
  }

  // 2. 用户当前选中的宝宝（可能是被邀请的，所以不能只查 userId）
  const user = await User.findByPk(req.userId)
  if (user && user.currentBabyId) {
    const baby = await findOwnBaby(user.currentBabyId, req.userId)
    if (baby) return baby
  }

  // 3. 兜底：可见范围里第一个，并自动设为选中
  const ids = await accessibleBabyIds(req.userId)
  if (ids.length === 0) return null

  const first = await Baby.findOne({
    where: { id: { [Op.in]: ids }, status: 1 },
    order: [['id', 'ASC']],
  })
  if (first && user && user.currentBabyId !== first.id) {
    await user.update({ currentBabyId: first.id })
  }
  return first
}

/**
 * 宝宝成员 → 展示名映射 { userId: '妈妈' }
 * 用于时间线显示「这条是谁记的」
 * @returns {Promise<Record<number, string>>}
 */
async function buildRecorderMap(babyId) {
  const baby = await Baby.findByPk(babyId)
  if (!baby) return {}

  const members = await BabyMember.findAll({
    where: { babyId, status: 1 },
    raw: true,
  })

  const userIds = [...new Set(members.map((m) => m.userId).concat([baby.userId]))]
  const users = await User.findAll({
    where: { id: { [Op.in]: userIds } },
    attributes: ['id', 'nickName'],
    raw: true,
  })

  const map = {}
  users.forEach((u) => {
    const member = members.find((m) => m.userId === u.id)
    map[u.id] = (member && member.relation) || u.nickName || '家人'
  })
  return map
}

module.exports = {
  accessibleBabyIds,
  findOwnBaby,
  isBabyOwner,
  getMemberRole,
  resolveBaby,
  buildRecorderMap,
}
