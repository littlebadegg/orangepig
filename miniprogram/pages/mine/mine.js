/**
 * 我的 — 宝宝管理 + 家人共享
 */
const babyService = require('../../services/baby')
const { genderText } = require('../../utils/format')

const GENDER_OPTIONS = ['未知', '男宝', '女宝']
const RELATION_OPTIONS = ['妈妈', '爸爸', '爷爷', '奶奶', '外公', '外婆', '月嫂', '其他家人']

Page({
  data: {
    babies: [],
    currentBabyId: null,

    // 添加/编辑弹窗
    showSheet: false,
    editingId: null,
    babyName: '',
    babyGender: 0,
    babyBirthday: '',
    genderOptions: GENDER_OPTIONS,
    relationOptions: RELATION_OPTIONS,
    myRelationIndex: 0,

    // 家人弹窗
    showFamily: false,
    familyBabyId: null,
    familyBabyName: '',
    familyIsOwner: false,
    inviteCode: '',
    members: [],

    // 加入宝宝弹窗
    showJoin: false,
    joinCode: '',
    joinRelationIndex: 1,

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

  // ============ 添加 / 编辑宝宝 ============

  openAdd() {
    this.setData({
      showSheet: true,
      editingId: null,
      babyName: '',
      babyGender: 0,
      babyBirthday: '',
      myRelationIndex: 0,
    })
  },

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

  onMyRelationChange(e) {
    this.setData({ myRelationIndex: parseInt(e.detail.value) })
  },

  async submitBaby() {
    const { babyName, babyGender, babyBirthday, editingId, myRelationIndex } = this.data
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
        payload.relation = RELATION_OPTIONS[myRelationIndex] || ''
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
      content: `确定删除「${name}」吗？家人也会失去这个宝宝的访问权限。`,
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

  // ============ 家人共享 ============

  async openFamily(e) {
    const { id, name } = e.currentTarget.dataset
    this.setData({
      showFamily: true,
      familyBabyId: id,
      familyBabyName: name,
      members: [],
      inviteCode: '',
    })

    try {
      const data = await babyService.members(id)
      this.setData({
        members: data.list || [],
        familyIsOwner: !!data.isOwner,
        inviteCode: data.inviteCode || '',
      })

      // 老宝宝可能还没有邀请码，创建者打开时补一个
      if (data.isOwner && !data.inviteCode) {
        const inv = await babyService.invite(id)
        this.setData({ inviteCode: inv.inviteCode })
      }
    } catch (err) {
      wx.showToast({ title: err.message || '加载成员失败', icon: 'none' })
    }
  },

  closeFamily() {
    this.setData({ showFamily: false })
  },

  copyCode() {
    const { inviteCode } = this.data
    if (!inviteCode) return
    wx.setClipboardData({
      data: inviteCode,
      success: () => wx.showToast({ title: '邀请码已复制', icon: 'none' }),
    })
  },

  onRemoveMember(e) {
    const { uid, name } = e.currentTarget.dataset
    wx.showModal({
      title: '移除成员',
      content: `确定把「${name}」移出这个宝宝吗？TA 将不能再查看和记录。`,
      success: async (res) => {
        if (!res.confirm) return
        try {
          await babyService.removeMember(this.data.familyBabyId, uid)
          wx.showToast({ title: '已移除', icon: 'none' })
          const data = await babyService.members(this.data.familyBabyId)
          this.setData({ members: data.list || [] })
          await this.refresh()
        } catch (err) {
          wx.showToast({ title: err.message || '移除失败', icon: 'none' })
        }
      },
    })
  },

  /** 列表里的「退出」 */
  onLeaveBaby(e) {
    const { id, name } = e.currentTarget.dataset
    this.confirmLeave(id, name)
  },

  /** 家人弹窗里的「退出」 */
  onLeaveFromSheet() {
    this.confirmLeave(this.data.familyBabyId, this.data.familyBabyName)
  },

  confirmLeave(id, name) {
    wx.showModal({
      title: '退出',
      content: `确定退出「${name}」吗？之后需要重新凭邀请码加入。`,
      success: async (res) => {
        if (!res.confirm) return
        try {
          await babyService.leave(id)
          this.setData({ showFamily: false })
          wx.showToast({ title: '已退出', icon: 'none' })
          await this.refresh()
        } catch (err) {
          wx.showToast({ title: err.message || '退出失败', icon: 'none' })
        }
      },
    })
  },

  // ============ 凭邀请码加入 ============

  openJoin() {
    this.setData({ showJoin: true, joinCode: '', joinRelationIndex: 1 })
  },

  closeJoin() {
    this.setData({ showJoin: false })
  },

  onJoinCodeInput(e) {
    this.setData({ joinCode: e.detail.value })
  },

  onJoinRelationChange(e) {
    this.setData({ joinRelationIndex: parseInt(e.detail.value) })
  },

  async submitJoin() {
    const { joinCode, joinRelationIndex } = this.data
    const code = (joinCode || '').trim().toUpperCase()

    if (code.length !== 6) {
      wx.showToast({ title: '请输入 6 位邀请码', icon: 'none' })
      return
    }

    this.setData({ submitting: true })
    try {
      const baby = await babyService.join({
        code,
        relation: RELATION_OPTIONS[joinRelationIndex] || '',
      })
      this.setData({ showJoin: false })
      wx.showToast({ title: `已加入 ${baby.name}`, icon: 'none' })
      await this.refresh()
    } catch (err) {
      wx.showToast({ title: err.message || '加入失败', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  },

  // ============ 账号 ============

  /** 查看《用户服务协议》全文 */
  openUserAgreement() {
    wx.navigateTo({ url: '/pages/agreement/agreement?type=user' })
  },

  /** 查看《隐私政策》全文 */
  openPrivacyAgreement() {
    wx.navigateTo({ url: '/pages/agreement/agreement?type=privacy' })
  },

  onLogout() {
    wx.showModal({
      title: '退出登录',
      content: '退出后需要重新微信登录，已记录的宝宝数据不会丢失。',
      success: (res) => {
        if (!res.confirm) return
        const app = getApp()
        if (app && app.logout) {
          app.logout()
        } else {
          wx.removeStorageSync('access_token')
          wx.reLaunch({ url: '/pages/login/login' })
        }
      },
    })
  },

  // ============ 分享邀请 ============

  onShareAppMessage() {
    const { inviteCode, familyBabyName } = this.data
    if (inviteCode) {
      return {
        title: `一起来记录${familyBabyName || '宝宝'}的日常`,
        path: `/pages/invite/invite?code=${inviteCode}`,
      }
    }
    return {
      title: '橙猪宝宝记 — 记录宝宝每一次成长',
      path: '/pages/record/record',
    }
  },
})
