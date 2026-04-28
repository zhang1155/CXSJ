import React, { Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import IntersectObserver from '@/components/common/IntersectObserver';
import { Toaster } from '@/components/ui/sonner';
import { AuthProvider } from '@/contexts/AuthContext';
import { ModelProvider } from '@/contexts/ModelContext';
import { RouteGuard } from '@/components/common/RouteGuard';
import ErrorBoundary from '@/components/common/ErrorBoundary';
import { routes } from './routes';

// 全局懒加载 Loading：只存在一个，不随路由切换创建/销毁。
// 放在 Suspense 同层可避免 Radix Portal 删除时的 removeChild 崩溃。
const PageLoading = () => (
  <div className="flex items-center justify-center min-h-screen bg-background">
    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
  </div>
);

const App: React.FC = () => {
  return (
    <Router>
      <ErrorBoundary>
        <AuthProvider>
          <ModelProvider>
            <ErrorBoundary>
              <RouteGuard>
                <IntersectObserver />
                <div className="flex flex-col min-h-screen dark">
                  <main className="flex-grow">
                    {/* 单一 Suspense 包裹所有路由：
                        每个路由单独套 Suspense 会在路由切换时创建/销毁
                        Suspense 边界，React 删除阶段遍历 Portal fiber 时
                        以错误父节点调用 removeChild，导致 NotFoundError。
                        统一提升到此处可彻底规避该问题。 */}
                    <Suspense fallback={<PageLoading />}>
                      <Routes>
                        {routes.map((route, index) => (
                          <Route key={index} path={route.path} element={route.element} />
                        ))}
                        <Route path="*" element={<Navigate to="/" replace />} />
                      </Routes>
                    </Suspense>
                  </main>
                </div>
                <Toaster position="top-right" theme="dark" richColors />
              </RouteGuard>
            </ErrorBoundary>
          </ModelProvider>
        </AuthProvider>
      </ErrorBoundary>
    </Router>
  );
};

export default App;
