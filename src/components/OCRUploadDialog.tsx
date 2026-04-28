/**
 * OCRUploadDialog
 * 图片转可编辑 PPT 对话框
 * 流程：上传图片 → OCR识别 → 预览文字块 → 插入幻灯片
 */
import { useState, useRef, useCallback } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { runOCR, ocrBlocksToElements, type OCRBlock, type OCRResult } from '@/lib/ocrProcessor';
import type { SlideElement } from '@/types/types';

interface Props {
  open: boolean;
  onClose: () => void;
  /** 识别完成后将元素和可选背景图插入当前幻灯片 */
  onInsert: (elements: SlideElement[], bgImageUrl?: string) => void;
  /** 当前幻灯片已有元素数量（用于 zIndex 计算） */
  existingCount: number;
}

type Step = 'upload' | 'processing' | 'preview';

export default function OCRUploadDialog({ open, onClose, onInsert, existingCount }: Props) {
  const [step, setStep] = useState<Step>('upload');
  const [imgSrc, setImgSrc] = useState<string>('');
  const [progress, setProgress] = useState(0);
  const [progressStatus, setProgressStatus] = useState('');
  const [result, setResult] = useState<OCRResult | null>(null);
  // 用户可取消勾选某些文字块
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [keepBackground, setKeepBackground] = useState(true);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep('upload');
    setImgSrc('');
    setProgress(0);
    setProgressStatus('');
    setResult(null);
    setSelectedIds(new Set());
    setKeepBackground(true);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const processFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) return;

    // 预览图
    const dataURL = await new Promise<string>((res) => {
      const reader = new FileReader();
      reader.onload = () => res(reader.result as string);
      reader.readAsDataURL(file);
    });
    setImgSrc(dataURL);
    setStep('processing');
    setProgress(0);

    try {
      const ocr = await runOCR(file, (pct, status) => {
        setProgress(pct);
        setProgressStatus(status);
      });
      setResult(ocr);
      // 默认全选
      setSelectedIds(new Set(ocr.blocks.map((_, i) => i)));
      setStep('preview');
    } catch (e) {
      console.error('[OCR] 识别失败:', e);
      setProgressStatus('识别失败，请重试');
      setStep('upload');
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) processFile(f);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) processFile(f);
  };

  const toggleBlock = (idx: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  const handleInsert = () => {
    if (!result) return;
    const chosenBlocks: OCRBlock[] = result.blocks.filter((_, i) => selectedIds.has(i));
    const elements = ocrBlocksToElements(chosenBlocks, existingCount + 1);
    onInsert(
      elements,
      keepBackground ? imgSrc : undefined,
    );
    handleClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-card border-border max-w-2xl rounded-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="text-foreground text-base flex items-center gap-2">
            <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
            </svg>
            图片转可编辑 PPT
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-xs">
            上传图片，AI 自动识别文字区域，生成可编辑文本框
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0">
          {/* ── Step 1：上传 ── */}
          {step === 'upload' && (
            <div className="p-4">
              <div
                role="button"
                tabIndex={0}
                className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center gap-4 cursor-pointer transition-all ${
                  dragging
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-ring/60 hover:bg-secondary/30'
                }`}
                onClick={() => fileRef.current?.click()}
                onKeyDown={(e) => e.key === 'Enter' && fileRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
              >
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <svg className="w-8 h-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
                  </svg>
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-foreground">拖拽图片到此处，或点击上传</p>
                  <p className="text-xs text-muted-foreground mt-1">支持 JPG、PNG、WEBP · 建议清晰截图效果更佳</p>
                </div>
                <div className="px-4 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium pointer-events-none">
                  选择文件
                </div>
              </div>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />

              {/* 使用说明 */}
              <div className="mt-4 p-3 bg-secondary/40 rounded-lg">
                <p className="text-xs text-muted-foreground font-medium mb-1.5">💡 使用说明</p>
                <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                  <li>识别 PPT 截图、设计稿、文档照片中的文字</li>
                  <li>支持中英文混排识别</li>
                  <li>识别后可编辑每个文字块，保留原图作为背景参考</li>
                  <li>首次使用需下载语言包（约 10MB），请保持网络连接</li>
                </ul>
              </div>
            </div>
          )}

          {/* ── Step 2：识别进度 ── */}
          {step === 'processing' && (
            <div className="p-8 flex flex-col items-center gap-6">
              <div className="relative w-24 h-24">
                <div className="w-24 h-24 rounded-full border-2 border-border overflow-hidden">
                  {imgSrc && <img src={imgSrc} alt="正在识别" className="w-full h-full object-cover" />}
                </div>
                {/* 扫描动画 */}
                <div
                  className="absolute inset-x-0 h-0.5 bg-primary/80 shadow-[0_0_8px_2px_rgba(99,102,241,0.6)]"
                  style={{
                    top: `${progress}%`,
                    transition: 'top 0.3s ease',
                  }}
                />
              </div>

              <div className="w-full max-w-sm space-y-2">
                <Progress value={progress} className="h-1.5 bg-secondary" />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{progressStatus || 'OCR 识别中...'}</span>
                  <span>{progress}%</span>
                </div>
              </div>

              <p className="text-xs text-muted-foreground text-center">
                正在使用 Tesseract.js 本地识别，无需上传服务器，保护您的隐私
              </p>
            </div>
          )}

          {/* ── Step 3：预览 ── */}
          {step === 'preview' && result && (
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-[1fr_1px_240px] gap-4 min-h-0">
                {/* 左：图片 + 文字块叠加预览 */}
                <div className="relative bg-secondary/30 rounded-lg overflow-hidden" style={{ minHeight: 200 }}>
                  <img src={imgSrc} alt="原图" className="w-full h-auto" />
                  {result.blocks.map((b, i) => (
                    <div
                      key={i}
                      onClick={() => toggleBlock(i)}
                      role="checkbox"
                      aria-checked={selectedIds.has(i)}
                      tabIndex={0}
                      onKeyDown={(e) => e.key === ' ' && toggleBlock(i)}
                      className={`absolute cursor-pointer transition-all rounded border ${
                        selectedIds.has(i)
                          ? 'border-primary bg-primary/20'
                          : 'border-border/40 bg-black/10'
                      }`}
                      style={{
                        left: `${b.x}%`,
                        top: `${b.y}%`,
                        width: `${b.width}%`,
                        height: `${b.height}%`,
                      }}
                      title={b.text}
                    />
                  ))}
                </div>

                {/* 分割线 */}
                <div className="bg-border w-px self-stretch" />

                {/* 右：文字块列表 */}
                <div className="space-y-2 overflow-y-auto max-h-[340px] pr-1">
                  <div className="flex items-center justify-between sticky top-0 bg-card pb-1">
                    <p className="text-xs text-muted-foreground font-medium">
                      共识别 {result.blocks.length} 个文字块
                    </p>
                    <button
                      type="button"
                      className="text-[11px] text-primary hover:text-primary/80 transition-colors"
                      onClick={() =>
                        selectedIds.size === result.blocks.length
                          ? setSelectedIds(new Set())
                          : setSelectedIds(new Set(result.blocks.map((_, i) => i)))
                      }
                    >
                      {selectedIds.size === result.blocks.length ? '取消全选' : '全选'}
                    </button>
                  </div>

                  {result.blocks.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-6">
                      未识别到文字，建议使用更清晰的截图
                    </p>
                  ) : (
                    result.blocks.map((b, i) => (
                      <label
                        key={i}
                        className={`flex items-start gap-2 p-2 rounded-lg cursor-pointer border transition-all ${
                          selectedIds.has(i)
                            ? 'border-primary/50 bg-primary/5'
                            : 'border-border bg-secondary/20 opacity-60'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedIds.has(i)}
                          onChange={() => toggleBlock(i)}
                          className="mt-0.5 accent-primary shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="text-xs text-foreground leading-relaxed break-words">{b.text}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            置信度 {Math.round(b.confidence)}%
                          </p>
                        </div>
                      </label>
                    ))
                  )}
                </div>
              </div>

              {/* 选项 */}
              <div className="border-t border-border pt-3 flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={keepBackground}
                    onChange={(e) => setKeepBackground(e.target.checked)}
                    className="accent-primary"
                  />
                  <span className="text-xs text-muted-foreground">保留原图为背景参考层</span>
                </label>
                <p className="text-xs text-muted-foreground ml-auto">
                  将插入 {selectedIds.size} 个可编辑文本框
                </p>
              </div>
            </div>
          )}
        </div>

        {/* 底部操作栏 */}
        <div className="shrink-0 border-t border-border p-4 flex justify-end gap-2">
          {step === 'preview' && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-border text-muted-foreground h-8 text-xs"
              onClick={() => { reset(); }}
            >
              重新上传
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-border text-muted-foreground h-8 text-xs"
            onClick={handleClose}
          >
            取消
          </Button>
          {step === 'preview' && (
            <Button
              type="button"
              size="sm"
              className="btn-accent h-8 px-5 text-xs"
              onClick={handleInsert}
              disabled={selectedIds.size === 0}
            >
              插入 PPT（{selectedIds.size} 块）
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
