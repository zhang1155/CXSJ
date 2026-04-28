import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';

const NAV_LINKS = [
  { label: '首页', path: '/' },
  { label: '模板库', path: '/templates' },
  { label: '我的作品', path: '/my-works' },
];

export default function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const NavLinks = ({ onClick }: { onClick?: () => void }) => (
    <>
      {NAV_LINKS.map((link) => (
        <Link
          key={link.path}
          to={link.path}
          onClick={onClick}
          className={`text-sm transition-colors duration-150 ${
            isActive(link.path)
              ? 'text-foreground font-medium'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {link.label}
        </Link>
      ))}
    </>
  );

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-14 glass">
      <div className="max-w-6xl mx-auto px-4 h-full flex items-center justify-between gap-6">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <div className="w-7 h-7 rounded-lg bg-foreground flex items-center justify-center">
            <span className="text-background text-xs font-black">AI</span>
          </div>
          <span className="font-semibold text-foreground text-sm tracking-tight hidden sm:block">
            发布会 PPT
          </span>
        </Link>

        {/* 桌面导航 */}
        <nav className="hidden md:flex items-center gap-6">
          <NavLinks />
        </nav>

        {/* 右侧操作区 */}
        <div className="flex items-center gap-3">
          {user ? (
            <>
              <Button
                size="sm"
                className="hidden md:flex h-8 px-4 text-xs btn-accent"
                onClick={() => navigate('/create')}
              >
                + 新建
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="w-8 h-8 rounded-full bg-secondary border border-border flex items-center justify-center text-xs font-semibold text-foreground hover:border-muted-foreground transition-colors"
                  >
                    {(profile?.username || user.email || 'U').slice(0, 1).toUpperCase()}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44 bg-popover border-border">
                  <div className="px-3 py-2 border-b border-border">
                    <p className="text-xs font-medium text-foreground truncate">{profile?.username || '用户'}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {profile?.role === 'admin' ? '管理员' : '普通用户'}
                    </p>
                  </div>
                  <DropdownMenuItem onClick={() => navigate('/create')} className="text-sm cursor-pointer">
                    新建 PPT
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate('/my-works')} className="text-sm cursor-pointer">
                    我的作品
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate('/settings')} className="text-sm cursor-pointer">
                    设置
                  </DropdownMenuItem>
                  {profile?.role === 'admin' && (
                    <>
                      <DropdownMenuSeparator className="bg-border" />
                      <DropdownMenuItem onClick={() => navigate('/admin')} className="text-sm cursor-pointer text-accent-foreground">
                        管理后台
                      </DropdownMenuItem>
                    </>
                  )}
                  <DropdownMenuSeparator className="bg-border" />
                  <DropdownMenuItem
                    onClick={handleSignOut}
                    className="text-sm cursor-pointer text-muted-foreground"
                  >
                    退出登录
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="hidden md:flex h-8 px-3 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => navigate('/login')}
              >
                登录
              </Button>
              <Button
                size="sm"
                className="h-8 px-4 text-xs btn-accent"
                onClick={() => navigate('/login')}
              >
                免费开始
              </Button>
            </>
          )}

          {/* 移动端汉堡菜单 */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="md:hidden h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-64 bg-card border-border p-0">
              <div className="flex flex-col h-full">
                <div className="p-5 border-b border-border flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-foreground flex items-center justify-center">
                    <span className="text-background text-xs font-black">AI</span>
                  </div>
                  <span className="font-semibold text-foreground text-sm">发布会 PPT</span>
                </div>
                <nav className="flex-1 p-5 flex flex-col gap-3">
                  <NavLinks onClick={() => setMobileOpen(false)} />
                  {user && (
                    <>
                      <div className="h-px bg-border my-1" />
                      <button
                        type="button"
                        onClick={() => { navigate('/settings'); setMobileOpen(false); }}
                        className="text-sm text-muted-foreground hover:text-foreground text-left"
                      >
                        设置
                      </button>
                    </>
                  )}
                </nav>
                <div className="p-5 border-t border-border">
                  {user ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full border-border text-muted-foreground text-xs"
                      onClick={() => { handleSignOut(); setMobileOpen(false); }}
                    >
                      退出登录
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      className="w-full btn-accent text-xs"
                      onClick={() => { navigate('/login'); setMobileOpen(false); }}
                    >
                      登录 / 注册
                    </Button>
                  )}
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}

