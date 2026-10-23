/**
 * 宝宝相关接口
 */
const { get, post, put, del } = require('../utils/request')

/** 宝宝列表（含 currentBabyId） */
function list() {
  return get('/babies')
}

/** 添加宝宝 { name, gender, birthday } */
function create(data) {
  return post('/babies', data)
}

/** 修改宝宝 */
function update(id, data) {
  return put(`/babies/${id}`, data)
}

/** 删除宝宝 */
function remove(id) {
  return del(`/babies/${id}`)
}

/** 切换当前宝宝 */
function select(id) {
  return post(`/babies/${id}/select`)
}

// ============ 家人共享 ============

/** 生成 / 获取邀请码（仅创建者） */
function invite(id) {
  return post(`/babies/${id}/invite`)
}

/** 邀请码详情：看看是谁邀请的 */
function inviteInfo(code) {
  return get(`/babies/invite-info/${code}`)
}

/** 凭邀请码加入宝宝 { code, relation } */
function join(data) {
  return post('/babies/join', data)
}

/** 家庭成员列表 */
function members(id) {
  return get(`/babies/${id}/members`)
}

/** 修改成员称呼 { relation } */
function updateRelation(babyId, userId, relation) {
  return put(`/babies/${babyId}/members/${userId}`, { relation })
}

/** 移除成员（仅创建者） */
function removeMember(babyId, userId) {
  return del(`/babies/${babyId}/members/${userId}`)
}

/** 退出这个宝宝 */
function leave(id) {
  return post(`/babies/${id}/leave`)
}

module.exports = {
  list,
  create,
  update,
  remove,
  select,
  invite,
  inviteInfo,
  join,
  members,
  updateRelation,
  removeMember,
  leave,
}
