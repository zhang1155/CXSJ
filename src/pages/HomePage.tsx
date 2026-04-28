import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import MainLayout from '@/components/layouts/MainLayout';

const FEATURES = [
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
      </svg>
    ),
    title: 'AI 多模型生图',
    desc: 'GPT-Image-2、DALL·E、通义万相自由切换，一键生成发布会级别配图',
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
      </svg>
    ),
    title: '可视化编辑器',
    desc: '图层管理、文字排版、背景替换，实时预览每一页演示效果',
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.429 9.75L2.25 12l4.179 2.25m0-4.5l5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L21.75 12l-4.179 2.25m0 0l4.179 2.25L12 21.75 2.25 16.5l4.179-2.25m11.142 0l-5.571 3-5.571-3" />
      </svg>
    ),
    title: '精品模板库',
    desc: '六大发布会风格模板：极简商务、科技未来、高端奢华一键套用',
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
      </svg>
    ),
    title: '一键导出 PPTX',
    desc: '生成标准 PowerPoint 格式，兼容 Office、WPS 等主流演示软件',
  },
];

const STEPS = [
  { n: '01', title: '选模板', desc: '从精品模板库挑选风格，或从空白页面开始创作' },
  { n: '02', title: '生成配图', desc: '输入描述，AI 根据发布会主题生成高质量配图' },
  { n: '03', title: '排版精修', desc: '在线编辑文字、图层、背景，逐页打磨视觉效果' },
  { n: '04', title: '导出分享', desc: '导出标准 PPTX，即刻用于演示或发送给团队' },
];

const WORKS = [
  {
    img: 'https://miaoda-site-img.cdn.bcebos.com/images/MiaoTu_c038332c-eef4-4f96-8ac0-89afbfd6fca1.jpg',
    title: 'AI 产品发布会',
    tag: '科技',
    pages: 12,
  },
  {
    img: 'https://miaoda-site-img.cdn.bcebos.com/images/baidu_image_search_cac7f0af-f62d-4fd6-bd45-2b4bdc3fabdc.jpg',
    title: '年度战略报告',
    tag: '商务',
    pages: 18,
  },
  {
    img: 'https://miaoda-site-img.cdn.bcebos.com/images/baidu_image_search_d268c680-fa7d-45ec-975d-719e2a90da4f.jpg',
    title: 'AI 创意设计展',
    tag: '设计',
    pages: 8,
  },
  {
    img: 'https://miaoda-site-img.cdn.bcebos.com/images/MiaoTu_44b78a12-91cc-4f28-bc4d-80ed2816f73b.jpg',
    title: '高端发布会演示',
    tag: '发布会',
    pages: 15,
  },
];

const MODEL_BADGES = ['GPT-Image-2', 'DALL·E 3', '通义万相', 'Stable Diffusion', '自定义 API'];

export default function HomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [hoveredWork, setHoveredWork] = useState<number | null>(null);

  const go = () => navigate(user ? '/create' : '/login');

  return (
    <MainLayout>
      {/* ── Hero ──────────────────────────────────────────── */}
      <section className="relative min-h-[92vh] flex flex-col items-center justify-center px-4 pt-20 pb-24 overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)`,
            backgroundSize: '64px 64px',
          }}
        />
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[500px] pointer-events-none"
          style={{ background: 'radial-gradient(ellipse, rgba(59,130,246,0.06) 0%, transparent 70%)' }} />

        <div className="relative max-w-4xl mx-auto text-center fade-in">
          <div className="flex flex-wrap items-center justify-center gap-1.5 mb-10">
            {MODEL_BADGES.map((m) => (
              <span key={m} className="px-2.5 py-1 rounded-full text-[11px] font-medium border border-border bg-secondary text-muted-foreground">
                {m}
              </span>
            ))}
          </div>

          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold leading-[1.1] tracking-tight text-foreground mb-6">
            AI 发布会<br />
            <span className="gradient-text">PPT 生成器</span>
          </h1>

          <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed mb-10">
            从一段文字出发，AI 生成专业图片，内置编辑器精修排版，
            导出标准 PPTX，为每场发布会打造高端视觉呈现。
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-14">
            <button
              type="button"
              onClick={go}
              className="btn-accent px-8 py-3 text-sm rounded-lg font-semibold w-full sm:w-auto transition-all duration-200 hover:scale-105 hover:shadow-lg hover:shadow-primary/20 active:scale-95"
            >
              免费开始创作
            </button>
            <button type="button" onClick={() => navigate('/templates')} className="px-8 py-3 text-sm rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground transition-all duration-150 w-full sm:w-auto">{"浏览模板库"}</button>
          </div>

          <div className="flex items-center justify-center gap-8 md:gap-12">
            {[{ num: '5+', label: 'AI 模型支持' }, { num: '20+', label: '专业模板' }, { num: '6', label: '发布会风格' }].map(({ num, label }) => (
              <div key={label} className="text-center">
                <p className="text-2xl md:text-3xl font-bold text-foreground tabular-nums">{num}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      {/* ── 作品展示 ───────────────────────────────────── */}
      <section className="px-4 py-20 border-t border-border">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-end justify-between mb-10">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-widest mb-2">作品展示</p>
              <h2 className="text-2xl md:text-3xl font-bold text-foreground">精彩案例</h2>
            </div>
            <button type="button" onClick={go} className="hidden md:block text-xs text-muted-foreground hover:text-foreground transition-colors border-b border-transparent hover:border-muted-foreground pb-px">
              查看更多 →
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
            {WORKS.map((w, i) => (
              <div
                key={i}
                className="group card-base rounded-xl overflow-hidden cursor-pointer"
                onMouseEnter={() => setHoveredWork(i)}
                onMouseLeave={() => setHoveredWork(null)}
                onClick={go}
                onKeyDown={(e) => e.key === 'Enter' && go()}
                role="button"
                tabIndex={0}
              >
                <div className="aspect-video bg-secondary relative overflow-hidden">
                  <img src={w.img} alt={w.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                  <div className={`absolute inset-0 bg-background/60 transition-opacity duration-200 flex items-end p-3 ${hoveredWork === i ? 'opacity-100' : 'opacity-0'}`}>
                    <button type="button" className="w-full py-1.5 text-xs btn-accent rounded-lg font-medium" onClick={go}>使用此风格</button>
                  </div>
                  <div className="absolute top-2 left-2">
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-background/80 text-muted-foreground backdrop-blur-sm border border-border/50">{w.tag}</span>
                  </div>
                  <div className="absolute top-2 right-2">
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-background/80 text-muted-foreground backdrop-blur-sm">{w.pages}页</span>
                  </div>
                </div>
                <div className="p-3"><p className="text-xs font-medium text-foreground truncate">{w.title}</p></div>
              </div>
            ))}
          </div>
        </div>
      </section>
      {/* ── 核心功能 ───────────────────────────────────── */}
      <section className="px-4 py-20 border-t border-border bg-card/20">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-xs text-muted-foreground uppercase tracking-widest mb-2">核心能力</p>
            <h2 className="text-2xl md:text-3xl font-bold text-foreground">为发布会场景深度打磨</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {FEATURES.map((f, i) => (
              <div key={i} className="card-base rounded-xl p-6 flex gap-4">
                <div className="w-10 h-10 rounded-lg bg-secondary border border-border flex items-center justify-center shrink-0 text-muted-foreground">{f.icon}</div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-1.5">{f.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
      {/* ── 四步流程 ───────────────────────────────────── */}
      <section className="px-4 py-20 border-t border-border">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-xs text-muted-foreground uppercase tracking-widest mb-2">使用流程</p>
            <h2 className="text-2xl md:text-3xl font-bold text-foreground">四步完成 PPT</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-4">
            {STEPS.map((s, i) => (
              <div key={i} className="relative">
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-3xl font-bold tabular-nums" style={{ color: 'hsl(var(--border))' }}>{s.n}</span>
                  {i < STEPS.length - 1 && <div className="hidden md:block flex-1 h-px bg-border" />}
                </div>
                <h3 className="text-sm font-semibold text-foreground mb-1.5">{s.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      {/* ── 多模型特性 ─────────────────────────────────── */}
      <section className="px-4 py-20 border-t border-border bg-card/20">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-xs text-muted-foreground uppercase tracking-widest mb-3">多模型支持</p>
          <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-4">自由切换 AI 模型</h2>
          <p className="text-sm text-muted-foreground mb-8 leading-relaxed">
            支持手动填入 API Key 和自定义代理地址，适配企业内网或第三方转发服务。主模型失败时自动 fallback 到备用模型，保障生成不中断。
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-left">
            {[
              { title: '自定义 API Key', desc: '每个模型独立配置，安全隔离' },
              { title: '自定义代理地址', desc: '支持企业内网和第三方转发' },
              { title: '自动 Fallback', desc: '主模型失败自动切换备用' },
            ].map((item) => (
              <div key={item.title} className="card-base rounded-xl p-4">
                <div className="w-1.5 h-1.5 rounded-full bg-foreground mb-3" />
                <h4 className="text-sm font-semibold text-foreground mb-1">{item.title}</h4>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      {/* ── CTA ──────────────────────────────────────────── */}
      <section className="px-4 py-24 border-t border-border">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-4">开始打造你的发布会 PPT</h2>
          <p className="text-sm text-muted-foreground mb-8 leading-relaxed">免费注册，配置 API Key 后即可使用全部 AI 功能</p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              type="button"
              onClick={go}
              className="btn-accent px-10 py-3 text-sm rounded-lg font-semibold w-full sm:w-auto transition-all duration-200 hover:scale-105 hover:shadow-lg hover:shadow-primary/20 active:scale-95"
            >立即免费开始</button>
            <button type="button" onClick={() => navigate('/templates')} className="px-8 py-3 text-sm border border-border text-muted-foreground rounded-lg hover:text-foreground hover:border-muted-foreground transition-all duration-150 w-full sm:w-auto">浏览所有模板</button>
          </div>
        </div>
      </section>
      {/* ── Footer ───────────────────────────────────────── */}
      <footer className="border-t border-border px-4 py-8">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-foreground flex items-center justify-center">
              <span className="text-background text-[10px] font-black">AI</span>
            </div>
            <span className="text-sm font-semibold text-foreground">发布会 PPT 生成器</span>
          </div>
          <div className="flex items-center gap-6">
            {[{ label: '首页', to: '/' }, { label: '模板库', to: '/templates' }, { label: '我的作品', to: '/my-works' }, { label: '设置', to: '/settings' }].map(({ label, to }) => (
              <button key={to} type="button" onClick={() => navigate(to)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">{label}</button>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground/50">Powered by GPT-Image-2 &middot; {new Date().getFullYear()}</p>
        </div>
      </footer>
    </MainLayout>
  );
}
