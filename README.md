# AuraStudio

珠宝行业 AI 图片生成平台

## 架构（安全）

```
浏览器 ──► Vite/Nginx(/api) ──► Node API(Hono) ──► fal.ai / VibraDraft MCP
   │                                │
HttpOnly 会话 Cookie          SQLite 用户/会话 + .env.local 密钥
```

密钥**只存在服务端**，浏览器永远不直连第三方 API。

## 快速开始

```bash
npm install
copy .env.example .env.local
npm run dev
```

## 配置 VibraDraft MCP

编辑 `.env.local`：

```env
AI_PROVIDER=vibradraft
VIBRADRAFT_MCP_URL=https://aigc.chowtaifook.com/mcp
VIBRADRAFT_MCP_TOKEN=你的_Bearer_Token（不要带 Bearer 前缀也可以）
# 默认 GPT-Image-2
VIBRADRAFT_MODEL_ID=gpt-image-2.0
PORT=8787
```

> 请使用 **https**。该主机 HTTP:80 通常不可用。

重启 `npm run dev` 后，顶栏应显示 **VibraDraft**。

| `AI_PROVIDER` | 行为 |
|---------------|------|
| `demo` | 服务端模拟图，无需密钥 |
| `fal` | 服务端调用 fal.ai FLUX |
| `vibradraft` | 服务端调用 VibraDraft MCP（文生图 / 图生图） |

## 功能

- 文生图 / 参考图生图（多张上传）
- 作品库本地保存
- Provider 状态徽章
- 账号密码登录、首次强制改密和安全会话
- 管理员用户管理、角色、禁用与密码重置

## 登录与用户管理

用户和会话保存在 `.storage/aurastudio.db`。首次启动且数据库为空时，
服务端会创建 `admin` 管理员，并在服务端日志中仅输出一次临时密码。
首次登录后必须修改密码。

```env
SQLITE_PATH=.storage/aurastudio.db
SESSION_TTL_DAYS=14
ADMIN_USERNAME=admin
# 可留空，由服务端首次启动时生成强随机临时密码
ADMIN_INITIAL_PASSWORD=
# 完成 HTTPS 配置后设为 true
AUTH_COOKIE_SECURE=false
```

生产环境必须配置 HTTPS，再将 `AUTH_COOKIE_SECURE=true`。

## 脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | 前端 + API |
| `npm run dev:web` | 仅 Vite |
| `npm run dev:api` | 仅 API `:8787` |
| `npm run start:api` | 生产环境启动 API |

## 腾讯云应用服务器部署

适用于 Ubuntu 22.04/24.04。脚本会自动安装 Node.js 22、Nginx、PM2，
拉取 `main` 分支、构建前端、启动 API 并配置反向代理。

### 首次部署

SSH 登录服务器后，以普通用户运行（不要使用 `sudo bash`）：

```bash
curl -fsSL https://raw.githubusercontent.com/jayhong2023/Aura_AI_Studio/main/deploy/tencent-cloud/deploy.sh | bash
```

首次执行会创建 `/var/www/Aura_AI_Studio/.env.local` 并暂停。填写真实配置：

```bash
nano /var/www/Aura_AI_Studio/.env.local
```

至少配置：

```env
AI_PROVIDER=vibradraft
VIBRADRAFT_MCP_URL=https://aigc.chowtaifook.com/mcp
VIBRADRAFT_MCP_TOKEN=你的Token
VIBRADRAFT_MODEL_ID=gpt-image-2.0
PORT=8787
SQLITE_PATH=.storage/aurastudio.db
SESSION_TTL_DAYS=14
AUTH_COOKIE_SECURE=false
```

然后重新执行：

```bash
bash /var/www/Aura_AI_Studio/deploy/tencent-cloud/deploy.sh
```

使用域名时：

```bash
DOMAIN=studio.example.com bash /var/www/Aura_AI_Studio/deploy/tencent-cloud/deploy.sh
```

### 腾讯云安全组

放行 TCP `22`、`80`，启用 HTTPS 后再放行 `443`。不要开放 `8787`，
该端口只供服务器本机 Nginx 访问。

### HTTPS（有域名时）

域名解析到服务器公网 IP 后执行：

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d studio.example.com
```

### 更新版本

以后代码推送到 GitHub 后，只需再次运行：

```bash
bash /var/www/Aura_AI_Studio/deploy/tencent-cloud/deploy.sh
```

### 运维命令

```bash
pm2 status
pm2 logs aurastudio-api
curl http://127.0.0.1:8787/api/health
sudo nginx -t
```
