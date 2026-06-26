import { degrees } from "pdf-lib";
import {
  buildWatermarkText,
  exportRotation,
  getWatermarkDrawSpecs,
  makeTextWatermarkImage,
  rotatedBottomLeftForCenter,
  getPageLayoutSize,
} from "./watermarkLayout";

// 始终走 Canvas 栅格路径：Canvas 会使用用户电脑上已安装的所选字体，
// 而 pdf-lib 矢量 drawText 只支持内置标准字体，无法呈现系统自定义字体。
async function applyRasterWatermarks(page, pdfDoc, config, text, pageWidth, pageHeight) {
  const imageData = await makeTextWatermarkImage(text, config, pageWidth);
  const watermarkImage = await pdfDoc.embedPng(imageData.bytes);
  const specs = getWatermarkDrawSpecs(pageWidth, pageHeight, config, imageData);
  const pdfRotation = exportRotation(config);

  for (const spec of specs) {
    const pdfCenterY = pageHeight - spec.centerY;
    const point = rotatedBottomLeftForCenter(
      spec.centerX,
      pdfCenterY,
      spec.width,
      spec.height,
      pdfRotation,
    );
    page.drawImage(watermarkImage, {
      x: point.x,
      y: point.y,
      width: spec.width,
      height: spec.height,
      rotate: degrees(pdfRotation),
      opacity: spec.opacity,
    });
  }
}

export async function applyWatermarksToPages(pdfDoc, config, pageIndices) {
  const text = buildWatermarkText(config);
  if (!text) return;

  const pages = pdfDoc.getPages();

  for (const index of pageIndices) {
    const page = pages[index];
    if (!page) continue;

    const { width, height } = getPageLayoutSize(page);
    await applyRasterWatermarks(page, pdfDoc, config, text, width, height);
  }
}
