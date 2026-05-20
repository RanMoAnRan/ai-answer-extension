import type { AiConfig, DetectedQuestion, AiAnswer } from '../types';
import { buildAnswerPrompt } from './prompts';
import { parseAiAnswer } from './parser';

export async function askQuestion(config: AiConfig, question: DetectedQuestion): Promise<{ raw: string; parsed: AiAnswer }> {
  if (!config.baseUrl || !config.apiKey || !config.model) {
    throw new Error('请先配置 Base URL、API Key 和 Model');
  }

  const base = config.baseUrl.replace(/\/+$/, '');
  const prompt = buildAnswerPrompt(question);
  const mode = config.apiMode || 'responses';
  const url = mode === 'responses'
    ? (/\/responses$/i.test(base) ? base : `${base}/responses`)
    : (/\/chat\/completions$/i.test(base) ? base : `${base}/chat/completions`);

  const res = await fetchWithUpstreamRetry(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`
    },
    body: JSON.stringify(mode === 'responses' ? {
      model: config.model,
      instructions: '你只输出 JSON。',
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_text', text: prompt }
          ]
        }
      ],
      reasoning: { effort: config.reasoningEffort || 'medium' },
      store: config.store ?? false,
      max_output_tokens: 1024
    } : {
      model: config.model,
      temperature: config.temperature ?? 0.1,
      messages: [
        { role: 'system', content: '你只输出 JSON。' },
        { role: 'user', content: prompt }
      ]
    })
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`AI 请求失败：${res.status} ${text.slice(0, 200)}`);
  }

  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const text = await res.text().catch(() => '');
    throw new Error(`AI 响应不是 JSON，可能 Base URL/API 类型不匹配：${contentType} ${text.slice(0, 120)}`);
  }

  const json = await res.json();
  const raw = mode === 'responses'
    ? extractResponsesText(json)
    : json?.choices?.[0]?.message?.content;
  if (!raw || typeof raw !== 'string') {
    throw new Error(mode === 'responses' ? 'AI 响应缺少 output_text/output content' : 'AI 响应缺少 choices[0].message.content');
  }

  return { raw, parsed: parseAiAnswer(raw) };
}

function extractResponsesText(json: any): string | undefined {
  if (typeof json?.output_text === 'string') return json.output_text;
  const output = json?.output;
  if (Array.isArray(output)) {
    const texts: string[] = [];
    for (const item of output) {
      const content = item?.content;
      if (!Array.isArray(content)) continue;
      for (const c of content) {
        if (typeof c?.text === 'string') texts.push(c.text);
        else if (typeof c?.content === 'string') texts.push(c.content);
      }
    }
    if (texts.length) return texts.join('');
  }
  return undefined;
}

export async function testMinimalResponse(config: AiConfig): Promise<{ raw: string; json: any }> {
  if (!config.baseUrl || !config.apiKey || !config.model) {
    throw new Error('请先配置 Base URL、API Key 和 Model');
  }
  const base = config.baseUrl.replace(/\/+$/, '');
  const url = /\/responses$/i.test(base) ? base : `${base}/responses`;
  const res = await fetchWithUpstreamRetry(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model: config.model,
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_text', text: '只回答 OK' }
          ]
        }
      ],
      reasoning: { effort: config.reasoningEffort || 'medium' },
      store: config.store ?? false,
      max_output_tokens: 128
    })
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`最小测试失败：${res.status} ${text.slice(0, 500)}`);
  let json: any;
  try { json = JSON.parse(text); } catch { throw new Error(`最小测试返回非 JSON：${text.slice(0, 500)}`); }
  return { raw: extractResponsesText(json) || text.slice(0, 500), json };
}

async function fetchWithUpstreamRetry(url: string, init: RequestInit, attempts = 3): Promise<Response> {
  let lastResponse: Response | null = null;
  let lastText = '';
  for (let i = 0; i < attempts; i++) {
    const res = await fetch(url, init);
    if (res.ok) return res;

    const text = await res.clone().text().catch(() => '');
    lastResponse = res;
    lastText = text;

    const retryable = res.status === 502 || res.status === 503 || res.status === 504 ||
      text.includes('upstream_error') || text.includes('Upstream access forbidden') || text.includes('consecutive_403') || text.includes('API_KEY_REQUIRED') || text.includes('API key is required');
    if (!retryable || i === attempts - 1) return res;
    await new Promise((resolve) => setTimeout(resolve, 800 + i * 700));
  }

  if (lastResponse) {
    return new Response(lastText, { status: lastResponse.status, statusText: lastResponse.statusText, headers: lastResponse.headers });
  }
  return fetch(url, init);
}
