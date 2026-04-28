import { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@/contexts/AuthContext';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { toast } from 'sonner';

const usernameSchema = z
  .string()
  .min(3, '用户名至少 3 个字符')
  .max(20, '用户名最多 20 个字符')
  .regex(/^[a-zA-Z0-9_]+$/, '用户名只能包含字母、数字和下划线');

const loginSchema = z.object({
  username: usernameSchema,
  password: z.string().min(6, '密码至少 6 个字符'),
});

const registerSchema = z
  .object({
    username: usernameSchema,
    password: z.string().min(6, '密码至少 6 个字符'),
    confirmPassword: z.string(),
    agree: z.boolean().refine((v) => v, '请阅读并同意用户协议'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: '两次输入的密码不一致',
    path: ['confirmPassword'],
  });

type LoginFormValues = z.infer<typeof loginSchema>;
type RegisterFormValues = z.infer<typeof registerSchema>;

export default function LoginPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [loading, setLoading] = useState(false);
  const { signInWithUsername, signUpWithUsername } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string })?.from || '/my-works';

  const loginForm = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: '', password: '' },
    mode: 'onBlur',
  });

  const registerForm = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { username: '', password: '', confirmPassword: '', agree: false },
    mode: 'onBlur',
  });

  const handleLogin = async (values: LoginFormValues) => {
    setLoading(true);
    const { error } = await signInWithUsername(values.username, values.password);
    setLoading(false);
    if (error) { toast.error(`登录失败：${error.message}`); return; }
    toast.success('登录成功');
    navigate(from, { replace: true });
  };

  const handleRegister = async (values: RegisterFormValues) => {
    setLoading(true);
    const { error } = await signUpWithUsername(values.username, values.password);
    setLoading(false);
    if (error) { toast.error(`注册失败：${error.message}`); return; }
    toast.success('注册成功，正在登录...');
    const { error: loginErr } = await signInWithUsername(values.username, values.password);
    if (!loginErr) navigate(from, { replace: true });
  };

  const inputCls = 'bg-secondary border-border h-9 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-ring focus:ring-1 focus:ring-ring/20 transition-all';

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.025]"
        style={{
          backgroundImage: `linear-gradient(hsl(var(--border)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--border)) 1px, transparent 1px)`,
          backgroundSize: '80px 80px',
        }}
      />
      <div className="relative w-full max-w-[340px] slide-up">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-foreground flex items-center justify-center">
              <span className="text-background text-xs font-black">AI</span>
            </div>
            <span className="font-semibold text-foreground text-sm">发布会 PPT</span>
          </Link>
          <h1 className="text-xl font-semibold text-foreground">
            {mode === 'login' ? '欢迎回来' : '创建账户'}
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            {mode === 'login' ? '登录以继续使用 AI PPT 生成器' : '注册后立即开始创作'}
          </p>
        </div>

        {/* Tab 切换 */}
        <div className="flex bg-secondary rounded-lg p-1 mb-5">
          {(['login', 'register'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-all duration-150 ${
                mode === m ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {m === 'login' ? '登录' : '注册'}
            </button>
          ))}
        </div>

        {/* 登录表单 */}
        {mode === 'login' && (
          <div className="bg-card border border-border rounded-xl p-5 fade-in">
            <Form {...loginForm}>
              <form onSubmit={loginForm.handleSubmit(handleLogin)} className="space-y-3.5">
                <FormField control={loginForm.control} name="username" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs text-muted-foreground">用户名</FormLabel>
                    <FormControl><Input {...field} placeholder="输入用户名" className={inputCls} /></FormControl>
                    <FormMessage className="text-xs text-red-400 font-medium mt-1" />
                  </FormItem>
                )} />
                <FormField control={loginForm.control} name="password" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs text-muted-foreground">密码</FormLabel>
                    <FormControl><Input {...field} type="password" placeholder="输入密码" className={inputCls} /></FormControl>
                    <FormMessage className="text-xs text-red-400 font-medium mt-1" />
                  </FormItem>
                )} />
                {/* 通用表单错误提示 */}
                {Object.keys(loginForm.formState.errors).length > 0 && (
                  <p className="text-xs text-red-400 font-medium bg-red-400/10 border border-red-400/20 rounded-md px-3 py-2">
                    请检查表单输入
                  </p>
                )}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full btn-accent py-2 text-sm rounded-lg font-semibold mt-1 disabled:opacity-40"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      登录中...
                    </span>
                  ) : '登录'}
                </button>
              </form>
            </Form>
          </div>
        )}

        {/* 注册表单 */}
        {mode === 'register' && (
          <div className="bg-card border border-border rounded-xl p-5 fade-in">
            <Form {...registerForm}>
              <form onSubmit={registerForm.handleSubmit(handleRegister)} className="space-y-3.5">
                <FormField control={registerForm.control} name="username" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs text-muted-foreground">用户名</FormLabel>
                    <FormControl><Input {...field} placeholder="字母、数字、下划线，3-20 位" className={inputCls} /></FormControl>
                    <FormMessage className="text-xs text-red-400 font-medium mt-1" />
                  </FormItem>
                )} />
                <FormField control={registerForm.control} name="password" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs text-muted-foreground">密码</FormLabel>
                    <FormControl><Input {...field} type="password" placeholder="至少 6 个字符" className={inputCls} /></FormControl>
                    <FormMessage className="text-xs text-red-400 font-medium mt-1" />
                  </FormItem>
                )} />
                <FormField control={registerForm.control} name="confirmPassword" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs text-muted-foreground">确认密码</FormLabel>
                    <FormControl><Input {...field} type="password" placeholder="再次输入密码" className={inputCls} /></FormControl>
                    <FormMessage className="text-xs text-red-400 font-medium mt-1" />
                  </FormItem>
                )} />
                <FormField control={registerForm.control} name="agree" render={({ field }) => (
                  <FormItem className="flex items-start gap-2">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        className="border-border data-[state=checked]:bg-ring data-[state=checked]:border-ring mt-0.5"
                      />
                    </FormControl>
                    <div>
                      <FormLabel className="text-[11px] text-muted-foreground cursor-pointer leading-relaxed">
                        我已阅读并同意{' '}
                        <span className="text-accent-foreground hover:underline">用户协议</span>
                        {' '}和{' '}
                        <span className="text-accent-foreground hover:underline">隐私政策</span>
                      </FormLabel>
                      <FormMessage className="text-xs text-red-400 font-medium mt-1" />
                    </div>
                  </FormItem>
                )} />
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full btn-accent py-2 text-sm rounded-lg font-semibold mt-1 disabled:opacity-40"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      注册中...
                    </span>
                  ) : '注册账号'}
                </button>
              </form>
            </Form>
          </div>
        )}

        <p className="text-center text-[10px] text-muted-foreground/60 mt-5 px-4 leading-relaxed">
          注册即表示同意用户协议（示例版本，请自行修改以符合法律要求）
        </p>
      </div>
    </div>
  );
}


