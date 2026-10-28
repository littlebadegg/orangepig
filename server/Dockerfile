# ---- Build stage ----
FROM node:18-alpine AS builder

WORKDIR /app

# 先复制依赖描述文件，利用 Docker 层缓存
COPY package.json package-lock.json ./

# 安装全部依赖（含 devDependencies，用于后续可能的构建步骤）
RUN npm ci

# 复制源码
COPY . .

# ---- Production stage ----
FROM node:18-alpine AS production

WORKDIR /app

# 时区设置为中国时区（放在最前面，独立成层 —— 不受源码变更影响，永远走缓存）
RUN apk add --no-cache tzdata && \
    cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime && \
    echo "Asia/Shanghai" > /etc/timezone

# 安装生产依赖
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# 复制源码
COPY --from=builder /app ./

# 创建上传目录
RUN mkdir -p uploads

ENV NODE_ENV=production
ENV TZ=Asia/Shanghai

EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["node", "app.js"]
