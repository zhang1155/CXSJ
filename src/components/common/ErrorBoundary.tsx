import { Component, type ReactNode, type ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
  /** 自定义降级 UI；不传则使用默认样式 */
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * 全局错误边界，捕获子树中的渲染/生命周期错误，
 * 防止整个页面黑屏崩溃。
 */
export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // removeChild 错误来自 Radix Portal 组件在路由切换时卸载的时序问题，
    // 自动静默恢复即可，无需展示错误页面
    if (error.message.includes('removeChild')) {
      console.warn('[ErrorBoundary] 捕获到 Portal removeChild 时序错误，自动恢复:', error.message);
      setTimeout(() => this.handleReset(), 100);
      return;
    }
    console.error('[ErrorBoundary] 捕获到渲染错误:', error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center gap-6">
          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
            <svg className="w-8 h-8 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-semibold text-foreground mb-2">页面加载出错</h2>
            <p className="text-muted-foreground text-sm max-w-sm">
              该页面遇到了一个意外错误。请尝试刷新页面，或重置状态后继续。
            </p>
            {this.state.error && (
              <p className="mt-3 text-xs text-destructive/70 font-mono bg-destructive/5 rounded px-3 py-2 max-w-md break-all">
                {this.state.error.message}
              </p>
            )}
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={this.handleReset}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              重新加载
            </button>
            <button
              type="button"
              onClick={() => {
                // 清理本地缓存数据，防止脏数据反复崩溃
                try {
                  localStorage.removeItem('ai_model_configs');
                  localStorage.removeItem('ai_active_model');
                } catch { /* noop */ }
                this.handleReset();
              }}
              className="px-4 py-2 rounded-lg border border-border text-muted-foreground text-sm font-medium hover:text-foreground hover:border-ring transition-colors"
            >
              清除缓存并重试
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
