# PDF 水印工具

纯前端 React + Ant Design PDF 水印工具。用户选择本地 PDF 后，浏览器直接读取、生成并下载带水印的新 PDF，不经过服务端，也不会上传文件。

## 使用方式

安装依赖后启动 Vite：

```powershell
corepack prepare pnpm@latest --activate
pnpm install
pnpm dev
```

然后打开 Vite 输出的本地地址，通常是 `http://127.0.0.1:5173/`。

## 打包 Windows exe

桌面版使用 Electron，安装包输出在 `release/` 目录。

```powershell
pnpm install
pnpm dist:exe
```

- **安装版（NSIS）**：`pnpm dist:exe` → `release/PDF水印工具 Setup x.x.x.exe`
- **免安装便携版**：`pnpm dist:portable` → `release/PDF水印工具 x.x.x.exe`
- **本地预览桌面窗口**（不打包）：`pnpm electron:dev`

首次打包会下载 Electron 运行时，耗时较长，请保持网络畅通。

## 功能

- 默认淡灰、低透明度、斜向铺满，接近腾讯会议安全水印效果。
- 支持文本水印模板，可使用 `{user}`、`{time}`、`{detail}` 变量。
- 支持图片水印，格式为 PNG/JPG。
- 支持自定义颜色、透明度、角度、字号、图片缩放、铺满间距、页码范围。
- 页码范围支持 `all`、`1`、`1-3`、`2-`、`1,3,5-7`。

## 技术栈

- React
- Ant Design
- pdf-lib
- 浏览器 File API / Blob 下载

PDF 文件处理全程发生在用户本机浏览器内。

## 腾讯云开发 CloudBase（可选）

项目已接入 `@cloudbase/js-sdk`，用于后续云数据库、登录等能力；**不配置也不影响本地加水印**。

### 1. 控制台准备

1. 打开 [云开发控制台](https://console.cloud.tencent.com/tcb)，创建或选择环境，记下 **环境 ID**。
2. **环境配置 → API Key**，复制 **Publishable Key**（发布密钥，可放前端）。
3. **登录授权 → 登录方式**，开启 **匿名登录**（`initCloudBase` 默认会匿名登录）。
4. **环境配置 → 安全配置 → 安全来源**，添加：
   - `http://127.0.0.1:5173`
   - `http://localhost:5173`
   - 你的 GitHub Pages 域名（如 `https://romayn-x.github.io`）

### 2. 本地环境变量

复制示例并填写：

```powershell
copy .env.example .env
```

编辑 `.env`：

```env
VITE_CLOUDBASE_ENV_ID=你的环境ID
VITE_CLOUDBASE_PUBLISHABLE_KEY=你的PublishableKey
```

重启 `pnpm dev` 后，浏览器控制台无 `[CloudBase] 初始化失败` 即表示连通。

### 3. 在代码里使用

```js
import { getCloudBaseDatabase, initCloudBase } from "./lib/cloudbase.js";

await initCloudBase();
const db = getCloudBaseDatabase();
// const res = await db.collection("watermark_presets").get();
```

### 4. GitHub Pages 构建

在仓库 **Settings → Secrets → Actions** 中配置同名变量 `VITE_CLOUDBASE_ENV_ID`、`VITE_CLOUDBASE_PUBLISHABLE_KEY`，在 CI 的 `pnpm build` 步骤注入即可。

使用 CloudBase CLI 部署静态站时，将 `cloudbaserc.json` 里的 `envId` 改成你的环境 ID。
