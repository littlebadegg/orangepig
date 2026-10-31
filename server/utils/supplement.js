/**
 * 喂养品名称处理
 *
 * ⚠️ AD 和 D3 是同一类（维生素 D 补充），吃一种就够了 ——
 *    提醒逻辑要把它们合并成一条，不能各提醒一次。
 */

/** 名称归一化：去空格 + 最长 30 字，常见写法统一成 AD / D3 */
function normalizeSupplementName(raw) {
  let name = String(raw || '').trim().slice(0, 30)
  if (!name) return ''

  const lower = name.toLowerCase()
  // 维生素 AD
  if (name === '维生素AD' || name === '维生素AD滴剂' || lower === 'ad') {
    return 'AD'
  }
  // 维生素 D（D3 是常见剂型，统一记为 D3）
  if (
    name === '维生素D3' ||
    name === '维生素D' ||
    name === '维生素D滴剂' ||
    lower === 'd3' ||
    lower === 'vd' ||
    lower === 'vd3'
  ) {
    return 'D3'
  }
  return name
}

/** 是否属于「维生素 D 类」（AD / D3），统计提醒时视为同一种 */
const VITAMIN_D_NAMES = ['AD', 'D3', 'VD', '维生素AD', '维生素D', '维生素D3']

function isVitaminDName(name) {
  const n = String(name || '').trim().toUpperCase()
  if (!n) return false
  return VITAMIN_D_NAMES.some((x) => x.toUpperCase() === n)
}

module.exports = {
  normalizeSupplementName,
  isVitaminDName,
  VITAMIN_D_NAMES,
}
