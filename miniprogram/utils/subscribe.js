/**
 * 订阅消息工具 — 用户增长的关键触达渠道
 *
 * 使用场景：
 * - 内容更新通知（关注的人发了新内容）
 * - 评论回复通知
 * - 点赞通知
 * - 活动通知
 *
 * 注意事项：
 * 1. 每次只能弹一次授权弹窗，用户点"允许"后该模板可发一次
 * 2. 需要在用户操作的关键时刻触发（如发布成功后、评论后）
 * 3. 用户可以选择"总是保持以上选择"，后续不再弹窗
 */

const TEMPLATE_IDS = {
  NEW_POST: 'template_id_new_post',       // 关注的人发布新内容
  COMMENT_REPLY: 'template_id_comment_reply', // 评论被回复
  LIKE_NOTICE: 'template_id_like_notice',     // 内容被点赞
  SYSTEM_NOTICE: 'template_id_system',       // 系统通知
}

/**
 * 请求订阅消息授权
 * @param {string[]} templateKeys - TEMPLATE_IDS 中的 key 数组
 * @returns {Promise<string[]>} 用户同意的模板ID列表
 */
function requestSubscribe(templateKeys = []) {
  const tmplIds = templateKeys
    .map((key) => TEMPLATE_IDS[key])
    .filter(Boolean)

  if (tmplIds.length === 0) {
    return Promise.resolve([])
  }

  return new Promise((resolve) => {
    wx.requestSubscribeMessage({
      tmplIds,
      success: (res) => {
        const accepted = tmplIds.filter((id) => res[id] === 'accept')
        console.log('[subscribe] accepted:', accepted.length, '/', tmplIds.length)
        resolve(accepted)
      },
      fail: () => {
        resolve([])
      },
    })
  })
}

/**
 * 便捷方法：请求单个订阅
 */
function requestOne(templateKey) {
  return requestSubscribe([templateKey])
}

/**
 * 在关键节点触发订阅请求的推荐时机
 * - 发布内容成功后 → 请求 COMMENT_REPLY + LIKE_NOTICE
 * - 关注用户成功后 → 请求 NEW_POST
 * - 评论成功后 → 请求 COMMENT_REPLY
 */
const SUBSCRIBE_TRIGGERS = {
  AFTER_PUBLISH: ['COMMENT_REPLY', 'LIKE_NOTICE'],
  AFTER_FOLLOW: ['NEW_POST'],
  AFTER_COMMENT: ['COMMENT_REPLY'],
}

module.exports = {
  TEMPLATE_IDS,
  requestSubscribe,
  requestOne,
  SUBSCRIBE_TRIGGERS,
}
