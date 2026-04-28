import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import JSZip from "npm:jszip";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const DEEPSEEK_API = 'https://api.deepseek.com/v1/chat/completions';
const REQUEST_TIMEOUT_MS = 120000;

const EXTRACT_PROMPT = `你是一个PPT内容结构化专家。从以下Word文稿文本中提取发布会PPT的内容结构，输出严格JSON格式：

{
  "slides": [
    {
      "type": "类型",
      "title": "页面标题",
      "subtitle": "副标题文字（可选）",
      "image_prompt": "英文图片描述，用于AI生图",
      "bullets": ["要点1", "要点2", "要点3"]
    }
  ]
}

规则：
1. 第一页type="cover"作为封面，包含标题、副标题
2. 正文页type="content"，每页3~5个要点
3. 最后一页type="ending"作为结束页
4. image_prompt用英文描述适合该页的背景/配图
5. 只输出JSON，不要任何解释文字`;

interface SlideJson {
  type: string;
  title: string;
  subtitle?: string;
  image_prompt: string;
  bullets: string[];
}

/** 从 docx ZIP 中提取纯文本 */
async function extractTextFromDocx(buffer: Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const docFile = zip.file('word/document.xml');
  if (!docFile) throw new Error('无法找到 word/document.xml，文件可能不是有效的 .docx');

  const xmlText = await docFile.async('string');

  // 使用正则提取 <w:t> 标签内文本，按段落（<w:p>）组织
  const paragraphs: string[] = [];
  const paraRegex = /<w:p[ >][\s\S]*?<\/w:p>/g;
  const textRegex = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g;

  let paraMatch: RegExpExecArray | null;
  while ((paraMatch = paraRegex.exec(xmlText)) !== null) {
    const paraXml = paraMatch[0];
    let paraText = '';
    let tMatch: RegExpExecArray | null;
    while ((tMatch = textRegex.exec(paraXml)) !== null) {
      paraText += tMatch[1];
    }
    textRegex.lastIndex = 0;
    if (paraText.trim()) paragraphs.push(paraText.trim());
  }

  return paragraphs.join('\n');
}

/** 调用 DeepSeek API 结构化文本 */
async function callDeepSeek(text: string, apiKey: string): Promise<SlideJson[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(DEEPSEEK_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'DeepSeek-V4-flash',
        messages: [
          { role: 'system', content: EXTRACT_PROMPT },
          { role: 'user', content: text.slice(0, 12000) },
        ],
        temperature: 0.1,
        max_tokens: 4096,
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`DeepSeek API 错误 (${response.status}): ${errText.slice(0, 200)}`);
  }

  const result = await response.json();
  const content: string = result.choices?.[0]?.message?.content || '';
  if (!content) throw new Error('DeepSeek 返回内容为空');

  // 提取 JSON（兼容 ```json ... ``` 包裹）
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || content.match(/(\{[\s\S]*\})/);
  const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]).trim() : content.trim();

  const parsed = JSON.parse(jsonStr);
  if (parsed.slides && Array.isArray(parsed.slides)) {
    return parsed.slides as SlideJson[];
  }
  throw new Error('DeepSeek 返回格式不符合预期：缺少 slides 数组');
}

// ─── 主处理逻辑 ───────────────────────────────────────────────────────────────
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
    let fileBuffer: Uint8Array | null = null;
    let deepseekApiKey = '';
    let textContent = '';

    const contentType = req.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      // FormData 上传
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      deepseekApiKey = (formData.get('apiKey') as string) || '';

      if (!file) {
        return jsonResp({ success: false, error: '请上传 .docx 文件' }, 400);
      }
      const arrayBuf = await file.arrayBuffer();
      fileBuffer = new Uint8Array(arrayBuf);
    } else {
      // JSON body
      let body: Record<string, unknown> = {};
      try {
        body = await req.json();
      } catch {
        const raw = await req.text();
        body = JSON.parse(raw);
      }

      deepseekApiKey = (body.apiKey as string) || '';

      // 支持 base64 文件内容
      if (body.fileBase64) {
        const b64 = body.fileBase64 as string;
        const binaryStr = atob(b64);
        fileBuffer = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          fileBuffer[i] = binaryStr.charCodeAt(i);
        }
      }

      // 支持直接传入文本
      if (body.text) {
        textContent = body.text as string;
      }
    }

    if (!fileBuffer && !textContent) {
      return jsonResp({ success: false, error: '请提供 .docx 文件或文本内容' }, 400);
    }

    // 提取文本
    const rawText = fileBuffer ? await extractTextFromDocx(fileBuffer) : textContent;

    if (!rawText.trim()) {
      return jsonResp({ success: false, error: '未能从文档中提取到文本内容' }, 400);
    }

    console.log(`[parse-docx] 提取到 ${rawText.length} 字符文本`);

    // 未提供 API Key 时仅返回提取的文本
    if (!deepseekApiKey) {
      return jsonResp({
        success: true,
        info: '未提供 DeepSeek API Key，仅返回提取的文本',
        rawText: rawText.slice(0, 2000),
        slides: null,
      });
    }

    // 调用 DeepSeek 结构化
    const slides = await callDeepSeek(rawText, deepseekApiKey);
    console.log(`[parse-docx] DeepSeek 返回 ${slides.length} 页幻灯片`);

    return jsonResp({
      success: true,
      slides,
      rawText: rawText.slice(0, 500),
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    console.error('[parse-docx] 错误:', errorMessage);
    return jsonResp({ success: false, error: errorMessage }, 500);
  }
});
