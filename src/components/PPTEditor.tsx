import { useState, useRef, useCallback, useEffect } from 'react';
import type React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import FabricCanvas from '@/components/FabricCanvas';
import OCRUploadDialog from '@/components/OCRUploadDialog';
import type { PPTData, Slide, SlideElement } from '@/types/types';
import { v4 as uuidv4 } from 'uuid';

interface PPTEditorProps {
  data: PPTData;
  onChange: (data: PPTData) => void;
  onSave: () => void;
  onExport: () => void;
  saving?: boolean;
  exporting?: boolean;
  saveSuccess?: boolean;
  exportProgress?: number;
}

const SLIDE_RATIO: Record<string, number> = {
  '16:9':   16 / 9,
  '4:3':    4 / 3,
  '9:16':   9 / 16,
  '1:1':    1,
  '2.35:1': 2.35,
  'custom': 16 / 9, // fallback
};

const SIZE_PRESETS = [
  { label: '16:9',  value: '16:9',  w: 1920, h: 1080 },
  { label: '4:3',   value: '4:3',   w: 1440, h: 1080 },
  { label: '9:16',  value: '9:16',  w: 1080, h: 1920 },
  { label: '1:1',   value: '1:1',   w: 1080, h: 1080 },
];

// ── 缩略图（纯 CSS 渲染） ──────────────────────────────────────────
function SlideThumbnail({ slide, index, isActive, onClick, aspectRatio }: {
  slide: Slide; index: number; isActive: boolean; onClick: (e: React.MouseEvent) => void; aspectRatio?: string;
}) {
  const ratio = SLIDE_RATIO[aspectRatio ?? '16:9'] ?? (16 / 9);
  // Bug4 修复：使用 includes('gradient') 精确判断渐变背景
  const getBg = (bg: string) =>
    bg.includes('gradient')
      ? { background: bg } : { backgroundColor: bg };
  return (
    <button
      type="button"
      onClick={(e) => onClick(e)}
      className={`w-full rounded-lg overflow-hidden border-2 transition-all ${
        isActive ? 'border-primary' : 'border-border hover:border-muted-foreground'
      }`}
    >
      <div className="relative w-full" style={{ paddingTop: `${(1 / ratio) * 100}%` }}>
        <div className="absolute inset-0" style={getBg(slide.background || '#0F111A')}>
          {[...slide.elements].sort((a, b) => a.zIndex - b.zIndex).map((el) => (
            <div
              key={el.id}
              className="absolute overflow-hidden"
              style={{
                left: `${el.x}%`, top: `${el.y}%`,
                width: `${el.width}%`, height: `${el.height}%`,
                color: el.fontColor || '#F8F9FA',
                fontSize: `${(el.fontSize || 12) * 0.22}px`,
                fontWeight: el.fontWeight || 'normal',
              }}
            >
              {el.type === 'text' && el.text}
              {el.type === 'image' && el.imageUrl && (
                <img src={el.imageUrl} alt="" className="w-full h-full object-cover" />
              )}
              {el.type === 'video' && (
                <div className="w-full h-full bg-blue-900/30 flex items-center justify-center text-[6px] text-blue-400">🎬</div>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="px-2 py-1 bg-card flex items-center justify-between">
        <span className="text-xs font-semibold text-foreground">{index + 1}</span>
        <span className="text-[9px] text-muted-foreground">页</span>
      </div>
    </button>
  );
}

// ── 幻灯片尺寸设置面板 ────────────────────────────────────────────
function SlideSizePanel({ data, onChange }: { data: PPTData; onChange: (d: PPTData) => void }) {
  const [customW, setCustomW] = useState(String(data.customWidth || 1920));
  const [customH, setCustomH] = useState(String(data.customHeight || 1080));

  const applyPreset = (preset: typeof SIZE_PRESETS[number]) => {
    onChange({ ...data, aspectRatio: preset.value as PPTData['aspectRatio'], customWidth: preset.w, customHeight: preset.h });
    setCustomW(String(preset.w));
    setCustomH(String(preset.h));
  };

  const applyCustom = () => {
    const w = Math.max(100, Math.min(10000, Number(customW) || 1920));
    const h = Math.max(100, Math.min(10000, Number(customH) || 1080));
    onChange({ ...data, aspectRatio: 'custom', customWidth: w, customHeight: h });
  };

  // Bug1 修复：用明确映射替代末端硬编码 1080，支持 4:3、2.35:1 等比例
  const DEFAULT_H: Record<string, number> = { '16:9': 1080, '4:3': 1080, '9:16': 1920, '1:1': 1080, '2.35:1': 816 };
  const currentW = data.customWidth || (data.aspectRatio === '16:9' ? 1920 : data.aspectRatio === '4:3' ? 1440 : 1080);
  const currentH = data.customHeight || (DEFAULT_H[data.aspectRatio] ?? 1080);

  return (
    <div className="p-3 space-y-4">
      <div>
        <p className="text-xs font-medium text-foreground mb-2">预设比例</p>
        <div className="grid grid-cols-2 gap-1.5">
          {SIZE_PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => applyPreset(p)}
              className={`py-2 rounded-lg text-xs font-medium border transition-all ${
                data.aspectRatio === p.value
                  ? 'border-ring bg-accent text-accent-foreground'
                  : 'border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground'
              }`}
            >
              <div>{p.label}</div>
              <div className="text-[10px] opacity-60 mt-0.5">{p.w}×{p.h}</div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs font-medium text-foreground mb-2">自定义尺寸</p>
        <div className="flex items-center gap-2 mb-2">
          <div className="flex-1">
            <Label className="text-[10px] text-muted-foreground">宽 (px)</Label>
            <input
              type="number"
              value={customW}
              onChange={(e) => setCustomW(e.target.value)}
              placeholder="1920"
              className="w-full h-7 mt-0.5 px-2 text-xs rounded-md bg-secondary border border-border text-foreground focus:border-ring focus:outline-none"
              min={100} max={10000}
            />
          </div>
          <span className="text-muted-foreground text-xs mt-4">×</span>
          <div className="flex-1">
            <Label className="text-[10px] text-muted-foreground">高 (px)</Label>
            <input
              type="number"
              value={customH}
              onChange={(e) => setCustomH(e.target.value)}
              placeholder="1080"
              className="w-full h-7 mt-0.5 px-2 text-xs rounded-md bg-secondary border border-border text-foreground focus:border-ring focus:outline-none"
              min={100} max={10000}
            />
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="w-full h-7 text-xs border-border"
          onClick={applyCustom}
        >
          应用自定义尺寸
        </Button>
      </div>

      <div className="pt-2 border-t border-border">
        <p className="text-xs text-muted-foreground">当前尺寸</p>
        <p className="text-sm font-medium text-foreground mt-0.5">{currentW} × {currentH} px</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">比例：{data.aspectRatio}</p>
      </div>
    </div>
  );
}

// ── 元素属性面板 ──────────────────────────────────────────────────
function ElementProperties({ element, onChange, onDelete }: {
  element: SlideElement;
  onChange: (updated: SlideElement) => void;
  onDelete: () => void;
}) {
  const update = (patch: Partial<SlideElement>) => onChange({ ...element, ...patch });

  return (
    <div className="space-y-3 p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-foreground">
          {element.type === 'text' ? '文本' : element.type === 'image' ? '图片' : element.type === 'video' ? '视频' : '元素'}
        </span>
        <button type="button" onClick={onDelete} className="text-xs text-destructive hover:text-destructive/80">删除</button>
      </div>

      {/* 位置尺寸 */}
      <div className="grid grid-cols-2 gap-2">
        {([['X%', 'x'], ['Y%', 'y'], ['W%', 'width'], ['H%', 'height']] as const).map(([label, key]) => (
          <div key={key}>
            <Label className="text-[10px] text-muted-foreground">{label}</Label>
            <Input
              type="number"
              value={Math.round(element[key] as number)}
              onChange={(e) => update({ [key]: Number(e.target.value) })}
              className="h-7 text-xs bg-muted border-border"
              min={0} max={100}
            />
          </div>
        ))}
      </div>

      {/* 旋转角度 */}
      <div>
        <Label className="text-[10px] text-muted-foreground mb-1 block">旋转: {Math.round(element.rotation ?? 0)}°</Label>
        <Slider
          value={[element.rotation ?? 0]}
          onValueChange={([v]) => update({ rotation: v })}
          min={-180} max={180} step={1}
          className="w-full"
        />
      </div>

      {/* 文本属性 */}
      {element.type === 'text' && (
        <>
          <div>
            <Label className="text-[10px] text-muted-foreground">文本内容</Label>
            <textarea
              value={element.text || ''}
              onChange={(e) => update({ text: e.target.value })}
              className="w-full mt-1 text-xs p-2 rounded bg-muted border border-border text-foreground resize-none focus:border-primary focus:outline-none"
              rows={3}
            />
          </div>
          <div>
            <Label className="text-[10px] text-muted-foreground mb-1 block">字体大小: {element.fontSize || 16}px</Label>
            <Slider value={[element.fontSize || 16]} onValueChange={([v]) => update({ fontSize: v })} min={8} max={80} step={1} className="w-full" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[10px] text-muted-foreground">字体颜色</Label>
              <div className="flex items-center gap-2 mt-1">
                <input type="color" value={element.fontColor || '#F8F9FA'} onChange={(e) => update({ fontColor: e.target.value })} className="w-7 h-7 rounded cursor-pointer border border-border bg-transparent" />
                <span className="text-xs text-muted-foreground">{element.fontColor || '#F8F9FA'}</span>
              </div>
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">对齐</Label>
              <Select value={element.fontAlign || 'left'} onValueChange={(v) => update({ fontAlign: v as 'left' | 'center' | 'right' })}>
                <SelectTrigger className="h-7 mt-1 text-xs bg-muted border-border"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="left" className="text-xs">左</SelectItem>
                  <SelectItem value="center" className="text-xs">中</SelectItem>
                  <SelectItem value="right" className="text-xs">右</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Select value={element.fontWeight || 'normal'} onValueChange={(v) => update({ fontWeight: v as 'normal' | 'bold' })}>
            <SelectTrigger className="h-7 text-xs bg-muted border-border"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-card border-border">
              <SelectItem value="normal" className="text-xs">正常</SelectItem>
              <SelectItem value="bold" className="text-xs">粗体</SelectItem>
            </SelectContent>
          </Select>
        </>
      )}

      {/* 层级 */}
      <div>
        <Label className="text-[10px] text-muted-foreground mb-1 block">层级: {element.zIndex}</Label>
        <Slider value={[element.zIndex]} onValueChange={([v]) => update({ zIndex: v })} min={0} max={20} step={1} className="w-full" />
      </div>
    </div>
  );
}



const PRESET_BACKGROUNDS = [
  '#0F111A', '#111111', '#FFFFFF', '#1E2133',
  '#0A0E1E', 'linear-gradient(135deg, #1a0533, #0F111A, #001533)',
  'linear-gradient(135deg, #001533, #0F111A)',
];

export default function PPTEditor({
  data,
  onChange,
  onSave,
  onExport,
  saving,
  exporting,
  saveSuccess,
  exportProgress,
}: PPTEditorProps) {
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [selectedElement, setSelectedElement] = useState<string | null>(null);
  const [rightTab, setRightTab] = useState<'props' | 'size'>('props');
  const [ocrOpen, setOcrOpen] = useState(false);
  // Feature2：多选幻灯片
  const [selectedSlides, setSelectedSlides] = useState<Set<number>>(new Set());
  // Feature3：快捷键面板
  const [showShortcuts, setShowShortcuts] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const [canvasContainerW, setCanvasContainerW] = useState(800);

  // 观察画布容器宽度变化
  useEffect(() => {
    const el = canvasContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width;
      if (w > 0) setCanvasContainerW(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const activeSlide = data.slides[activeSlideIndex] || data.slides[0];

  // 计算画布像素尺寸（保持比例，适配容器）
  const getCanvasDimensions = useCallback(() => {
    let ratio: number;
    if (data.aspectRatio === 'custom' && data.customWidth && data.customHeight) {
      ratio = data.customWidth / data.customHeight;
    } else {
      ratio = SLIDE_RATIO[data.aspectRatio] ?? (16 / 9);
    }
    const maxW = Math.max(200, canvasContainerW - 48);
    const maxH = Math.round(maxW / ratio);
    return { canvasWidth: maxW, canvasHeight: maxH };
  }, [data.aspectRatio, data.customWidth, data.customHeight, canvasContainerW]);

  const { canvasWidth, canvasHeight } = getCanvasDimensions();

  const updateSlide = useCallback((slideId: string, patch: Partial<Slide>) => {
    onChange({
      ...data,
      slides: data.slides.map((s) => s.id === slideId ? { ...s, ...patch } : s),
    });
  }, [data, onChange]);

  const updateElementInSlide = useCallback((slideId: string, elId: string, patch: Partial<SlideElement>) => {
    const slide = data.slides.find((s) => s.id === slideId);
    if (!slide) return;
    updateSlide(slideId, {
      elements: slide.elements.map((e) => e.id === elId ? { ...e, ...patch } : e),
    });
  }, [data, updateSlide]);

  const deleteElement = (slideId: string, elId: string) => {
    const slide = data.slides.find((s) => s.id === slideId);
    if (!slide) return;
    updateSlide(slideId, { elements: slide.elements.filter((e) => e.id !== elId) });
    setSelectedElement(null);
  };

  const addTextElement = () => {
    if (!activeSlide) return;
    const newEl: SlideElement = {
      id: uuidv4(), type: 'text',
      x: 10, y: 40, width: 80, height: 15, zIndex: activeSlide.elements.length + 1,
      text: '双击编辑文本', fontSize: 24, fontColor: '#F8F9FA', fontWeight: 'normal', fontAlign: 'center',
    };
    updateSlide(activeSlide.id, { elements: [...activeSlide.elements, newEl] });
    setSelectedElement(newEl.id);
  };

  const addImageElement = useCallback((imageUrl: string) => {
    if (!activeSlide) return;
    const newEl: SlideElement = {
      id: uuidv4(), type: 'image',
      x: 10, y: 10, width: 80, height: 60, zIndex: activeSlide.elements.length + 1,
      imageUrl,
    };
    updateSlide(activeSlide.id, { elements: [...activeSlide.elements, newEl] });
    setSelectedElement(newEl.id);
  }, [activeSlide, updateSlide]);

  const addVideoElement = useCallback((videoUrl: string) => {
    if (!activeSlide) return;
    const newEl: SlideElement = {
      id: uuidv4(), type: 'video',
      x: 10, y: 10, width: 80, height: 60, zIndex: activeSlide.elements.length + 1,
      videoUrl,
    };
    updateSlide(activeSlide.id, { elements: [...activeSlide.elements, newEl] });
    setSelectedElement(newEl.id);
  }, [activeSlide, updateSlide]);

  // 通过 CustomEvent 接收来自 AIGenerator / AIVideoGenerator 的图片/视频插入请求
  useEffect(() => {
    const handleAddImage = (e: Event) => {
      const url = (e as CustomEvent<string>).detail;
      if (url) addImageElement(url);
    };
    const handleAddVideo = (e: Event) => {
      const url = (e as CustomEvent<string>).detail;
      if (url) addVideoElement(url);
    };
    window.addEventListener('ppt:addImage', handleAddImage);
    window.addEventListener('ppt:addVideo', handleAddVideo);
    return () => {
      window.removeEventListener('ppt:addImage', handleAddImage);
      window.removeEventListener('ppt:addVideo', handleAddVideo);
    };
  }, [addImageElement, addVideoElement]);

  // OCR 识别结果插入当前幻灯片
  const handleOCRInsert = useCallback((elements: SlideElement[], bgImageUrl?: string) => {
    if (!activeSlide) return;
    const newElements = [...activeSlide.elements];
    // 可选：原图作为背景层（zIndex = 0）
    if (bgImageUrl) {
      newElements.push({
        id: uuidv4(), type: 'image',
        x: 0, y: 0, width: 100, height: 100, zIndex: 0,
        imageUrl: bgImageUrl,
      });
    }
    newElements.push(...elements);
    updateSlide(activeSlide.id, { elements: newElements });
    if (elements.length > 0) setSelectedElement(elements[0].id);
  }, [activeSlide, updateSlide]);

  const addNewSlide = () => {
    const newSlide: Slide = { id: uuidv4(), background: '#0F111A', elements: [], order: data.slides.length };
    const applyAdd = () => {
      onChange({ ...data, slides: [...data.slides, newSlide] });
      setActiveSlideIndex(data.slides.length);
      setSelectedElement(null);
    };
    try {
      applyAdd();
    } catch (e) {
      if ((e as Error)?.message?.includes('removeChild')) {
        // Portal removeChild 冲突，等 ErrorBoundary 恢复后重试（100ms 内完成）
        setTimeout(applyAdd, 200);
      } else {
        throw e;
      }
    }
  };

  const deleteSlide = (index: number) => {
    if (data.slides.length <= 1) return;
    const newSlides = data.slides.filter((_, i) => i !== index);
    const applyDelete = () => {
      onChange({ ...data, slides: newSlides.map((s, i) => ({ ...s, order: i })) });
      setActiveSlideIndex(Math.min(index, newSlides.length - 1));
      setSelectedElement(null);
    };
    try {
      applyDelete();
    } catch (e) {
      if ((e as Error)?.message?.includes('removeChild')) {
        setTimeout(applyDelete, 200);
      } else {
        throw e;
      }
    }
  };

  // 第2项：复制幻灯片
  const duplicateSlide = (index: number) => {
    const sorted = [...data.slides].sort((a, b) => a.order - b.order);
    const src = sorted[index];
    if (!src) return;
    const copy: Slide = {
      ...src,
      id: uuidv4(),
      elements: src.elements.map((el) => ({ ...el, id: uuidv4() })),
      order: index + 1,
    };
    const newSlides = [
      ...sorted.slice(0, index + 1),
      copy,
      ...sorted.slice(index + 1),
    ].map((s, i) => ({ ...s, order: i }));
    requestAnimationFrame(() => {
      onChange({ ...data, slides: newSlides });
      setActiveSlideIndex(index + 1);
      setSelectedElement(null);
    });
  };

  // 第2项：拖拽排序
  const dragIndexRef = useRef<number | null>(null);

  const moveSlide = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    const sorted = [...data.slides].sort((a, b) => a.order - b.order);
    const moved = sorted.splice(fromIndex, 1)[0];
    sorted.splice(toIndex, 0, moved);
    onChange({ ...data, slides: sorted.map((s, i) => ({ ...s, order: i })) });
    setActiveSlideIndex(toIndex);
  };

  // 第4项：键盘快捷键（Ctrl+S 保存 / Delete 删除选中元素）
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      const isEditing = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable;
      if (isEditing) return;

      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        onSave();
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedElement && activeSlide) {
        e.preventDefault();
        deleteElement(activeSlide.id, selectedElement);
      }
      // Feature3: ? 键切换快捷键面板
      if (e.key === '?' || e.key === '/') {
        e.preventDefault();
        setShowShortcuts((v) => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedElement, activeSlide, onSave]);

  // Feature2：批量删除选中幻灯片
  const batchDeleteSlides = () => {
    if (selectedSlides.size === 0) return;
    const sorted = [...data.slides].sort((a, b) => a.order - b.order);
    const newSlides = sorted.filter((_, i) => !selectedSlides.has(i)).map((s, i) => ({ ...s, order: i }));
    if (newSlides.length === 0) return; // 至少保留一页
    onChange({ ...data, slides: newSlides });
    const newActive = Math.min(activeSlideIndex, newSlides.length - 1);
    setActiveSlideIndex(newActive);
    setSelectedSlides(new Set());
    setSelectedElement(null);
  };

  // Feature2：批量复制选中幻灯片
  const batchDuplicateSlides = () => {
    if (selectedSlides.size === 0) return;
    const sorted = [...data.slides].sort((a, b) => a.order - b.order);
    const inserts: Slide[] = sorted
      .filter((_, i) => selectedSlides.has(i))
      .map((s) => ({ ...s, id: uuidv4(), elements: s.elements.map((el) => ({ ...el, id: uuidv4() })) }));
    const newSlides = [...sorted, ...inserts].map((s, i) => ({ ...s, order: i }));
    onChange({ ...data, slides: newSlides });
    setSelectedSlides(new Set());
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const url = ev.target?.result as string;
      if (url) addImageElement(url);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const selectedEl = activeSlide?.elements.find((e) => e.id === selectedElement);

  // 画布拖拽调整大小（右下角 handle）
  const isResizingCanvas = useRef(false);
  const resizeStartX = useRef(0);
  const resizeStartW = useRef(0);

  const onResizeMouseDown = (e: React.MouseEvent) => {
    isResizingCanvas.current = true;
    resizeStartX.current = e.clientX;
    resizeStartW.current = canvasContainerW;
    e.preventDefault();
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isResizingCanvas.current) return;
      const delta = e.clientX - resizeStartX.current;
      const newW = Math.max(300, Math.min(1200, resizeStartW.current + delta));
      setCanvasContainerW(newW);
    };
    const onUp = () => { isResizingCanvas.current = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  return (
    <div className="flex h-full bg-background border-t border-border relative">
      {/* 左侧：幻灯片列表 */}
      <div className="w-36 shrink-0 border-r border-border flex flex-col">
        <div className="p-2 border-b border-border flex items-center justify-between">
          <span className="text-xs text-muted-foreground font-medium">幻灯片</span>
          <button type="button" onClick={addNewSlide} className="text-xs text-primary hover:text-primary/80 font-medium">+ 新增</button>
        </div>
        {/* Feature2：批量操作工具栏 */}
        {selectedSlides.size > 0 && (
          <div className="px-2 py-1.5 border-b border-border bg-accent/30 flex items-center justify-between gap-1">
            <span className="text-[10px] text-muted-foreground">已选 {selectedSlides.size} 页</span>
            <div className="flex gap-1">
              <button type="button" onClick={batchDuplicateSlides} title="批量复制"
                className="w-5 h-5 rounded bg-secondary text-foreground text-[11px] flex items-center justify-center hover:bg-accent">⧉</button>
              {selectedSlides.size < data.slides.length && (
                <button type="button" onClick={batchDeleteSlides} title="批量删除"
                  className="w-5 h-5 rounded bg-destructive/80 text-white text-[11px] flex items-center justify-center hover:bg-destructive">×</button>
              )}
            </div>
          </div>
        )}
        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          {[...data.slides].sort((a, b) => a.order - b.order).map((slide, idx) => (
            <div
              key={slide.id}
              className={`relative group ${selectedSlides.has(idx) ? 'ring-1 ring-ring rounded-lg' : ''}`}
              draggable
              onDragStart={() => { dragIndexRef.current = idx; }}
              onDragOver={(e) => { e.preventDefault(); }}
              onDrop={() => {
                if (dragIndexRef.current !== null && dragIndexRef.current !== idx) {
                  moveSlide(dragIndexRef.current, idx);
                }
                dragIndexRef.current = null;
              }}
              onDragEnd={() => { dragIndexRef.current = null; }}
            >
              <SlideThumbnail
                slide={slide} index={idx} isActive={idx === activeSlideIndex}
                onClick={(e) => {
                  // Feature2: Shift+点击多选
                  if ((e as unknown as React.MouseEvent).shiftKey) {
                    setSelectedSlides((prev) => {
                      const next = new Set(prev);
                      if (next.has(idx)) next.delete(idx); else next.add(idx);
                      return next;
                    });
                  } else {
                    setSelectedSlides(new Set());
                    setActiveSlideIndex(idx);
                    setSelectedElement(null);
                  }
                }}
                aspectRatio={data.aspectRatio}
              />
              {/* 右上角：复制 + 删除 */}
              <div className="absolute top-1 right-1 hidden group-hover:flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); duplicateSlide(idx); }}
                  className="w-5 h-5 rounded bg-secondary/90 text-foreground text-[11px] flex items-center justify-center hover:bg-accent transition-colors"
                  title="复制幻灯片"
                >⧉</button>
                {data.slides.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); deleteSlide(idx); }}
                    className="w-5 h-5 rounded bg-destructive/80 text-white text-[11px] flex items-center justify-center hover:bg-destructive transition-colors"
                    title="删除幻灯片"
                  >×</button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 中间：画布区 */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 工具栏 */}
        <div className="h-10 border-b border-border flex items-center px-3 gap-2 shrink-0 overflow-x-auto">
          <Button size="sm" variant="outline" className="h-7 text-xs border-border px-2 shrink-0" onClick={addTextElement}>+ 文本</Button>
          <Button size="sm" variant="outline" className="h-7 text-xs border-border px-2 shrink-0" onClick={() => fileInputRef.current?.click()}>+ 图片</Button>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
          {/* 图片转可编辑 PPT */}
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs border-primary/40 text-primary hover:bg-primary/10 px-2 shrink-0 flex items-center gap-1"
            onClick={() => setOcrOpen(true)}
            title="上传图片，AI 识别文字生成可编辑文本框"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
            </svg>
            图转可编辑
          </Button>

          {/* 背景设置 */}
          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" variant="outline" className="h-7 text-xs border-border px-2 shrink-0 flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm border border-border/50 shrink-0"
                  style={{ background: activeSlide?.background.includes('gradient') ? 'linear-gradient(135deg,#00e5ff,#7b61ff)' : activeSlide?.background || '#0F111A' }} />
                背景
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 bg-card border-border p-3">
              <p className="text-xs text-muted-foreground mb-2 font-medium">背景颜色 / 渐变</p>
              <div className="grid grid-cols-4 gap-2 mb-3">
                {PRESET_BACKGROUNDS.map((bg, i) => (
                  <button key={i} type="button" onClick={() => updateSlide(activeSlide.id, { background: bg })}
                    className={`w-8 h-8 rounded border-2 transition-all ${activeSlide?.background === bg ? 'border-primary' : 'border-border'}`}
                    style={{ background: bg }} title={bg} />
                ))}
              </div>
              <p className="text-xs text-muted-foreground mb-1">自定义颜色</p>
              <div className="flex items-center gap-2">
                <input type="color"
                  value={activeSlide?.background?.startsWith('#') ? activeSlide.background : '#0F111A'}
                  onChange={(e) => updateSlide(activeSlide.id, { background: e.target.value })}
                  className="w-8 h-8 rounded cursor-pointer border border-border bg-transparent" />
                <Input
                  value={activeSlide?.background?.startsWith('#') ? activeSlide.background : ''}
                  onChange={(e) => updateSlide(activeSlide.id, { background: e.target.value })}
                  placeholder="#0F111A" className="h-7 text-xs bg-muted border-border" />
              </div>
            </PopoverContent>
          </Popover>

          <div className="ml-auto flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              variant="outline"
              className={`h-7 text-xs border-border transition-colors ${saveSuccess ? 'border-green-500/60 text-green-500 bg-green-500/10' : ''}`}
              onClick={onSave}
              disabled={saving}
            >
              {saving ? '保存中...' : saveSuccess ? '✓ 已保存' : '保存'}
            </Button>
            <div className="relative">
              <Button size="sm" className="h-7 text-xs btn-gradient text-background" onClick={onExport} disabled={exporting}>
                {exporting ? '导出中...' : '导出 PPTX'}
              </Button>
              {(exportProgress ?? 0) > 0 && (
                <div className="absolute top-full left-0 right-0 mt-0.5 bg-secondary rounded-full h-0.5 overflow-hidden">
                  <div className="h-full bg-primary transition-all duration-300" style={{ width: `${exportProgress}%` }} />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Fabric.js 画布 + 拖拽 handle */}
        <div className="flex-1 flex items-center justify-center p-6 bg-muted/20 overflow-auto" ref={canvasContainerRef}>
          <div className="relative inline-block">
            {activeSlide && (
              <div
                className="rounded-lg overflow-hidden shadow-2xl"
                style={{ width: canvasWidth, height: canvasHeight }}
              >
                <FabricCanvas
                  key={activeSlide.id}
                  slide={activeSlide}
                  canvasWidth={canvasWidth}
                  canvasHeight={canvasHeight}
                  selectedId={selectedElement}
                  onSelectElement={setSelectedElement}
                  onUpdateElement={(elId, patch) => updateElementInSlide(activeSlide.id, elId, patch)}
                />
              </div>
            )}
            {/* 右下角拖拽调整画布大小 */}
            <div
              className="absolute -bottom-1 -right-1 w-5 h-5 flex items-center justify-center cursor-se-resize rounded-sm bg-border/80 hover:bg-primary/30 transition-colors"
              onMouseDown={onResizeMouseDown}
              title="拖拽调整画布大小"
            >
              <svg className="w-3 h-3 text-muted-foreground" fill="currentColor" viewBox="0 0 6 6">
                <path d="M6 0v6H0L6 0z" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* 右侧：属性/尺寸 双 Tab */}
      <div className="w-52 shrink-0 border-l border-border flex flex-col">
        <div className="flex border-b border-border shrink-0">
          {(['props', 'size'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setRightTab(tab)}
              className={`flex-1 py-2 text-xs font-medium transition-colors ${
                rightTab === tab ? 'text-foreground border-b-2 border-ring -mb-px' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab === 'props' ? '元素属性' : '尺寸设置'}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          {rightTab === 'props' ? (
            selectedEl ? (
              <ElementProperties
                element={selectedEl}
                onChange={(updated) => updateElementInSlide(activeSlide.id, selectedEl.id, updated)}
                onDelete={() => deleteElement(activeSlide.id, selectedEl.id)}
              />
            ) : (
              <div className="p-3 text-xs text-muted-foreground">
                <p>点击画布中的元素以编辑属性</p>
                <div className="mt-4 space-y-1.5">
                  <p className="font-medium text-foreground">幻灯片信息</p>
                  <p>第 {activeSlideIndex + 1} / {data.slides.length} 页</p>
                  <p>元素：{activeSlide?.elements.length || 0} 个</p>
                  <p>尺寸：{canvasWidth} × {canvasHeight} px</p>
                </div>
              </div>
            )
          ) : (
            <SlideSizePanel data={data} onChange={onChange} />
          )}
        </div>
      </div>

      {/* OCR 图片转可编辑对话框 */}
      <OCRUploadDialog
        open={ocrOpen}
        onClose={() => setOcrOpen(false)}
        onInsert={handleOCRInsert}
        existingCount={activeSlide?.elements.length || 0}
      />

      {/* Feature3：快捷键提示面板（右下角，? 键切换） */}
      {showShortcuts && (
        <div className="absolute bottom-4 right-4 z-50 bg-card border border-border rounded-xl shadow-2xl p-4 w-52 text-xs">
          <div className="flex items-center justify-between mb-3">
            <span className="font-semibold text-foreground">快捷键</span>
            <button type="button" onClick={() => setShowShortcuts(false)} className="text-muted-foreground hover:text-foreground text-base leading-none">×</button>
          </div>
          <div className="space-y-2">
            {[
              { key: 'Ctrl+S', desc: '保存' },
              { key: 'Delete', desc: '删除选中元素' },
              { key: 'Ctrl+Z', desc: '撤销（预留）' },
              { key: 'Ctrl+D', desc: '复制元素（预留）' },
              { key: 'Ctrl+A', desc: '全选元素（预留）' },
              { key: 'Shift+点击', desc: '多选幻灯片' },
              { key: '?', desc: '切换此面板' },
            ].map(({ key, desc }) => (
              <div key={key} className="flex items-center justify-between gap-2">
                <kbd className="px-1.5 py-0.5 rounded bg-secondary border border-border text-[10px] font-mono text-foreground shrink-0">{key}</kbd>
                <span className="text-muted-foreground text-right">{desc}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* Feature3：右下角 ? 提示入口 */}
      <button
        type="button"
        title="快捷键 (按 ?)"
        onClick={() => setShowShortcuts((v) => !v)}
        className="absolute bottom-4 right-4 w-7 h-7 rounded-full bg-secondary border border-border text-muted-foreground text-xs font-bold hover:text-foreground hover:border-muted-foreground transition-colors z-40 flex items-center justify-center"
        style={{ display: showShortcuts ? 'none' : 'flex' }}
      >?</button>
    </div>
  );
}

