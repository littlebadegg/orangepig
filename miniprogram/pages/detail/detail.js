/**
 * 内容详情页
 */
const postService = require('../../services/post')
const userService = require('../../services/user')
const { formatTime, formatNumber } = require('../../utils/format')
const { requestSubscribe, SUBSCRIBE_TRIGGERS } = require('../../utils/subscribe')

Page({
  data: {
    postId: '',
    post: null,
    comments: [],
    commentPage: 1,
    hasMoreComments: true,
    commentText: '',
    loading: true,
    showCommentInput: false,
  },

  onLoad(options) {
    const postId = options.id
    if (!postId || postId === 'undefined') {
      wx.showToast({ title: '内容不存在', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 1500)
      return
    }
    this.setData({ postId })
    this.loadDetail(postId)
  },

  async loadDetail(postId) {
    try {
      const post = await postService.getDetail(postId)
      post.timeText = formatTime(post.createTime)
      post.likeCountText = formatNumber(post.likeCount || 0)
      post.commentCountText = formatNumber(post.commentCount || 0)

      this.setData({ post, loading: false })
      this.loadComments(postId)
    } catch (err) {
      wx.showToast({ title: '加载失败', icon: 'none' })
      this.setData({ loading: false })
    }
  },

  async loadComments(postId) {
    const { commentPage } = this.data
    try {
      const result = await postService.getComments(postId, commentPage)
      const formatted = (result.list || []).map((c) => ({
        ...c,
        timeText: formatTime(c.createTime),
      }))

      this.setData({
        comments: commentPage === 1 ? formatted : [...this.data.comments, ...formatted],
        hasMoreComments: result.list && result.list.length >= 20,
      })
    } catch (err) {
      console.error('加载评论失败:', err)
    }
  },

  onReachBottom() {
    if (this.data.hasMoreComments) {
      this.setData({ commentPage: this.data.commentPage + 1 })
      this.loadComments(this.data.postId)
    }
  },

  async onToggleLike() {
    const { post } = this.data
    const newLiked = !post.liked
    const newCount = post.likeCount + (newLiked ? 1 : -1)

    // 乐观更新
    this.setData({
      'post.liked': newLiked,
      'post.likeCount': newCount,
      'post.likeCountText': formatNumber(newCount),
    })

    try {
      await postService.toggleLike(this.data.postId, newLiked)

      if (newLiked) {
        requestSubscribe(SUBSCRIBE_TRIGGERS.AFTER_COMMENT)
      }
    } catch (err) {
      this.setData({
        'post.liked': !newLiked,
        'post.likeCount': post.likeCount,
        'post.likeCountText': formatNumber(post.likeCount),
      })
    }
  },

  /**
   * 关注 / 取关作者
   */
  async onToggleFollow() {
    const { post } = this.data
    if (!post || !post.author) return

    const newFollow = !post.isFollowing
    const authorId = post.author.id

    // 乐观更新
    this.setData({
      'post.isFollowing': newFollow,
    })

    try {
      await userService.toggleFollow(authorId, newFollow)
      wx.showToast({
        title: newFollow ? '已关注' : '已取消',
        icon: 'none',
      })
    } catch (err) {
      this.setData({
        'post.isFollowing': !newFollow,
      })
      wx.showToast({ title: '操作失败', icon: 'none' })
    }
  },

  onCommentInput(e) {
    this.setData({ commentText: e.detail.value })
  },

  toggleCommentInput() {
    this.setData({ showCommentInput: !this.data.showCommentInput })
  },

  async onSubmitComment() {
    const { commentText, postId } = this.data
    if (!commentText.trim()) return

    try {
      await postService.addComment(postId, commentText.trim())
      await requestSubscribe(SUBSCRIBE_TRIGGERS.AFTER_COMMENT)

      this.setData({ commentText: '', commentPage: 1, showCommentInput: false })
      this.loadComments(postId)

      const newCount = this.data.post.commentCount + 1
      this.setData({
        'post.commentCount': newCount,
        'post.commentCountText': formatNumber(newCount),
      })

      wx.showToast({ title: '评论成功', icon: 'success' })
    } catch (err) {
      wx.showToast({ title: '评论失败', icon: 'none' })
    }
  },

  previewImage(e) {
    const { url } = e.currentTarget.dataset
    wx.previewImage({
      current: url,
      urls: this.data.post.images || [],
    })
  },

  /**
   * 点击作者 → 跳转个人主页
   */
  onTapAuthor() {
    const { post } = this.data
    if (!post || !post.author) return
    wx.navigateTo({
      url: `/subpackages/user-center/pages/profile/profile?userId=${post.author.id}`,
    })
  },

  onShareAppMessage() {
    const { post } = this.data
    return {
      title: post ? post.content?.slice(0, 30) || '分享一个内容' : '分享内容',
      path: `/pages/detail/detail?id=${this.data.postId}`,
      imageUrl: post?.images?.[0] || '',
    }
  },

  onShareTimeline() {
    const { post } = this.data
    return {
      title: post ? post.content?.slice(0, 20) || '分享内容' : '',
      query: `id=${this.data.postId}`,
    }
  },
})
