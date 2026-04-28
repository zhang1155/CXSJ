import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import MainLayout from '@/components/layouts/MainLayout';
import { pptTemplates } from '@/data/pptTemplates';
import type { PPTTemplate } from '@/types/types';

const STYLE_CATEGORIES = ['全部', '发布会', '报告', '极简', '创新', '空白'];

export default function TemplatesPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [category, setCategory] = useState('全部');
  const [preview, setPreview] = useState<PPTTemplate | null>(null);

  const filtered =
    category === '全部' ? pptTemplates : pptTemplates.filter((t) => t.category === category);

  const handleUseTemplate = (template: PPTTemplate) => {
    if (!user) { navigate('/login'); return; }
    navigate('/create', { state: { template } });
  };

  return (
    <MainLayout>
      <div className="max-w-5xl mx-auto px-4 py-10 fade-in">
        {/* 页头 */}
        <div className="mb-8">
          <h1 className="text-[28px] font-bold text-foreground">模板库</h1>
          <p className="text-muted-foreground text-sm mt-1">精选 AI 发布会专属模板，快速开始创作</p>
        </div>

        {/* 分类筛选 */}
        <div className="flex flex-wrap gap-2 mb-8">
          {STYLE_CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategory(cat)}
              className={`px-3.5 py-1 rounded-md text-xs font-medium transition-all duration-150 border ${
                category === cat
                  ? 'border-ring bg-accent text-accent-foreground'
                  : 'border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* 模板网格 */}
        {filtered.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground text-sm">暂无该分类的模板</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((template) => (
              <div key={template.id} className="card-base rounded-xl overflow-hidden group cursor-pointer">
                {/* 缩略图 */}
                <div className="aspect-video bg-secondary relative overflow-hidden">
                  {template.thumbnail ? (
                    <img
                      src={template.thumbnail}
                      alt={template.name}
                      className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                      <svg className="w-8 h-8 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                      </svg>
                      <span className="text-xs text-muted-foreground">空白模板</span>
                    </div>
                  )}
                  {/* 悬浮操作 */}
                  <div className="absolute inset-0 bg-background/70 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center gap-2">
                    {template.thumbnail && (
                      <button
                        type="button"
                        className="px-3 py-1.5 text-xs border border-border bg-card/80 text-muted-foreground rounded-lg hover:text-foreground transition-colors"
                        onClick={(e) => { e.stopPropagation(); setPreview(template); }}
                      >
                        预览
                      </button>
                    )}
                    <button
                      type="button"
                      className="px-3 py-1.5 text-xs btn-accent rounded-lg"
                      onClick={() => handleUseTemplate(template)}
                    >
                      使用模板
                    </button>
                  </div>
                </div>
                {/* 信息 */}
                <div className="p-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <h3 className="text-sm font-semibold text-foreground">{template.name}</h3>
                    <span className="text-[10px] text-muted-foreground border border-border px-1.5 py-0.5 rounded">
                      {template.category}
                    </span>
                  </div>
                  {/* Feature4：风格标签 */}
                  {template.styleTags && template.styleTags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {template.styleTags.map((tag) => (
                        <span key={tag} className="px-1.5 py-0.5 rounded-sm bg-secondary text-[9px] font-medium text-muted-foreground border border-border/50">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground leading-relaxed mb-1.5">{template.description}</p>
                  {/* Feature4：适用场景 */}
                  {template.scenario && (
                    <p className="text-[10px] text-muted-foreground/70 leading-relaxed mb-3 italic">💡 {template.scenario}</p>
                  )}
                  <button
                    type="button"
                    className="w-full btn-accent py-2 text-xs rounded-lg font-medium"
                    onClick={() => handleUseTemplate(template)}
                  >
                    使用此模板
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 预览弹窗 */}
      <Dialog open={!!preview} onOpenChange={() => setPreview(null)}>
        <DialogContent className="max-w-3xl bg-card border-border rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-foreground text-base">{preview?.name}</DialogTitle>
          </DialogHeader>
          {preview && (
            <div className="space-y-3">
              {/* Feature4：预览弹窗中显示风格标签和场景 */}
              {preview.styleTags && preview.styleTags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {preview.styleTags.map((tag) => (
                    <span key={tag} className="px-2 py-0.5 rounded bg-secondary text-xs text-muted-foreground border border-border/50">{tag}</span>
                  ))}
                </div>
              )}
              {preview.scenario && (
                <p className="text-xs text-muted-foreground italic">💡 {preview.scenario}</p>
              )}
              {preview.preview.map((img, i) => (
                <img key={i} src={img} alt={`预览 ${i + 1}`} className="w-full rounded-lg border border-border" />
              ))}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  className="flex-1 btn-accent py-2 text-sm rounded-lg font-medium"
                  onClick={() => { setPreview(null); handleUseTemplate(preview); }}
                >
                  使用此模板
                </button>
                <button
                  type="button"
                  className="px-4 py-2 text-sm border border-border text-muted-foreground rounded-lg hover:text-foreground transition-colors"
                  onClick={() => setPreview(null)}
                >
                  关闭
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}


