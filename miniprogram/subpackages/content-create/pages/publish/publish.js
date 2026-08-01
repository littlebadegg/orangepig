/**
 * 发布内容页 — 用户增长的内容生产入口
 *
 * 流程（非云开发版本）：
 * 1. 输入文字 + 选择图片
 * 2. 图片上传到自己的服务器
 * 3. 提交内容（后端做内容安全检测）
 * 4. 发布成功后请求订阅消息
 */
const postService = require('../../../../services/post')
const { uploadFiles } = require('../../../../utils/request')
const { requestSubscribe, SUBSCRIBE_TRIGGERS } = require('../../../../utils/subscribe')

Page({
  data: {
    content: '',
    images: [],
    maxImages: 9,
    maxChars: 500,
    submitting: false,
  },

  onContentInput(e) {
    this.setData({ content: e.detail.value })
  },

  /**
   * 选择图片 — 从相册或拍照
   */
  chooseImage() {
    const remaining = this.data.maxImages - this.data.images.length
    if (remaining <= 0) {
      wx.showToast({ title: '最多上传9张图片', icon: 'none' })
      return
    }

    wx.chooseMedia({
      count: remaining,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: (res) => {
        const newImages = res.tempFiles.map((f) => f.tempFilePath)
        this.setData({
          images: [...this.data.images, ...newImages],
        })
      },
    })
  },

  /**
   * 预览图片
   */
  previewImage(e) {
    const { url } = e.currentTarget.dataset
    wx.previewImage({
      current: url,
      urls: this.data.images,
    })
  },

  /**
   * 删除图片
   */
  deleteImage(e) {
    const { index } = e.currentTarget.dataset
    const images = [...this.data.images]
    images.splice(index, 1)
    this.setData({ images })
  },

  /**
   * 发布
   */
  async onSubmit() {
    const { content, images } = this.data

    if (!content.trim() && images.length === 0) {
      wx.showToast({ title: '请输入内容或选择图片', icon: 'none' })
      return
    }

    this.setData({ submitting: true })

    try {
      // 1. 上传图片到自己的服务器
      let imageUrls = []
      if (images.length > 0) {
        wx.showLoading({ title: '上传图片中...', mask: true })
        imageUrls = await uploadFiles(images)
        wx.hideLoading()
      }

      // 2. 发布内容（后端会做内容安全检测）
      await postService.publish({
        content: content.trim(),
        images: imageUrls,
      })

      // 3. 请求订阅消息（关键增长触达）
      await requestSubscribe(SUBSCRIBE_TRIGGERS.AFTER_PUBLISH)

      // 4. 发布成功
      wx.showToast({ title: '发布成功', icon: 'success' })
      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
    } catch (err) {
      console.error('发布失败:', err)
      wx.showToast({ title: err.message || '发布失败', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  },

  onCancel() {
    if (this.data.content || this.data.images.length > 0) {
      wx.showModal({
        title: '提示',
        content: '确定放弃编辑吗？',
        success: (res) => {
          if (res.confirm) wx.navigateBack()
        },
      })
    } else {
      wx.navigateBack()
    }
  },
})
