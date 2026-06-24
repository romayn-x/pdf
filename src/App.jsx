import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  App as AntApp,
  Button,
  Card,
  ColorPicker,
  Form,
  Input,
  InputNumber,
  Select,
  Slider,
  Space,
  Switch,
  Tag,
  Typography,
  Upload,
  message,
} from "antd";
import { DownloadOutlined, FilePdfOutlined, ReloadOutlined } from "@ant-design/icons";
import { PDFDocument, degrees } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

const { Dragger } = Upload;
const { TextArea } = Input;
const { Text } = Typography;

const STORAGE_KEY = "pdf-watermark-config-v6";

const FONT_OPTIONS = [
  { label: "Golden Goose Sans", value: '"Golden Goose Sans", sans-serif' },
  { label: "微软雅黑", value: '"Microsoft YaHei", sans-serif' },
  { label: "宋体", value: 'SimSun, "Songti SC", serif' },
  { label: "黑体", value: 'SimHei, "Heiti SC", sans-serif' },
  { label: "苹方", value: '"PingFang SC", sans-serif' },
  { label: "Arial", value: "Arial, sans-serif" },
  { label: "Times New Roman", value: '"Times New Roman", serif' },
  { label: "Courier New", value: '"Courier New", monospace' },
];

const defaultConfig = {
  watermarkText: "机密",
  fontFamily: FONT_OPTIONS[0].value,
  color: "#D4380D",
  opacity: 0.12,
  rotation: -30,
  fontSize: 22,
  tile: true,
  gapX: 180,
  gapY: 200,
  position: "center",
  pages: "all",
};

const positionMap = {
  center: { x: 0.5, y: 0.5 },
  topLeft: { x: 0.18, y: 0.16 },
  topRight: { x: 0.82, y: 0.16 },
  bottomLeft: { x: 0.18, y: 0.84 },
  bottomRight: { x: 0.82, y: 0.84 },
};

function colorToHex(value) {
  if (!value) return defaultConfig.color;
  if (typeof value === "string") return value;
  return value.toHexString();
}

function normalizeConfig(config) {
  return {
    ...defaultConfig,
    ...config,
    color: colorToHex(config?.color),
  };
}

function loadStoredConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? normalizeConfig(JSON.parse(raw)) : defaultConfig;
  } catch {
    return defaultConfig;
  }
}

function saveConfig(config) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeConfig(config)));
}

function buildWatermarkText(config) {
  return (config.watermarkText || "").trim();
}

function parsePageSpec(spec, total) {
  if (!spec || spec.trim().toLowerCase() === "all") {
    return new Set(Array.from({ length: total }, (_, index) => index));
  }

  const selected = new Set();
  for (const part of spec.split(",")) {
    const clean = part.trim();
    const match = clean.match(/^(\d+)?(?:-(\d+)?)?$/);
    if (!match) throw new Error(`页码范围不正确：${clean}`);

    const start = match[1] ? Number(match[1]) : 1;
    const end = match[2] ? Number(match[2]) : clean.includes("-") ? total : start;
    if (start < 1 || end < start) throw new Error(`页码范围不正确：${clean}`);

    for (let page = start; page <= Math.min(end, total); page += 1) {
      selected.add(page - 1);
    }
  }
  return selected;
}

function makeTextWatermarkImage(text, config) {
  const ratio = window.devicePixelRatio || 1;
  const lines = text.split("\n").filter((line) => line.trim());
  const fontSize = Math.max(10, Number(config.fontSize));
  const fontFamily = config.fontFamily || defaultConfig.fontFamily;
  const paddingX = fontSize * 1.2;
  const paddingY = fontSize * 0.75;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  context.font = `400 ${fontSize * ratio}px ${fontFamily}`;
  const width =
    Math.max(...lines.map((line) => context.measureText(line).width), fontSize * ratio) +
    paddingX * 2 * ratio;
  const lineHeight = fontSize * 1.42 * ratio;
  const height = Math.max(lines.length, 1) * lineHeight + paddingY * 2 * ratio;
  canvas.width = Math.ceil(width);
  canvas.height = Math.ceil(height);

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.font = `400 ${fontSize * ratio}px ${fontFamily}`;
  context.fillStyle = colorToHex(config.color);
  context.textAlign = "center";
  context.textBaseline = "middle";

  const firstY = canvas.height / 2 - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, index) => {
    context.fillText(line, canvas.width / 2, firstY + index * lineHeight);
  });

  return {
    bytes: canvas.toDataURL("image/png").split(",")[1],
    width: canvas.width / ratio,
    height: canvas.height / ratio,
  };
}

async function readArrayBuffer(file) {
  return await file.arrayBuffer();
}

function rotatedBottomLeftForCenter(centerX, centerY, width, height, rotation) {
  const angle = (Number(rotation) * Math.PI) / 180;
  const rotatedCenterX = (width * Math.cos(angle) - height * Math.sin(angle)) / 2;
  const rotatedCenterY = (width * Math.sin(angle) + height * Math.cos(angle)) / 2;
  return {
    x: centerX - rotatedCenterX,
    y: centerY - rotatedCenterY,
  };
}

function exportRotation(config) {
  return -Number(config.rotation || 0);
}

function getPagePoint(page, config) {
  const { width, height } = page.getSize();
  const point = positionMap[config.position] || positionMap.center;
  return {
    x: width * point.x,
    y: height * (1 - point.y),
  };
}

async function generatePdf(pdfFile, config) {
  const text = buildWatermarkText(config);
  if (!text) throw new Error("请填写水印文字");

  const pdfBytes = await readArrayBuffer(pdfFile);
  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const pages = pdfDoc.getPages();
  const selectedPages = parsePageSpec(config.pages, pages.length);
  const imageData = makeTextWatermarkImage(text, config);
  const watermarkImage = await pdfDoc.embedPng(imageData.bytes);

  for (const [index, page] of pages.entries()) {
    if (!selectedPages.has(index)) continue;

    const { width, height } = page.getSize();
    const pageRatioScale = Math.min(width / 620, 1.8);
    const drawWidth = imageData.width * pageRatioScale;
    const drawHeight = imageData.height * pageRatioScale;
    const rotation = exportRotation(config);

    if (config.tile) {
      const gapX = Math.max(24, Number(config.gapX) || defaultConfig.gapX);
      const gapY = Math.max(24, Number(config.gapY) || defaultConfig.gapY);
      for (let centerY = -height * 0.25; centerY <= height * 1.25; centerY += gapY) {
        for (let centerX = -width * 0.25; centerX <= width * 1.25; centerX += gapX) {
          const point = rotatedBottomLeftForCenter(centerX, centerY, drawWidth, drawHeight, rotation);
          page.drawImage(watermarkImage, {
            x: point.x,
            y: point.y,
            width: drawWidth,
            height: drawHeight,
            rotate: degrees(rotation),
            opacity: Number(config.opacity),
          });
        }
      }
    } else {
      const center = getPagePoint(page, config);
      const point = rotatedBottomLeftForCenter(center.x, center.y, drawWidth, drawHeight, rotation);
      page.drawImage(watermarkImage, {
        x: point.x,
        y: point.y,
        width: drawWidth,
        height: drawHeight,
        rotate: degrees(rotation),
        opacity: Number(config.opacity),
      });
    }
  }

  return await pdfDoc.save();
}

function downloadPdf(bytes, fileName) {
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function PdfPageCanvas({ file, onError }) {
  const canvasRef = useRef(null);
  const onErrorRef = useRef(onError);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    let cancelled = false;
    let renderTask = null;

    async function renderFirstPage() {
      setLoaded(false);
      if (!file || !canvasRef.current) return;

      try {
        const data = await file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data });
        const pdf = await loadingTask.promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 1.6 });
        const canvas = canvasRef.current;
        const context = canvas.getContext("2d");

        canvas.width = viewport.width;
        canvas.height = viewport.height;
        renderTask = page.render({ canvasContext: context, viewport });
        await renderTask.promise;

        if (!cancelled) setLoaded(true);
        await pdf.destroy();
      } catch (reason) {
        if (!cancelled) {
          onErrorRef.current?.(reason instanceof Error ? reason.message : "PDF 预览失败");
          setLoaded(false);
        }
      }
    }

    renderFirstPage();

    return () => {
      cancelled = true;
      renderTask?.cancel?.();
    };
  }, [file]);

  return (
    <>
      <canvas ref={canvasRef} className={`pdf-canvas ${loaded ? "is-loaded" : ""}`} />
      {!file && <div className="empty-preview">选择 PDF 后预览第一页</div>}
      {file && !loaded && <div className="empty-preview">正在渲染 PDF 预览...</div>}
    </>
  );
}

function buildPreviewItems(config) {
  if (!config.tile) {
    const point = positionMap[config.position] || positionMap.center;
    return [{ x: `${point.x * 100}%`, y: `${point.y * 100}%` }];
  }

  const stepX = Math.max(8, (Number(config.gapX) / 620) * 100);
  const stepY = Math.max(7, (Number(config.gapY) / 877) * 100);
  const items = [];
  for (let y = -8; y <= 108; y += stepY) {
    for (let x = -8; x <= 108; x += stepX) {
      items.push({ x: `${x}%`, y: `${y}%` });
    }
  }
  return items;
}

function WatermarkLayer({ config }) {
  const text = buildWatermarkText(config) || "机密";
  const items = buildPreviewItems(config);

  return (
    <div className="watermark-layer">
      {items.map((item, index) => (
        <div
          className="mark"
          key={`${item.x}-${item.y}-${index}`}
          style={{
            "--x": item.x,
            "--y": item.y,
            "--color": colorToHex(config.color),
            "--opacity": config.opacity,
            "--font-size": `${Math.max(12, Number(config.fontSize))}px`,
            "--font-family": config.fontFamily || defaultConfig.fontFamily,
            "--rotation": `${config.rotation}deg`,
          }}
        >
          {text}
        </div>
      ))}
    </div>
  );
}

function PdfWatermarkPreview({ config, pdfFile, onPreviewError }) {
  return (
    <div className="pdf-preview-shell">
      <div className={`paper ${pdfFile ? "has-pdf" : ""}`}>
        <PdfPageCanvas file={pdfFile} onError={onPreviewError} />
        <WatermarkLayer config={config} />
      </div>
    </div>
  );
}

export default function App() {
  const initialConfig = useMemo(loadStoredConfig, []);
  const [form] = Form.useForm();
  const [config, setConfig] = useState(initialConfig);
  const [pdfFile, setPdfFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [api, contextHolder] = message.useMessage();

  function updateConfig(values) {
    const normalized = normalizeConfig(values);
    setConfig(normalized);
    saveConfig(normalized);
  }

  function resetConfig() {
    form.setFieldsValue(defaultConfig);
    setConfig(defaultConfig);
    saveConfig(defaultConfig);
    api.success("已恢复默认水印配置");
  }

  const pdfUploadProps = {
    multiple: false,
    accept: "application/pdf,.pdf",
    showUploadList: pdfFile ? { showRemoveIcon: true } : false,
    fileList: pdfFile ? [{ uid: "pdf", name: pdfFile.name, status: "done" }] : [],
    beforeUpload: (file) => {
      if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
        api.error("请选择 PDF 文件");
        return Upload.LIST_IGNORE;
      }
      setPdfFile(file);
      setResult(`${file.name} 已载入`);
      setError("");
      return false;
    },
    onRemove: () => {
      setPdfFile(null);
      setResult("");
    },
  };

  async function onGenerate() {
    if (!pdfFile) {
      setError("请先选择 PDF 文件");
      return;
    }

    setBusy(true);
    setError("");
    setResult("正在本地生成 PDF...");
    try {
      const normalized = normalizeConfig(form.getFieldsValue());
      const bytes = await generatePdf(pdfFile, normalized);
      const baseName = pdfFile.name.replace(/\.pdf$/i, "");
      downloadPdf(bytes, `${baseName}-watermarked.pdf`);
      setResult("已生成并开始下载");
      api.success("PDF 水印已生成");
    } catch (reason) {
      const messageText = reason instanceof Error ? reason.message : "生成失败";
      setError(messageText);
      setResult("");
      api.error(messageText);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AntApp>
      {contextHolder}
      <div className="app">
        <div className="shell">
          <header className="header compact-header">
            <div className="title-block">
              <h1>PDF 水印工具</h1>
            </div>
          </header>

          <div className="layout">
            <div className="control-stack">
              <Card className="action-card">
                <Button
                  className="download-button"
                  type="primary"
                  size="large"
                  icon={<DownloadOutlined />}
                  loading={busy}
                  onClick={onGenerate}
                >
                  生成并下载 PDF
                </Button>
                <div className={`result-note ${error ? "error" : ""}`}>{error || result}</div>
              </Card>

              <Card title="选择 PDF" extra={<FilePdfOutlined />}>
                <Dragger {...pdfUploadProps}>
                  <p className="ant-upload-drag-icon">
                    <FilePdfOutlined />
                  </p>
                  <p className="ant-upload-text">点击或拖拽 PDF 到此处</p>
                </Dragger>
              </Card>

              <Card
                title="水印配置"
                extra={
                  <Button size="small" icon={<ReloadOutlined />} onClick={resetConfig}>
                    恢复默认
                  </Button>
                }
              >
                <Form
                  form={form}
                  layout="vertical"
                  initialValues={initialConfig}
                  onValuesChange={(_, values) => updateConfig(values)}
                >
                  <Form.Item
                    name="watermarkText"
                    label="水印文字"
                    tooltip="支持多行文字，换行会原样渲染到预览和导出的 PDF 中"
                  >
                    <TextArea rows={5} placeholder={"机密\n仅限内部查看"} />
                  </Form.Item>

                  <div className="inline-fields">
                    <Form.Item name="fontFamily" label="字体">
                      <Select options={FONT_OPTIONS} />
                    </Form.Item>
                    <Form.Item name="pages" label="页码范围">
                      <Input placeholder="all 或 1,3-5" />
                    </Form.Item>
                  </div>

                  <div className="triple-fields">
                    <Form.Item name="color" label="颜色">
                      <ColorPicker showText />
                    </Form.Item>
                    <Form.Item name="opacity" label={`透明度 ${Math.round(Number(config.opacity) * 100)}%`}>
                      <Slider min={0.04} max={0.35} step={0.01} />
                    </Form.Item>
                    <Form.Item name="rotation" label={`角度 ${config.rotation}°`}>
                      <Slider min={-60} max={60} step={1} />
                    </Form.Item>
                  </div>

                  <div className="inline-fields">
                    <Form.Item name="fontSize" label="字号">
                      <InputNumber min={10} max={80} style={{ width: "100%" }} />
                    </Form.Item>
                    <Form.Item name="tile" label="铺满页面" valuePropName="checked">
                      <Switch checkedChildren="铺满" unCheckedChildren="单个" />
                    </Form.Item>
                  </div>

                  {config.tile ? (
                    <div className="inline-fields">
                      <Form.Item name="gapX" label="水平间距">
                        <InputNumber min={40} max={600} style={{ width: "100%" }} />
                      </Form.Item>
                      <Form.Item name="gapY" label="垂直间距">
                        <InputNumber min={40} max={500} style={{ width: "100%" }} />
                      </Form.Item>
                    </div>
                  ) : (
                    <Form.Item name="position" label="单个水印位置">
                      <Select
                        options={[
                          { label: "居中", value: "center" },
                          { label: "左上", value: "topLeft" },
                          { label: "右上", value: "topRight" },
                          { label: "左下", value: "bottomLeft" },
                          { label: "右下", value: "bottomRight" },
                        ]}
                      />
                    </Form.Item>
                  )}
                </Form>
              </Card>
            </div>

            <Card
              className="preview-card"
              title="PDF 预览"
              extra={<Text type="secondary">{config.tile ? "铺满水印" : "单个水印"}</Text>}
            >
              <div className="preview-toolbar">
                <Space wrap>
                  <Tag color="red">默认：机密</Tag>
                  <Tag>间距 {config.gapX} / {config.gapY}</Tag>
                  <Tag>角度 {config.rotation}°</Tag>
                </Space>
              </div>
              <div className="preview-stage">
                <PdfWatermarkPreview
                  config={config}
                  pdfFile={pdfFile}
                  onPreviewError={(messageText) => api.warning(messageText)}
                />
              </div>
            </Card>
          </div>
        </div>
      </div>
    </AntApp>
  );
}
