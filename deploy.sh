#!/bin/bash
# ============================================================
# 橙猪小程序 — 生产服务器一键部署脚本
# ============================================================
# 用法：
#   1. git clone git@github.com:littlebadegg/orangepig.git
#   2. cd orangepig
#   3. chmod +x deploy.sh
#   4. ./deploy.sh
# ============================================================

set -e

echo "🐷 橙猪小程序部署脚本"
echo "========================"

# 检查 .env 是否存在
if [ ! -f .env ]; then
  echo ""
  echo "⚠️  未找到 .env 文件，正在从 .env.example 创建..."
  cp .env.example .env
  echo ""
  echo "❌ 请先编辑 .env 文件，填入生产环境的数据库和微信配置！"
  echo "   vi .env"
  echo ""
  echo "必填项："
  echo "   DOMAIN       — 你的域名（如 api.yourdomain.com）"
  echo "   DB_HOST      — 数据库地址"
  echo "   DB_PASSWORD  — 数据库密码"
  echo "   JWT_SECRET   — JWT 密钥（随机字符串）"
  echo "   WX_APPID     — 微信小程序 AppID"
  echo "   WX_SECRET    — 微信小程序 AppSecret"
  echo ""
  echo "填好后重新运行：./deploy.sh"
  exit 1
fi

# 检查必填项
MISSING=""
grep -q "^DB_HOST=your-db-host" .env && MISSING="$MISSING DB_HOST"
grep -q "^DB_PASSWORD=your-db-password" .env && MISSING="$MISSING DB_PASSWORD"
grep -q "^JWT_SECRET=your-random-secret-key" .env && MISSING="$MISSING JWT_SECRET"

if [ -n "$MISSING" ]; then
  echo "❌ .env 中还有未填写的占位符：$MISSING"
  echo "   请编辑 .env 填入真实值后重新运行：./deploy.sh"
  exit 1
fi

echo "✅ .env 配置检查通过"

# 显示关键配置（密码脱敏）
echo ""
echo "📋 当前配置："
echo "   DOMAIN:       $(grep ^DOMAIN= .env | cut -d= -f2)"
echo "   NGINX_PORT:   $(grep ^NGINX_PORT= .env | cut -d= -f2 || echo '8080')"
echo "   DB_HOST:      $(grep ^DB_HOST= .env | cut -d= -f2)"
echo "   DB_NAME:      $(grep ^DB_NAME= .env | cut -d= -f2)"
echo "   DB_USER:      $(grep ^DB_USER= .env | cut -d= -f2)"
echo "   DB_PASSWORD:  ******"
echo ""

# 确认
read -p "确认以上配置正确？(y/N) " confirm
if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
  echo "已取消"
  exit 0
fi

echo ""
echo "🚀 开始构建和启动..."
docker compose down 2>/dev/null || true
docker compose up -d --build

echo ""
echo "⏳ 等待服务启动..."
sleep 5

# 检查容器状态
echo ""
echo "📦 容器状态："
docker compose ps

# 健康检查
echo ""
echo "🔍 健康检查..."
NGINX_PORT=$(grep ^NGINX_PORT= .env | cut -d= -f2 || echo "8080")
DOMAIN=$(grep ^DOMAIN= .env | cut -d= -f2)

HEALTH_URL="http://localhost:${NGINX_PORT}/api/health"
echo "   检查: $HEALTH_URL"

RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL" 2>/dev/null || echo "000")

if [ "$RESPONSE" = "200" ]; then
  echo "   ✅ 服务正常运行！"
  echo ""
  echo "🎉 部署成功！"
  echo ""
  echo "   访问地址: http://${DOMAIN}:${NGINX_PORT}"
  echo "   API 地址: http://${DOMAIN}:${NGINX_PORT}/api"
  echo "   健康检查: http://${DOMAIN}:${NGINX_PORT}/api/health"
  echo ""
  echo "   如果通过 Rancher Ingress 代理，配置转发到 ${NGINX_PORT} 端口即可。"
else
  echo "   ❌ 健康检查失败 (HTTP $RESPONSE)"
  echo ""
  echo "   查看日志："
  echo "   docker compose logs server"
  echo "   docker compose logs nginx"
fi
