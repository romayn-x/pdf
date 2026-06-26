import { StandardFonts, degrees, rgb } from "pdf-lib";
import {
  buildWatermarkText,
  exportRotation,
  getWatermarkDrawSpecs,
  hexToRgb,
  canUseVectorWatermark,
  makeTextWatermarkImage,
  measureVectorWatermarkSize,
  resolveStandardFont,
  rotatedBottomLeftForCenter,
  getPageLayoutSize,
} from "./watermarkLayout";

const STANDARD_FONT_MAP = {
  Helvetica: StandardFonts.Helvetica,
  TimesRoman: StandardFonts.TimesRoman,
  Courier: StandardFonts.Courier,
};

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

function applyVectorWatermarks(page, config, text, pageWidth, pageHeight, font) {
  const vectorSize = measureVectorWatermarkSize(text, config, font, pageWidth);
  const specs = getWatermarkDrawSpecs(pageWidth, pageHeight, config, vectorSize);
  const pdfRotation = exportRotation(config);
  const { r, g, b } = hexToRgb(config.color);
  const color = rgb(r, g, b);
  const lines = vectorSize.lines.length ? vectorSize.lines : [text];

  for (const spec of specs) {
    const pdfCenterX = spec.centerX;
    const pdfCenterY = pageHeight - spec.centerY;
    const point = rotatedBottomLeftForCenter(
      pdfCenterX,
      pdfCenterY,
      spec.width,
      spec.height,
      pdfRotation,
    );

    lines.forEach((line, index) => {
      const lineWidth = font.widthOfTextAtSize(line, spec.fontSize);
      const textX = point.x + (spec.width - lineWidth) / 2;
      const textY = point.y + vectorSize.paddingY + spec.fontSize * 0.85 + index * vectorSize.lineHeight;

      page.drawText(line, {
        x: textX,
        y: textY,
        size: spec.fontSize,
        font,
        color,
        rotate: degrees(pdfRotation),
        opacity: spec.opacity,
      });
    });
  }
}

export async function applyWatermarksToPages(pdfDoc, config, pageIndices) {
  const text = buildWatermarkText(config);
  if (!text) return;

  const pages = pdfDoc.getPages();
  const useVector = canUseVectorWatermark(text);
  let vectorFont = null;

  if (useVector) {
    const fontKey = resolveStandardFont(config.fontFamily);
    vectorFont = await pdfDoc.embedFont(STANDARD_FONT_MAP[fontKey]);
  }

  for (const index of pageIndices) {
    const page = pages[index];
    if (!page) continue;

    const { width, height } = getPageLayoutSize(page);

    if (useVector) {
      applyVectorWatermarks(page, config, text, width, height, vectorFont);
    } else {
      await applyRasterWatermarks(page, pdfDoc, config, text, width, height);
    }
  }
}
