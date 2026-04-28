import { useState } from 'react';
import { supabase } from '@/db/supabase';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

interface AIVideoGeneratorProps {
  onVideoGenerated: (url: string) => void;
}

const RESOLUTION_PRESETS = [
  { label: '1080p', value: '1920x1080' },
  { label: '720p',  value: '1280x720' },
  { label: '480p',  value: '720x480' },
  { label: '自定义', value: 'custom' },
];

const DURATION_OPTIONS = [5, 10, 15] as const;

const STYLE_OPTIONS = [
  { label: '写实风格', value: 'realistic' },
  { label: '动画风格', value: 'animation' },
  { label: '科技感',   value: 'tech' },
  { label: '艺术风格', value: 'artistic' },
  { label: '极简风格', value: 'minimal' },
  { label: '电影质感', value: 'cinematic' },
];

function SliderRow({ label, value, onChange, min = 0, max = 100 }: {
  label: string; value: number; onChange: (v: number) => void; min?: number; max?: number;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        <span className="text-xs tabular-nums text-muted-foreground w-8 text-right">{value}</span>
      </div>
      <Slider value={[value]} onValueChange={([v]) => onChange(v)} min={min} max={max} step={1} className="w-full" />
    </div>
  );
}

export default function AIVideoGenerator({ onVideoGenerated }: AIVideoGeneratorProps) {
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [resolution, setResolution] = useState('1920x1080');
  const [customW, setCustomW] = useState('1920');
  const [customH, setCustomH] = useState('1080');
  const [duration, setDuration] = useState<5 | 10 | 15>(5);
  const [style, setStyle] = useState('realistic');
  const [fps, setFps] = useState(24);
  const [motionStrength, setMotionStrength] = useState(60);
  const [quality, setQuality] = useState(80);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);

  const finalResolution = resolution === 'custom' ? `${customW}x${customH}` : resolution;

  const handleGenerate = async () => {
    if (!prompt.trim()) { toast.error('请输入视频描述'); return; }

    setGenerating(true);
    setGeneratedUrl(null);
    try {
      const { data, error } = await supabase.functions.invoke('generate-video', {
        body: {
          prompt: prompt.trim(),
          negativePrompt: negativePrompt.trim() || undefined,
          resolution: finalResolution,
          duration,
          style,
          fps,
          motionStrength,
          quality,
        },
      });

      if (error) {
        const raw = await error?.context?.text().catch(() => '');
        let msg = error.message;
        try { msg = (JSON.parse(raw ?? '')).error || msg; } catch { /* noop */ }
        throw new Error(msg);
      }
      if (!data?.success) throw new Error(data?.error || '视频生成失败');

      setGeneratedUrl(data.url);
      toast.success('视频生成成功');
    } catch (err) {
      toast.error(`生成失败：${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="flex flex-col h-full text-foreground">
      {/* 标题 */}
      <div className="px-4 py-3 border-b border-border">
        <h2 className="text-sm font-semibold">AI 视频生成</h2>
        <p className="text-[11px] text-muted-foreground mt-0.5">输入描述，一键生成发布会视频</p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* 视频描述 */}
        <div>
          <Label className="text-xs text-muted-foreground mb-1.5 block">视频描述</Label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="描述视频内容，例如：未来科技城市夜景，霓虹灯光，慢镜头推进..."
            className="w-full text-sm p-3 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground/60 resize-none focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring/30 transition-all"
            rows={4}
          />
        </div>

        {/* 分辨率 */}
        <div>
          <Label className="text-xs text-muted-foreground mb-2 block">分辨率</Label>
          <div className="grid grid-cols-2 gap-1.5 mb-2">
            {RESOLUTION_PRESETS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setResolution(p.value)}
                className={`py-1.5 rounded-md text-[11px] font-medium transition-all border ${
                  resolution === p.value
                    ? 'border-ring bg-accent text-accent-foreground'
                    : 'border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          {resolution === 'custom' && (
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={customW}
                onChange={(e) => setCustomW(e.target.value)}
                placeholder="宽"
                className="flex-1 h-8 px-2 text-xs rounded-md bg-secondary border border-border text-foreground focus:border-ring focus:outline-none"
              />
              <span className="text-muted-foreground text-xs">×</span>
              <input
                type="number"
                value={customH}
                onChange={(e) => setCustomH(e.target.value)}
                placeholder="高"
                className="flex-1 h-8 px-2 text-xs rounded-md bg-secondary border border-border text-foreground focus:border-ring focus:outline-none"
              />
            </div>
          )}
        </div>

        {/* 视频时长 */}
        <div>
          <Label className="text-xs text-muted-foreground mb-2 block">视频时长</Label>
          <div className="flex gap-1.5">
            {DURATION_OPTIONS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDuration(d)}
                className={`flex-1 py-1.5 rounded-md text-[11px] font-medium transition-all border ${
                  duration === d
                    ? 'border-ring bg-accent text-accent-foreground'
                    : 'border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground'
                }`}
              >
                {d} 秒
              </button>
            ))}
          </div>
        </div>

        {/* 风格选择 */}
        <div>
          <Label className="text-xs text-muted-foreground mb-1.5 block">视频风格</Label>
          <Select value={style} onValueChange={setStyle}>
            <SelectTrigger className="h-8 text-xs bg-secondary border-border">
              <SelectValue placeholder="选择风格" />
            </SelectTrigger>
            <SelectContent className="bg-popover border-border">
              {STYLE_OPTIONS.map((s) => (
                <SelectItem key={s.value} value={s.value} className="text-xs">{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* 高级参数 */}
        <div>
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <svg
              className={`w-3.5 h-3.5 transition-transform duration-150 ${showAdvanced ? 'rotate-90' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            高级参数
          </button>
          {showAdvanced && (
            <div className="mt-3 space-y-4 pl-1 fade-in">
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">负面提示词</Label>
                <textarea
                  value={negativePrompt}
                  onChange={(e) => setNegativePrompt(e.target.value)}
                  placeholder="不希望出现的元素，如：模糊、抖动..."
                  className="w-full text-xs p-2.5 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground/60 resize-none focus:border-ring focus:outline-none"
                  rows={2}
                />
              </div>
              <SliderRow label="帧率 (fps)" value={fps} onChange={setFps} min={24} max={60} />
              <SliderRow label="运动强度" value={motionStrength} onChange={setMotionStrength} />
              <SliderRow label="画质" value={quality} onChange={setQuality} />
            </div>
          )}
        </div>

        {/* 生成结果预览 */}
        {generatedUrl && (
          <div className="space-y-2 fade-in">
            <Label className="text-xs text-muted-foreground block">生成结果</Label>
            <div className="rounded-lg overflow-hidden bg-secondary border border-border">
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video
                src={generatedUrl}
                controls
                className="w-full"
                style={{ maxHeight: 180 }}
              />
            </div>
            <Button
              onClick={() => onVideoGenerated(generatedUrl)}
              className="w-full h-8 text-xs btn-accent"
              type="button"
            >
              ✨ 添加到 PPT
            </Button>
          </div>
        )}
      </div>

      {/* 底部生成按钮 */}
      <div className="px-4 py-3 border-t border-border shrink-0">
        <Button
          onClick={handleGenerate}
          disabled={generating || !prompt.trim()}
          className="w-full h-9 text-sm btn-accent disabled:opacity-40"
          type="button"
        >
          {generating ? (
            <span className="flex items-center gap-2">
              <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
              生成中...
            </span>
          ) : '🎬 生成视频'}
        </Button>
      </div>
    </div>
  );
}
