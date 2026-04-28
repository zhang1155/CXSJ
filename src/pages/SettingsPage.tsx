import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useModel, DEFAULT_MODELS } from '@/contexts/ModelContext';
import { supabase } from '@/db/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription,
} from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import MainLayout from '@/components/layouts/MainLayout';
import type { ModelConfig } from '@/types/types';

// ── 账户设置表单 ──────────────────────────────────────────────────
const profileSchema = z.object({ apiKey: z.string().min(1, '请输入 API Key') });
type ProfileValues = z.infer<typeof profileSchema>;

// ── 模型表单 ─────────────────────────────────────────────────────
const modelSchema = z.object({
  name: z.string().min(1, '请输入模型名称'),
  modelName: z.string().min(1, '请输入模型 ID'),
  type: z.enum(['gpt-image', 'dalle', 'tongyi', 'custom', 'video']),
  baseUrl: z.string().url('请输入有效的 URL'),
  apiKey: z.string().min(1, '请输入 API Key'),
  enabled: z.boolean(),
});
type ModelFormValues = z.infer<typeof modelSchema>;

const MODEL_TYPE_LABELS: Record<string, string> = {
  'gpt-image': 'GPT-Image',
  'dalle': 'DALL·E',
  'tongyi': '通义万相',
  'custom': '自定义',
  'video': '视频生成',
};

// ── 模型表单弹窗 ─────────────────────────────────────────────────
function ModelFormDialog({
  open,
  onClose,
  initial,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  initial?: ModelConfig;
  onSave: (values: ModelFormValues) => void;
}) {
  const form = useForm<ModelFormValues>({
    resolver: zodResolver(modelSchema),
    defaultValues: initial
      ? { name: initial.name, modelName: initial.modelName, type: initial.type, baseUrl: initial.baseUrl || 'https://', apiKey: initial.apiKey, enabled: initial.enabled }
      : { name: '', modelName: '', type: 'custom', baseUrl: 'https://', apiKey: '', enabled: true },
  });

  // 当 initial 切换时重置表单内容，避免闪现旧数据
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initialKey = initial?.id ?? 'new';
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    form.reset(
      initial
        ? { name: initial.name, modelName: initial.modelName, type: initial.type, baseUrl: initial.baseUrl || 'https://', apiKey: initial.apiKey, enabled: initial.enabled }
        : { name: '', modelName: '', type: 'custom', baseUrl: 'https://', apiKey: '', enabled: true },
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialKey]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-card border-border max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-foreground text-base">{initial ? '编辑模型' : '添加模型'}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSave)} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs text-muted-foreground">显示名称</FormLabel>
                  <FormControl><Input {...field} className="h-8 text-xs bg-secondary border-border focus:border-ring" /></FormControl>
                  <FormMessage className="text-[10px]" />
                </FormItem>
              )} />
              <FormField control={form.control} name="type" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs text-muted-foreground">模型类型</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger className="h-8 text-xs bg-secondary border-border">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="bg-popover border-border">
                      {Object.entries(MODEL_TYPE_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k} className="text-xs">{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage className="text-[10px]" />
                </FormItem>
              )} />
            </div>
            <FormField control={form.control} name="modelName" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs text-muted-foreground">模型 ID</FormLabel>
                <FormControl><Input {...field} placeholder="gpt-image-2" className="h-8 text-xs bg-secondary border-border font-mono focus:border-ring" /></FormControl>
                <FormMessage className="text-[10px]" />
              </FormItem>
            )} />
            <FormField control={form.control} name="baseUrl" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs text-muted-foreground">API 端点（Base URL）</FormLabel>
                <FormControl><Input {...field} className="h-8 text-xs bg-secondary border-border font-mono focus:border-ring" /></FormControl>
                <FormDescription className="text-[10px] text-muted-foreground">支持自定义反向代理地址</FormDescription>
                <FormMessage className="text-[10px]" />
              </FormItem>
            )} />
            <FormField control={form.control} name="apiKey" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs text-muted-foreground">API Key</FormLabel>
                <FormControl><Input {...field} type="password" className="h-8 text-xs bg-secondary border-border font-mono focus:border-ring" /></FormControl>
                <FormMessage className="text-[10px]" />
              </FormItem>
            )} />
            <FormField control={form.control} name="enabled" render={({ field }) => (
              <FormItem className="flex items-center gap-2">
                <FormControl>
                  <input type="checkbox" checked={field.value} onChange={field.onChange} className="w-4 h-4 rounded" />
                </FormControl>
                <FormLabel className="text-xs text-muted-foreground !mt-0 cursor-pointer">启用此模型</FormLabel>
              </FormItem>
            )} />
            <div className="flex gap-2 pt-2">
              <Button type="submit" className="flex-1 btn-accent text-xs h-8">保存</Button>
              <Button type="button" variant="outline" className="flex-1 border-border text-muted-foreground text-xs h-8" onClick={onClose}>取消</Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ── 主设置页 ─────────────────────────────────────────────────────
export default function SettingsPage() {
  const { profile, refreshProfile } = useAuth();
  const { models, addModel, updateModel, deleteModel, testModel, saving } = useModel();
  const [showModelForm, setShowModelForm] = useState(false);
  const [editingModel, setEditingModel] = useState<ModelConfig | undefined>();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);

  const profileForm = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { apiKey: profile?.api_key || '' },
  });

  // 当 profile 数据异步加载完成后，同步更新表单显示值（useForm defaultValues 只读一次）
  useEffect(() => {
    profileForm.reset({ apiKey: profile?.api_key || '' });
  }, [profile?.api_key]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSaveProfile = async (values: ProfileValues) => {
    if (!profile) return;
    setProfileSaving(true);
    const { error } = await supabase.from('profiles').update({ api_key: values.apiKey }).eq('id', profile.id);
    setProfileSaving(false);
    if (error) { toast.error(`保存失败：${error.message}`); return; }
    // 同步到 gpt-image-2 模型
    updateModel('gpt-image-2', { apiKey: values.apiKey });
    await refreshProfile();
    // 重置表单 defaultValues，防止刷新后输入框恢复为空
    profileForm.reset({ apiKey: values.apiKey });
    toast.success('API Key 已保存');
  };

  const handleSaveModel = (values: ModelFormValues) => {
    if (editingModel) {
      updateModel(editingModel.id, values);
      toast.success('模型已更新');
    } else {
      addModel(values);
      toast.success('模型已添加');
    }
    // 仅关闭弹窗；editingModel 在下次打开时再覆写，
    // 避免与 Radix Portal 关闭动画同帧修改 DOM 导致 removeChild 错误
    setShowModelForm(false);
  };

  const handleTestModel = async (model: ModelConfig) => {
    if (!model.apiKey) { toast.error('请先配置 API Key'); return; }
    setTestingId(model.id);
    const ok = await testModel(model);
    setTestingId(null);
    if (ok) toast.success(`${model.name} 连接测试成功 ✓`);
    else toast.error(`${model.name} 连接测试失败，请检查 API Key 和端点`);
  };

  const handleDeleteModel = () => {
    if (!deletingId) return;
    const builtIn = DEFAULT_MODELS.map((m) => m.id);
    if (builtIn.includes(deletingId)) {
      // 内置模型只禁用，不删除
      updateModel(deletingId, { enabled: false, apiKey: '' });
      toast.success('内置模型已禁用并清除 Key');
    } else {
      deleteModel(deletingId);
      toast.success('模型已删除');
    }
    setDeletingId(null);
  };

  return (
    <MainLayout>
      <div className="max-w-4xl mx-auto px-4 py-10 space-y-8 fade-in">
        {/* 页头 */}
        <div>
          <h1 className="text-[28px] font-bold text-foreground">设置</h1>
          <p className="text-muted-foreground text-sm mt-1">管理 API Key、模型配置和账户信息</p>
        </div>

        {/* 快速配置：GPT-Image-2 API Key */}
        <section className="bg-card border border-border rounded-xl p-6">
          <h2 className="text-base font-semibold text-foreground mb-1">快速配置（GPT-Image-2）</h2>
          <p className="text-muted-foreground text-xs mb-5">
            设置主力模型的 API Key，即可立即开始生成
          </p>
          <Form {...profileForm}>
            <form onSubmit={profileForm.handleSubmit(handleSaveProfile)} className="flex gap-3">
              <FormField control={profileForm.control} name="apiKey" render={({ field }) => (
                <FormItem className="flex-1">
                  <FormControl>
                    <Input
                      {...field}
                      type="password"
                      placeholder="sk-..."
                      className="h-9 text-sm bg-secondary border-border font-mono focus:border-ring focus:ring-1 focus:ring-ring/30"
                    />
                  </FormControl>
                  <FormMessage className="text-[10px]" />
                </FormItem>
              )} />
              <Button type="submit" disabled={profileSaving} className="btn-accent h-9 px-5 text-sm shrink-0">
                {profileSaving ? '保存中...' : '保存'}
              </Button>
            </form>
          </Form>
        </section>

        {/* 模型管理面板 */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-foreground">模型管理</h2>
              <p className="text-xs text-muted-foreground mt-0.5">配置多模型，支持自定义反向代理和 Fallback</p>
            </div>
            <Button
              size="sm"
              className="btn-accent h-8 px-4 text-xs"
              onClick={() => { setEditingModel(undefined); setShowModelForm(true); }}
            >
              + 添加模型
            </Button>
          </div>

          <div className="bg-card border border-border rounded-xl overflow-hidden">
            {/* 表头（仅桌面显示） */}
            <div className="hidden md:grid grid-cols-[1fr_80px_140px_80px_100px] gap-3 px-4 py-2.5 border-b border-border bg-secondary/50">
              {['名称 / 类型', '状态', 'API 端点', 'API Key', '操作'].map((h) => (
                <span key={h} className="section-label">{h}</span>
              ))}
            </div>

            {/* 模型行 */}
            {models.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">暂无模型，点击「添加模型」开始配置</div>
            ) : (
              models.map((model, i) => (
                <div
                  key={model.id}
                  className={`${i < models.length - 1 ? 'border-b border-border' : ''} hover:bg-secondary/30 transition-colors`}
                >
                  {/* 桌面：网格行 */}
                  <div className="hidden md:grid grid-cols-[1fr_80px_140px_80px_100px] gap-3 px-4 py-3 items-center">
                    <div>
                      <p className="text-sm font-medium text-foreground">{model.name}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {MODEL_TYPE_LABELS[model.type]} · {model.modelName}
                      </p>
                    </div>
                    <div>
                      <button
                        type="button"
                        onClick={() => updateModel(model.id, { enabled: !model.enabled })}
                        className="flex items-center gap-1.5"
                        title={model.enabled ? '点击禁用' : '点击启用'}
                      >
                        <span className={model.enabled ? 'dot-active' : 'dot-inactive'} />
                        <span className={`text-xs ${model.enabled ? 'text-green-500' : 'text-muted-foreground'}`}>
                          {model.enabled ? '启用' : '禁用'}
                        </span>
                      </button>
                    </div>
                    <div className="overflow-hidden">
                      <p className="text-[11px] text-muted-foreground font-mono truncate" title={model.baseUrl}>
                        {(model.baseUrl || '').replace('https://', '')}
                      </p>
                    </div>
                    <div>
                      {model.apiKey ? (
                        <Badge variant="outline" className="border-border text-muted-foreground text-[10px] px-1.5">已设置</Badge>
                      ) : (
                        <Badge variant="outline" className="border-destructive/40 text-destructive text-[10px] px-1.5">未配置</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button type="button" onClick={() => handleTestModel(model)} disabled={testingId === model.id}
                        className="text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors">
                        {testingId === model.id ? '测试中' : '测试'}
                      </button>
                      <span className="text-border">·</span>
                      <button type="button" onClick={() => { setEditingModel(model); setShowModelForm(true); }}
                        className="text-[11px] text-muted-foreground hover:text-foreground transition-colors">编辑</button>
                      <span className="text-border">·</span>
                      <button type="button" onClick={() => setDeletingId(model.id)}
                        className="text-[11px] text-destructive/70 hover:text-destructive transition-colors">删除</button>
                    </div>
                  </div>

                  {/* 移动端：卡片式布局 */}
                  <div className="md:hidden px-4 py-3 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">{model.name}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{MODEL_TYPE_LABELS[model.type]} · {model.modelName}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => updateModel(model.id, { enabled: !model.enabled })}
                        className="flex items-center gap-1.5 shrink-0"
                      >
                        <span className={model.enabled ? 'dot-active' : 'dot-inactive'} />
                        <span className={`text-xs ${model.enabled ? 'text-green-500' : 'text-muted-foreground'}`}>
                          {model.enabled ? '启用' : '禁用'}
                        </span>
                      </button>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] text-muted-foreground font-mono truncate flex-1 mr-2" title={model.baseUrl}>
                        {(model.baseUrl || '').replace('https://', '')}
                      </p>
                      {model.apiKey ? (
                        <Badge variant="outline" className="border-border text-muted-foreground text-[10px] px-1.5 shrink-0">已设置</Badge>
                      ) : (
                        <Badge variant="outline" className="border-destructive/40 text-destructive text-[10px] px-1.5 shrink-0">未配置</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 pt-1">
                      <button type="button" onClick={() => handleTestModel(model)} disabled={testingId === model.id}
                        className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors">
                        {testingId === model.id ? '测试中...' : '测试连接'}
                      </button>
                      <button type="button" onClick={() => { setEditingModel(model); setShowModelForm(true); }}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors">编辑</button>
                      <button type="button" onClick={() => setDeletingId(model.id)}
                        className="text-xs text-destructive/70 hover:text-destructive transition-colors">删除</button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
          {saving && <p className="text-[11px] text-muted-foreground mt-2">同步到云端...</p>}
        </section>

        {/* 账户信息 */}
        <section className="bg-card border border-border rounded-xl p-6">
          <h2 className="text-base font-semibold text-foreground mb-4">账户信息</h2>
          <div className="space-y-0 divide-y divide-border">
            {[
              { label: '用户名', value: profile?.username || '-' },
              { label: '账户角色', value: profile?.role === 'admin' ? '管理员' : '普通用户' },
              { label: '注册时间', value: profile?.created_at ? new Date(profile.created_at).toLocaleDateString('zh-CN') : '-' },
            ].map((row) => (
              <div key={row.label} className="flex justify-between items-center py-3">
                <span className="text-sm text-muted-foreground">{row.label}</span>
                <span className="text-sm font-medium text-foreground">{row.value}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* 模型表单弹窗
          不使用 key 强制重挂载：key 变化会在 Radix Portal 关闭动画仍在运行时
          触发 React unmount，导致 removeChild 错误。
          改用 useEffect 在 initial 变化时 reset 表单内容，保证切换编辑目标时数据正确。 */}
      <ModelFormDialog
        open={showModelForm}
        onClose={() => setShowModelForm(false)}
        initial={editingModel}
        onSave={handleSaveModel}
      />

      {/* 删除确认 — onOpenChange(false) 才清空 deletingId，避免误触 */}
      <AlertDialog open={!!deletingId} onOpenChange={(isOpen) => { if (!isOpen) setDeletingId(null); }}>
        <AlertDialogContent className="bg-card border-border rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">确认操作</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              {DEFAULT_MODELS.map((m) => m.id).includes(deletingId || '')
                ? '内置模型将被禁用并清除 API Key，可在后续重新配置。'
                : '删除后无法恢复，确定要删除此模型吗？'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border text-muted-foreground">取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteModel} className="bg-destructive text-destructive-foreground">
              确认
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MainLayout>
  );
}
