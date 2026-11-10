#!/bin/bash
# ============================================================
# 本地测试脚本（不依赖 Docker）
# 直接 node 启动后端 + 跑冒烟测试；Docker 只用于线上部署
#
# 用法：
#   ./scripts/dev-test.sh                # 跑默认冒烟（v14 + v13 + v9）
#   ./scripts/dev-test.sh v14            # 只跑指定版本
#   ./scripts/dev-test.sh v14 v12        # 跑多个指定版本
#   KEEP=1 ./scripts/dev-test.sh         # 测完保留本地服务（方便联调）
#   ADMIN_PASSWORD=xxx ./scripts/dev-test.sh v12   # 需要后台口令的冒烟
# ============================================================
set -e
cd "$(dirname "$0")/.."   # 仓库根目录
SERVER_DIR="$PWD/server"

# ---- 0. 本地请求不走系统代理（避免 HTTP_PROXY 把 127.0.0.1 的请求转发出去）----
export NO_PROXY="127.0.0.1,localhost"
export no_proxy="127.0.0.1,localhost"

SMOKE_VERSIONS=("${@:-v14 v13 v9}")

# ---- 1. 检查 3000 端口是否已有服务 ----
PID=$(lsof -nP -iTCP:3000 -sTCP:LISTEN 2>/dev/null | awk 'NR>1{print $2}' | head -1)
STARTED_HERE=0
if [ -n "$PID" ]; then
  echo "== 复用已在运行的本地服务 (pid $PID) =="
else
  echo "== 启动本地测试服务（node，无 Docker）=="
  # 环境变量优先级高于 server/.env；ADMIN_PASSWORD 为空则后台功能关闭
  # 服务作为本脚本的子进程运行（随脚本退出而停止），KEEP=1 时改为脱离运行
  cd "$SERVER_DIR"
  if [ "$KEEP" = "1" ]; then
    nohup node app.js > /tmp/orangepig-dev.log 2>&1 &
    echo $! > /tmp/orangepig-dev.pid
  else
    node app.js > /tmp/orangepig-dev.log 2>&1 &
    SERVER_PID=$!
    trap 'kill $SERVER_PID 2>/dev/null' EXIT
  fi
  cd - > /dev/null
  STARTED_HERE=1
fi

# ---- 2. 等服务就绪（首启要连远程库同步表结构，可能较慢）----
echo -n "== 等待服务就绪 "
READY=0
for i in $(seq 1 40); do
  if curl -4 -s -o /dev/null --max-time 3 --noproxy '*' http://127.0.0.1:3000/admin/ 2>/dev/null; then
    READY=1; break
  fi
  echo -n "."
  sleep 2
done
echo ""
if [ "$READY" != "1" ]; then
  echo "❌ 服务 60 秒内未就绪，查看日志：tail -50 /tmp/orangepig-dev.log"
  exit 1
fi
echo "== 服务已就绪 =="

# ---- 3. 依次跑冒烟（必须在 server 目录运行，dotenv 才能读到 server/.env）----
FAIL=0
cd "$SERVER_DIR"
for v in $SMOKE_VERSIONS; do
  SCRIPT="$SERVER_DIR/scripts/smoke-$v.js"
  if [ ! -f "$SCRIPT" ]; then
    echo "⚠️  找不到 $SCRIPT，跳过"; continue
  fi
  echo ""
  echo "===== 冒烟 smoke-$v ====="
  if ! node "$SCRIPT"; then
    FAIL=1
    echo "❌ smoke-$v 失败"
  fi
done

# ---- 4. 收尾 ----
if [ "$STARTED_HERE" = "1" ] && [ "$KEEP" != "1" ]; then
  echo "== 已停止本地测试服务 =="
elif [ "$KEEP" = "1" ]; then
  echo "== 服务保留运行中（http://127.0.0.1:3000），日志 /tmp/orangepig-dev.log =="
fi

if [ "$FAIL" = "1" ]; then
  echo ""; echo "❌ 有冒烟测试未通过"; exit 1
fi
echo ""; echo "✅ 本地测试全部通过（未使用 Docker）"
