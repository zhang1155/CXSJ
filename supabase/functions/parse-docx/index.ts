import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @deno-types="npm:@types/mammoth"
import mammoth from "npm:mammoth";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const DEEPSEEK_ENDPOINT = 'https://api.deepseek.com/v1/chat/completions';
const DEEPSEEK_MODEL = 'deepseek-chat';
const REQUEST_TIMEOUT_MS = 120000;

// ─── 带超时的 fetch ────────────────────────────────────────────────────────────
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

// ─── 从 Word 文件 Buffer 提取纯文本 ──────────────────────────────────────────
async function extractTextFromDocx(buffer: ArrayBuffer): Promise<string> {
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  return result.value.trim();
}

// ─── 调用 DeepSeek 生成结构化幻灯片 JSON ─────────────────────────────────────
async function generateSlidesFromText(text: string, apiKey: string): Promise<unknown> {
  const systemPrompt = `你是一位专业的 PPT 内容设计师，擅长将文档内容转化为结构清晰、逻辑连贯的演示文稿。`;

  const userPrompt = `请将以下文档内容转化为 PPT 幻灯片结构，严格按照 JSON 格式输出，不要输出任何其他内容。

要求：
1. 根据内容合理划分幻灯片，通常 8~15 页
2. 第一页为封面（type: "cover"），最后一页为结束页（type: "ending"）
3. 章节分隔页使用 type: "section"，正文内容页使用 type: "content"
4. 每页 bullets 3~5 个要点，简洁有力
5. image_prompt 用英文描述该页适合配的图片风格，便于 AI 生图
6. 所有文字字段（title/subtitle/bullets）使用中文

输出格式（只输出 JSON，不要 markdown 代码块）：
{
  "slides": [
    {
      "type": "cover",
      "title": "幻灯片主标题",
      "subtitle": "副标题或日期（可选）",
      "image_prompt": "English prompt for AI image generation",
      "bullets": []
    },
    {
      "type": "content",
      "title": "章节标题",
      "subtitle": "",
      "image_prompt": "English prompt for AI image generation",
      "bullets": ["要点1", "要点2", "要点3"]
    }
  ]
}

文档内容：
${text.slice(0, 12000)}`;

  const resp = await fetchWithTimeout(
    DEEPSEEK_ENDPOINT,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 4096,
      }),
    },
    REQUEST_TIMEOUT_MS,
  );

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`DeepSeek API 错误 ${resp.status}: ${errText}`);
  }

  const json = await resp.json();
  const content: string = json?.choices?.[0]?.message?.content ?? '';
  if (!content) throw new Error('DeepSeek 返回内容为空');

  // 清理可能包含的 markdown 代码块标记
  const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    throw new Error(`DeepSeek 返回格式无法解析：${cleaned.slice(0, 200)}`);
  }
}

// ─── 主处理逻辑 ───────────────────────────────────────────────────────────────
serve(async (req: Request) => {
  // CORS 预检
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ success: false, error: '仅支持 POST 请求' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  try {
    // 读取 multipart/form-data
    const contentType = req.headers.get('content-type') ?? '';
    if (!contentType.includes('multipart/form-data')) {
      return new Response(
        JSON.stringify({ success: false, error: '请使用 multipart/form-data 上传文件' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const apiKeyFromBody = formData.get('apiKey') as string | null;

    // 从 Authorization header 读取（Bearer token 格式）或 body 中读取
    const authHeader = req.headers.get('authorization') ?? '';
    const apiKeyFromHeader = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : (req.headers.get('x-api-key') ?? '');

    const apiKey = (apiKeyFromBody || apiKeyFromHeader || '').trim();

    // 验证 API Key
    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: '未提供 DeepSeek API Key，请在设置中配置' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 验证文件
    if (!file) {
      return new Response(
        JSON.stringify({ success: false, error: '未找到上传的文件，请上传 .docx 文件' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const fileName = file.name?.toLowerCase() ?? '';
    if (!fileName.endsWith('.docx')) {
      return new Response(
        JSON.stringify({ success: false, error: '仅支持 .docx 格式的 Word 文档' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 解析 Word 文档
    const arrayBuffer = await file.arrayBuffer();
    const text = await extractTextFromDocx(arrayBuffer);

    if (!text || text.length < 10) {
      return new Response(
        JSON.stringify({ success: false, error: '文档内容为空或无法提取文本，请检查文件' }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 调用 DeepSeek 生成结构化 JSON
    const parsed = await generateSlidesFromText(text, apiKey) as { slides?: unknown[] };
    const slides = parsed?.slides;

    if (!Array.isArray(slides) || slides.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'AI 未能生成有效的幻灯片内容，请重试' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({ success: true, slides }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[parse-docx] 错误：', message);
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
