# AuraStudio

珠宝行业 AI 图片生成平台

## 架构（安全）

```
浏览器 ──► Vite(/api 代理) ──► 本地 Node API(Hono) ──► fal.ai / VibraDraft MCP
                ▲                      ▲
           无密钥、无直连           .env.local 存密钥
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

## 脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | 前端 + API |
| `npm run dev:web` | 仅 Vite |
| `npm run dev:api` | 仅 API `:8787` |
