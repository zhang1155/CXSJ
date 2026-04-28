import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/db/supabase';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import MainLayout from '@/components/layouts/MainLayout';
import { exportToPPTX } from '@/lib/exportPPTX';
import { toast } from 'sonner';
import type { PPTProject, Slide } from '@/types/types';

function PPTPreviewCanvas({ project }: { project: PPTProject }) {
  const slides = [...(project.data?.slides || [])].sort((a, b) => a.order - b.order);
  const firstSlide: Slide | undefined = slides[0];
  if (!firstSlide) {
    return <div className="w-full aspect-video bg-secondary flex items-center justify-center text-xs text-muted-foreground">暂无预览</div>;
  }
  const getBg = (bg: string) =>
    !bg ? { backgroundColor: '#111' } :
    bg.startsWith('linear-gradient') || bg.startsWith('radial-gradient') ? { background: bg } :
    { backgroundColor: bg };
  return (
    <div className="w-full aspect-video relative overflow-hidden" style={getBg(firstSlide.background || '#111')}>
      {firstSlide.elements.slice(0, 5).map((el) => (
        <div
          key={el.id}
          className="absolute overflow-hidden"
          style={{
            left: `${el.x}%`, top: `${el.y}%`,
            width: `${el.width}%`, height: `${el.height}%`,
            zIndex: el.zIndex,
            color: el.fontColor || '#e5e5e5',
            fontSize: `clamp(6px, ${(el.fontSize || 12) * 0.16}vw, ${(el.fontSize || 12) * 0.7}px)`,
            fontWeight: el.fontWeight || 'normal',
            textAlign: el.fontAlign || 'left',
            whiteSpace: 'pre-wrap',
          }}
        >
          {el.type === 'text' ? el.text : el.type === 'image' && el.imageUrl
            ? <img src={el.imageUrl} alt="" className="w-full h-full object-cover" />
            : null}
        </div>
      ))}
    </div>
  );
}

function FullPreviewModal({ project, onClose }: { project: PPTProject; onClose: () => void }) {
  const slides = [...(project.data?.slides || [])].sort((a, b) => a.order - b.order);
  const [current, setCurrent] = useState(0);
  const slide = slides[current];
  const getBg = (bg: string) =>
    !bg ? { backgroundColor: '#111' } :
    bg.startsWith('linear-gradient') || bg.startsWith('radial-gradient') ? { background: bg } :
    { backgroundColor: bg };
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl bg-card border-border rounded-2xl p-5">
        <DialogHeader>
          <DialogTitle className="text-foreground text-sm">{project.title}</DialogTitle>
        </DialogHeader>
        {slide && (
          <div className="space-y-3">
            <div className="relative w-full aspect-video rounded-lg overflow-hidden border border-border" style={getBg(slide.background || '#111')}>
              {slide.elements.map((el) => (
                <div
                  key={el.id}
                  className="absolute overflow-hidden"
                  style={{
                    left: `${el.x}%`, top: `${el.y}%`,
                    width: `${el.width}%`, height: `${el.height}%`,
                    zIndex: el.zIndex, color: el.fontColor || '#e5e5e5',
                    fontSize: `${el.fontSize || 16}px`, fontWeight: el.fontWeight,
                    textAlign: el.fontAlign, whiteSpace: 'pre-wrap', padding: '4px',
                  }}
                >
                  {el.type === 'text' ? el.text : el.type === 'image' && el.imageUrl
                    ? <img src={el.imageUrl} alt="" className="w-full h-full object-cover" /> : null}
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between">
              <button type="button" onClick={() => setCurrent((c) => Math.max(0, c - 1))} disabled={current === 0}
                className="px-3 py-1 text-xs border border-border text-muted-foreground rounded-lg disabled:opacity-40 hover:text-foreground transition-colors">上一页</button>
              <span className="text-xs text-muted-foreground tabular-nums">{current + 1} / {slides.length}</span>
              <button type="button" onClick={() => setCurrent((c) => Math.min(slides.length - 1, c + 1))} disabled={current === slides.length - 1}
                className="px-3 py-1 text-xs border border-border text-muted-foreground rounded-lg disabled:opacity-40 hover:text-foreground transition-colors">下一页</button>
            </div>
            <div className="flex gap-1.5 overflow-x-auto py-1">
              {slides.map((s, i) => (
                <button key={s.id} type="button" onClick={() => setCurrent(i)}
                  className={`shrink-0 w-16 aspect-video rounded border overflow-hidden transition-all ${i === current ? 'border-ring' : 'border-border hover:border-muted-foreground'}`}
                  style={getBg(s.background || '#111')}>
                  <span className="text-[8px] text-muted-foreground">{i + 1}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function MyWorksPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<PPTProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [previewProject, setPreviewProject] = useState<PPTProject | null>(null);
  const [exportingId, setExportingId] = useState<string | null>(null);

  const loadProjects = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('ppt_projects')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(50);
    setLoading(false);
    if (error) { toast.error('加载作品失败'); return; }
    setProjects(Array.isArray(data) ? (data as PPTProject[]) : []);
  }, [user]);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from('ppt_projects').delete().eq('id', deleteId);
    if (error) { toast.error('删除失败'); } else {
      setProjects((prev) => prev.filter((p) => p.id !== deleteId));
      toast.success('已删除');
    }
    setDeleteId(null);
  };

  const handleExport = async (project: PPTProject) => {
    setExportingId(project.id);
    try {
      await exportToPPTX(project.data, project.title);
      toast.success('导出成功！');
    } catch (err) {
      toast.error(`导出失败：${err instanceof Error ? err.message : '未知错误'}`);
    } finally { setExportingId(null); }
  };

  return (
    <MainLayout>
      <div className="max-w-5xl mx-auto px-4 py-10 fade-in">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-[28px] font-bold text-foreground">我的作品</h1>
            <p className="text-sm text-muted-foreground mt-1">管理你创建的所有 PPT 演示文稿</p>
          </div>
          <button
            type="button"
            className="btn-accent px-4 py-2 text-sm rounded-lg font-medium"
            onClick={() => navigate('/create')}
          >
            + 新建 PPT
          </button>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="rounded-xl overflow-hidden bg-card border border-border">
                <Skeleton className="w-full aspect-video bg-muted skeleton-shimmer" />
                <div className="p-4 space-y-2">
                  <Skeleton className="h-3.5 w-3/4 bg-muted skeleton-shimmer" />
                  <Skeleton className="h-3 w-1/2 bg-muted skeleton-shimmer" />
                </div>
              </div>
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-24">
            <div className="w-14 h-14 rounded-full bg-secondary flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="text-sm font-medium text-foreground mb-1">暂无作品</h3>
            <p className="text-xs text-muted-foreground mb-5">开始创建你的第一份 AI 发布会 PPT</p>
            <button
              type="button"
              className="btn-accent px-6 py-2 text-sm rounded-lg font-medium"
              onClick={() => navigate('/create')}
            >
              立即创建
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => (
              <div key={project.id} className="card-base rounded-xl overflow-hidden group">
                <div
                  className="relative cursor-pointer"
                  onClick={() => setPreviewProject(project)}
                  onKeyDown={(e) => e.key === 'Enter' && setPreviewProject(project)}
                  role="button"
                  tabIndex={0}
                >
                  <PPTPreviewCanvas project={project} />
                  <div className="absolute inset-0 bg-background/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="text-xs font-medium bg-card/90 px-3 py-1.5 rounded-lg border border-border text-foreground">预览</span>
                  </div>
                  <div className="absolute top-2 right-2 bg-background/80 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground backdrop-blur-sm">
                    {project.data?.slides?.length || 0} 页
                  </div>
                </div>
                <div className="p-4">
                  <h3 className="text-sm font-medium text-foreground truncate mb-1">{project.title}</h3>
                  <p className="text-[11px] text-muted-foreground mb-3">
                    更新于 {new Date(project.updated_at).toLocaleDateString('zh-CN')}
                  </p>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      className="flex-1 btn-accent py-1.5 text-xs rounded-lg"
                      onClick={() => navigate(`/create/${project.id}`)}
                    >
                      编辑
                    </button>
                    <button
                      type="button"
                      disabled={exportingId === project.id}
                      className="px-3 py-1.5 text-xs border border-border text-muted-foreground rounded-lg hover:text-foreground hover:border-muted-foreground disabled:opacity-40 transition-colors"
                      onClick={() => handleExport(project)}
                    >
                      {exportingId === project.id ? '...' : '下载'}
                    </button>
                    <button
                      type="button"
                      className="px-3 py-1.5 text-xs border border-destructive/40 text-destructive/70 rounded-lg hover:text-destructive hover:border-destructive transition-colors"
                      onClick={() => setDeleteId(project.id)}
                    >
                      删除
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {previewProject && <FullPreviewModal project={previewProject} onClose={() => setPreviewProject(null)} />}

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent className="bg-card border-border rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">确认删除</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground text-sm">
              删除后无法恢复，确定要删除这份 PPT 吗？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border text-muted-foreground text-sm">取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground text-sm">
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MainLayout>
  );
}


