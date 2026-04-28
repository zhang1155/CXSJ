/**
 * FabricCanvas — 基于 Fabric.js 的 PPT 幻灯片画布
 * 支持：自由拖拽、四角缩放、旋转、等比例缩放、对齐辅助线
 */
import { useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import type { Slide, SlideElement } from '@/types/types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FabricCanvas = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FabricObject = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FabricLib = any;

// 动态引入 Fabric，避免 SSR/Node.js canvas 依赖问题
let fabricPromise: Promise<FabricLib> | null = null;
function getFabric(): Promise<FabricLib> {
  if (!fabricPromise) {
    fabricPromise = import('fabric').then((m) => m.fabric ?? m);
  }
  return fabricPromise;
}

const GUIDE_COLOR = '#3b82f6';
const GUIDE_WIDTH = 1;
const SNAP_THRESHOLD = 6; // px

interface FabricCanvasProps {
  slide: Slide;
  canvasWidth: number;
  canvasHeight: number;
  selectedId: string | null;
  onSelectElement: (id: string | null) => void;
  onUpdateElement: (id: string, patch: Partial<SlideElement>) => void;
}

export default function FabricCanvas({
  slide,
  canvasWidth,
  canvasHeight,
  selectedId,
  onSelectElement,
  onUpdateElement,
}: FabricCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fcRef = useRef<FabricCanvas | null>(null);
  // 标记是否正在从外部更新，避免循环触发 onChange
  const internalUpdateRef = useRef(false);
  // 组件是否已卸载——用于防止异步回调在 dispose() 后继续操作画布
  const mountedRef = useRef(true);
  // Bug3 修复：用 ref 持有最新回调，避免 init effect 的闭包捕获旧值
  const onUpdateElementRef = useRef(onUpdateElement);
  useEffect(() => { onUpdateElementRef.current = onUpdateElement; });

  // ── 将 SlideElement 百分比坐标转为像素 ───────────────────────────
  const toPixels = useCallback((el: SlideElement) => ({
    left:   (el.x / 100) * canvasWidth,
    top:    (el.y / 100) * canvasHeight,
    width:  (el.width / 100) * canvasWidth,
    height: (el.height / 100) * canvasHeight,
    angle:  el.rotation ?? 0,
  }), [canvasWidth, canvasHeight]);

  // ── 将 Fabric Object 像素坐标转回百分比 ──────────────────────────
  const fromPixels = useCallback((obj: FabricObject): Partial<SlideElement> => {
    const w = (obj.width ?? 0) * (obj.scaleX ?? 1);
    const h = (obj.height ?? 0) * (obj.scaleY ?? 1);
    return {
      x:        ((obj.left ?? 0) / canvasWidth) * 100,
      y:        ((obj.top  ?? 0) / canvasHeight) * 100,
      width:    (w / canvasWidth) * 100,
      height:   (h / canvasHeight) * 100,
      rotation: obj.angle ?? 0,
    };
  }, [canvasWidth, canvasHeight]);

  // Bug3 修复：fromPixelsRef 在 fromPixels 声明后初始化，并随 fromPixels 更新
  const fromPixelsRef = useRef(fromPixels);
  useEffect(() => { fromPixelsRef.current = fromPixels; }, [fromPixels]);

  // ── 对齐辅助线逻辑 ────────────────────────────────────────────────
  const drawGuides = useCallback((fc: FabricCanvas, moving: FabricObject) => {
    // 移除旧辅助线
    const oldGuides = fc.getObjects().filter((o: FabricObject) => o.isGuide);
    oldGuides.forEach((g: FabricObject) => fc.remove(g));

    const ml = moving.left ?? 0;
    const mt = moving.top  ?? 0;
    const mw = (moving.width  ?? 0) * (moving.scaleX ?? 1);
    const mh = (moving.height ?? 0) * (moving.scaleY ?? 1);
    const mRight  = ml + mw;
    const mBottom = mt + mh;
    const mCx = ml + mw / 2;
    const mCy = mt + mh / 2;

    const lines: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];

    // 与画布边缘对齐
    const canvasSnaps: Array<{ mv: number; cv: number; isH: boolean }> = [
      { mv: ml,      cv: 0,            isH: false },
      { mv: mRight,  cv: canvasWidth,  isH: false },
      { mv: mCx,     cv: canvasWidth / 2, isH: false },
      { mv: mt,      cv: 0,            isH: true },
      { mv: mBottom, cv: canvasHeight, isH: true },
      { mv: mCy,     cv: canvasHeight / 2, isH: true },
    ];
    for (const s of canvasSnaps) {
      if (Math.abs(s.mv - s.cv) < SNAP_THRESHOLD) {
        if (s.isH) {
          lines.push({ x1: 0, y1: s.cv, x2: canvasWidth, y2: s.cv });
        } else {
          lines.push({ x1: s.cv, y1: 0, x2: s.cv, y2: canvasHeight });
        }
      }
    }

    // 与其他元素对齐
    fc.getObjects().filter((o: FabricObject) =>
      o !== moving && !o.isGuide
    ).forEach((other: FabricObject) => {
      const ol = other.left ?? 0;
      const ot = other.top  ?? 0;
      const ow = (other.width  ?? 0) * (other.scaleX ?? 1);
      const oh = (other.height ?? 0) * (other.scaleY ?? 1);
      const oRight  = ol + ow;
      const oBottom = ot + oh;
      const oCx = ol + ow / 2;
      const oCy = ot + oh / 2;

      const pairs: Array<{ mv: number; cv: number; isH: boolean }> = [
        { mv: ml,      cv: ol,      isH: false },
        { mv: ml,      cv: oRight,  isH: false },
        { mv: mRight,  cv: ol,      isH: false },
        { mv: mRight,  cv: oRight,  isH: false },
        { mv: mCx,     cv: oCx,     isH: false },
        { mv: mt,      cv: ot,      isH: true  },
        { mv: mt,      cv: oBottom, isH: true  },
        { mv: mBottom, cv: ot,      isH: true  },
        { mv: mBottom, cv: oBottom, isH: true  },
        { mv: mCy,     cv: oCy,     isH: true  },
      ];
      for (const p of pairs) {
        if (Math.abs(p.mv - p.cv) < SNAP_THRESHOLD) {
          if (p.isH) {
            lines.push({ x1: 0, y1: p.cv, x2: canvasWidth, y2: p.cv });
          } else {
            lines.push({ x1: p.cv, y1: 0, x2: p.cv, y2: canvasHeight });
          }
        }
      }
    });

    // 去重并绘制
    const seen = new Set<string>();
    for (const l of lines) {
      const key = `${l.x1},${l.y1},${l.x2},${l.y2}`;
      if (seen.has(key)) continue;
      seen.add(key);
      getFabric().then((fabric) => {
        // 异步回调：重新从 ref 读取，若已卸载则放弃操作
        const currentFc = fcRef.current;
        if (!mountedRef.current || !currentFc) return;
        const line = new fabric.Line([l.x1, l.y1, l.x2, l.y2], {
          stroke: GUIDE_COLOR,
          strokeWidth: GUIDE_WIDTH,
          strokeDashArray: [4, 4],
          selectable: false,
          evented: false,
          hoverCursor: 'default',
        });
        line.isGuide = true;
        currentFc.add(line);
        line.bringToFront();
      });
    }
    fc.requestRenderAll();
  }, [canvasWidth, canvasHeight]);

  const clearGuides = useCallback((fc: FabricCanvas) => {
    const guides = fc.getObjects().filter((o: FabricObject) => o.isGuide);
    guides.forEach((g: FabricObject) => fc.remove(g));
    fc.requestRenderAll();
  }, []);

  // ── 关键：在 React DOM 提交阶段（commitMutationEffects）同步还原 canvas ──
  // Fabric.js 初始化时会把 React 渲染的 <canvas> 移入自己创建的 wrapperEl 里。
  // 当 key 变化导致组件卸载时，React 在 commitMutationEffects 阶段就调用
  // parent.removeChild(canvas)，但 canvas 已不在原始父节点下，抛出 NotFoundError。
  // useLayoutEffect cleanup 在 commitMutationEffects 期间同步执行，能赶在
  // React removeChild 之前把 canvas 移回原位。
  useLayoutEffect(() => {
    return () => {
      const canvas = canvasRef.current;
      const wrapper = fcRef.current?.wrapperEl as HTMLElement | null;
      if (canvas && wrapper && wrapper.parentNode && canvas.parentNode === wrapper) {
        wrapper.parentNode.insertBefore(canvas, wrapper);
      }
    };
  }, []);

  // ── 初始化 Fabric.js 画布 ─────────────────────────────────────────
  useEffect(() => {
    if (!canvasRef.current) return;
    let disposed = false;
    let fc: FabricCanvas | null = null;

    getFabric().then((fabric) => {
      if (disposed || !canvasRef.current) return;

      fc = new fabric.Canvas(canvasRef.current, {
        width: canvasWidth,
        height: canvasHeight,
        selection: true,
        preserveObjectStacking: true,
        backgroundColor: slide.background || '#111111',
        controlsAboveOverlay: true,
      });
      fcRef.current = fc;

      // 自定义控制点样式
      fabric.Object.prototype.set({
        borderColor: '#3b82f6',
        cornerColor: '#3b82f6',
        cornerSize: 8,
        cornerStyle: 'circle',
        transparentCorners: false,
        padding: 4,
      });

      // 选中事件
      fc.on('selection:created', (e: FabricObject) => {
        if (internalUpdateRef.current) return;
        const obj = e.selected?.[0];
        if (obj?.elementId) onSelectElement(obj.elementId);
      });
      fc.on('selection:updated', (e: FabricObject) => {
        if (internalUpdateRef.current) return;
        const obj = e.selected?.[0];
        if (obj?.elementId) onSelectElement(obj.elementId);
      });
      fc.on('selection:cleared', () => {
        if (internalUpdateRef.current) return;
        onSelectElement(null);
      });

      // 拖拽时显示对齐辅助线
      fc.on('object:moving', (e: FabricObject) => {
        if (e.target) drawGuides(fc, e.target);
      });
      fc.on('object:scaling', (e: FabricObject) => {
        if (e.target) drawGuides(fc, e.target);
      });

      // Bug3 修复：对象修改完成后通过 ref 读取最新 fromPixels 和 onUpdateElement
      const syncBack = (e: FabricObject) => {
        clearGuides(fc);
        const obj = e.target;
        if (!obj?.elementId) return;
        onUpdateElementRef.current(obj.elementId, fromPixelsRef.current(obj));
      };
      fc.on('object:modified', syncBack);

      // 加载现有元素
      renderElements(fc, fabric, slide.elements, toPixels, mountedRef, fcRef);
    });

    return () => {
      disposed = true;
      mountedRef.current = false;
      if (fc) {
        // useLayoutEffect cleanup 已在 React DOM 提交阶段把 canvas 移回原位，
        // 此处直接调用 dispose 即可。
        fc.dispose();
        fcRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 画布尺寸变化时重建 ────────────────────────────────────────────
  useEffect(() => {
    const fc = fcRef.current;
    if (!fc) return;
    fc.setWidth(canvasWidth);
    fc.setHeight(canvasHeight);
    fc.requestRenderAll();
  }, [canvasWidth, canvasHeight]);

  // ── 幻灯片背景变化 ────────────────────────────────────────────────
  useEffect(() => {
    const fc = fcRef.current;
    if (!fc) return;
    fc.backgroundColor = slide.background || '#111111';
    fc.requestRenderAll();
  }, [slide.background]);

  // ── 元素列表变化时同步到 Fabric ───────────────────────────────────
  useEffect(() => {
    getFabric().then((fabric) => {
      // 异步回调：重新从 ref 读取，若已卸载则放弃操作，避免操作已 dispose 的画布
      const fc = fcRef.current;
      if (!mountedRef.current || !fc) return;

      internalUpdateRef.current = true;
      // 删除非辅助线对象
      const nonGuides = fc.getObjects().filter((o: FabricObject) => !o.isGuide);
      nonGuides.forEach((o: FabricObject) => fc.remove(o));

      renderElements(fc, fabric, slide.elements, toPixels, mountedRef, fcRef);

      // 恢复选中
      if (selectedId) {
        const target = fc.getObjects().find((o: FabricObject) => o.elementId === selectedId);
        if (target) fc.setActiveObject(target);
      }
      fc.requestRenderAll();
      internalUpdateRef.current = false;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slide.elements, slide.background]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        display: 'block',
        width: canvasWidth,
        height: canvasHeight,
      }}
    />
  );
}

// ── 将 SlideElement[] 渲染到 Fabric.Canvas ─────────────────────────
function renderElements(
  fc: FabricCanvas,
  fabric: FabricLib,
  elements: SlideElement[],
  toPixels: (el: SlideElement) => { left: number; top: number; width: number; height: number; angle: number },
  mountedRef: React.MutableRefObject<boolean>,
  fcRef: React.MutableRefObject<FabricCanvas | null>,
) {
  // Bug5 修复：对 elements 做空值保护
  const safeElements = Array.isArray(elements) ? elements : [];
  const sorted = [...safeElements].sort((a, b) => a.zIndex - b.zIndex);
  for (const el of sorted) {
    const { left, top, width, height, angle } = toPixels(el);
    const common = {
      left, top, angle,
      hasRotatingPoint: true,
      lockUniScaling: false,
    };

    if (el.type === 'text') {
      const obj = new fabric.Textbox(el.text || '', {
        ...common,
        width,
        fontSize: el.fontSize || 16,
        fill: el.fontColor || '#ffffff',
        fontWeight: el.fontWeight || 'normal',
        textAlign: el.fontAlign || 'left',
        editable: true,
        splitByGrapheme: false,
      });
      obj.elementId = el.id;
      fc.add(obj);
    } else if (el.type === 'image' && el.imageUrl) {
      fabric.Image.fromURL(el.imageUrl, (img: FabricObject) => {
        // 图片加载是异步的，需要检查组件是否已卸载
        if (!mountedRef.current) return;
        const currentFc = fcRef.current;
        if (!currentFc) return;

        if (!img) {
          // Bug6 修复：图片加载失败时显示占位矩形+提示文字
          const placeholder = new fabric.Rect({
            ...common,
            width, height,
            fill: '#1a1a2e',
            stroke: '#ef4444',
            strokeWidth: 1,
            strokeDashArray: [4, 4],
            rx: 4, ry: 4,
          });
          placeholder.elementId = el.id;
          const hint = new fabric.Text('图片加载失败', {
            left: left + width / 2,
            top: top + height / 2,
            originX: 'center',
            originY: 'center',
            fontSize: Math.max(10, Math.min(width * 0.08, 16)),
            fill: '#ef4444',
            selectable: false,
            evented: false,
          });
          currentFc.add(placeholder);
          currentFc.add(hint);
          currentFc.requestRenderAll();
          return;
        }

        img.set({
          ...common,
          scaleX: width  / (img.width  || width),
          scaleY: height / (img.height || height),
        });
        img.elementId = el.id;
        currentFc.add(img);
        currentFc.requestRenderAll();
      }, { crossOrigin: 'anonymous' });
    } else if (el.type === 'video' && el.videoUrl) {
      // 视频元素用占位矩形 + 文本标注表示
      const rect = new fabric.Rect({
        ...common,
        width, height,
        fill: '#1a1a2e',
        stroke: '#3b82f6',
        strokeWidth: 2,
        rx: 4, ry: 4,
      });
      const label = new fabric.Text('🎬 视频', {
        left: left + width / 2,
        top: top + height / 2,
        originX: 'center',
        originY: 'center',
        fontSize: Math.max(12, Math.min(width * 0.1, 24)),
        fill: '#3b82f6',
        selectable: false,
        evented: false,
      });
      const group = new fabric.Group([rect, label], { ...common });
      group.elementId = el.id;
      fc.add(group);
    } else if (el.type === 'shape') {
      const rect = new fabric.Rect({
        ...common,
        width, height,
        fill: el.fillColor || '#3b82f6',
        stroke: el.borderColor || 'transparent',
        strokeWidth: el.borderWidth || 0,
        rx: 4, ry: 4,
      });
      rect.elementId = el.id;
      fc.add(rect);
    }
  }
}
