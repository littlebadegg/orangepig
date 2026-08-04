# 橙猪小程序 — 生产部署指南

## 问题根因

`.env` 文件被 `.gitignore` 忽略，`git clone` 到服务器后不存在此文件，Docker 容器拿不到 `DB_HOST` 等环境变量，默认用 `localhost` 导致 `connect ECONNREFUSED ::1:3306`。

## 部署步骤

### 1. 拉取代码
```bash
git clone git@github.com:littlebadegg/orangepig.git
cd orangepig
```

### 2. 创建 .env 文件
```bash
cp .env.example .env
vi .env
```

填入生产环境配置：
```env
DOMAIN=your-domain.com
NGINX_PORT=8080

DB_HOST=rds.grindsword.top
DB_PORT=3306
DB_NAME=orangepig
DB_USER=laiju2022
DB_PASSWORD=2022richdaybyday!

JWT_SECRET=your-super-secret-key-change-me
JWT_EXPIRES_IN=7d

WX_APPID=wx410b41aa977ff923
WX_SECRET=f30a1fbb05d302977853c66a370bcd85

STATIC_BASE_URL=http://your-domain.com
MAX_FILE_SIZE=15728640
```

### 3. 一键部署
```bash
chmod +x deploy.sh
./deploy.sh
```

脚本会自动：检查 .env → 确认配置 → docker compose up -d --build → 健康检查

### 4. 手动部署（不用脚本）
```bash
docker compose up -d --build
```

## Rancher Ingress 配置

服务器 80 端口被 Rancher 占用，Nginx 运行在 8080 端口：

- Rancher Ingress 域名 → 转发到服务器 IP:8080
- Nginx 8080 → /api/ 代理到 Node.js:3000，/uploads/ 直接服务静态文件
- SSL 由 Rancher Ingress 处理

## 常用命令
```bash
docker compose logs -f server    # 查看后端日志
docker compose logs -f nginx     # 查看 Nginx 日志
docker compose restart server    # 重启后端
docker compose down              # 停止所有服务
docker compose up -d --build     # 重新构建并启动
```
