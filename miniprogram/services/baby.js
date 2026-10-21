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

module.exports = { list, create, update, remove, select }
