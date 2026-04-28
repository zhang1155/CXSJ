/**
 * ocrProcessor.ts
 * 基于 Tesseract.js 的 OCR 识别工具
 * 将图片中的文字区域提取并转换为 PPT SlideElement 坐标格式（百分比）
 */
import type { SlideElement } from '@/types/types';
import { v4 as uuidv4 } from 'uuid';

export interface OCRBlock {
  text: string;
  /** 相对图片的百分比坐标 */
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
}

export interface OCRResult {
  blocks: OCRBlock[];
  imageWidth: number;
  imageHeight: number;
  fullText: string;
}

export type OCRProgressCallback = (progress: number, status: string) => void;

/**
 * 对 File/Blob/URL 执行 OCR 识别，返回文字块列表
 * @param source  图片文件、Blob 或 dataURL
 * @param onProgress  进度回调 (0~100, 状态描述)
 */
export async function runOCR(
  source: File | Blob | string,
  onProgress?: OCRProgressCallback,
): Promise<OCRResult> {
  // 动态导入，避免首屏加载 tesseract.js 的较大体积
  const { createWorker } = await import('tesseract.js');

  onProgress?.(5, '初始化 OCR 引擎...');

  const worker = await createWorker('chi_sim+eng', 1, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') {
        const pct = Math.round(10 + m.progress * 80);
        onProgress?.(pct, `识别中 ${pct}%`);
      } else if (m.status === 'loading language traineddata') {
        onProgress?.(8, '加载中文语言包...');
      }
    },
  });

  onProgress?.(10, '开始识别文字...');

  // 统一转为 string（dataURL）
  let imgSrc: string;
  if (typeof source === 'string') {
    imgSrc = source;
  } else {
    imgSrc = await fileToDataURL(source);
  }

  const { data } = await worker.recognize(imgSrc);

  onProgress?.(92, '解析识别结果...');

  // 获取图片实际尺寸
  const { width: imgW, height: imgH } = await getImageDimensions(imgSrc);

  // 将 Tesseract 段落块转换为百分比坐标块
  const blocks: OCRBlock[] = [];

  // 遍历 blocks → paragraphs（tesseract.js v4/v5 结构）
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawBlocks: any[] = (data as any).blocks ?? [];
  for (const block of rawBlocks) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const paras: any[] = block.paragraphs ?? [];
    for (const para of paras) {
      const txt: string = (para.text ?? '').trim();
      if (!txt || (para.confidence ?? 0) < 30) continue;

      const { x0, y0, x1, y1 } = para.bbox ?? { x0: 0, y0: 0, x1: 0, y1: 0 };
      const bw = x1 - x0;
      const bh = y1 - y0;
      if (bw < 5 || bh < 5) continue;

      blocks.push({
        text: txt,
        x: Math.max(0, (x0 / imgW) * 100),
        y: Math.max(0, (y0 / imgH) * 100),
        width: Math.min(100, (bw / imgW) * 100),
        height: Math.min(100, (bh / imgH) * 100),
        confidence: para.confidence ?? 0,
      });
    }
  }

  // 若 blocks 结构为空，fallback 到直接使用 data.lines（部分版本）
  if (blocks.length === 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lines: any[] = (data as any).lines ?? [];
    for (const line of lines) {
      const txt: string = (line.text ?? '').trim();
      if (!txt || (line.confidence ?? 0) < 30) continue;
      const { x0, y0, x1, y1 } = line.bbox ?? { x0: 0, y0: 0, x1: 0, y1: 0 };
      const bw = x1 - x0;
      const bh = y1 - y0;
      if (bw < 5 || bh < 5) continue;
      blocks.push({
        text: txt,
        x: Math.max(0, (x0 / imgW) * 100),
        y: Math.max(0, (y0 / imgH) * 100),
        width: Math.min(100, (bw / imgW) * 100),
        height: Math.min(100, (bh / imgH) * 100),
        confidence: line.confidence ?? 0,
      });
    }
  }

  await worker.terminate();

  onProgress?.(100, '识别完成');

  return {
    blocks,
    imageWidth: imgW,
    imageHeight: imgH,
    fullText: data.text,
  };
}

/**
 * 将 OCRBlock[] 转换为 PPT SlideElement[]（文本框）
 * zIndex 从 startZ 开始递增
 */
export function ocrBlocksToElements(
  blocks: OCRBlock[],
  startZ = 2,
): SlideElement[] {
  return blocks.map((b, i): SlideElement => ({
    id: uuidv4(),
    type: 'text',
    x: Math.round(b.x * 10) / 10,
    y: Math.round(b.y * 10) / 10,
    width: Math.max(5, Math.round(b.width * 10) / 10),
    height: Math.max(3, Math.round(b.height * 10) / 10),
    zIndex: startZ + i,
    text: b.text,
    fontSize: estimateFontSize(b.height),
    fontColor: '#F8F9FA',
    fontWeight: 'normal',
    fontAlign: 'left',
  }));
}

// ── 辅助函数 ──────────────────────────────────────────────────────

function fileToDataURL(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function getImageDimensions(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({ width: 1000, height: 700 }); // fallback
    img.src = src;
  });
}

/** 根据文本块高度（百分比）估算字号 */
function estimateFontSize(heightPct: number): number {
  // 假设 PPT 高度 1080px，字号 ≈ 块高 * 0.7
  const pixelH = (heightPct / 100) * 1080;
  const size = Math.round(pixelH * 0.65);
  return Math.max(12, Math.min(size, 72));
}
