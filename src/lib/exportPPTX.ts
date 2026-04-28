import PptxGenJS from 'pptxgenjs';
import type { PPTData, Slide, SlideElement } from '@/types/types';

// 根据 aspectRatio 获取宽高 (英寸)
function getSlideDimensions(ratio: string): { w: number; h: number } {
  switch (ratio) {
    case '4:3': return { w: 10, h: 7.5 };
    case '9:16': return { w: 7.5, h: 13.33 };
    case '1:1': return { w: 10, h: 10 };
    default: return { w: 13.33, h: 7.5 }; // 16:9
  }
}

// 将百分比坐标转换为英寸
function pctToInch(pct: number, total: number): number {
  return (pct / 100) * total;
}

// 将 hex/rgb 颜色转为 pptx 期望的 6 位 HEX
function normalizeColor(color: string): string {
  const cleaned = color.replace('#', '').toUpperCase();
  if (cleaned.length === 3) {
    return cleaned.split('').map((c) => c + c).join('');
  }
  return cleaned.padEnd(6, '0').slice(0, 6);
}

function applyBackgroundToSlide(slide: Slide, pptSlide: PptxGenJS.Slide, w: number, h: number) {
  const bg = slide.background;
  if (!bg) {
    pptSlide.background = { color: '0F111A' };
    return;
  }
  if (bg.startsWith('linear-gradient') || bg.startsWith('radial-gradient')) {
    // Gradient: 使用近似色替代（PPTX 原生不支持 CSS gradient）
    pptSlide.background = { color: '0F111A' };
  } else if (bg.startsWith('http') || bg.startsWith('data:')) {
    pptSlide.background = { data: bg };
  } else {
    try {
      pptSlide.background = { color: normalizeColor(bg) };
    } catch {
      pptSlide.background = { color: '0F111A' };
    }
  }
}

function addElementToSlide(
  el: SlideElement,
  pptSlide: PptxGenJS.Slide,
  w: number,
  h: number,
) {
  const x = pctToInch(el.x, w);
  const y = pctToInch(el.y, h);
  const elW = pctToInch(el.width, w);
  const elH = pctToInch(el.height, h);

  if (el.type === 'text' && el.text) {
    const color = el.fontColor ? normalizeColor(el.fontColor) : 'F8F9FA';
    pptSlide.addText(el.text, {
      x,
      y,
      w: elW,
      h: elH,
      fontSize: el.fontSize || 18,
      color,
      bold: el.fontWeight === 'bold',
      align: (el.fontAlign as 'left' | 'center' | 'right') || 'left',
      breakLine: true,
      wrap: true,
      fontFace: 'Arial',
    });
  } else if (el.type === 'image' && el.imageUrl) {
    pptSlide.addImage({
      path: el.imageUrl,
      x,
      y,
      w: elW,
      h: elH,
    });
  }
}

export async function exportToPPTX(data: PPTData, title: string): Promise<void> {
  const pptx = new PptxGenJS();
  const { w, h } = getSlideDimensions(data.aspectRatio);
  pptx.defineLayout({ name: 'CUSTOM', width: w, height: h });
  pptx.layout = 'CUSTOM';

  // 按 order 排序幻灯片
  const sorted = [...data.slides].sort((a, b) => a.order - b.order);

  for (const slideData of sorted) {
    const slide = pptx.addSlide();
    applyBackgroundToSlide(slideData, slide, w, h);
    // 按 zIndex 排序元素
    const els = [...slideData.elements].sort((a, b) => a.zIndex - b.zIndex);
    for (const el of els) {
      addElementToSlide(el, slide, w, h);
    }
  }

  await pptx.writeFile({ fileName: `${title || 'AI-PPT'}.pptx` });
}
