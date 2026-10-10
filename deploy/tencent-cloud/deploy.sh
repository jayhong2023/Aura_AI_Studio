#!/usr/bin/env bash
set -Eeuo pipefail

REPO_URL="${REPO_URL:-https://github.com/jayhong2023/Aura_AI_Studio.git}"
APP_DIR="${APP_DIR:-/var/www/Aura_AI_Studio}"
DOMAIN="${DOMAIN:-_}"
NGINX_SITE="aurastudio"
NODE_MAJOR="${NODE_MAJOR:-22}"

log() {
  printf '\n\033[1;32m[AuraStudio]\033[0m %s\n' "$1"
}

if ! command -v sudo >/dev/null 2>&1; then
  echo "缺少 sudo，请使用 Ubuntu 普通用户执行该脚本。"
  exit 1
fi

if [ "$EUID" -eq 0 ]; then
  echo "请使用 Ubuntu 普通用户执行，不要使用 sudo bash；脚本会在需要时自行调用 sudo。"
  exit 1
fi

log "安装系统依赖"
sudo apt-get update
sudo apt-get install -y ca-certificates curl git nginx gettext-base

if ! command -v node >/dev/null 2>&1 || [ "$(node -p 'Number(process.versions.node.split(`.`)[0])')" -lt "$NODE_MAJOR" ]; then
  log "安装 Node.js ${NODE_MAJOR}"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | sudo -E bash -
  sudo apt-get install -y nodejs
fi

if ! command -v pm2 >/dev/null 2>&1; then
  log "安装 PM2"
  sudo npm install -g pm2
fi

log "同步项目代码"
sudo mkdir -p "$APP_DIR"
sudo chown -R "$USER":"$USER" "$APP_DIR"

if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" fetch origin main
  git -C "$APP_DIR" checkout main
  git -C "$APP_DIR" pull --ff-only origin main
else
  git clone --branch main "$REPO_URL" "$APP_DIR"
fi

cd "$APP_DIR"

if [ ! -f .env.local ]; then
  cp .env.example .env.local
  chmod 600 .env.local
  cat <<EOF

已创建 $APP_DIR/.env.local。
请先填写 VIBRADRAFT_MCP_TOKEN 等真实配置，然后重新运行：

  bash $APP_DIR/deploy/tencent-cloud/deploy.sh

EOF
  exit 2
fi

log "安装依赖并构建前端"
npm ci
npm run build
mkdir -p .storage/generated

log "启动或重载 Node API"
pm2 startOrReload ecosystem.config.cjs --env production
pm2 save
sudo env "PATH=$PATH" pm2 startup systemd -u "$USER" --hp "$HOME" >/dev/null || true
pm2 save

log "配置 Nginx"
export APP_DIR DOMAIN
envsubst '${APP_DIR} ${DOMAIN}' \
  < deploy/tencent-cloud/nginx.conf.template \
  | sudo tee "/etc/nginx/sites-available/$NGINX_SITE" >/dev/null
sudo ln -sfn \
  "/etc/nginx/sites-available/$NGINX_SITE" \
  "/etc/nginx/sites-enabled/$NGINX_SITE"
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl enable --now nginx
sudo systemctl reload nginx

log "检查服务"
sleep 2
curl --fail --silent --show-error http://127.0.0.1:8787/api/status
printf '\n'

cat <<EOF

部署完成。
访问地址：http://${DOMAIN/_/服务器公网IP}

腾讯云安全组需要放行：
  - TCP 22（SSH）
  - TCP 80（HTTP）
  - TCP 443（配置 HTTPS 后使用）

常用命令：
  pm2 status
  pm2 logs aurastudio-api
  sudo nginx -t

EOF
