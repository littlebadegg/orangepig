/**
 * 游客模式演示数据 — 未登录时在首页展示，供用户先浏览体验功能
 *
 * 合规要求（微信审核）：进入小程序先让用户体验功能服务，登录由用户主动触发。
 * 这里的数据全部是本地写死的示例，不请求后端；点「确定记录」等保存动作时引导登录。
 */

/** 首页（记录页）演示数据 */
function recordDemo() {
  return {
    currentBaby: { id: 0, name: '小橙子（示例）' },
    babySubtitle: '男宝 · 2026-08-15 · 2个月',

    // 今日概览（与 normalizeStats 的形状一致，多字段可以缺省）
    stats: {
      feeding: {
        count: 5,
        totalAmount: 590,
        lastFeeding: { agoText: '32分钟前', timeText: '14:08', title: '奶粉 130ml' },
      },
      diaper: {
        count: 6,
        peeCount: 4,
        pooCount: 2,
        lastDiaper: { agoText: '45分钟前', timeText: '13:55', typeText: '小便', minutes: 45 },
      },
      sleep: { count: 2, totalText: '2小时10分' },
      exercise: { count: 2, minutesText: '8分钟' },
      spitUp: { count: 1, lastLevelText: '少量' },
      bath: { count: 1, minutesText: '10分钟' },
      temperature: { count: 2, latestText: '36.8℃', levelText: '正常' },
      growth: { hasData: true, heightText: '64.5cm', weightText: '7.2kg', measuredText: '10-26' },
      score: { total: 88, level: '良好' },
      reminders: [
        {
          type: 'water',
          icon: '🚰',
          text: '已经喂了两顿奶，记得给宝宝喂水哦',
          actionText: '去喂水',
          action: 'water',
          level: 'urgent',
        },
      ],
    },

    // 时间线（最新在前）
    list: [
      { kind: 'feeding', id: 'd1', icon: '🍼', title: '喂奶 · 奶粉 130ml', timeText: '14:08', recorder: '妈妈' },
      { kind: 'water', id: 'd2', icon: '🚰', title: '喂水 20ml', timeText: '13:40', recorder: '爸爸' },
      { kind: 'diaper', id: 'd3', icon: '🧷', title: '换尿片 · 小便', timeText: '13:55', recorder: '妈妈' },
      { kind: 'sleep', id: 'd4', icon: '😴', title: '睡觉', subtitle: '12:30 → 14:05 · 共1小时35分', timeText: '14:05', recorder: '奶奶' },
      { kind: 'supplement', id: 'd5', icon: '💊', title: '喂养品 · 维生素AD', timeText: '12:10', recorder: '妈妈' },
      { kind: 'exercise', id: 'd6', icon: '🤸', title: '排气操 5分钟 · 有排气', timeText: '11:20', recorder: '爸爸' },
      { kind: 'spitup', id: 'd7', icon: '🤮', title: '吐奶 · 少量', timeText: '10:45', recorder: '妈妈' },
      { kind: 'bath', id: 'd8', icon: '🛁', title: '洗澡 10分钟 · 水温38℃', timeText: '09:30', recorder: '妈妈' },
      { kind: 'feeding', id: 'd9', icon: '🍼', title: '喂奶 · 母乳 15分钟', timeText: '09:00', recorder: '妈妈' },
      { kind: 'temperature', id: 'd10', icon: '🌡️', title: '体温 36.8℃ · 耳温', timeText: '08:10', recorder: '爸爸' },
    ],

    // 养育小贴士（示例：2~3月龄段）
    tips: [
      {
        category: 'feed',
        icon: '🍼',
        label: '喂养参考',
        items: [
          { id: 't1', title: '每日奶量', content: '2~3月龄每天约 700~900ml，单次 120~150ml 左右，按需喂养，不必严格定量' },
          { id: 't2', title: '喂水', content: '纯母乳宝宝一般无需额外喂水；奶粉喂养两顿奶之间可少量喂水 10~20ml' },
        ],
      },
      {
        category: 'sleep',
        icon: '😴',
        label: '睡眠参考',
        items: [
          { id: 't3', title: '睡眠时长', content: '2~3月龄每天总睡眠 14~17 小时，白天小睡 3~5 次，注意观察困倦信号' },
        ],
      },
      {
        category: 'growth',
        icon: '📏',
        label: '生长参考',
        items: [
          { id: 't4', title: '体重身高', content: '2~3月龄男宝体重约 5.6~7.5kg、身长约 59~65cm，每月体重增长约 600~800g' },
        ],
      },
      {
        category: 'care',
        icon: '🌤️',
        label: '日常护理',
        items: [
          { id: 't5', title: '户外活动', content: '天气好时每天可户外 30~60 分钟，从每次 10 分钟开始循序渐进' },
        ],
      },
    ],
    stageText: '2~3月龄',
  }
}

module.exports = { recordDemo }
