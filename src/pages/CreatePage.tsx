import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/db/supabase';
import MainLayout from '@/components/layouts/MainLayout';
import PPTEditor from '@/components/PPTEditor';
import AIGenerator from '@/components/AIGenerator';
import AIVideoGenerator from '@/components/AIVideoGenerator';
import DocGenerator from '@/components/DocGenerator';
import { exportToPPTX } from '@/lib/exportPPTX';
import { toast } from 'sonner';
import type { PPTData, Slide, SlideElement, PPTTemplate } from '@/types/types';
import { v4 as uuidv4 } from 'uuid';

// 移动端面板切换类型
type MobilePanel = 'ai' | 'editor';
// AI 生成器 Tab
type AITab = 'image' | 'video' | 'doc';

const DEFAULT_PPT_DATA: PPTData = {
  aspectRatio: '16:9',
  slides: [
    {
      id: uuidv4(),
      background: '#111111',
      order: 0,
      elements: [
        {
          id: uuidv4(),
          type: 'text',
          x: 10, y: 38, width: 80, height: 15,
          zIndex: 1,
          text: 'AI 发布会标题',
          fontSize: 36,
          fontColor: '#e5e5e5',
          fontWeight: 'bold',
          fontAlign: 'center',
        },
        {
          id: uuidv4(),
          type: 'text',
          x: 15, y: 60, width: 70, height: 12,
          zIndex: 1,
          text: '副标题 / 描述文字',
          fontSize: 18,
          fontColor: '#6b7280',
          fontWeight: 'normal',
          fontAlign: 'center',
        },
      ] as SlideElement[],
    } as Slide,
  ],
};

export default function CreatePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const [title, setTitle] = useState('未命名 PPT');
  const [pptData, setPptData] = useState<PPTData>(DEFAULT_PPT_DATA);
  const [projectId, setProjectId] = useState<string | null>(id || null);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [loading, setLoading] = useState(!!id);
  // 移动端面板切换（默认显示 AI 生成器）
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>('ai');
  // AI 生成器 Tab 切换
  const [aiTab, setAITab] = useState<AITab>('image');

  useEffect(() => {
    if (!id) {
      const template = (location.state as { template?: PPTTemplate })?.template;
      if (template) { setPptData(template.data); setTitle(`${template.name} - 副本`); }
      return;
    }
    const loadProject = async () => {
      setLoading(true);
      const { data, error } = await supabase.from('ppt_projects').select('*').eq('id', id).maybeSingle();
      if (error || !data) { toast.error('项目不存在或无权限访问'); navigate('/my-works'); return; }
      setTitle(data.title);
      setPptData(data.data as PPTData);
      setProjectId(data.id);
      setLoading(false);
    };
    loadProject();
  }, [id, location.state, navigate]);

  const handleImageGenerated = useCallback((imageUrl: string) => {
    // 通过 CustomEvent 通知 PPTEditor 添加图片
    window.dispatchEvent(new CustomEvent('ppt:addImage', { detail: imageUrl }));
    // 生成图片后在移动端自动切换到编辑器
    setMobilePanel('editor');
    toast.success('图片已添加到 PPT');
  }, []);

  const handleVideoGenerated = useCallback((videoUrl: string) => {
    // 通过 CustomEvent 通知 PPTEditor 添加视频
    window.dispatchEvent(new CustomEvent('ppt:addVideo', { detail: videoUrl }));
    setMobilePanel('editor');
    toast.success('视频已添加到 PPT');
  }, []);

  const handleSlidesGenerated = useCallback((slides: Slide[], docTitle: string) => {
    // 将解析出的幻灯片替换当前 PPT 内容，并切换到编辑器
    setPptData((prev) => ({ ...prev, slides }));
    setTitle(docTitle);
    setMobilePanel('editor');
  }, []);

  const handleSave = async () => {
    if (!user) { toast.error('请先登录'); return; }
    setSaving(true);
    try {
      if (projectId) {
        const { error } = await supabase.from('ppt_projects').update({ title, data: pptData }).eq('id', projectId);
        if (error) throw error;
        toast.success('已保存');
      } else {
        const { data, error } = await supabase
          .from('ppt_projects')
          .insert({ user_id: user.id, title, data: pptData })
          .select('id')
          .maybeSingle();
        if (error) throw error;
        if (data?.id) { setProjectId(data.id); navigate(`/create/${data.id}`, { replace: true }); toast.success('已保存到我的作品'); }
      }
      // UI2：保存成功后 2 秒内显示绿色"已保存"提示
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err) {
      toast.error(`保存失败：${err instanceof Error ? err.message : '未知错误'}`);
    } finally { setSaving(false); }
  };

  const handleExport = async () => {
    setExporting(true);
    // UI3：模拟进度条 0→90%，完成跳 100%
    setExportProgress(5);
    const timer = setInterval(() => {
      setExportProgress((p) => (p < 88 ? p + Math.random() * 10 : p));
    }, 300);
    try {
      await exportToPPTX(pptData, title);
      setExportProgress(100);
      toast.success('导出成功！');
    } catch (err) {
      toast.error(`导出失败：${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      clearInterval(timer);
      setExporting(false);
      setTimeout(() => setExportProgress(0), 800);
    }
  };

  if (loading) {
    return (
      <MainLayout fullHeight>
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-border border-t-muted-foreground rounded-full animate-spin" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout fullHeight>
      {/* ── 顶部工具栏 ─────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 md:px-4 h-11 border-b border-border bg-card/60 shrink-0">
        {/* 返回按钮（移动端） */}
        <button
          type="button"
          className="md:hidden shrink-0 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-secondary text-muted-foreground transition-colors"
          onClick={() => navigate('/my-works')}
          title="返回"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        {/* 标题 */}
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="flex-1 bg-transparent text-sm font-medium text-foreground placeholder:text-muted-foreground border-none outline-none min-w-0"
          placeholder="PPT 标题..."
        />

        {/* 右侧操作 */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            className="hidden md:block px-3 py-1 text-xs border border-border text-muted-foreground rounded-lg hover:text-foreground transition-colors"
            onClick={() => navigate('/my-works')}
          >
            我的作品
          </button>
          <button
            type="button"
            disabled={saving}
            className={`px-3 py-1 text-xs border rounded-lg disabled:opacity-40 transition-colors ${
              saveSuccess
                ? 'border-green-500/60 text-green-500 bg-green-500/10'
                : 'border-border text-muted-foreground hover:text-foreground'
            }`}
            onClick={handleSave}
          >
            {saving ? '保存中...' : saveSuccess ? '✓ 已保存' : '保存'}
          </button>
          <div className="relative">
            <button
              type="button"
              disabled={exporting}
              className="btn-accent px-3 py-1 text-xs rounded-lg disabled:opacity-40"
              onClick={handleExport}
            >
              {exporting ? '导出中...' : '导出'}
            </button>
            {/* UI3：导出进度条 */}
            {exportProgress > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-secondary rounded-full h-0.5 overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${exportProgress}%` }}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── 主体：桌面双栏 / 移动端单栏 ─────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* AI 生成器面板（桌面常驻 / 移动端条件显示） */}
        <div className={`w-72 shrink-0 border-r border-border bg-card overflow-hidden flex-col ${mobilePanel === 'ai' ? 'flex' : 'hidden md:flex'}`}>
          {/* AI 生成器 Tab 切换 */}
          <div className="flex border-b border-border shrink-0">
            {(['image', 'video', 'doc'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setAITab(tab)}
                className={`flex-1 py-2.5 text-xs font-medium transition-colors flex items-center justify-center gap-1.5 ${
                  aiTab === tab
                    ? 'text-foreground border-b-2 border-ring -mb-px bg-card'
                    : 'text-muted-foreground hover:text-foreground bg-card/60'
                }`}
              >
                {tab === 'image' ? (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
                    </svg>
                    图片生成
                  </>
                ) : tab === 'video' ? (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
                    </svg>
                    视频生成
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                    </svg>
                    文档导入
                  </>
                )}
              </button>
            ))}
          </div>
          {/* 内容区 */}
          <div className="flex-1 min-h-0 overflow-hidden">
            {aiTab === 'image' ? (
              <AIGenerator onImageGenerated={handleImageGenerated} />
            ) : aiTab === 'video' ? (
              <AIVideoGenerator onVideoGenerated={handleVideoGenerated} />
            ) : (
              <DocGenerator onSlidesGenerated={handleSlidesGenerated} />
            )}
          </div>
        </div>

        {/* 编辑器面板（桌面常驻 / 移动端条件显示） */}
        <div className={`flex-1 min-w-0 flex-col ${mobilePanel === 'editor' ? 'flex' : 'hidden md:flex'}`}>
          <PPTEditor
            data={pptData}
            onChange={setPptData}
            onSave={handleSave}
            onExport={handleExport}
            saving={saving}
            exporting={exporting}
            saveSuccess={saveSuccess}
            exportProgress={exportProgress}
          />
        </div>
      </div>

      {/* ── 移动端底部标签栏 ──────────────────────── */}
      <div className="md:hidden flex border-t border-border bg-card shrink-0">
        <button
          type="button"
          onClick={() => setMobilePanel('ai')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-medium transition-colors ${mobilePanel === 'ai' ? 'text-foreground border-t-2 border-t-ring -mt-px' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
          </svg>
          AI 生成
        </button>
        <div className="w-px bg-border my-2" />
        <button
          type="button"
          onClick={() => setMobilePanel('editor')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-medium transition-colors ${mobilePanel === 'editor' ? 'text-foreground border-t-2 border-t-ring -mt-px' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
          </svg>
          编辑器
        </button>
      </div>
    </MainLayout>
  );
}


