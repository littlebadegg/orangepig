/**
 * 全局配置 — API 地址、环境切换
 *
 * ⚠️ 上线前必做：
 * 1. 把 prod.baseUrl 改成你的正式域名（必须 HTTPS）
 * 2. 微信公众平台 → 开发管理 → 开发设置 → 服务器域名 → request 合法域名 添加该域名
 *
 * 本地开发说明：
 * Docker 里 Node 后端只暴露在容器内部（3000），对外是 Nginx（默认 8080）
 * 所以本地调试走 8080，并在开发者工具勾选「不校验合法域名」
 */

const isDev =
  typeof __wxConfig !== 'undefined'
    ? __wxConfig.envVersion === 'develop' || __wxConfig.envVersion === 'trial'
    : true

const config = {
  dev: {
    // 走 Nginx 对外端口（docker-compose 里的 NGINX_PORT，默认 8080）
    baseUrl: 'http://didi.grindsword.top/api',
  },
  prod: {
    baseUrl: 'http://didi.grindsword.top/api',
  },
}

const env = isDev ? config.dev : config.prod

module.exports = {
  BASE_URL: env.baseUrl,
  IS_DEV: isDev,
}
