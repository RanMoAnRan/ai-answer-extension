import type { AiConfig, DetectedQuestion, AiAnswer, ChatMessage } from '../types';
import { buildAnswerPrompt } from './prompts';
import { parseAiAnswer } from './parser';

export async function askQuestion(config: AiConfig, question: DetectedQuestion): Promise<{ raw: string; parsed: AiAnswer }> {
  if (!config.baseUrl || !config.apiKey || !config.model) {
    throw new Error('请先配置 Base URL、API Key 和 Model');
  }

  const prompt = buildAnswerPrompt(question);
  const mode = config.apiMode || 'responses';
  const url = buildApiUrl(config.baseUrl, mode);

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

const CHAT_SYSTEM_PROMPT = `你是一个通用聊天助手，也可以作为答题助手。

根据用户最后一条消息自动选择回复模式：
1. 普通聊天、咨询、解释、改写、翻译、代码等请求：正常、自然、清晰地回答。
2. 用户明确要求做题、选择答案、填空、判断正误、只要答案、给最终答案，或消息明显是一道题目时：只输出最终答案，不要解析，不要说明原因，不要复述题目，不要展示思考过程。多题时每行只写“题号. 选项/答案”，例如“46. D located”。

无论是否启用推理能力，最终给用户看的回复必须写在可见的 message.content / output_text 中，不要只放在 reasoning_content 中。`;

export async function askChat(config: AiConfig, messages: ChatMessage[]): Promise<{ raw: string }> {
  if (!config.baseUrl || !config.apiKey || !config.model) {
    throw new Error('请先配置 Base URL、API Key 和 Model');
  }
  const chatMessages = messages
    .map((item) => ({ role: item.role, content: item.content.trim() }))
    .filter((item) => item.content);
  if (!chatMessages.length) throw new Error('请输入聊天内容');

  const mode = config.apiMode || 'responses';
  const url = buildApiUrl(config.baseUrl, mode);
  const res = await fetchWithUpstreamRetry(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`
    },
    body: JSON.stringify(mode === 'responses' ? {
      model: config.model,
      instructions: CHAT_SYSTEM_PROMPT,
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_text', text: formatChatHistory(chatMessages) }
          ]
        }
      ],
      reasoning: { effort: config.reasoningEffort || 'medium' },
      store: config.store ?? false,
      max_output_tokens: 4096
    } : {
      model: config.model,
      temperature: config.temperature ?? 0.3,
      messages: [
        { role: 'system', content: CHAT_SYSTEM_PROMPT },
        ...chatMessages
      ],
      max_tokens: 4096
    })
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    throw new Error(`AI 聊天请求失败：${res.status} ${errorText.slice(0, 200)}`);
  }

  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const errorText = await res.text().catch(() => '');
    throw new Error(`AI 聊天响应不是 JSON：${contentType} ${errorText.slice(0, 120)}`);
  }

  const json = await res.json();
  const raw = mode === 'responses'
    ? extractResponsesText(json)
    : extractChatCompletionsText(json);
  if (!raw || typeof raw !== 'string') {
    throw new Error(`${mode === 'responses' ? 'AI 聊天响应缺少 output_text/output content' : 'AI 聊天响应缺少 choices[0].message.content'}：${JSON.stringify(json).slice(0, 300)}`);
  }
  return { raw };
}

function formatChatHistory(messages: ChatMessage[]) {
  return messages.map((item) => `${item.role === 'user' ? '用户' : '助手'}：${item.content}`).join('\n\n');
}

function extractChatCompletionsText(json: any): string | undefined {
  const message = json?.choices?.[0]?.message;
  if (typeof message?.content === 'string' && message.content) return message.content;
  if (Array.isArray(message?.content)) {
    const texts = message.content
      .map((item: any) => typeof item?.text === 'string' ? item.text : typeof item?.content === 'string' ? item.content : '')
      .filter(Boolean);
    if (texts.length) return texts.join('');
  }
  if (typeof json?.choices?.[0]?.text === 'string' && json.choices[0].text) return json.choices[0].text;
  return undefined;
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
  const mode = config.apiMode || 'responses';
  const url = buildApiUrl(config.baseUrl, mode);
  const res = await fetchWithUpstreamRetry(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`
    },
    body: JSON.stringify(mode === 'responses' ? {
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
    } : {
      model: config.model,
      temperature: config.temperature ?? 0.1,
      messages: [
        { role: 'user', content: '只回答 OK' }
      ],
      max_tokens: 128
    })
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`最小测试失败：${res.status} ${text.slice(0, 500)}`);
  let json: any;
  try { json = JSON.parse(text); } catch { throw new Error(`最小测试返回非 JSON：${text.slice(0, 500)}`); }
  const raw = mode === 'responses'
    ? extractResponsesText(json)
    : json?.choices?.[0]?.message?.content;
  return { raw: raw || text.slice(0, 500), json };
}

function buildApiUrl(baseUrl: string, mode: 'chat' | 'responses') {
  const base = baseUrl
    .replace(/\/+$/, '')
    .replace(/\/chat\/completions$/i, '')
    .replace(/\/responses$/i, '');
  return mode === 'responses' ? `${base}/responses` : `${base}/chat/completions`;
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
