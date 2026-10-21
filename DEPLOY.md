# 橙猪宝宝记 — 生产部署指南

> 宝宝喂养记录小程序 · Express + MySQL + Nginx 反向代理 · Docker 一键部署

## 部署只需要三步

```bash
git clone git@github.com:littlebadegg/orangepig.git
cd orangepig
cp .env.example .env && vi .env   # 填入数据库 / 微信配置
./deploy.sh                        # 或者 docker compose up -d --build
```

**数据库表不用手动初始化** —— 服务启动时会自动建库、建表、首次插入演示数据。

## 常见问题：数据库连接不上

报错 `connect ECONNREFUSED ::1:3306` 说明容器里 `DB_HOST` 是空的。

原因：`.env` 被 `.gitignore` 忽略，`git clone` 后服务器上没有这个文件，Docker Compose 拿不到变量，后端默认连 `localhost`（也就是容器自己）。

解决：在服务器上 `cp .env.example .env` 并填入真实配置。

## .env 完整配置

```env
DOMAIN=your-domain.com        # Nginx server_name
NGINX_PORT=8080               # Nginx 对外端口（80 被 Rancher 占用时改用这个）

DB_HOST=rds.example.com
DB_PORT=3306
DB_NAME=orangepig
DB_USER=your-db-user
DB_PASSWORD=your-db-password

JWT_SECRET=换个随机字符串
JWT_EXPIRES_IN=7d

WX_APPID=wx410b41aa977ff923
WX_SECRET=你的 AppSecret

SEED_DEMO=true                # 首次启动插入演示数据，正式使用建议 false
```

生产环境可以直接用命令行传，不落盘：

```bash
DB_HOST=xxx DB_PASSWORD='xxx!' JWT_SECRET=xxx WX_APPID=xxx WX_SECRET=xxx \
  docker compose up -d --build
```

## 访问地址

| 路径 | 说明 |
|------|------|
| `/` | 服务状态首页 |
| `/api/health` | 健康检查 |
| `/api/auth/login` | 微信登录 |
| `/api/babies` | 宝宝列表 / 新增 |
| `/api/records/*` | 喂养 / 尿片 / 睡眠记录 |
| `/api/stats/*` | 每日统计与趋势 |

## Rancher Ingress

服务器 80 端口被 Rancher 占用，Nginx 跑在 `NGINX_PORT`（默认 8080）：

- Rancher Ingress 绑定域名 → 转发到服务器 IP:8080
- SSL 证书由 Rancher Ingress 处理，Nginx 不再监听 443

## 常用命令

```bash
docker compose logs -f server    # 后端日志
docker compose logs -f nginx     # Nginx 日志
docker compose restart server    # 重启后端
docker compose down              # 停止
docker compose up -d --build     # 重新构建启动
```

## 微信小程序侧配置

在微信公众平台「开发管理 → 服务器域名」中加入你的域名（必须是 HTTPS）：

- request 合法域名：`https://your-domain.com`

小程序端接口地址在 `miniprogram/utils/config.js` 里改。
