import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useModel } from '@/contexts/ModelContext';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Slider } from '@/components/ui/slider';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import type { SizePreset } from '@/types/types';

interface AIGeneratorProps {
  onImageGenerated: (url: string) => void;
}

const SIZE_PRESETS: SizePreset[] = [
  { label: '16:9', value: '16:9', ratio: '16:9', width: 1792, height: 1024, apiSize: '1792x1024' },
  { label: '4:3',  value: '4:3',  ratio: '4:3',  width: 1024, height: 768,  apiSize: '1024x768' },
  { label: '1:1',  value: '1:1',  ratio: '1:1',  width: 1024, height: 1024, apiSize: '1024x1024' },
  { label: '9:16', value: '9:16', ratio: '9:16', width: 1024, height: 1792, apiSize: '1024x1792' },
  { label: '2.35:1', value: '2.35:1', ratio: '2.35:1', width: 1792, height: 768, apiSize: '1792x1024' },
  { label: '自定义', value: 'custom', ratio: 'custom', width: 1024, height: 1024, apiSize: '1024x1024' },
];

const MAX_FILE_SIZE = 1024 * 1024;

async function compressImage(file: File, maxSize = MAX_FILE_SIZE): Promise<File> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let quality = 0.8;
        const maxDim = 1080;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(file); return; }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const tryCompress = () => {
          canvas.toBlob((blob) => {
            if (!blob) { resolve(file); return; }
            if (blob.size <= maxSize || quality <= 0.1) {
              resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.webp'), { type: 'image/webp' }));
            } else {
              quality -= 0.1;
              tryCompress();
            }
          }, 'image/webp', quality);
        };
        tryCompress();
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}

function SliderRow({ label, value, onChange, min = 0, max = 100 }: {
  label: string; value: number; onChange: (v: number) => void; min?: number; max?: number;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        <span className="text-xs tabular-nums text-muted-foreground w-6 text-right">{value}</span>
      </div>
      <Slider value={[value]} onValueChange={([v]) => onChange(v)} min={min} max={max} step={1} className="w-full" />
    </div>
  );
}

export default function AIGenerator({ onImageGenerated }: AIGeneratorProps) {
  const { profile } = useAuth();
  const { models, activeModel, activeModelId, setActiveModelId, generateImage } = useModel();
  const enabledModels = models.filter((m) => m.enabled);

  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [selectedSize, setSelectedSize] = useState<SizePreset>(SIZE_PRESETS[0]);
  const [customW, setCustomW] = useState('1024');
  const [customH, setCustomH] = useState('1024');

  const [generating, setGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState(0);
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);

  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedFiles, setUploadedFiles] = useState<Array<{ name: string; url: string }>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 当 profile.api_key 变化时，同步到 localStorage 中的模型配置兜底
  // 确保从设置页跳转回来后 ModelContext 能立即读取到最新 apiKey
  useEffect(() => {
    if (profile?.api_key) {
      try {
        const stored = JSON.parse(localStorage.getItem('ai_model_configs') || '[]');
        const updated = stored.map((m: { id: string; apiKey?: string }) =>
          m.id === 'gpt-image-2' ? { ...m, apiKey: profile.api_key } : m
        );
        localStorage.setItem('ai_model_configs', JSON.stringify(updated));
      } catch { /* noop */ }
    }
  }, [profile?.api_key]);

  const hasApiKey = !!(activeModel?.apiKey || profile?.api_key);

  const handleGenerate = async () => {
    if (!prompt.trim()) { toast.error('请输入图片描述'); return; }
    if (!hasApiKey) { toast.error('请先在设置页面为当前模型配置 API Key'); return; }

    setGenerating(true);
    setGenProgress(5);
    // 模拟生成进度（0→90%，完成后跳到100%）
    const timer = setInterval(() => {
      setGenProgress((p) => (p < 88 ? p + Math.random() * 8 : p));
    }, 400);
    try {
      // 直接使用 apiSize（像素格式），Edge Function 的 pixelSizeToRatio 会自动转换为比例格式
      const size = selectedSize.value === 'custom'
        ? `${customW}x${customH}`
        : selectedSize.apiSize;
      const result = await generateImage({
        prompt: prompt.trim(),
        size,
        ...(negativePrompt.trim() ? { negativePrompt: negativePrompt.trim() } : {}),
      });

      if (!result.success) throw new Error(result.error || '生成失败');

      const urls: string[] = [];
      if (result.url) urls.push(result.url);
      if (result.images?.length) {
        result.images.forEach((img) => {
          const u = img.url || (img.b64_json ? `data:image/png;base64,${img.b64_json}` : '');
          if (u && !urls.includes(u)) urls.push(u);
        });
      }
      if (!urls.length) throw new Error('未获取到图片链接');

      setGeneratedImages(urls);
      setGenProgress(100);
      toast.success('图片生成成功');
    } catch (err) {
      toast.error(`生成失败：${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      clearInterval(timer);
      setGenerating(false);
      setTimeout(() => setGenProgress(0), 600);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    for (const file of files) {
      const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
      if (!allowed.includes(file.type)) {
        toast.error(`不支持的文件格式：${file.name}`);
        continue;
      }
      setUploading(true);
      setUploadProgress(20);
      try {
        let uploadFile = file;
        let compressed = false;
        if (file.type !== 'application/pdf' && file.size > MAX_FILE_SIZE) {
          uploadFile = await compressImage(file);
          compressed = true;
          toast.info(`已自动压缩至 ${(uploadFile.size / 1024).toFixed(0)} KB`);
        }
        setUploadProgress(60);
        const safeFilename = `${profile?.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const { data: uploadData, error } = await supabase.storage.from('uploads').upload(safeFilename, uploadFile, {
          contentType: uploadFile.type,
          upsert: false,
        });
        if (error) throw error;
        setUploadProgress(90);
        const { data: urlData } = supabase.storage.from('uploads').getPublicUrl(uploadData.path);
        setUploadedFiles((prev) => [...prev, { name: file.name, url: urlData.publicUrl }]);
        setUploadProgress(100);
        toast.success(`${compressed ? '(已压缩) ' : ''}上传成功：${file.name}`);
      } catch (err) {
        toast.error(`上传失败：${err instanceof Error ? err.message : '未知错误'}`);
      } finally {
        setUploading(false);
        setUploadProgress(0);
      }
    }
    e.target.value = '';
  };

  return (
    <div className="flex flex-col h-full text-foreground">
      {/* 标题 */}
      <div className="px-4 py-3 border-b border-border">
        <h2 className="text-sm font-semibold">AI 图片生成</h2>
        <p className="text-[11px] text-muted-foreground mt-0.5">输入描述，一键生成发布会配图</p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* API Key 提示 */}
        {!hasApiKey && (
          <div className="p-3 rounded-lg border border-border bg-accent text-xs text-accent-foreground">
            请前往 <a href="/settings" className="underline font-medium">设置</a> 为模型配置 API Key
          </div>
        )}

        {/* 模型选择 */}
        {enabledModels.length > 0 && (
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">当前模型</Label>
            <Select value={activeModelId} onValueChange={setActiveModelId}>
              <SelectTrigger className="h-8 text-xs bg-secondary border-border">
                <SelectValue placeholder="选择模型" />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border">
                {enabledModels.map((m) => (
                  <SelectItem key={m.id} value={m.id} className="text-xs">
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* 正向提示词 */}
        <div>
          <Label className="text-xs text-muted-foreground mb-1.5 block">图片描述</Label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="描述画面内容，例如：未来科技发布会舞台，蓝色光效，极简风格..."
            className="w-full text-sm p-3 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground/60 resize-none focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring/30 transition-all"
            rows={4}
          />
        </div>

        {/* Feature1：负面提示词（可折叠高级选项） */}
        <div>
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <span className={`transition-transform duration-150 ${showAdvanced ? 'rotate-90' : ''}`}>▶</span>
            高级选项
          </button>
          {showAdvanced && (
            <div className="mt-2 space-y-2">
              <Label className="text-xs text-muted-foreground block">负面提示词（可选）</Label>
              <textarea
                value={negativePrompt}
                onChange={(e) => setNegativePrompt(e.target.value)}
                placeholder="描述不希望出现的内容，如：模糊、低质量、文字..."
                className="w-full text-xs p-2.5 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground/50 resize-none focus:border-ring focus:outline-none transition-all"
                rows={2}
              />
            </div>
          )}
        </div>

        {/* 尺寸选择 */}
        <div>
          <Label className="text-xs text-muted-foreground mb-2 block">画面比例</Label>
          <div className="grid grid-cols-3 gap-1.5 mb-2">
            {SIZE_PRESETS.map((preset) => (
              <button
                key={preset.value}
                type="button"
                onClick={() => setSelectedSize(preset)}
                className={`py-1.5 rounded-md text-[11px] font-medium transition-all border ${
                  selectedSize.value === preset.value
                    ? 'border-ring bg-accent text-accent-foreground'
                    : 'border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
          {selectedSize.value === 'custom' && (
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

        {/* 参考素材上传 */}
        <div>
          <Label className="text-xs text-muted-foreground mb-1.5 block">参考素材（可选）</Label>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full border border-dashed border-border hover:border-muted-foreground rounded-lg p-4 text-center transition-colors cursor-pointer"
          >
            <p className="text-xs text-muted-foreground">点击上传参考图或 PDF</p>
            <p className="text-[11px] text-muted-foreground/50 mt-1">PNG / JPG / PDF，超 1MB 自动压缩</p>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            multiple
            className="hidden"
            onChange={handleFileUpload}
          />
          {uploading && (
            <div className="mt-2">
              <Progress value={uploadProgress} className="h-0.5 bg-secondary" />
              <p className="text-[11px] text-muted-foreground mt-1">上传中 {uploadProgress}%</p>
            </div>
          )}
          {uploadedFiles.length > 0 && (
            <div className="mt-2 space-y-1">
              {uploadedFiles.map((f, i) => (
                <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded bg-secondary text-xs">
                  <span className="flex-1 truncate text-muted-foreground">{f.name}</span>
                  <button
                    type="button"
                    onClick={() => setUploadedFiles((prev) => prev.filter((_, idx) => idx !== i))}
                    className="text-muted-foreground hover:text-destructive"
                  >×</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 生成按钮 */}
        <button
          type="button"
          onClick={handleGenerate}
          disabled={generating || !hasApiKey}
          className={`w-full py-2.5 rounded-lg text-sm font-semibold transition-all duration-150 ${
            generating ? 'ai-breathing bg-secondary text-muted-foreground cursor-wait' : 'btn-accent'
          } disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          {generating ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full animate-spin" />
              AI 生成中...
            </span>
          ) : '生成图片'}
        </button>
        {/* Feature1：生成进度条 */}
        {genProgress > 0 && (
          <div className="space-y-1">
            <Progress value={genProgress} className="h-1 bg-secondary" />
            <p className="text-[10px] text-muted-foreground text-right">{Math.round(genProgress)}%</p>
          </div>
        )}

        {/* 生成结果 */}
        {generatedImages.length > 0 && (
          <div className="slide-up">
            <Label className="text-xs text-muted-foreground mb-2 block">生成结果</Label>
            <div className="space-y-3">
              {generatedImages.map((url, i) => (
                <div key={i} className="rounded-lg overflow-hidden border border-border">
                  <img src={url} alt={`生成图片 ${i + 1}`} className="w-full object-cover" />
                  <div className="p-2 bg-card flex gap-2">
                    <Button
                      size="sm"
                      className="flex-1 btn-accent text-xs h-7"
                      onClick={() => onImageGenerated(url)}
                    >
                      添加到 PPT
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-border text-muted-foreground text-xs h-7"
                      asChild
                    >
                      <a href={url} download={`ai-image-${i + 1}.png`} target="_blank" rel="noreferrer">
                        下载
                      </a>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
