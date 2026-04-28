import { lazy } from 'react';
import type { ReactNode } from 'react';

const HomePage = lazy(() => import('./pages/HomePage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const CreatePage = lazy(() => import('./pages/CreatePage'));
const TemplatesPage = lazy(() => import('./pages/TemplatesPage'));
const MyWorksPage = lazy(() => import('./pages/MyWorksPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));

export interface RouteConfig {
  name: string;
  path: string;
  element: ReactNode;
  visible?: boolean;
  /** 无需登录即可访问 */
  public?: boolean;
}

// 注意：不在此处包裹 <Suspense>。
// 每个路由都单独套一个 Suspense 会在路由切换时创建/销毁 Suspense 边界，
// 导致 React 的删除效果遍历 Portal fiber（Radix Dialog / DropdownMenu / Sheet）
// 时以错误的父节点调用 removeChild，引发 NotFoundError 崩溃。
// Suspense 统一放在 App.tsx 的 <Routes> 外层。
export const routes: RouteConfig[] = [
  {
    name: '首页',
    path: '/',
    element: <HomePage />,
    public: true,
    visible: true,
  },
  {
    name: '登录',
    path: '/login',
    element: <LoginPage />,
    public: true,
    visible: false,
  },
  {
    name: '创建',
    path: '/create',
    element: <CreatePage />,
    public: false,
    visible: true,
  },
  {
    name: '编辑',
    path: '/create/:id',
    element: <CreatePage />,
    public: false,
    visible: false,
  },
  {
    name: '模板库',
    path: '/templates',
    element: <TemplatesPage />,
    public: true,
    visible: true,
  },
  {
    name: '我的作品',
    path: '/my-works',
    element: <MyWorksPage />,
    public: false,
    visible: true,
  },
  {
    name: '设置',
    path: '/settings',
    element: <SettingsPage />,
    public: false,
    visible: true,
  },
];
