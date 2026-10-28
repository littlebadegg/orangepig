#!/usr/bin/env bash
#
# 将后端镜像构建并推送到你的 Nexus 私服
# 用法: ./scripts/push-to-nexus.sh [tag]
#   tag 不传默认为 latest
#
# 探测结论 (registry.grindsword.top):
#   - Nexus 3.68 OSS, 使用 HTTP BASIC 认证 (用 Nexus 账号密码 docker login 即可)
#   - 80(HTTP) 与 443(HTTPS) 均为 Docker registry 端点
#   - 专用端口方式暴露, 镜像名需带 Nexus 里的 Docker 仓库名前缀
#   - 推荐用 443(HTTPS), 开箱即用; 若改用 80(HTTP), 本机 docker 需在
#     daemon.json 加 "insecure-registries": ["registry.grindsword.top"]
#
set -euo pipefail

# ===================== 配置：改成你实际的 =====================
NEXUS_HOST="registry.grindsword.top"
# 端口：留空即走默认 443 HTTPS（推荐，镜像名不带端口，与本机 keychain 凭证一致）
# 若用 HTTP 80 则填 "80"
NEXUS_PORT=""
# Nexus 里 Docker 仓库（repository）的名字 —— 改成你实际的！常见默认 docker-hosted
NEXUS_REPO="docker-hosted"
IMAGE_NAME="orangepig-server"
# =============================================================

TAG="${1:-latest}"

# 端口为空则镜像名不带端口（默认 443 HTTPS）
if [ -z "$NEXUS_PORT" ]; then
  REGISTRY="$NEXUS_HOST"
else
  REGISTRY="$NEXUS_HOST:$NEXUS_PORT"
fi
FULL_IMAGE="${REGISTRY}/${NEXUS_REPO}/${IMAGE_NAME}:${TAG}"

echo "▶ 构建镜像: ${FULL_IMAGE}"
# DOCKER_BUILDKIT=0: 回退传统 builder, 避免 buildx 在受限环境下更新 buildx/activity 被沙箱拦截
DOCKER_BUILDKIT=0 docker build -t "${FULL_IMAGE}" ./server

echo "▶ 登录 Nexus (用你的 Nexus 账号密码): ${REGISTRY}"
docker login "${REGISTRY}"

echo "▶ 推送镜像..."
docker push "${FULL_IMAGE}"

echo "✅ 完成: ${FULL_IMAGE}"
