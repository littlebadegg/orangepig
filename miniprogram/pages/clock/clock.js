/**
 * 24 小时时钟盘 — 一天里每段时间都在做什么
 *
 * 外圈扇形＝有时长的活动（睡觉 / 排气操 / 洗澡）
 * 内侧圆点＝瞬时记录（喂奶 / 换尿片 / 体温 / 吐奶 / 喂水 / 喂养品）
 * 灰色环底＝还没记录的时间
 */
const babyService = require('../../services/baby')
const recordService = require('../../services/record')
const { todayString } = require('../../utils/format')

const TAU = Math.PI * 2
const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

/** 分钟 → 角度（0 点在正上方，顺时针） */
function angleOf(minute) {
  return (minute / 1440) * TAU - Math.PI / 2
}

function pad(n) {
  return String(n).padStart(2, '0')
}

/** "2026-11-08" → "11月8日 周日" */
function dateTitle(dateStr) {
  const d = new Date(String(dateStr).replace(/-/g, '/'))
  if (isNaN(d.getTime())) return dateStr
  return `${d.getMonth() + 1}月${d.getDate()}日 ${WEEKDAYS[d.getDay()]}`
}

/** 日期加减天数 */
function shiftDate(dateStr, delta) {
  const d = new Date(String(dateStr).replace(/-/g, '/'))
  d.setDate(d.getDate() + delta)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

Page({
  data: {
    date: '',
    dateText: '',
    isToday: true,
    babyName: '',
    guest: false,
    loading: true,
    hasData: false,
    segments: [],
    events: [],
    summary: [],
    timeline: [],
    coverageText: '0分钟',
    coveragePercent: 0,
    coveragePercentElapsed: 0,
    unrecordedText: '',
    activeTip: '',
    showAll: false,
  },

  onLoad(options) {
    const date = options && options.date ? options.date : todayString()
    this.setData({ date, dateText: dateTitle(date) })
  },

  onShow() {
    if (!wx.getStorageSync('access_token')) {
      this.setData({ guest: true, loading: false })
      return
    }
    this.setData({ guest: false })
    this.load()
  },

  /** 加载当天时钟数据 */
  async load() {
    const date = this.data.date
    this.setData({ loading: true })
    try {
      // 宝宝信息（名字展示用），失败不阻塞时钟
      if (!this.data.babyName) {
        try {
          const babyData = await babyService.list()
          const babies = babyData.list || []
          const current =
            babies.find((b) => b.id === (babyData.currentBabyId || (babies[0] && babies[0].id))) ||
            babies[0]
          if (current) this.setData({ babyName: current.name })
        } catch (e) {
          console.warn('[clock] 宝宝信息加载失败', e)
        }
      }

      const data = await recordService.clock(date)
      const timeline = (data.timeline || []).map((i, idx) => ({ ...i, key: `${i.kind}-${i.sortKey}-${idx}` }))
      this.setData({
        date: data.date || date,
        dateText: dateTitle(data.date || date),
        isToday: !!data.isToday,
        segments: data.segments || [],
        events: data.events || [],
        summary: data.summary || [],
        timeline,
        coverageText: data.coverageText || '0分钟',
        coveragePercent: data.coveragePercent || 0,
        coveragePercentElapsed: data.coveragePercentElapsed || 0,
        unrecordedText: data.isToday ? data.unrecordedText : '',
        hasData: !!data.hasData,
        activeTip: '',
      })
      this.active = null
      this.paint()
    } catch (err) {
      console.error('[clock] 加载失败:', err)
      wx.showToast({ title: err.message || '加载失败', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },

  /** 画表盘 */
  paint() {
    const query = wx.createSelectorQuery().in(this)
    query
      .select('#clock')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res || !res[0] || !res[0].node) return
        const canvas = res[0].node
        const ctx = canvas.getContext('2d')
        const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
        const dpr = info.pixelRatio || 2
        const w = res[0].width
        const h = res[0].height
        canvas.width = w * dpr
        canvas.height = h * dpr
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.scale(dpr, dpr)
        ctx.clearRect(0, 0, w, h)
        this.drawDial(ctx, w, h)
      })
  },

  drawDial(ctx, w, h) {
    const { segments, events, isToday, coverageText } = this.data
    const cx = w / 2
    const cy = h / 2
    const R = Math.min(w, h) / 2 - 2
    const rOuter = R * 0.8
    const rInner = R * 0.58
    const rMid = (rOuter + rInner) / 2
    const ringW = rOuter - rInner
    const rDot = R * 0.46
    const rLabel = R * 0.93

    // ---- 底层米色环（清醒·未记录，保证整圈都有颜色）----
    ctx.beginPath()
    ctx.arc(cx, cy, rMid, 0, TAU)
    ctx.strokeStyle = '#FBEEDC'
    ctx.lineWidth = ringW
    ctx.stroke()

    // ---- 时段扇形 ----
    segments.forEach((s) => {
      const dur = s.end - s.start
      const gap = Math.min(1.5, dur / 8)
      const active = this.active && this.active.key === `seg-${s.kind}-${s.start}`
      ctx.beginPath()
      ctx.arc(cx, cy, rMid, angleOf(s.start + gap), angleOf(s.end - gap), false)
      ctx.strokeStyle = s.color
      ctx.lineWidth = active ? ringW + 3 : ringW
      ctx.stroke()
    })

    // ---- 事件示意色块（瞬时动作也在环上体现：喂奶 25 分钟 / 尿片 12 分钟 / 其余 6 分钟宽）----
    events.forEach((e) => {
      if (e.exhibitEnd <= e.exhibitStart) return
      const gap = Math.min(0.6, (e.exhibitEnd - e.exhibitStart) / 6)
      const active = this.active && this.active.key === `evt-${e.kind}-${e.minute}`
      ctx.beginPath()
      ctx.arc(cx, cy, rMid, angleOf(e.exhibitStart + gap), angleOf(e.exhibitEnd - gap), false)
      ctx.strokeStyle = e.color
      ctx.lineWidth = active ? ringW + 3 : ringW
      ctx.stroke()
    })

    // ---- 事件轨道底环 ----
    ctx.beginPath()
    ctx.arc(cx, cy, rDot, 0, TAU)
    ctx.strokeStyle = '#F7F8FA'
    ctx.lineWidth = 14
    ctx.stroke()

    // ---- 事件圆点 ----
    events.forEach((e) => {
      const a = angleOf(e.minute)
      const x = cx + Math.cos(a) * rDot
      const y = cy + Math.sin(a) * rDot
      const active = this.active && this.active.key === `evt-${e.kind}-${e.minute}`
      ctx.beginPath()
      ctx.arc(x, y, active ? 6.5 : 4.5, 0, TAU)
      ctx.fillStyle = e.color
      ctx.fill()
      ctx.lineWidth = 1.5
      ctx.strokeStyle = '#ffffff'
      ctx.stroke()
    })

    // ---- 刻度与小时标签 ----
    for (let i = 0; i < 24; i++) {
      const a = angleOf(i * 60)
      const long = i % 3 === 0
      const r1 = rOuter + 3
      const r2 = rOuter + (long ? 9 : 6)
      ctx.beginPath()
      ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1)
      ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2)
      ctx.strokeStyle = long ? '#C9CCD2' : '#E2E4E8'
      ctx.lineWidth = 1
      ctx.stroke()

      if (long) {
        ctx.font = '10px sans-serif'
        ctx.fillStyle = '#9AA0A6'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(String(i), cx + Math.cos(a) * rLabel, cy + Math.sin(a) * rLabel)
      }
    }

    // ---- 当前时间指针 ----
    if (isToday) {
      const now = new Date()
      const nowMin = now.getHours() * 60 + now.getMinutes()
      const a = angleOf(nowMin)
      ctx.beginPath()
      ctx.moveTo(cx + Math.cos(a) * (rInner - 6), cy + Math.sin(a) * (rInner - 6))
      ctx.lineTo(cx + Math.cos(a) * (rOuter + 2), cy + Math.sin(a) * (rOuter + 2))
      ctx.strokeStyle = '#FF7A45'
      ctx.lineWidth = 2
      ctx.lineCap = 'round'
      ctx.stroke()
    }

    // ---- 圆心文字 ----
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#2B2B2B'
    ctx.font = '600 20px sans-serif'
    ctx.fillText(coverageText, cx, cy - 8)
    ctx.fillStyle = '#9AA0A6'
    ctx.font = '11px sans-serif'
    ctx.fillText('已记录', cx, cy + 14)
  },

  /** 点圆盘：查看这一时刻的记录 */
  onCanvasTap(e) {
    const { segments, events } = this.data
    if (!segments.length && !events.length) return
    // 优先用触点视口坐标（与 boundingClientRect 同基准），兜底 detail.x/y
    const t =
      (e.changedTouches && e.changedTouches[0]) ||
      (e.touches && e.touches[0]) ||
      e.detail ||
      {}
    const pageX = t.clientX !== undefined ? t.clientX : t.x
    const pageY = t.clientY !== undefined ? t.clientY : t.y
    if (pageX === undefined || pageY === undefined) return

    wx.createSelectorQuery()
      .in(this)
      .select('#clock')
      .boundingClientRect((rect) => {
        if (!rect) return
        const cx = rect.width / 2
        const cy = rect.height / 2
        const x = pageX - rect.left
        const y = pageY - rect.top
        let deg = (Math.atan2(y - cy, x - cx) * 180) / Math.PI + 90
        if (deg < 0) deg += 360
        const minute = Math.min(1439, Math.round((deg / 360) * 1440))

        // 优先命中事件示意色块（画在最上层），再命中时长时段
        let tip = ''
        let active = null
        const evt = events.find((e) => minute >= e.exhibitStart && minute < e.exhibitEnd)
        if (evt) {
          tip = `${evt.icon} ${evt.timeText} ${evt.label}${evt.detail ? ' · ' + evt.detail : ''}`
          active = { key: `evt-${evt.kind}-${evt.minute}` }
        } else {
          const seg = segments.find((s) => minute >= s.start && minute < s.end)
          if (seg) {
            tip = `${seg.icon} ${seg.label} ${seg.startText} - ${seg.endText}（${seg.minutesText}）${seg.detail ? ' · ' + seg.detail : ''}`
            active = { key: `seg-${seg.kind}-${seg.start}` }
          }
        }

        this.active = active
        this.setData({ activeTip: tip })
        this.paint()
      })
      .exec()
  },

  onPrevDay() {
    const date = shiftDate(this.data.date, -1)
    this.setData({ date, dateText: dateTitle(date) })
    this.load()
  },

  onNextDay() {
    if (this.data.isToday) return
    const next = shiftDate(this.data.date, 1)
    const today = todayString()
    const date = next > today ? today : next
    this.setData({ date, dateText: dateTitle(date) })
    this.load()
  },

  onPullDownRefresh() {
    if (this.data.guest) {
      wx.stopPullDownRefresh()
      return
    }
    this.load().then(() => wx.stopPullDownRefresh())
  },

  goRecord() {
    wx.switchTab({ url: '/pages/record/record' })
  },

  goLogin() {
    wx.navigateTo({ url: '/pages/login/login' })
  },
})
