# AuraStudio 嵌入式 SDK 接入文档

将珠宝 AI 创作能力嵌入第三方 **H5**（iframe + JS SDK）或 **微信小程序**（web-view）。最终用户免登录，由宿主后端用 AppId/Secret 签名换取一次性票据。

## 1. 创建接入应用

1. 管理员登录 `https://你的域名/admin/` → **接入应用** → **新建应用**
2. 填写：应用名称、允许嵌入的域名（H5 iframe 用，如 `https://shop.example.com`）、可选 Webhook、每日出图额度
3. **立即保存 AppSecret**（只显示一次）

## 2. 签名算法

宿主后端请求换票接口时携带：

| Header | 说明 |
|--------|------|
| `X-Aura-AppId` | 应用 ID |
| `X-Aura-Timestamp` | 毫秒时间戳，与服务器偏差 ≤ 5 分钟 |
| `X-Aura-Signature` | `HMAC-SHA256(secret, timestamp + "\\n" + rawBody)` 的 **hex** |

```js
// Node.js 示例
import crypto from 'node:crypto'

function sign(secret, timestamp, body) {
  return crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}\n${body}`)
    .digest('hex')
}
```

## 3. 换取票据

`POST /api/embed/v1/tickets`

```json
{ "externalUserId": "用户在宿主系统中的唯一 ID", "displayName": "可选" }
```

成功返回：

```json
{
  "ok": true,
  "ticket": "tkt_...",
  "expiresAt": 1710000000000,
  "embedUrl": "/embed/?appId=app_xxx&ticket=tkt_..."
}
```

票据 **一次性**，5 分钟内有效。

## 4. H5：JS SDK

```html
<div id="aura"></div>
<script src="https://你的域名/sdk/aura-embed.js"></script>
<script>
  const studio = AuraStudio.mount('#aura', {
    appId: 'app_xxx',
    baseUrl: 'https://你的域名',
    getTicket: async () => {
      // 必须调你自己的后端，不要把 Secret 暴露到前端
      const r = await fetch('/api/aura-ticket')
      const d = await r.json()
      return d.ticket
    },
    onGenerated: ({ jobId, images, prompt }) => {
      console.log('生成完成', images)
    },
    onError: (e) => console.error(e.message),
  })
  // studio.destroy()
</script>
```

### postMessage 协议（`aura:` 前缀）

嵌入页 → 宿主：`ready` / `resize` / `generated` / `token-expired` / `error`  
宿主 → 嵌入页：`ticket` / `config`

本地联调：打开 `/sdk-demo/`，填入 AppId 与 Secret。

## 5. 微信小程序

1. 域名须 **HTTPS + ICP 备案**，在小程序后台配置 **业务域名**
2. 宿主后端用 openid 作为 `externalUserId` 换票
3. 页面：

```xml
<web-view src="https://你的域名/embed/?appId=APP_ID&ticket=TICKET" />
```

小程序内请提示用户 **长按图片保存**。结果以 Webhook 回传为主（web-view 难以实时 postMessage 回小程序）。

## 6. Webhook

任务成功后，若配置了 `webhookUrl`，AuraStudio 会 POST：

```json
{
  "appId": "app_xxx",
  "externalUserId": "...",
  "jobId": "...",
  "status": "success",
  "prompt": "...",
  "imageType": "product_white",
  "model": "gpt-image-2.0",
  "images": ["https://.../api/assets/xxx?exp=&sig="],
  "createdAt": 1710000000000
}
```

请求头同样带 `X-Aura-AppId` / `X-Aura-Timestamp` / `X-Aura-Signature`（对 body 签名）。图片链接为签名 URL，约 7 天有效。失败会重试最多 3 次。

## 7. 图片与鉴权说明

- 嵌入会话使用 `Authorization: Bearer <accessToken>`，不依赖第三方 Cookie
- `<img>` 使用签名查询参数访问 `/api/assets/...`，无需带请求头
- 每日出图额度按 **接入应用** 统计，超额返回 HTTP 429

## 8. Nginx（生产）

需将 `/embed` 反代到 Node（以便按 appId 下发 `Content-Security-Policy: frame-ancestors`），静态资源仍由 Nginx 提供：

```nginx
location ^~ /embed {
    proxy_pass http://127.0.0.1:8787;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

`/sdk/` 由 `dist/sdk/` 静态提供即可。
