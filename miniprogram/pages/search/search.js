/**
 * 相册页 — 照片上传、按时间/地点浏览
 */
const photoService = require('../../services/photo')
const { uploadFile } = require('../../utils/request')

Page({
  data: {
    activeTab: 'time', // time | location
    groups: [],
    loading: true,
    uploading: false,
    photoCount: 0,
    // 照片预览
    previewVisible: false,
    previewUrls: [],
  },

  onLoad() {
    this.loadAlbum()
  },

  onShow() {
    // 每次显示时刷新（从其他页面上传后回来也能看到）
    if (this.data.groups.length > 0 || !this.data.loading) {
      this.loadAlbum()
    }
  },

  onPullDownRefresh() {
    this.loadAlbum().then(() => {
      wx.stopPullDownRefresh()
    })
  },

  /**
   * 加载相册
   */
  async loadAlbum() {
    const app = getApp()
    if (!app || !app.globalData || !app.globalData.userId) {
      this.setData({ loading: false, groups: [] })
      return
    }

    this.setData({ loading: true })

    try {
      const userId = app.globalData.userId
      if (this.data.activeTab === 'time') {
        const result = await photoService.getAlbum(userId)
        this.setData({
          groups: result.groups || [],
          photoCount: (result.groups || []).reduce((sum, g) => sum + g.photos.length, 0),
          loading: false,
        })
      } else {
        const result = await photoService.getLocations(userId)
        const groups = (result.groups || []).map((g) => ({
          ...g,
          dateText: g.photoCount + ' 张照片',
        }))
        this.setData({
          groups,
          photoCount: groups.reduce((sum, g) => sum + g.photoCount, 0),
          loading: false,
        })
      }
    } catch (err) {
      console.error('加载相册失败:', err)
      this.setData({ loading: false })
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  /**
   * 切换 Tab
   */
  onTabChange(e) {
    const tab = e.currentTarget.dataset.tab
    if (tab === this.data.activeTab) return
    this.setData({ activeTab: tab, groups: [], loading: true })
    this.loadAlbum()
  },

  /**
   * 选择并上传照片
   * 使用 sizeType: original 保留照片 EXIF 数据（拍摄时间+GPS）
   * 后端优先从 EXIF 提取拍摄位置，照片无 GPS 时才用当前位置兜底
   */
  onUploadPhoto() {
    const app = getApp()
    if (!app || !app.globalData || !app.globalData.userId) {
      wx.showToast({ title: '请先登录', icon: 'none' })
      return
    }

    wx.chooseMedia({
      count: 9,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['original'], // 原图保留 EXIF
      success: (res) => {
        this.uploadPhotos(res.tempFiles)
      },
    })
  },

  /**
   * 获取当前位置（兜底用，当照片无 EXIF GPS 时）
   * 返回 { latitude, longitude } 或 null
   */
  getCurrentLocation() {
    return new Promise((resolve) => {
      wx.getLocation({
        type: 'gcj02',
        success: (res) => {
          resolve({ latitude: res.latitude, longitude: res.longitude })
        },
        fail: () => {
          // 用户拒绝授权或获取失败，不阻塞上传
          resolve(null)
        },
      })
    })
  },

  /**
   * 上传照片
   * 流程：获取当前位置（兜底）→ 上传原图 → 后端解析 EXIF → 创建照片记录
   * 位置优先级：EXIF 拍摄位置 > 当前位置兜底 > 无
   */
  async uploadPhotos(tempFiles) {
    if (!tempFiles || tempFiles.length === 0) return

    this.setData({ uploading: true })
    wx.showLoading({ title: '上传中...', mask: true })

    // 预先获取当前位置（兜底用）
    const currentLocation = await this.getCurrentLocation()
    if (currentLocation) {
      console.log('[Album] 获取到当前位置:', currentLocation)
    } else {
      console.log('[Album] 未获取到当前位置（可能未授权）')
    }

    let successCount = 0
    let failCount = 0
    let exifLocationCount = 0 // 照片有拍摄位置
    let gpsLocationCount = 0  // 用当前位置兜底
    let noLocationCount = 0   // 无位置

    for (const file of tempFiles) {
      try {
        // 1. 上传原图文件（EXIF 数据保留在文件中）
        const imageUrl = await uploadFile(file.tempFilePath)

        // 2. 创建照片记录 — 后端自动从图片文件解析 EXIF
        //    前端同时传入当前位置作为兜底（当 EXIF 无 GPS 时使用）
        const result = await photoService.createPhoto({
          imageUrl,
          title: '',
          location: '',
          latitude: currentLocation ? currentLocation.latitude : null,
          longitude: currentLocation ? currentLocation.longitude : null,
          photoTime: null,
        })

        if (result.source === 'exif') {
          exifLocationCount++
        } else if (result.source === 'gps') {
          gpsLocationCount++
        } else {
          noLocationCount++
        }
        successCount++
      } catch (err) {
        console.error('上传失败:', err)
        failCount++
      }
    }

    wx.hideLoading()
    this.setData({ uploading: false })

    if (successCount > 0) {
      // 提示位置来源
      let hint = ''
      if (exifLocationCount > 0 && gpsLocationCount > 0) {
        hint = `，${exifLocationCount}张有拍摄位置，${gpsLocationCount}张用当前位置`
      } else if (exifLocationCount > 0) {
        hint = `，${exifLocationCount}张已识别拍摄位置`
      } else if (gpsLocationCount > 0) {
        hint = `，使用当前位置`
      } else {
        hint = '，无拍摄位置信息'
      }
      wx.showToast({
        title: `上传${successCount}张成功${failCount > 0 ? `,${failCount}张失败` : hint}`,
        icon: 'none',
        duration: 2500,
      })
      this.loadAlbum()
    } else {
      wx.showToast({ title: '上传失败', icon: 'none' })
    }
  },

  /**
   * 预览照片
   */
  onPreviewPhoto(e) {
    const { groupIndex, photoIndex } = e.currentTarget.dataset
    const group = this.data.groups[groupIndex]

    let urls = []
    let current = 0

    // 收集所有照片 URL
    this.data.groups.forEach((g, gi) => {
      const photos = g.photos || (g.imageUrl ? [{ imageUrl: g.imageUrl }] : [])
      photos.forEach((p, pi) => {
        if (gi === groupIndex && pi === photoIndex) {
          current = urls.length
        }
        urls.push(p.imageUrl)
      })
    })

    wx.previewImage({ current: urls[current], urls })
  },

  /**
   * 预览单组照片
   */
  onPreviewGroup(e) {
    const { groupIndex } = e.currentTarget.dataset
    const group = this.data.groups[groupIndex]
    const photos = group.photos || (group.imageUrl ? [{ imageUrl: group.imageUrl }] : [])
    const urls = photos.map((p) => p.imageUrl)
    wx.previewImage({ urls })
  },

  /**
   * 删除照片
   */
  onLongPressPhoto(e) {
    const { photoId } = e.currentTarget.dataset
    if (!photoId) return

    wx.showActionSheet({
      itemList: ['删除照片'],
      itemColor: '#FF6B35',
      success: (res) => {
        if (res.tapIndex === 0) {
          this.deletePhoto(photoId)
        }
      },
    })
  },

  async deletePhoto(photoId) {
    try {
      await photoService.deletePhoto(photoId)
      wx.showToast({ title: '已删除', icon: 'success' })
      this.loadAlbum()
    } catch (err) {
      wx.showToast({ title: '删除失败', icon: 'none' })
    }
  },
})
