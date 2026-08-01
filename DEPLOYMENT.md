# 橙猪小程序 — 运行、预览、部署完整指南

## 架构说明

本项目采用 **前后端分离** 架构：

| 层      | 技术栈                       | 目录                                          |
| ------ | ------------------------- | ------------------------------------------- |
| 小程序前端  | 原生微信小程序                   | `miniprogram/` + `miniprogram/subpackages/` |
| 后端 API | Node.js + Express + MySQL | `server/`                                   |
| 图片存储   | 服务器本地文件（生产建议换 OSS/COS）    | `server/uploads/`                           |

---

## 前置准备

### 1. 注册微信小程序账号

- 访问 <https://mp.weixin.qq.com/>
- 点击「立即注册」→ 选择「小程序」
- 完成邮箱激活、主体认证（个人或企业）
- 在「开发管理 → 开发设置」页面找到 **AppID** 和 **AppSecret**

### 2. 安装微信开发者工具

- 下载地址：<https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html>
- 选择 **稳定版 Stable Build**
- 安装后用注册小程序的微信扫码登录

### 3. 安装 Node.js 和 MySQL

```bash
# Node.js (v18+)
node -v

# MySQL (v8.0+)
# macOS: brew install mysql
# Ubuntu: sudo apt install mysql-server
# 或使用 Docker: docker run -d -p 3306:3306 -e MYSQL_ROOT_PASSWORD=yourpassword mysql:8
mysql --version
```

---

## 本地运行

### 第一步：启动后端服务

```bash
cd server

# 安装依赖
npm install

# 配置环境变量
cp .env.example .env

# 编辑 .env，填入数据库和微信配置
# DB_HOST=localhost
# DB_PORT=3306
# DB_NAME=orangepig
# DB_USER=root
# DB_PASSWORD=你的MySQL密码
# WX_APPID=你的小程序AppID
# WX_SECRET=你的小程序AppSecret

# 初始化数据库（创建数据库 + 建表 + 测试数据）npm
npm run init-db

# 启动服务
npm run dev
```

启动成功后会看到：

```
[DB] MySQL connected
[DB] Tables synced (dev mode)
[Server] running at http://localhost:3000
[Server] API base: http://localhost:3000/api
```

验证服务是否正常：

```bash
curl http://localhost:3000/api/health
# 返回: {"code":0,"message":"ok","data":{"status":"ok","timestamp":...}}
```

### 第二步：配置小程序前端

1. 打开微信开发者工具
2. 点击左侧「小程序」→ 右上角「+」号
3. 项目目录：选择 `/Users/yaoyuqi/WorkBuddy/orangepig` 文件夹
4. AppID：填入你注册的小程序 AppID
5. 点击「确定」

修改前端配置：

**`project.config.json`** — 替换 appid：

```json
"appid": "你的真实AppID"
```

**`miniprogram/utils/config.js`** — 确认 API 地址（开发环境默认 localhost）：

```js
dev: {
  baseUrl: 'http://localhost:3000/api',
  uploadUrl: 'http://localhost:3000/api/upload/image',
}
```

> 本地开发时 `urlCheck` 已设为 `false`，允许访问 localhost。

### 第三步：编译预览

1. 点击工具栏「编译」按钮（或 Cmd+B）
2. 左侧模拟器会显示小程序界面
3. 首页会显示骨架屏 → 加载完成后显示 Feed 列表（首次有测试数据）
4. 点击发布按钮测试完整流程

### 第四步：真机预览

1. 点击工具栏「预览」按钮
2. 生成二维码，用手机微信扫码
3. 在手机上体验完整小程序

> 真机预览时，手机和电脑需在同一局域网，且 `config.js` 中的 `baseUrl` 要改成电脑的局域网 IP（如 `http://192.168.1.100:3000/api`）

---

## 后端 API 接口一览

| 方法   | 路径                        | 说明        | 鉴权 |
| ---- | ------------------------- | --------- | -- |
| POST | `/api/auth/login`         | 微信登录      | 否  |
| POST | `/api/auth/profile`       | 更新用户资料    | 是  |
| GET  | `/api/auth/me`            | 获取当前用户信息  | 是  |
| GET  | `/api/posts/feed`         | 首页 Feed 流 | 可选 |
| GET  | `/api/posts/:id`          | 内容详情      | 可选 |
| POST | `/api/posts`              | 发布内容      | 是  |
| GET  | `/api/posts/search`       | 搜索内容      | 否  |
| GET  | `/api/posts/user`         | 用户发布列表    | 否  |
| POST | `/api/posts/:id/like`     | 点赞        | 是  |
| POST | `/api/posts/:id/unlike`   | 取消点赞      | 是  |
| GET  | `/api/posts/:id/comments` | 评论列表      | 否  |
| POST | `/api/posts/:id/comments` | 发表评论      | 是  |
| GET  | `/api/users/info`         | 用户信息      | 否  |
| POST | `/api/users/profile`      | 更新资料      | 是  |
| POST | `/api/users/:id/follow`   | 关注        | 是  |
| POST | `/api/users/:id/unfollow` | 取消关注      | 是  |
| GET  | `/api/users/follow-list`  | 关注/粉丝列表   | 否  |
| POST | `/api/upload/image`       | 上传图片      | 是  |

### 统一响应格式

```json
{
  "code": 0,
  "message": "ok",
  "data": { ... }
}
```

- `code: 0` 表示成功，非 0 表示业务错误
- 401 状态码表示 token 过期，前端会自动重新登录重试

---

## 数据库表结构

MySQL 表由 Sequelize 自动创建（`npm run init-db` 或开发模式启动时自动 sync）。

| 表名         | 说明    | 关键字段                                                                               |
| ---------- | ----- | ---------------------------------------------------------------------------------- |
| `users`    | 用户    | openid(唯一), nick_name, avatar_url, following_count, followers_count                |
| `posts`    | 内容/帖子 | author_id(→users), content, images(JSON), like_count, comment_count                |
| `comments` | 评论    | post_id(→posts), author_id(→users), content, reply_to_user_id, reply_to_comment_id |
| `likes`    | 点赞    | user_id, target_id, target_type(post/comment)，唯一索引防重复                              |
| `follows`  | 关注关系  | follower, following，唯一索引防重复                                                        |

---

## 部署上线

### 后端部署

#### 方案一：自有服务器（推荐中小项目初期）

```bash
# 1. 在服务器上安装 Node.js 和 MySQL
# 2. 上传 server/ 目录
# 3. 安装依赖
cd server && npm install --production

# 4. 配置 .env（生产环境）
PORT=3000
DB_HOST=localhost
DB_PORT=3306
DB_NAME=orangepig
DB_USER=root
DB_PASSWORD=你的MySQL密码
JWT_SECRET=一个足够长的随机字符串
WX_APPID=你的AppID
WX_SECRET=你的AppSecret
STATIC_BASE_URL=https://your-domain.com

# 5. 初始化数据库
npm run init-db

# 6. 用 PM2 管理进程
npm install -g pm2
pm2 start app.js --name orangepig-server
pm2 save
pm2 startup  # 开机自启
```

#### 方案二：Docker 部署

```dockerfile
# server/Dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 3000
CMD ["node", "app.js"]
```

```yaml
# docker-compose.yml
version: '3'
services:
  server:
    build: ./server
    ports:
      - "3000:3000"
    environment:
      - DB_HOST=mysql
      - DB_PORT=3306
      - DB_NAME=orangepig
      - DB_USER=root
      - DB_PASSWORD=yourpassword
      - JWT_SECRET=your-secret
      - WX_APPID=your-appid
      - WX_SECRET=your-secret
      - NODE_ENV=production
    depends_on:
      - mysql
  mysql:
    image: mysql:8
    environment:
      - MYSQL_ROOT_PASSWORD=yourpassword
      - MYSQL_DATABASE=orangepig
    volumes:
      - mysql-data:/var/lib/mysql
    ports:
      - "3306:3306"
    command: --character-set-server=utf8mb4 --collation-server=utf8mb4_unicode_ci

volumes:
  mysql-data:
```

#### Nginx 反向代理（HTTPS + 域名）

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate     /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    # API 代理
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # 图片静态文件
    location /uploads/ {
        alias /path/to/server/uploads/;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
```

### 小程序配置

后端部署完成后，需要配置微信后台和前端：

#### 1. 微信公众平台配置域名

登录 <https://mp.weixin.qq.com/> → 开发管理 → 开发设置 → 服务器域名：

| 类型              | 域名                        |
| --------------- | ------------------------- |
| request 合法域名    | `https://your-domain.com` |
| uploadFile 合法域名 | `https://your-domain.com` |

> 必须是 HTTPS，不能用 IP

#### 2. 修改前端配置

**`miniprogram/utils/config.js`**：

```js
prod: {
  baseUrl: 'https://your-domain.com/api',
  uploadUrl: 'https://your-domain.com/api/upload/image',
}
```

**`project.config.json`**：

```json
"urlCheck": true   // 上线前改回 true，确保域名已配置
```

### 小程序发布

1. 点击开发者工具「上传」→ 填版本号
2. 登录 mp.weixin.qq.com → 管理版本管理 → 提交审核
3. 审核通过后点「发布」

---

## 生产环境优化建议

| 项目        | 说明                                  |
| --------- | ----------------------------------- |
| **图片存储**  | 服务器本地存储不适合大规模，建议接入腾讯云 COS / 阿里云 OSS |
| **数据库索引** | 已创建基础索引，大数据量后需要优化查询                 |
| **缓存**    | Feed 流可加 Redis 缓存热点数据               |
| **CDN**   | 图片通过 CDN 加速，提升加载速度                  |
| **日志收集**  | 接入日志服务，监控错误和性能                      |
| **进程守护**  | 用 PM2 管理进程，自动重启                     |
| **HTTPS** | 必须使用 HTTPS，可用 Let's Encrypt 免费证书    |
| **数据库备份** | 配置 MySQL 定时备份（mysqldump + crontab）  |

---

## 常见问题

### Q: 后端启动报 MySQL 连接失败

A: 确认 MySQL 已启动：`mysql -u root -p`，或用 Docker：`docker run -d -p 3306:3306 -e MYSQL_ROOT_PASSWORD=yourpassword mysql:8`。检查 `.env` 中的 `DB_HOST`、`DB_PORT`、`DB_USER`、`DB_PASSWORD` 是否正确。

### Q: 数据库表没创建

A: 运行 `npm run init-db` 初始化数据库和表结构，或确保开发模式启动（`npm run dev`）时会自动 sync。

### Q: 小程序请求报 `request:fail url not in domain list`

A: 本地开发确认 `urlCheck: false`；真机/线上需在微信后台配置 request 合法域名

### Q: 登录失败，提示「微信登录失败」

A: 检查 `.env` 中的 `WX_APPID` 和 `WX_SECRET` 是否正确，与小程序后台一致

### Q: 图片上传返回 401

A: 上传接口需要登录，确认前端 `request.js` 中 `uploadFile` 方法携带了 Authorization header

### Q: 真机预览无法访问后端

A: 手机和电脑需在同一局域网，`config.js` 中的 `baseUrl` 要改成电脑局域网 IP，不能用 localhost

### Q: 审核被拒

A: 最常见原因：缺少隐私协议页面、UGC 内容未接入安全检测。本项目已集成 msgSecCheck/imgSecCheck，需额外补充隐私协议页面
