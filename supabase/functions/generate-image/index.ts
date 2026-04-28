import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key, x-base-url, x-model-name',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const DEFAULT_ENDPOINT = 'https://grsai.dakka.com.cn/v1/draw/completions';
const REQUEST_TIMEOUT_MS = 90000;
const MAX_RETRIES = 2;

function pixelSizeToRatio(size: string): string {
  const r: Record<string, string> = {
    '1792x1024': '16:9',
    '1024x768':  '4:3',
    '1024x1024': '1:1',
    '1024x1792': '9:16',
    '1792x768':  '21:9',
  };
  if (r[size]) return r[size];
  const parts = size.split('x').map(Number);
  if (parts.length === 2 && parts[0] > 0 && parts[1] > 0) {
    const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);
    const g = gcd(parts[0], parts[1]);
    return parts[0] / g + ':' + parts[1] / g;
  }
  return '16:9';
}

interface ImageItem {
  url?: string;
  uri?: string;
  b64_json?: string;
}

interface GrsaiChunk {
  id?: string;
  status?: string | number;
  progress?: number;
  code?: number | string;
  results?: ImageItem[];
  error?: string | { message?: string; msg?: string };
  message?: string;
  msg?: string;
  detail?: string;
  // 兼容 OpenAI 标准格式
  data?: ImageItem[] | Record<string, unknown>;
  images?: ImageItem[];
  output?: ImageItem[];
  url?: string;
  b64_json?: string;
  // grsai 其他可能字段
  [key: string]: unknown;
}

// ─── 带超时的 fetch ────────────────────────────────────────────────────────────
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

// ─── 带重试（5xx 重试，4xx 不重试）────────────────────────────────────────────
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries: number,
  timeoutMs: number,
): Promise<Response> {
  let lastError: Error = new Error('未知错误');
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[generate-image] 第 ${attempt}/${maxRetries} 次请求`);
      const response = await fetchWithTimeout(url, options, timeoutMs);
      if (response.ok || (response.status >= 400 && response.status < 500)) {
        return response;
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (lastError.name === 'AbortError') {
        lastError = new Error(`请求超时（${timeoutMs / 1000}秒），请检查网络或稍后重试`);
      }
      console.warn(`[generate-image] 第 ${attempt} 次异常: ${lastError.message}`);
    }
    if (attempt < maxRetries) {
      await new Promise((r) => setTimeout(r, attempt * 2000));
    }
  }
  throw lastError;
}

// ─── 核心：逐字符解析拼接的多 JSON 对象流 ────────────────────────────────────
// grsai 响应格式: {"id":"..."}{"status":"running"}{"status":"succeeded","results":[...]}
// 标准 JSON.parse 会在这种格式上失败，需要按花括号深度逐段切割
function parseStreamingJson(raw: string): GrsaiChunk[] {
  const cleaned = raw.replace(/^\uFEFF/, '').trim();
  if (!cleaned) return [];

  // 检测 HTML 错误页（网关/CDN 返回）
  if (cleaned.startsWith('<!') || cleaned.toLowerCase().startsWith('<html')) {
    const title = cleaned.match(/<title[^>]*>(.*?)<\/title>/i)?.[1] || '';
    throw new Error(`服务返回 HTML 错误页${title ? `: ${title}` : ''}，请检查 API 地址`);
  }

  const chunks: GrsaiChunk[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escape = false;

  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];

    // 字符串内转义处理
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;

    if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && start !== -1) {
        const fragment = cleaned.slice(start, i + 1);
        try {
          chunks.push(JSON.parse(fragment) as GrsaiChunk);
        } catch {
          console.warn(`[generate-image] 跳过无效片段: ${fragment.slice(0, 80)}`);
        }
        start = -1;
      }
    }
  }

  return chunks;
}

// ─── 从最终 chunk 中判断是否成功并提取图片 URL ────────────────────────────────

// 宽松的成功判断：兼容 grsai 所有可能的 status/code 字段
function isSuccessChunk(chunk: GrsaiChunk): boolean {
  // status 字符串全覆盖
  const status = String(chunk.status ?? '').toLowerCase();
  if (['succeeded', 'success', 'done', 'complete', 'completed', 'finished', 'ok', '200'].includes(status)) return true;

  // 数字/字符串 code：0 或 200 视为成功
  const code = chunk.code;
  if (code === 0 || code === '0' || code === 200 || code === '200') return true;

  // progress >= 100
  if (typeof chunk.progress === 'number' && chunk.progress >= 100) return true;

  // 含图片数据的数组字段（只要非空就算成功）
  if (Array.isArray(chunk.results) && chunk.results.length > 0) return true;
  if (Array.isArray(chunk.data)    && chunk.data.length > 0)    return true;
  if (Array.isArray(chunk.images)  && chunk.images.length > 0)  return true;
  if (Array.isArray(chunk.output)  && chunk.output.length > 0)  return true;

  // 顶层直接有 URL
  if (typeof chunk.url === 'string' && chunk.url.startsWith('http')) return true;

  return false;
}

// 递归深度扫描：找到任意一个 http(s) URL 字符串
function deepFindUrl(obj: unknown, depth = 0): string | undefined {
  if (depth > 6) return undefined;
  if (typeof obj === 'string') {
    return (obj.startsWith('http://') || obj.startsWith('https://')) ? obj : undefined;
  }
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = deepFindUrl(item, depth + 1);
      if (found) return found;
    }
  }
  if (obj && typeof obj === 'object') {
    // 优先检查高概率字段
    const priorityKeys = ['url', 'uri', 'image_url', 'imageUrl', 'src', 'link'];
    const rec = obj as Record<string, unknown>;
    for (const k of priorityKeys) {
      const found = deepFindUrl(rec[k], depth + 1);
      if (found) return found;
    }
    // 再扫描其余字段
    for (const [k, v] of Object.entries(rec)) {
      if (priorityKeys.includes(k)) continue;
      const found = deepFindUrl(v, depth + 1);
      if (found) return found;
    }
  }
  return undefined;
}

function extractImageUrl(chunk: GrsaiChunk): string | undefined {
  // grsai 格式：results[0].url 或 results[0].uri
  if (Array.isArray(chunk.results) && chunk.results.length > 0) {
    return chunk.results[0].url || chunk.results[0].uri;
  }
  // OpenAI 标准：data[0].url
  if (Array.isArray(chunk.data) && chunk.data.length > 0) {
    return (chunk.data as ImageItem[])[0]?.url;
  }
  // 其他兼容格式
  if (Array.isArray(chunk.images) && chunk.images.length > 0) return chunk.images[0].url;
  if (Array.isArray(chunk.output) && chunk.output.length > 0) return (chunk.output[0] as ImageItem).url;
  if (typeof chunk.url === 'string' && chunk.url.startsWith('http')) return chunk.url;
  return undefined;
}

function extractB64(chunk: GrsaiChunk): string | undefined {
  if (Array.isArray(chunk.results) && chunk.results.length > 0) return chunk.results[0].b64_json;
  if (Array.isArray(chunk.data) && chunk.data.length > 0) return (chunk.data as ImageItem[])[0]?.b64_json;
  if (typeof chunk.b64_json === 'string' && chunk.b64_json) return chunk.b64_json;
  return undefined;
}

// ─── 将英文 API 错误翻译为用户友好的中文提示 ──────────────────────────────────
function friendlyErrorMessage(raw: string): string {
  const s = raw.toLowerCase();
  if (s.includes('insufficient credits') || s.includes('insufficient balance') ||
      s.includes('quota exceeded') || s.includes('rate limit') ||
      s.includes('billing') || s.includes('credit')) {
    return `API 余额不足，请前往 grsai 平台为账户充值后重试（原始信息：${raw}）`;
  }
  if (s.includes('invalid api key') || s.includes('unauthorized') ||
      s.includes('authentication') || s.includes('api key')) {
    return `API Key 无效或已过期，请在设置页面重新配置（原始信息：${raw}）`;
  }
  if (s.includes('content policy') || s.includes('safety') ||
      s.includes('violated') || s.includes('blocked')) {
    return `提示词触发内容安全限制，请修改描述后重试（原始信息：${raw}）`;
  }
  if (s.includes('timeout') || s.includes('timed out')) {
    return `请求超时，请稍后重试（原始信息：${raw}）`;
  }
  return raw;
}

// ─── 从错误 chunk 中提取可读信息 ──────────────────────────────────────────────
function extractErrorMessage(chunk: GrsaiChunk, httpStatus: number): string {
  let raw = '';
  if (chunk.error) {
    if (typeof chunk.error === 'object') {
      raw = chunk.error.message || chunk.error.msg || JSON.stringify(chunk.error);
    } else if (typeof chunk.error === 'string') {
      raw = chunk.error;
    }
  }
  if (!raw && typeof chunk.message === 'string') raw = chunk.message;
  if (!raw && typeof chunk.msg    === 'string') raw = chunk.msg;
  if (!raw && typeof chunk.detail === 'string') raw = chunk.detail;
  if (!raw) return `API 请求失败 (HTTP ${httpStatus})`;
  return friendlyErrorMessage(raw);
}

// ─── Edge Function 入口 ────────────────────────────────────────────────────────
serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const jsonResp = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      // fallback：部分代理转发时 Content-Type 可能不匹配，尝试手动解析文本
      try {
        const text = await req.text();
        body = JSON.parse(text);
      } catch {
        return jsonResp({ success: false, error: '请求体 JSON 格式错误' }, 400);
      }
    }

    // 优先从 body 读取凭证（秒哒代理会剥离自定义 header），兼容旧版 header 传参
    const apiKey =
      (body.apiKey as string | undefined) ||
      req.headers.get('x-api-key') ||
      '';
    if (!apiKey) {
      return jsonResp({ success: false, error: '未提供 API Key，请在设置页面配置' }, 401);
    }

    const baseUrl =
      (body.baseUrl as string | undefined) ||
      req.headers.get('x-base-url') ||
      DEFAULT_ENDPOINT;
    const modelName =
      (body.modelName as string | undefined) ||
      req.headers.get('x-model-name') ||
      'gpt-image-2';

    const {
      prompt,
      size = '1:1',
      n = 1,
      variants = 1,
      response_format = 'url',
    } = body as {
      prompt?: string;
      size?: string;
      n?: number;
      variants?: number;
      response_format?: string;
    };

    if (!prompt?.trim()) {
      return jsonResp({ success: false, error: '请输入图片描述' }, 400);
    }

    // GrsAI gpt-image-2：size 使用比例格式，参数名为 variants，移除 style 等不支持字段
    const requestPayload = {
      model: modelName,
      prompt: prompt.trim(),
      variants: Number(variants) || Number(n) || 1,
      size: pixelSizeToRatio(String(size)),
      response_format: String(response_format),
    };

    console.log(`[generate-image] endpoint=${baseUrl} model=${modelName} size=${size}`);
    console.log(`[generate-image] prompt=${String(prompt).slice(0, 80)}`);

    // ── 发起请求 ──────────────────────────────────────────────────────────────
    let response: Response;
    try {
      response = await fetchWithRetry(
        baseUrl,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify(requestPayload),
        },
        MAX_RETRIES,
        REQUEST_TIMEOUT_MS,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[generate-image] 所有重试失败: ${msg}`);
      return jsonResp({ success: false, error: msg }, 503);
    }

    const rawText = await response.text();
    console.log(`[generate-image] HTTP ${response.status}，响应前600字: ${rawText.slice(0, 600)}`);

    // ── 解析流式 JSON 响应 ─────────────────────────────────────────────────────
    let chunks: GrsaiChunk[];
    try {
      chunks = parseStreamingJson(rawText);
    } catch (parseErr) {
      const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
      console.error(`[generate-image] 响应解析失败: ${msg}`);
      return jsonResp({ success: false, error: msg }, 502);
    }

    console.log(`[generate-image] 解析得到 ${chunks.length} 个 JSON 片段`);

    if (chunks.length === 0) {
      return jsonResp({ success: false, error: '服务返回空响应，请稍后重试' }, 502);
    }

    // ── HTTP 4xx/5xx 错误：从第一个 chunk 提取错误信息 ───────────────────────
    if (!response.ok) {
      const errMsg = extractErrorMessage(chunks[0], response.status);
      console.error(`[generate-image] API 错误(${response.status}): ${errMsg}`);
      return jsonResp({ success: false, error: errMsg }, response.status);
    }

    // ── 取最后一个 chunk 作为最终结果 ──────────────────────────────────────────
    const lastChunk = chunks[chunks.length - 1];
    console.log(`[generate-image] 最终 chunk: ${JSON.stringify(lastChunk).slice(0, 200)}`);

    // 先用常规方式找成功 chunk（从末尾往前找）
    const successChunk = isSuccessChunk(lastChunk)
      ? lastChunk
      : [...chunks].reverse().find(isSuccessChunk);

    if (successChunk) {
      const imageUrl = extractImageUrl(successChunk);
      const b64 = extractB64(successChunk);
      if (imageUrl || b64) {
        console.log(`[generate-image] 成功，URL=${imageUrl?.slice(0, 80) || '(base64)'}`);
        return jsonResp({ success: true, url: imageUrl, b64_json: b64 });
      }
    }

    // 兜底：HTTP 200 时深度扫描所有 chunk，找任意 http(s) URL
    for (const chunk of [...chunks].reverse()) {
      const url = deepFindUrl(chunk);
      if (url) {
        console.log(`[generate-image] 深度扫描找到 URL=${url.slice(0, 80)}`);
        return jsonResp({ success: true, url });
      }
    }

    // 确实没找到图片
    const errMsg = extractErrorMessage(lastChunk, response.status);
    console.error(`[generate-image] 未找到图片，全部 chunks: ${JSON.stringify(chunks).slice(0, 400)}`);
    return jsonResp({ success: false, error: errMsg || '未获取到图片，请重试' }, 500);

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    console.error('[generate-image] 未捕获异常:', errorMessage);
    return jsonResp({ success: false, error: `服务内部错误: ${errorMessage}` }, 500);
  }
});
