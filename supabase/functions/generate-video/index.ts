import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key, x-base-url, x-model-name',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface VideoRequest {
  prompt: string;
  negativePrompt?: string;
  resolution: string;    // e.g. "1920x1080"
  duration: 5 | 10 | 15;
  style: string;
  fps?: number;
  motionStrength?: number;
  quality?: number;
  // 前端直传凭证（优先级最高）
  apiKey?: string;
  baseUrl?: string;
  modelName?: string;
}

// 友好错误翻译
function friendlyError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('insufficient') || m.includes('credit') || m.includes('balance') || m.includes('quota'))
    return '❌ API 余额不足，请登录服务商平台充值后重试';
  if (m.includes('invalid') && (m.includes('key') || m.includes('token') || m.includes('auth')))
    return '❌ API Key 无效或已过期，请在设置页面重新配置';
  if (m.includes('content') && (m.includes('policy') || m.includes('filter') || m.includes('safe')))
    return '❌ 内容被安全策略过滤，请修改描述后重试';
  if (m.includes('timeout') || m.includes('timed out'))
    return '❌ 请求超时，请稍后重试或缩短视频时长';
  if (m.includes('rate limit') || m.includes('too many'))
    return '❌ 请求频率超限，请稍等片刻后重试';
  if (m.includes('model not found') || m.includes('no such model'))
    return '❌ 所选视频模型不存在，请在设置中检查模型名称';
  return `❌ ${msg}`;
}

// 获取用户激活的视频模型配置
async function getActiveVideoModel(authHeader: string | null) {
  if (!authHeader) return null;

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('model_configs, active_model_id')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.model_configs) return null;

  const configs: Array<{
    id: string; type: string; modelName: string;
    baseUrl: string; apiKey: string; enabled: boolean;
  }> = Array.isArray(profile.model_configs) ? profile.model_configs : [];

  // 优先找 video 类型启用的模型
  let model = configs.find((c) => c.enabled && c.type === 'video');
  // 回退到激活模型
  if (!model && profile.active_model_id) {
    model = configs.find((c) => c.id === profile.active_model_id && c.enabled);
  }
  // 回退到任意启用模型
  if (!model) {
    model = configs.find((c) => c.enabled);
  }
  return model ?? null;
}

// 主请求处理
serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: VideoRequest = await req.json();
    const {
      prompt, negativePrompt, resolution = '1920x1080',
      duration = 5, style = 'realistic',
      fps = 24, motionStrength = 60, quality = 80,
    } = body;

    if (!prompt?.trim()) {
      return new Response(
        JSON.stringify({ success: false, error: '请输入视频描述' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── 凭证优先级：body > header > DB ────────────────────────────────────────
    const apiKeyFromBody   = (body.apiKey   || '').trim();
    const baseUrlFromBody  = (body.baseUrl  || '').trim();
    const modelFromBody    = (body.modelName || '').trim();

    const apiKeyFromHeader  = (req.headers.get('x-api-key')    || '').trim();
    const baseUrlFromHeader = (req.headers.get('x-base-url')   || '').trim();
    const modelFromHeader   = (req.headers.get('x-model-name') || '').trim();

    let apiKey    = apiKeyFromBody  || apiKeyFromHeader;
    let baseUrl   = baseUrlFromBody || baseUrlFromHeader;
    let modelName = modelFromBody   || modelFromHeader;

    // 如果 body/header 没有完整凭证，回退到 DB 查找
    if (!apiKey) {
      const authHeader = req.headers.get('Authorization');
      const modelConfig = await getActiveVideoModel(authHeader);

      if (!modelConfig) {
        return new Response(
          JSON.stringify({ success: false, error: '未配置可用的视频生成模型，请前往设置页面添加模型' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      apiKey    = modelConfig.apiKey;
      baseUrl   = modelConfig.baseUrl;
      modelName = modelConfig.modelName;
    }

    if (!apiKey || !baseUrl) {
      return new Response(
        JSON.stringify({ success: false, error: 'API Key 或接口地址未配置，请在设置页面完善模型信息' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 构造请求
    const endpoint = baseUrl.replace(/\/$/, '') + '/v1/video/generations';
    const requestBody = {
      model: modelName,
      prompt: prompt.trim(),
      negative_prompt: negativePrompt || undefined,
      resolution,
      duration,
      style,
      fps,
      motion_strength: motionStrength / 100,
      quality: quality / 100,
      n: 1,
    };

    console.log('[generate-video] 调用模型:', modelName, '端点:', endpoint);
    console.log('[generate-video] 参数:', JSON.stringify({ ...requestBody, model: undefined }));

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120_000);

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    const rawText = await response.text();
    console.log('[generate-video] 状态:', response.status, '响应片段:', rawText.slice(0, 300));

    if (!response.ok) {
      let errMsg = `API 请求失败 (HTTP ${response.status})`;
      try {
        const errJson = JSON.parse(rawText);
        errMsg = errJson?.error?.message || errJson?.message || errJson?.error || errMsg;
      } catch { /* noop */ }
      return new Response(
        JSON.stringify({ success: false, error: friendlyError(errMsg) }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 解析响应，提取视频 URL
    let videoUrl: string | null = null;
    try {
      const json = JSON.parse(rawText);
      // 尝试多种响应格式
      videoUrl =
        json?.data?.[0]?.url ||
        json?.data?.[0]?.video_url ||
        json?.result?.url ||
        json?.result?.video_url ||
        json?.url ||
        json?.video_url ||
        json?.output?.video_url ||
        json?.output?.[0]?.url ||
        json?.choices?.[0]?.message?.content ||
        null;

      // 深度扫描
      if (!videoUrl) {
        videoUrl = deepFindVideoUrl(json);
      }
    } catch {
      // 纯 URL 文本响应
      const match = rawText.match(/https?:\/\/\S+\.(mp4|webm|mov|avi)[^\s"]*/i);
      if (match) videoUrl = match[0];
    }

    if (!videoUrl) {
      return new Response(
        JSON.stringify({ success: false, error: '视频生成成功但未找到视频地址，请检查模型接口兼容性' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[generate-video] 成功，视频 URL:', videoUrl);
    return new Response(
      JSON.stringify({ success: true, url: videoUrl }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[generate-video] 异常:', msg);
    const isTimeout = msg.includes('aborted') || msg.includes('timeout');
    return new Response(
      JSON.stringify({ success: false, error: isTimeout ? '⏱ 视频生成超时（>120秒），请稍后重试' : friendlyError(msg) }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// 递归深度扫描对象中的视频 URL
// deno-lint-ignore no-explicit-any
function deepFindVideoUrl(obj: any, depth = 0): string | null {
  if (depth > 8 || !obj || typeof obj !== 'object') return null;
  for (const val of Object.values(obj)) {
    if (typeof val === 'string') {
      if (/^https?:\/\/.+\.(mp4|webm|mov|avi)/i.test(val)) return val;
      if (/^https?:\/\/.+video/i.test(val)) return val;
    } else if (typeof val === 'object') {
      const found = deepFindVideoUrl(val, depth + 1);
      if (found) return found;
    }
  }
  return null;
}
