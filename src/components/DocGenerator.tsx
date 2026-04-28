import { useState, useRef } from 'react';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Progress } from '@/components/ui/progress';
import { useModel } from '@/contexts/ModelContext';
import { toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid';
import type { Slide, SlideElement } from '@/types/types';

interface DocGeneratorProps {
  onSlidesGenerated: (slides: Slide[], title: string) => void;
}

interface ParsedSlide {
  type: string;
  title: string;
  subtitle?: string;
  image_prompt?: string;
  bullets?: string[];
}

export default function DocGenerator({ onSlidesGenerated }: DocGeneratorProps) {
  const { profile } = useAuth();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { models } = useModel();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseProgress, setParseProgress] = useState(0);
  const [parsedSlides, setParsedSlides] = useState<ParsedSlide[] | null>(null);
  const [pptTitle, setPptTitle] = useState('');
  const [generating, setGenerating] = useState(false);
  const deepseekKey = profile?.api_key || '';
  const hasKey = !!deepseekKey;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.name.toLowerCase().endsWith('.docx')) {
      toast.error('仅支持 .docx 格式的 Word 文档');
      return;
    }
    setFile(f);
    setPptTitle(f.name.replace(/\.docx$/i, ''));
    setParsedSlides(null);
  };

  const handleParse = async () => {
    if (!file) { toast.error('请先选择 Word 文档'); return; }
    if (!hasKey) { toast.error('请先在设置页面配置 DeepSeek API Key'); return; }
    setParsing(true);
    setParseProgress(10);
    const timer = setInterval(() => {
      setParseProgress((p) => (p < 85 ? p + Math.random() * 8 : p));
    }, 400);
    try {
      setParseProgress(50);
      const formData = new FormData();
      formData.append('file', file);
      formData.append('apiKey', deepseekKey);
      const { data, error } = await supabase.functions.invoke('parse-docx', { body: formData });
      if (error) {
        const errText = await error?.context?.text?.()?.catch(() => '');
        throw new Error(errText || error.message || '解析失败');
      }
      if (!data?.success) throw new Error(data?.error || '解析失败');
      setParseProgress(100);
      const slides = data.slides as ParsedSlide[];
      setParsedSlides(slides);
      toast.success('解析成功！共 ' + slides.length + ' 页幻灯片');
    } catch (err) {
      toast.error('解析失败：' + (err instanceof Error ? err.message : '未知错误'));
    } finally {
      clearInterval(timer);
      setParsing(false);
      setTimeout(() => setParseProgress(0), 600);
    }
  };

  const handleGeneratePPT = () => {
    if (!parsedSlides || parsedSlides.length === 0) return;
    setGenerating(true);
    try {
      const bgColor = '#0F111A';
      const textColor = '#e5e5e5';
      const subtitleColor = '#6b7280';
      const accentColor = '#6366f1';
      const slides: Slide[] = parsedSlides.map((ps, idx) => {
        const elements: SlideElement[] = [];
        let yOffset = 8;
        if (ps.type === 'cover' && idx === 0) {
          elements.push({ id: uuidv4(), type: 'text', x: 5, y: 25, width: 90, height: 18, zIndex: 2, text: ps.title, fontSize: 42, fontColor: textColor, fontWeight: 'bold', fontAlign: 'center' });
          if (ps.subtitle) elements.push({ id: uuidv4(), type: 'text', x: 10, y: 48, width: 80, height: 10, zIndex: 2, text: ps.subtitle, fontSize: 20, fontColor: subtitleColor, fontWeight: 'normal', fontAlign: 'center' });
        } else if (ps.type === 'section') {
          elements.push({ id: uuidv4(), type: 'text', x: 5, y: 30, width: 90, height: 15, zIndex: 2, text: ps.title, fontSize: 36, fontColor: textColor, fontWeight: 'bold', fontAlign: 'center' });
          if (ps.subtitle) elements.push({ id: uuidv4(), type: 'text', x: 10, y: 50, width: 80, height: 8, zIndex: 2, text: ps.subtitle, fontSize: 16, fontColor: subtitleColor, fontWeight: 'normal', fontAlign: 'center' });
        } else if (ps.type === 'ending') {
          elements.push({ id: uuidv4(), type: 'text', x: 5, y: 35, width: 90, height: 15, zIndex: 2, text: ps.title || '感谢聆听', fontSize: 40, fontColor: textColor, fontWeight: 'bold', fontAlign: 'center' });
        } else {
          elements.push({ id: uuidv4(), type: 'text', x: 5, y: 5, width: 90, height: 10, zIndex: 2, text: ps.title, fontSize: 28, fontColor: textColor, fontWeight: 'bold', fontAlign: 'left' });
          yOffset = 17;
          elements.push({ id: uuidv4(), type: 'shape', x: 5, y: yOffset, width: 30, height: 0.3, zIndex: 1, shapeType: 'rect', fillColor: accentColor });
          yOffset += 5;
          (ps.bullets || []).forEach((bullet, bi) => {
            elements.push({ id: uuidv4(), type: 'text', x: 8, y: yOffset, width: 84, height: 6, zIndex: 2, text: (bi + 1) + '. ' + bullet, fontSize: 16, fontColor: textColor, fontWeight: 'normal', fontAlign: 'left' });
            yOffset += 8;
          });
        }
        if (idx > 0) {
          elements.push({ id: uuidv4(), type: 'text', x: 85, y: 92, width: 12, height: 5, zIndex: 1, text: '' + (idx + 1), fontSize: 10, fontColor: '#4b5563', fontWeight: 'normal', fontAlign: 'right' });
        }
        return {
          id: uuidv4(),
          background: ps.type === 'cover' ? 'linear-gradient(135deg, #0F111A 0%, #1a1a3e 100%)' : bgColor,
          elements,
          order: idx,
        };
      });
      onSlidesGenerated(slides, pptTitle || 'Word 导入文稿');
      toast.success('PPT 已生成！');
    } catch (err) {
      toast.error('生成失败：' + (err instanceof Error ? err.message : '未知错误'));
    } finally {
      setGenerating(false);
    }
  };

  const slideTypeLabels: Record<string, string> = {
    cover: '封面',
    section: '章节页',
    content: '内容页',
    ending: '结束页',
  };

  return (
    <div className="flex flex-col h-full text-foreground">
      {/* 头部 */}
      <div className="px-4 py-3 border-b border-border shrink-0">
        <h2 className="text-sm font-semibold">Word 文稿导入</h2>
        <p className="text-[11px] text-muted-foreground mt-0.5">上传 Word 文档，自动生成 PPT</p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* 未配置 Key 提示 */}
        {!hasKey && (
          <div className="p-3 rounded-lg border border-border bg-accent text-xs text-accent-foreground">
            请前往 <a href="/settings" className="underline font-medium">设置</a> 配置 DeepSeek API Key
          </div>
        )}

        {/* 文件上传区 */}
        <div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full border border-dashed border-border hover:border-muted-foreground rounded-lg p-6 text-center transition-colors cursor-pointer"
          >
            {file ? (
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">{file.name}</p>
                <p className="text-[11px] text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</p>
              </div>
            ) : (
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">点击上传 Word 文档</p>
                <p className="text-[11px] text-muted-foreground/50">支持 .docx 格式</p>
              </div>
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            onChange={handleFileSelect}
          />
        </div>

        {/* PPT 标题输入 */}
        {file && (
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">PPT 标题</label>
            <input
              type="text"
              value={pptTitle}
              onChange={(e) => setPptTitle(e.target.value)}
              className="w-full h-8 px-2.5 text-xs rounded-md bg-secondary border border-border text-foreground placeholder:text-muted-foreground/60 focus:border-ring focus:outline-none"
              placeholder="输入 PPT 标题..."
            />
          </div>
        )}

        {/* 解析按钮 */}
        {file && !parsedSlides && (
          <button
            type="button"
            onClick={handleParse}
            disabled={parsing || !hasKey}
            className="w-full py-2.5 rounded-lg text-sm font-semibold transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed btn-accent"
          >
            {parsing ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                AI 解析中...
              </span>
            ) : 'AI 解析文档'}
          </button>
        )}

        {/* 解析进度条 */}
        {parseProgress > 0 && (
          <div className="space-y-1">
            <Progress value={parseProgress} className="h-1 bg-secondary" />
            <p className="text-[10px] text-muted-foreground text-right">{Math.round(parseProgress)}%</p>
          </div>
        )}

        {/* 解析结果预览 + 生成按钮 */}
        {parsedSlides && parsedSlides.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">
                解析结果：共 {parsedSlides.length} 页
              </label>
            </div>
            <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
              {parsedSlides.map((s, i) => (
                <div key={i} className="p-2.5 rounded-lg bg-secondary/60 border border-border text-xs space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground shrink-0">{slideTypeLabels[s.type] || '页面'}</span>
                    <span className="text-muted-foreground">·</span>
                    <span className="font-medium text-foreground truncate flex-1">{s.title}</span>
                  </div>
                  {s.bullets && s.bullets.length > 0 && (
                    <p className="text-muted-foreground text-[10px] line-clamp-1">
                      {s.bullets.slice(0, 2).join(' · ')}{s.bullets.length > 2 && '...'}
                    </p>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={handleGeneratePPT}
              disabled={generating}
              className="w-full py-2.5 rounded-lg text-sm font-semibold transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed ai-breathing"
            >
              {generating ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                  生成 PPT 中...
                </span>
              ) : '一键生成 PPT'}
            </button>
            <button
              type="button"
              onClick={() => { setFile(null); setParsedSlides(null); setPptTitle(''); }}
              className="w-full py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              重新选择文件
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
