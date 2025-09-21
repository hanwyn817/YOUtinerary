# YOUtinerary · 那就出发吧！

个人旅行行程规划工具，面向 10 人以内的小团队/个人使用场景。项目基于 **Astro + Svelte + Tailwind CSS**，后端依托 **Cloudflare Pages Functions + KV** 存储，提供轻量的行程管理、密码保护、费用统计、高德地图路线代理等能力。

## ✨ 主要特性

- 首页总览：以时间轴表格呈现每条安排，可快速跳转到对应行程。
- 行程工作台：同一天内以时间轴形式混排交通 / 住宿 / 游玩 / 备注，支持插入、拖换顺序、复制与删除。
- 安全防护：编辑模式需输入密码，密码哈希保存在 `KV:SETTINGS` 中，会话令牌写入安全 Cookie。
- 导出分享：一键将行程详情渲染为图片（`html2canvas`），输出简洁时间轴，方便收藏与分享。
- 费用概览：按类别（交通/住宿/游玩/其他）维护预算统计。
- 高德路线：通过 Cloudflare Functions 代理高德路线规划 API，隐藏真实 API Key。
- 备份友好：行程数据保存在 KV，可额外导出为 JSON 备份（可在后续补充 UI 按钮）。

## 📦 项目结构

```
.
├── src/
│   ├── components/          # Svelte 组件（仪表盘、行程编辑等）
│   ├── layouts/             # Astro 布局
│   ├── lib/                 # 前端类型、API 客户端、store 与工具函数
│   └── pages/               # Astro 页面入口
├── src/pages/api/           # Cloudflare Pages Functions（Astro API Routes）
├── public/                  # 静态资源
├── wrangler.toml            # Cloudflare KV & 变量绑定示例
├── .env.example             # 本地调试所需环境变量示例
└── package.json
```

## 🔧 本地开发

```bash
npm install
npm run dev          # 仅前端，使用 Astro dev server
npm run dev:pages    # 先 build，再通过 wrangler pages dev 调起 Functions + 前端
```

使用 `npm run dev:pages` 前，请确保：

1. 安装 Wrangler CLI（已作为 devDependency）。
2. 本地创建 KV namespace，并将 namespace ID 写入 `wrangler.toml` 或通过 CLI 传参。
3. 准备 `.env`（可复制 `.env.example`）/ `.dev.vars` 并配置 `DEFAULT_PASSWORD`、`GAODE_REST_KEY` 等变量（Pages Dev 默认读取 `.dev.vars`）。
4. 运行 Pages Dev 时需绑定三个 KV：`ITINERARIES`、`SETTINGS`、`SESSION`，脚本中已包含 `--kv` 参数。

## 🔐 初始化密码

- 首次启动时，函数会检查 `KV:SETTINGS` 中是否存在管理密码。
- 若不存在且设置了 `DEFAULT_PASSWORD` 环境变量，会自动写入哈希值。
- 正式环境建议先通过 `wrangler kv:key put` 手动写入盐 + 哈希，避免在日志中暴露明文密码。

## 🌐 高德地图代理

- API 位置：`src/pages/api/gaode/route.ts`
- 请求参数：`mode`（driving/transit/walking/bicycling）、`origin`、`destination`。
- 代理要求：已解锁编辑权限的用户才能调用，防止滥用。
- 需在 Cloudflare 环境变量中设置 `GAODE_REST_KEY`。

前端可在交通条目中根据地点信息调用该接口，获得路线时长、费用预估等，随后写入交通备注。

## 📄 部署到 Cloudflare Pages

1. 构建：`npm run build`
2. Cloudflare Pages 控制台中新建项目，构建命令填写 `npm run build`，输出目录 `dist/`。
3. 在 **Settings → Functions** 中绑定 KV 名称空间：`ITINERARIES`（存行程）、`SETTINGS`（存密码哈希等配置）、`SESSION`（存登录会话，建议单独创建）。
4. 在 **Settings → Environment variables** 为生产/预览环境添加：`GAODE_REST_KEY`、`SESSION_TTL_SECONDS`（默认 28800 秒，可按需调整）、`DEFAULT_PASSWORD`（可选，用于首次初始化）。
5. 触发部署，首次进入站点时使用密码解锁即可开始编辑。

## 🧪 下一步可拓展方向

- 多人协作：为不同用户生成独立密码或邀请链接。
- JSON 备份/导入 UI：便于迁移或版本管理。
- 更丰富的地图联动：地点输入框内直接加载高德地点选择器、路线候选一键写入。
- PWA 离线模式：缓存最近行程，离线浏览。

> “那就出发吧！”——祝旅途顺利，行程顺心。
