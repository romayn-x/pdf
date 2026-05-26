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

依赖通过浏览器 ESM CDN 加载，PDF 文件处理全程发生在用户本机浏览器内。
