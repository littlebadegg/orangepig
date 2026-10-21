# 🍼 橙猪宝宝记

宝宝喂养记录小程序 —— 一键记录喂奶、换尿片、睡觉、排气操、身高体重、体温，自动生成每日统计与趋势。

## 功能

| 模块 | 说明 |
|------|------|
| **一键记录** | 六个大按钮：喂奶（奶粉记毫升 / 母乳记时长）、换尿片（小便 / 大便 / 都有）、睡觉（点一下开始，再点一下起床，自动算时长）、排气操（时长 + 有没有排气）、身高体重（可只填一项）、体温（耳温 / 额温 / 腋温，自动判发烧） |
| **今日时间线** | 按时间倒序列出今天所有记录，支持删除 |
| **统计** | 今日总奶量、喂养次数、大小便次数、睡眠总时长、排气操次数与时长、最新体温（分级提示）、最近身高体重 + 近 7 天奶量柱状趋势 |
| **多宝宝** | 支持添加多个宝宝，随时切换 |
| **补录** | 记录时默认当前时间，可改成任意时间补记 |

## 技术栈

- **小程序端**：原生微信小程序（WXML / WXSS / JS），主包三个页面，`requireComponents` 按需注入
- **后端**：Node.js 18 + Express + Sequelize（MySQL）
- **鉴权**：`wx.login` 换 openid → 签发 JWT
- **部署**：Docker Compose（Node.js + Nginx 反向代理）

## 项目结构

```
├── docker-compose.yml          # 一键部署编排
├── deploy.sh                   # 生产服务器部署脚本
├── .env.example                # 环境变量模板
├── nginx/                      # Nginx 反向代理配置
│   ├── nginx.conf
│   └── conf.d/orangepig.conf.template   # 启动时 envsubst 注入域名
├── server/                     # 后端
│   ├── app.js
│   ├── init-db.js              # 手动初始化（一般不用，启动会自动建表）
│   ├── config/index.js
│   ├── models/index.js         # User / Baby / Feeding / Diaper / Sleep / Exercise / Growth / Temperature
│   ├── routes/
│   │   ├── auth.js             # 微信登录、用户资料
│   │   ├── babies.js           # 宝宝 CRUD、切换
│   │   ├── records.js          # 喂养 / 尿片 / 睡眠 / 排气操 / 身高体重 / 体温 / 时间线
│   │   └── stats.js            # 每日统计、趋势
│   ├── utils/
│   │   ├── baby.js             # 宝宝解析（参数 → 当前选中 → 第一个）
│   │   ├── db-init.js          # 启动自动建表 + 演示数据
│   │   ├── time.js             # 东八区时间处理
│   │   └── wechat.js           # code2session、内容安全
│   └── middleware/
└── miniprogram/                # 小程序端
    ├── app.js / app.json / app.wxss
    ├── pages/
    │   ├── record/             # 记录 + 今日时间线
    │   ├── stats/              # 统计
    │   └── mine/               # 宝宝管理
    ├── services/               # baby.js / record.js
    ├── utils/                  # request.js / config.js / format.js
    └── images/tab/             # tabBar 图标
```

## 数据模型

| 表 | 关键字段 |
|----|---------|
| `users` | openid、nickName、currentBabyId |
| `babies` | userId、name、gender、birthday |
| `feeding_records` | babyId、type（formula/breast）、amount（ml）、duration（分钟）、time |
| `diaper_records` | babyId、type（pee/poo/both）、time |
| `sleep_records` | babyId、startTime、endTime、duration、recordStatus（0 进行中 / 1 已完成） |

所有删除都是软删除（`status = 0`）。

## 本地开发

```bash
# 1. 配置环境变量
cp .env.example .env
vi .env          # 填入数据库和微信配置

# 2. 启动后端（自动建表 + 演示数据）
cd server
npm install
node app.js      # 监听 3000

# 3. 小程序
# 微信开发者工具打开 miniprogram 目录
# 勾选「不校验合法域名、web-view、TLS 版本」
```

接口地址在 `miniprogram/utils/config.js`，本地默认 `http://localhost:8080/api`（走 Docker 的 Nginx），
直接跑 `node app.js` 时改成 `http://localhost:3000/api`。

## 生产部署

见 [DEPLOY.md](./DEPLOY.md)，核心就三步：

```bash
cp .env.example .env && vi .env
docker compose up -d --build
```

服务启动时会自动建库建表，首次运行插入一个演示宝宝「小橙子」和今天的几条示例记录。
正式使用把 `.env` 里的 `SEED_DEMO` 设为 `false`。

## API

统一响应格式 `{ code, message, data }`，`code === 0` 为成功。除登录外都需要在 Header 带 `Authorization: Bearer <token>`。

```
POST   /api/auth/login              微信登录 { code }
GET    /api/auth/me                 当前用户
GET    /api/babies                  宝宝列表（含 currentBabyId）
POST   /api/babies                  添加宝宝 { name, gender, birthday }
PUT    /api/babies/:id              编辑
DELETE /api/babies/:id              删除
POST   /api/babies/:id/select       切换当前宝宝

POST   /api/records/feeding         记喂养 { babyId, type, amount|duration, time }
POST   /api/records/diaper          记尿片 { babyId, type: pee|poo|both, time }
POST   /api/records/sleep/start     开始睡觉 { babyId }
POST   /api/records/sleep/end       起床     { babyId, id }
POST   /api/records/sleep           补录一段 { babyId, startTime, endTime }
POST   /api/records/exercise        记排气操 { babyId, duration, result, time }
POST   /api/records/growth          记身高体重 { babyId, height, weight, time }
POST   /api/records/temperature     记体温 { babyId, temperature, method, time }
GET    /api/records/timeline        时间线   ?babyId=&date=
DELETE /api/records/:type/:id       删除记录
                                    type: feeding|diaper|sleep|exercise|growth|temperature

GET    /api/stats/daily             今日概览 ?babyId=&date=
GET    /api/stats/trend             近 N 天  ?babyId=&days=7
```

`babyId` 可以省略 —— 后端会自动取当前用户选中的宝宝，没有的话取第一个。

## 上线前清单

- [ ] `.env` 里的 `JWT_SECRET` 换成随机字符串
- [ ] `SEED_DEMO=false`
- [ ] `miniprogram/utils/config.js` 的 `prod.baseUrl` 改成正式域名（HTTPS）
- [ ] 微信公众平台配置 request 合法域名
- [ ] AppID 换成自己的
