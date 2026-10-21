/**
 * 我的 — 宝宝管理（添加 / 切换 / 编辑 / 删除）
 */
const babyService = require('../../services/baby')
const { genderText } = require('../../utils/format')

const GENDER_OPTIONS = ['未知', '男宝', '女宝']

Page({
  data: {
    babies: [],
    currentBabyId: null,

    // 弹窗
    showSheet: false,
    editingId: null,
    babyName: '',
    babyGender: 0,
    babyBirthday: '',
    genderOptions: GENDER_OPTIONS,

    submitting: false,
  },

  onShow() {
    this.refresh()
  },

  async refresh() {
    try {
      const data = await babyService.list()
      const babies = (data.list || []).map((b) => ({
        ...b,
        genderText: genderText(b.gender),
      }))
      this.setData({ babies, currentBabyId: data.currentBabyId })
    } catch (err) {
      console.error('[mine] 加载失败:', err)
      wx.showToast({ title: err.message || '加载失败', icon: 'none' })
    }
  },

  /** 切换当前宝宝 */
  async onSelectBaby(e) {
    const id = e.currentTarget.dataset.id
    if (id === this.data.currentBabyId) return
    try {
      await babyService.select(id)
      await this.refresh()
      wx.showToast({ title: '已切换', icon: 'none' })
    } catch (err) {
      wx.showToast({ title: err.message || '切换失败', icon: 'none' })
    }
  },

  /** 新增 */
  openAdd() {
    this.setData({
      showSheet: true,
      editingId: null,
      babyName: '',
      babyGender: 0,
      babyBirthday: '',
    })
  },

  /** 编辑 */
  openEdit(e) {
    const { id, name, gender, birthday } = e.currentTarget.dataset
    this.setData({
      showSheet: true,
      editingId: id,
      babyName: name || '',
      babyGender: parseInt(gender) || 0,
      babyBirthday: birthday || '',
    })
  },

  closeSheet() {
    this.setData({ showSheet: false })
  },

  onNameInput(e) {
    this.setData({ babyName: e.detail.value })
  },

  onGenderChange(e) {
    this.setData({ babyGender: parseInt(e.detail.value) })
  },

  onBirthdayChange(e) {
    this.setData({ babyBirthday: e.detail.value })
  },

  async submitBaby() {
    const { babyName, babyGender, babyBirthday, editingId } = this.data
    const name = (babyName || '').trim()

    if (!name) {
      wx.showToast({ title: '请输入宝宝昵称', icon: 'none' })
      return
    }

    this.setData({ submitting: true })
    try {
      const payload = {
        name,
        gender: babyGender,
        birthday: babyBirthday || null,
      }
      if (editingId) {
        await babyService.update(editingId, payload)
        wx.showToast({ title: '已保存', icon: 'none' })
      } else {
        await babyService.create(payload)
        wx.showToast({ title: '宝宝已添加', icon: 'none' })
      }
      this.setData({ showSheet: false })
      await this.refresh()
    } catch (err) {
      wx.showToast({ title: err.message || '保存失败', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  },

  onDeleteBaby(e) {
    const { id, name } = e.currentTarget.dataset
    wx.showModal({
      title: '删除宝宝',
      content: `确定删除「${name}」吗？该宝宝的记录会一并隐藏。`,
      success: async (res) => {
        if (!res.confirm) return
        try {
          await babyService.remove(id)
          wx.showToast({ title: '已删除', icon: 'none' })
          await this.refresh()
        } catch (err) {
          wx.showToast({ title: err.message || '删除失败', icon: 'none' })
        }
      },
    })
  },
})
