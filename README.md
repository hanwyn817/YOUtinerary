# 🌍 YOUtinerary · 那就出发吧！

> 个人与小团队的轻量级旅行行程规划工具。基于 Astro + Svelte 构建，依托 Cloudflare 生态，为你带来极速、安全、沉浸的行程管理体验。

## ✨ 核心特性 / Features

🚀 **无缝的行程规划体验**
- **首页聚合看板**：全局时间轴模式，概览所有历史与未来行程，支持快速跳转。
- **现代化行程工作台**：同一天内混排交通、住宿、餐饮、游玩等多种卡片，支持自由拖拽排序、插入、复制与删除。
- **地点数据解耦**：允许自由编辑地点显示名称，同时保留底层高德地图坐标数据，兼顾个性化表达与精准度。

🛡️ **隐私与安全保护**
- **访问控制**：采用密码保护机制，哈希值安全存储于 Cloudflare KV 中。
- **安全 API 代理**：通过 Cloudflare Pages Functions 代理高德地图与汇率换算等第三方 API，彻底隐藏真实鉴权 Key。

🎨 **精致的视觉与交互**
- **响应式全局 UI**：全新的全局导航栏、精心设计的空状态与针对移动端深度优化的布局。
- **一键长图导出**：集成 `html2canvas` 方案，完美适配移动端长图排版对齐，一键生成精美时间轴长图，方便收藏与社交平台分享。

📊 **更多实用功能**
- **费用与预算统计**：按类别（交通、住宿、游玩等）智能汇总花销，内置多币种汇率换算。
- **智能路线规划**：集成前端选点与后端高德路线测算，自动获取耗时预估并填充至交通备注中。

## 🛠 技术栈 / Tech Stack

- **框架**: [Astro](https://astro.build) + [Svelte 5](https://svelte.dev)
- **样式**: [Tailwind CSS v4](https://tailwindcss.com)
- **后端**: Cloudflare Pages Functions
- **存储**: Cloudflare KV (`ITINERARIES`, `SETTINGS`, `SESSION`)
- **工具**: `html2canvas` (行程图导出), `qrcode` (行程二维码生成)

## 📦 项目结构 / Structure

```text
.
├── src/
│   ├── components/          # Svelte 核心组件集（行程编辑、卡片、拖拽等）
│   ├── layouts/             # Astro 全局布局
│   ├── lib/                 # 工具函数、状态管理 (stores)、类型定义
│   └── pages/               # Astro 页面 (首页、行程详情、开发者文档等)
├── src/pages/api/           # Cloudflare Functions 接口 (第三方代理、鉴权、KV增删改查)
├── public/                  # 静态资源与全局样式
├── wrangler.toml            # Cloudflare CLI (Wrangler) 配置文件与 KV 绑定示例
├── package.json             # 依赖管理
└── README.md                # 项目主文档
```

## 💻 本地开发指南 / Development

1. **安装依赖**
   ```bash
   npm install
   ```

2. **环境变量准备**
   复制文件 `.dev.vars.example` 为 `.dev.vars`，并填入以下参数：
   ```env
   DEFAULT_PASSWORD=your_admin_password
   GAODE_REST_KEY=your_amap_api_key
   FIXER_ACCESS_KEY=your_fixer_api_key
   ```
   > 提示：本地开发需确保系统已安装 Wrangler CLI。

3. **运行开发服务器**
   - **仅前端模式** (使用 Astro dev server，适合调整纯 UI 细节):
     ```bash
     npm run dev
     ```
   - **全栈模式** (通过 Wrangler 启动 Functions 与本地 KV 环境，适合完整功能调试):
     ```bash
     npm run dev:pages
     ```

## 🌩 云端部署 / Deployment

本项目原生支持几乎无配置的一键部署至 **Cloudflare Pages**：

1. 在 Cloudflare 控制台中新建 Pages 项目并连接您的 GitHub 仓库。
2. 配置构建信息：
   - 构建命令: `npm run build`
   - 输出目录: `dist`
3. **KV 绑定**：在项目设置 (**Settings -> Functions -> KV namespace bindings**) 中绑定三个基础的数据库：
   - `ITINERARIES`: 存储所有的 JSON 格式行程数据
   - `SETTINGS`: 存储系统级配置与管理员密码哈希
   - `SESSION`: 维护用户登录与认证会话
4. **环境变量**：在设置页面添加所需的第三方密钥与环境变量（如 `GAODE_REST_KEY`, `SESSION_TTL_SECONDS` 等）。

> **关于初始化密码**：应用首次启动且检测不到密码时，将读取环境变量 `DEFAULT_PASSWORD` 配置初始密码。出于安全考虑，强烈建议在上线后通过 Wrangler CLI 写入新的加盐哈希值。

## 🔮 探索与展望 / Roadmap

- [ ] **多人协作体验**：为不同旅行伙伴生成独立密码或带有权限控制的阅后即焚链接。
- [ ] **原生 PWA 支持**：提供近似原生应用的沉浸式体验，支持离线缓存访问行程。
- [ ] **更深度的地图集成**：地图选址控件内嵌、基于地图视角的路线绘制及动画预览。
- [ ] **数据导入导出**：提供完善的 JSON 格式备份与还原管理面板。

---

> “那就出发吧！” —— 愿每一次未知的旅程都满心欢喜，生活在别处，祝您旅途愉快。
