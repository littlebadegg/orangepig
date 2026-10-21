/**
 * 宝宝解析工具
 *
 * 统一处理「当前操作针对哪个宝宝」，避免各路由重复实现导致逻辑不一致。
 * 优先级：
 *   1. 请求参数 babyId（POST 取 body，GET 取 query）
 *   2. 用户当前选中的宝宝 currentBabyId
 *   3. 该用户的第一个宝宝（并顺手设为选中，省得下次再走一遍）
 */
const { Baby, User } = require('../models')

/**
 * 校验宝宝归属当前用户
 * @returns {Promise<Baby|null>}
 */
async function findOwnBaby(babyId, userId) {
  if (!babyId) return null
  return Baby.findOne({ where: { id: babyId, userId, status: 1 } })
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

  // 2. 用户当前选中的宝宝
  const user = await User.findByPk(req.userId)
  if (user && user.currentBabyId) {
    const baby = await findOwnBaby(user.currentBabyId, req.userId)
    if (baby) return baby
  }

  // 3. 兜底：第一个宝宝，并自动设为选中
  const first = await Baby.findOne({
    where: { userId: req.userId, status: 1 },
    order: [['id', 'ASC']],
  })
  if (first && user && user.currentBabyId !== first.id) {
    await user.update({ currentBabyId: first.id })
  }
  return first
}

module.exports = { findOwnBaby, resolveBaby }
