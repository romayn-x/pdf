import React, { useEffect, useRef, useState } from "react";
import { PDFDocument } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist";
import {
  PREVIEW_REF_WIDTH,
  PREVIEW_REF_HEIGHT,
  buildWatermarkText,
  ensureFontsReady,
  makeTextWatermarkImage,
  getWatermarkDrawSpecs,
  drawWatermarksOnCanvas,
  loadWatermarkImage,
  exportRotation,
} from "./watermarkLayout";
import { applyWatermarksToPages } from "./watermarkPdf";

function isRenderCancelledError(reason) {
  return (
    reason?.name === "RenderingCancelledException" ||
    reason?.message?.includes("cancelled") ||
    reason?.message?.includes("canceled")
  );
}

async function renderBlankPreview(canvas, config, ratio, isStale) {
  if (isStale()) return;

  const pageWidth = PREVIEW_REF_WIDTH;
  const pageHeight = PREVIEW_REF_HEIGHT;
  const scale = PREVIEW_REF_WIDTH / pageWidth;

  canvas.width = Math.ceil(PREVIEW_REF_WIDTH * ratio);
  canvas.height = Math.ceil(PREVIEW_REF_HEIGHT * ratio);
  canvas.style.width = `${PREVIEW_REF_WIDTH}px`;
  canvas.style.height = `${pageHeight * scale}px`;

  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);

  if (isStale()) return;

  await ensureFontsReady(config);
  const text = buildWatermarkText(config) || "机密";
  const imageData = await makeTextWatermarkImage(text, config, pageWidth);
  const watermarkImg = await loadWatermarkImage(imageData);
  if (isStale()) return;

  const specs = getWatermarkDrawSpecs(pageWidth, pageHeight, config, imageData);
  const pxPerPt = canvas.width / pageWidth;
  drawWatermarksOnCanvas(
    context,
    specs,
    watermarkImg,
    pageWidth,
    pxPerPt,
    exportRotation(config),
  );
}

async function renderPdfPreview(canvas, file, config, ratio, isStale, setRenderTask) {
  const sourceBytes = await file.arrayBuffer();
  if (isStale()) return;

  const pdfDoc = await PDFDocument.load(sourceBytes.slice(0), { ignoreEncryption: true });
  await applyWatermarksToPages(pdfDoc, config, [0]);
  if (isStale()) return;

  const watermarkedBytes = await pdfDoc.save();
  if (isStale()) return;

  const loadingTask = pdfjsLib.getDocument({ data: watermarkedBytes });
  const pdf = await loadingTask.promise;
  if (isStale()) {
    await pdf.destroy();
    return;
  }

  try {
    const page = await pdf.getPage(1);
    if (isStale()) return;

    const { width: pageWidth, height: pageHeight } = page.getViewport({ scale: 1 });
    const scale = PREVIEW_REF_WIDTH / pageWidth;
    const viewport = page.getViewport({ scale: scale * ratio });

    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    canvas.style.width = `${PREVIEW_REF_WIDTH}px`;
    canvas.style.height = `${pageHeight * scale}px`;

    const context = canvas.getContext("2d");
    context.clearRect(0, 0, canvas.width, canvas.height);

    const renderTask = page.render({ canvasContext: context, viewport });
    setRenderTask(renderTask);

    try {
      await renderTask.promise;
    } catch (reason) {
      if (isRenderCancelledError(reason)) return;
      throw reason;
    }
  } finally {
    await pdf.destroy();
  }
}

export default function PdfPreviewCanvas({ file, config, onError }) {
  const canvasRef = useRef(null);
  const onErrorRef = useRef(onError);
  const renderSeqRef = useRef(0);
  const renderTaskRef = useRef(null);
  const [loaded, setLoaded] = useState(false);
  const rafRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  function cancelActiveRender() {
    if (renderTaskRef.current?.cancel) {
      try {
        renderTaskRef.current.cancel();
      } catch {
        // ignore
      }
    }
    renderTaskRef.current = null;
  }

  useEffect(() => {
    let cancelled = false;
    const seq = ++renderSeqRef.current;

    const isStale = () => cancelled || seq !== renderSeqRef.current;

    const setRenderTask = (task) => {
      if (!isStale()) {
        renderTaskRef.current = task;
      }
    };

    async function render() {
      cancelActiveRender();
      setLoaded(false);

      const canvas = canvasRef.current;
      if (!canvas || isStale()) return;

      const ratio = window.devicePixelRatio || 1;

      try {
        if (!file) {
          await renderBlankPreview(canvas, config, ratio, isStale);
        } else {
          await renderPdfPreview(canvas, file, config, ratio, isStale, setRenderTask);
        }

        if (!isStale()) {
          renderTaskRef.current = null;
          setLoaded(true);
        }
      } catch (reason) {
        if (isStale() || isRenderCancelledError(reason)) return;
        onErrorRef.current?.(reason instanceof Error ? reason.message : "PDF 预览失败");
        if (!isStale()) setLoaded(false);
      }
    }

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      rafRef.current = requestAnimationFrame(() => {
        render();
      });
    }, 120);

    return () => {
      cancelled = true;
      cancelActiveRender();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [file, config]);

  return (
    <>
      <canvas ref={canvasRef} className={`pdf-canvas ${loaded ? "is-loaded" : ""}`} />
      {!loaded && (
        <div className="empty-preview">
          {file ? "正在渲染 PDF 预览..." : "选择 PDF 后预览第一页"}
        </div>
      )}
    </>
  );
}
