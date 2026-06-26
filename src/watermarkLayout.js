export const PREVIEW_REF_WIDTH = 620;
export const PREVIEW_REF_HEIGHT = 877;
const LAYER_INSET = 0.18;
const LAYER_EXTENT = 1 + LAYER_INSET * 2;
const TILE_START_PCT = -8;
const TILE_END_PCT = 108;

export const WATERMARK_RASTER_SCALE = 3;

export const WATERMARK_DEFAULTS = {
  color: "#D4380D",
  fontFamily: '"Microsoft YaHei", sans-serif',
  gapX: 180,
  gapY: 200,
  fontSize: 22,
  rotation: -30,
  opacity: 0.12,
  tile: true,
  position: "center",
};

export const positionMap = {
  center: { x: 0.5, y: 0.5 },
  topLeft: { x: 0.18, y: 0.16 },
  topRight: { x: 0.82, y: 0.16 },
  bottomLeft: { x: 0.18, y: 0.84 },
  bottomRight: { x: 0.82, y: 0.84 },
};

const CJK_PATTERN = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;

export function colorToHex(value) {
  if (!value) return WATERMARK_DEFAULTS.color;
  if (typeof value === "string") return value;
  return value.toHexString();
}

export function hexToRgb(hex) {
  const clean = colorToHex(hex).replace("#", "");
  return {
    r: parseInt(clean.slice(0, 2), 16) / 255,
    g: parseInt(clean.slice(2, 4), 16) / 255,
    b: parseInt(clean.slice(4, 6), 16) / 255,
  };
}

export function previewFontSize(config) {
  return Math.max(12, Number(config.fontSize));
}

export function buildWatermarkText(config) {
  return (config.watermarkText || "").trim();
}

export function hasCjkText(text) {
  return CJK_PATTERN.test(text);
}

export function isAsciiLatinText(text) {
  if (!text || hasCjkText(text)) return false;
  return /^[\t\n\r\x20-\x7e]+$/.test(text);
}

export function canUseVectorWatermark(text) {
  if (!isAsciiLatinText(text)) return false;
  const lines = text.split("\n").filter((line) => line.trim());
  return lines.length === 1;
}

export function resolveRasterScale(pageWidth = PREVIEW_REF_WIDTH) {
  const pageScale = pageWidth / PREVIEW_REF_WIDTH;
  return Math.max(WATERMARK_RASTER_SCALE, Math.ceil(WATERMARK_RASTER_SCALE * pageScale));
}

export async function ensureFontsReady(config) {
  if (typeof document === "undefined" || !document.fonts?.ready) return;
  await document.fonts.ready;
  const fontFamily = config.fontFamily || WATERMARK_DEFAULTS.fontFamily;
  const primary = fontFamily.split(",")[0].trim().replace(/^['"]|['"]$/g, "");
  if (!primary) return;
  try {
    await document.fonts.load(`400 16px ${primary}`);
    await document.fonts.load(`400 48px ${fontFamily}`);
  } catch {
    // 系统字体可能无需显式 load
  }
}

function previewGapSteps(config) {
  const gapX = Number(config.gapX) || WATERMARK_DEFAULTS.gapX;
  const gapY = Number(config.gapY) || WATERMARK_DEFAULTS.gapY;
  return {
    stepX: Math.max(8, (gapX / PREVIEW_REF_WIDTH) * 100),
    stepY: Math.max(7, (gapY / PREVIEW_REF_HEIGHT) * 100),
  };
}

export function layerPercentToPageCoords(xPct, yPct, pageWidth, pageHeight) {
  return {
    x: pageWidth * (-LAYER_INSET + (xPct / 100) * LAYER_EXTENT),
    y: pageHeight * (-LAYER_INSET + (yPct / 100) * LAYER_EXTENT),
  };
}

function axisPositions(step) {
  const range = TILE_END_PCT - TILE_START_PCT;
  if (step >= range * 0.6) return [50];
  const positions = [];
  for (let value = TILE_START_PCT; value <= TILE_END_PCT + 0.001; value += step) {
    positions.push(value);
  }
  return positions.length ? positions : [50];
}

export function buildTilePositions(config) {
  if (!config.tile) {
    const point = positionMap[config.position] || positionMap.center;
    return [{ xPct: point.x * 100, yPct: point.y * 100 }];
  }

  const { stepX, stepY } = previewGapSteps(config);
  const xPositions = axisPositions(stepX);
  const yPositions = axisPositions(stepY);
  const positions = [];
  for (const yPct of yPositions) {
    for (const xPct of xPositions) {
      positions.push({ xPct, yPct });
    }
  }
  return positions;
}

export function exportRotation(config) {
  return -Number(config.rotation || 0);
}

export function getWatermarkMetrics(pageWidth, pageHeight, config, contentSize) {
  const pageRatioScale = pageWidth / PREVIEW_REF_WIDTH;
  return {
    width: contentSize.width * pageRatioScale,
    height: contentSize.height * pageRatioScale,
    fontSize: previewFontSize(config) * pageRatioScale,
  };
}

export function getWatermarkDrawSpecs(pageWidth, pageHeight, config, contentSize) {
  const metrics = getWatermarkMetrics(pageWidth, pageHeight, config, contentSize);
  const opacity = Number(config.opacity);

  return buildTilePositions(config).map(({ xPct, yPct }) => {
    const coords = layerPercentToPageCoords(xPct, yPct, pageWidth, pageHeight);
    return {
      centerX: coords.x,
      centerY: coords.y,
      width: metrics.width,
      height: metrics.height,
      fontSize: metrics.fontSize,
      opacity,
    };
  });
}

function canvasToPngBytes(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("水印图片生成失败"));
        return;
      }
      blob.arrayBuffer().then((buffer) => resolve(new Uint8Array(buffer)), reject);
    }, "image/png");
  });
}

export async function measureRasterWatermarkSize(text, config, pageWidth = PREVIEW_REF_WIDTH) {
  const imageData = await makeTextWatermarkImage(text, config, pageWidth);
  return { width: imageData.width, height: imageData.height };
}

export async function makeTextWatermarkImage(text, config, pageWidth = PREVIEW_REF_WIDTH) {
  await ensureFontsReady(config);

  const ratio = Math.max(resolveRasterScale(pageWidth), window.devicePixelRatio || 1);
  const lines = text.split("\n").filter((line) => line.trim());
  const fontSize = previewFontSize(config);
  const fontFamily = config.fontFamily || WATERMARK_DEFAULTS.fontFamily;
  const paddingX = fontSize * 1.2;
  const paddingY = fontSize * 0.75;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  context.font = `400 ${fontSize * ratio}px ${fontFamily}`;
  const width =
    Math.max(...lines.map((line) => context.measureText(line).width), fontSize * ratio) +
    paddingX * 2 * ratio;
  const lineHeight = fontSize * 1.35 * ratio;
  const height = Math.max(lines.length, 1) * lineHeight + paddingY * 2 * ratio;
  canvas.width = Math.ceil(width);
  canvas.height = Math.ceil(height);

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.font = `400 ${fontSize * ratio}px ${fontFamily}`;
  context.fillStyle = colorToHex(config.color);
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  const firstY = canvas.height / 2 - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, index) => {
    context.fillText(line, canvas.width / 2, firstY + index * lineHeight);
  });

  const bytes = await canvasToPngBytes(canvas);
  return {
    bytes,
    width: canvas.width / ratio,
    height: canvas.height / ratio,
  };
}

export function measureVectorWatermarkSize(text, config, font, pageWidth = PREVIEW_REF_WIDTH) {
  const pageRatioScale = pageWidth / PREVIEW_REF_WIDTH;
  const fontSize = previewFontSize(config) * pageRatioScale;
  const paddingX = fontSize * 1.2;
  const paddingY = fontSize * 0.75;
  const lineHeight = fontSize * 1.35;
  const lines = text.split("\n").filter((line) => line.trim());
  const contentWidth = Math.max(
    ...lines.map((line) => font.widthOfTextAtSize(line, fontSize)),
    fontSize,
  );
  return {
    width: contentWidth + paddingX * 2,
    height: Math.max(lines.length, 1) * lineHeight + paddingY * 2,
    fontSize,
    lines,
    lineHeight,
    paddingX,
    paddingY,
  };
}

export function rotatedBottomLeftForCenter(centerX, centerY, width, height, rotation) {
  const angle = (Number(rotation) * Math.PI) / 180;
  const rotatedCenterX = (width * Math.cos(angle) - height * Math.sin(angle)) / 2;
  const rotatedCenterY = (width * Math.sin(angle) + height * Math.cos(angle)) / 2;
  return {
    x: centerX - rotatedCenterX,
    y: centerY - rotatedCenterY,
  };
}

export function drawWatermarksOnCanvas(ctx, specs, image, pageWidth, pxPerPt, rotation) {
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  for (const spec of specs) {
    const w = spec.width * pxPerPt;
    const h = spec.height * pxPerPt;
    ctx.save();
    ctx.globalAlpha = spec.opacity;
    ctx.translate(spec.centerX * pxPerPt, spec.centerY * pxPerPt);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.drawImage(image, -w / 2, -h / 2, w, h);
    ctx.restore();
  }
}

export function loadWatermarkImage(imageData) {
  return new Promise((resolve, reject) => {
    const bytes = imageData.bytes;
    const blob = new Blob([bytes], { type: "image/png" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (error) => {
      URL.revokeObjectURL(url);
      reject(error);
    };
    img.src = url;
  });
}

export function resolveStandardFont(fontFamily = "") {
  const value = fontFamily.toLowerCase();
  if (value.includes("courier") || value.includes("mono")) return "Courier";
  if (
    value.includes("times") ||
    value.includes("song") ||
    value.includes("serif") ||
    value.includes("宋")
  ) {
    return "TimesRoman";
  }
  return "Helvetica";
}

export function getPageLayoutSize(page) {
  const { width, height } = page.getSize();
  const rotation = page.getRotation().angle % 360;
  if (rotation === 90 || rotation === 270) {
    return { width: height, height: width, rotation };
  }
  return { width, height, rotation };
}
