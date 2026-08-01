/**
 * 全局配置 — API 地址、环境切换
 *
 * 使用方式：
 * - 开发环境：本地启动 server，用 localhost 地址
 * - 生产环境：替换为你的域名（需 HTTPS + 微信后台配置 request 合法域名）
 *
 * ⚠️ 上线前必做：
 * 1. 将 BASE_URL 改为你的正式域名（必须 HTTPS）
 * 2. 在微信公众平台 → 开发管理 → 开发设置 → 服务器域名 → request 合法域名 中添加该域名
 */

// 环境判断：可通过开发者工具的编译模式切换
const isDev = typeof __wxConfig !== 'undefined'
  ? __wxConfig.envVersion === 'develop' || __wxConfig.envVersion === 'trial'
  : true

const config = {
  // 开发环境：本地后端服务
  dev: {
    baseUrl: 'http://localhost:3000/api',
    uploadUrl: 'http://localhost:3000/api/upload/image',
  },
  // 生产环境：替换为你的域名
  prod: {
    baseUrl: 'https://your-domain.com/api',
    uploadUrl: 'https://your-domain.com/api/upload/image',
  },
}

const env = isDev ? config.dev : config.prod

module.exports = {
  BASE_URL: env.baseUrl,
  UPLOAD_URL: env.uploadUrl,
  IS_DEV: isDev,
}
