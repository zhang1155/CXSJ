import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import type { ModelConfig, GenerateImageParams, GenerateImageResponse } from '@/types/types';
import { v4 as uuidv4 } from 'uuid';

// ── 内置默认模型 ──────────────────────────────────────────────────
export const DEFAULT_MODELS: ModelConfig[] = [
  {
    id: 'gpt-image-2',
    name: 'GPT-Image-2',
    modelName: 'gpt-image-2',
    baseUrl: 'https://grsai.dakka.com.cn/v1/draw/completions',
    apiKey: '',
    enabled: true,
    isDefault: true,
    type: 'gpt-image',
  },
  {
    id: 'dall-e-3',
    name: 'DALL·E 3',
    modelName: 'dall-e-3',
    baseUrl: 'https://api.openai.com/v1/images/generations',
    apiKey: '',
    enabled: false,
    type: 'dalle',
  },
  {
    id: 'tongyi-wanxiang',
    name: '通义万相',
    modelName: 'wanx-v1',
    baseUrl: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis',
    apiKey: '',
    enabled: false,
    type: 'tongyi',
  },
];

interface ModelContextValue {
  models: ModelConfig[];
  activeModel: ModelConfig | null;
  activeModelId: string;
  setActiveModelId: (id: string) => void;
  addModel: (model: Omit<ModelConfig, 'id'>) => void;
  updateModel: (id: string, patch: Partial<ModelConfig>) => void;
  deleteModel: (id: string) => void;
  generateImage: (params: GenerateImageParams) => Promise<GenerateImageResponse>;
  testModel: (model: ModelConfig) => Promise<boolean>;
  saving: boolean;
}

const ModelContext = createContext<ModelContextValue | null>(null);

const STORAGE_KEY = 'ai_model_configs';

function sanitizeModel(m: Partial<ModelConfig>): ModelConfig {
  return {
    id:         m.id         || uuidv4(),
    name:       m.name       || '未命名模型',
    modelName:  m.modelName  || '',
    baseUrl:    m.baseUrl    || '',
    apiKey:     m.apiKey     || '',
    enabled:    m.enabled    !== undefined ? m.enabled : false,
    type:       (['gpt-image','dalle','tongyi','custom','video'] as const).includes(m.type as never)
                  ? (m.type as ModelConfig['type'])
                  : 'custom',
    isDefault:  m.isDefault  || false,
  };
}

function loadLocalModels(): ModelConfig[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_MODELS;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_MODELS;
    return parsed.map(sanitizeModel);
  } catch {
    return DEFAULT_MODELS;
  }
}

function saveLocalModels(models: ModelConfig[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(models));
  } catch {
    // 忽略存储错误
  }
}

export function ModelProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();
  const [models, setModels] = useState<ModelConfig[]>(loadLocalModels);
  const [activeModelId, setActiveModelIdState] = useState<string>(() => {
    return localStorage.getItem('ai_active_model') || 'gpt-image-2';
  });
  const [saving, setSaving] = useState(false);

  // 从 profile 同步远端配置（合并写法，避免多次 setModels 导致竞态）
  useEffect(() => {
    if (!profile) return;
    try {
      setModels((prev) => {
        let base = prev;
        // 用远端覆盖本地（若有效）
        if (profile.model_configs && Array.isArray(profile.model_configs) && profile.model_configs.length > 0) {
          base = (profile.model_configs as Partial<ModelConfig>[]).map(sanitizeModel);
          saveLocalModels(base);
        }
        // 同步 api_key 到 gpt-image-2
        if (profile.api_key) {
          return base.map((m) => m.id === 'gpt-image-2' ? { ...m, apiKey: profile.api_key! } : m);
        }
        return base;
      });
      if (profile.active_model_id) {
        setActiveModelIdState(profile.active_model_id);
      }
    } catch (e) {
      console.error('[ModelContext] 同步 profile 数据失败:', e);
    }
  }, [profile]);

  const persistToDb = useCallback(async (updated: ModelConfig[], newActiveId?: string) => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({
        model_configs: updated,
        ...(newActiveId ? { active_model_id: newActiveId } : {}),
      })
      .eq('id', user.id);
    setSaving(false);
    if (error) console.error('[ModelContext] 保存模型配置失败:', error.message);
  }, [user]);

  const setActiveModelId = useCallback((id: string) => {
    setActiveModelIdState(id);
    localStorage.setItem('ai_active_model', id);
    if (user) persistToDb(models, id);
  }, [user, models, persistToDb]);

  const addModel = useCallback((model: Omit<ModelConfig, 'id'>) => {
    const newModel: ModelConfig = { ...model, id: uuidv4() };
    const updated = [...models, newModel];
    setModels(updated);
    saveLocalModels(updated);
    persistToDb(updated);
  }, [models, persistToDb]);

  const updateModel = useCallback((id: string, patch: Partial<ModelConfig>) => {
    const updated = models.map((m) => m.id === id ? { ...m, ...patch } : m);
    setModels(updated);
    saveLocalModels(updated);
    persistToDb(updated);
    // 同步到 profile.api_key（仅 gpt-image-2 主模型）
    if (id === 'gpt-image-2' && patch.apiKey !== undefined && user) {
      supabase.from('profiles').update({ api_key: patch.apiKey }).eq('id', user.id).then(({ error }) => {
        if (error) console.error('[ModelContext] 同步 api_key 失败:', error.message);
      });
    }
  }, [models, persistToDb, user]);

  const deleteModel = useCallback((id: string) => {
    const updated = models.filter((m) => m.id !== id);
    setModels(updated);
    saveLocalModels(updated);
    persistToDb(updated);
    if (activeModelId === id) {
      const fallback = updated.find((m) => m.enabled)?.id || '';
      setActiveModelId(fallback);
    }
  }, [models, activeModelId, persistToDb, setActiveModelId]);

  const activeModel = models.find((m) => m.id === activeModelId) || models.find((m) => m.enabled) || null;

  // 单次模型调用
  async function callModel(model: ModelConfig, params: GenerateImageParams): Promise<GenerateImageResponse> {
    if (!model.apiKey) throw new Error(`模型 "${model.name}" 尚未配置 API Key`);

    const { data, error } = await supabase.functions.invoke('generate-image', {
      body: {
        prompt: params.prompt,
        size: params.size || '1:1',
        variants: params.variants ?? 1,
        // 将凭证放入 body，避免被秒哒代理剥离自定义 header
        apiKey: model.apiKey,
        baseUrl: model.baseUrl,
        modelName: model.modelName,
      },
    });

    if (error) {
      const raw = await error?.context?.text().catch(() => '');
      let msg = error.message;
      try { msg = (JSON.parse(raw ?? '')).error || msg; } catch { /* noop */ }
      console.error(`[ModelContext] ${model.name} 调用失败:`, msg);
      throw new Error(msg);
    }

    if (!data?.success) throw new Error(data?.error || '生成失败');
    return data as GenerateImageResponse;
  }

  // 带 fallback 的多模型调度
  const generateImage = useCallback(async (params: GenerateImageParams): Promise<GenerateImageResponse> => {
    const enabledModels = models.filter((m) => m.enabled && m.apiKey);
    if (enabledModels.length === 0) {
      return { success: false, error: '未找到可用模型，请先配置 API Key 并启用模型' };
    }

    // 主模型优先
    const primary = enabledModels.find((m) => m.id === activeModelId) || enabledModels[0];
    const fallbacks = enabledModels.filter((m) => m.id !== primary.id);
    const queue = [primary, ...fallbacks];

    let lastError = '';
    for (const model of queue) {
      try {
        console.log(`[ModelContext] 使用模型: ${model.name}`);
        const result = await callModel(model, params);
        if (result.success) {
          if (model.id !== primary.id) {
            toast.info(`主模型失败，已切换至 ${model.name}`);
          }
          return result;
        }
        lastError = result.error || '未知错误';
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        console.warn(`[ModelContext] ${model.name} 失败，尝试下一个模型: ${lastError}`);
      }
    }
    return { success: false, error: lastError || '所有模型均失败，请检查 API Key 和网络' };
  }, [models, activeModelId]);

  // 测试模型连接
  const testModel = useCallback(async (model: ModelConfig): Promise<boolean> => {
    try {
      const result = await callModel(model, {
        prompt: 'a simple test image, white background',
        size: '1:1',
        variants: 1,
      });
      return result.success;
    } catch {
      return false;
    }
  }, []);

  return (
    <ModelContext.Provider value={{
      models, activeModel, activeModelId, setActiveModelId,
      addModel, updateModel, deleteModel,
      generateImage, testModel, saving,
    }}>
      {children}
    </ModelContext.Provider>
  );
}

export function useModel() {
  const ctx = useContext(ModelContext);
  if (!ctx) throw new Error('useModel must be used within ModelProvider');
  return ctx;
}
