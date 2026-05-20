import type { AiConfig, DetectedQuestion } from '../types';
import { askQuestion, testMinimalResponse } from '../ai/client';

chrome.runtime.onMessage.addListener((message: any, _sender: any, sendResponse: any) => {
  if (message?.type === 'AI_ASK') {
    handleAsk(message.config, message.question).then(sendResponse);
    return true;
  }
  if (message?.type === 'OPEN_OPTIONS') {
    chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
    return undefined;
  }
  if (message?.type === 'AI_MODELS') {
    handleModels(message.config).then(sendResponse);
    return true;
  }
  if (message?.type === 'AI_PROBE_MODELS') {
    handleProbeModels(message.config, message.models || []).then(sendResponse);
    return true;
  }
  if (message?.type === 'AI_MINIMAL_TEST') {
    handleMinimalTest(message.config).then(sendResponse);
    return true;
  }
  if (message?.type === 'AI_TEST') {
    const sample: DetectedQuestion = {
      id: 'test',
      type: 'single',
      question: '1 + 1 等于多少？',
      options: [
        { key: 'A', text: '1' },
        { key: 'B', text: '2' },
        { key: 'C', text: '3' },
        { key: 'D', text: '4' }
      ],
      elementIndex: 0
    };
    handleAsk(message.config, sample).then(sendResponse);
    return true;
  }
  return undefined;
});

async function handleAsk(config: AiConfig, question: DetectedQuestion) {
  try {
    const data = await askQuestion(config, question);
    return { ok: true, data };
  } catch (error: any) {
    return { ok: false, error: error?.message || String(error) };
  }
}

async function handleModels(config: AiConfig) {
  try {
    if (!config?.baseUrl || !config?.apiKey) throw new Error('请先填写 Base URL 和 API Key');
    const base = config.baseUrl.replace(/\/+$/, '').replace(/\/chat\/completions$/i, '');
    const url = `${base}/models`;
    const res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${config.apiKey}` }
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`获取模型失败：${res.status} ${text.slice(0, 200)}`);
    let json: any;
    try { json = JSON.parse(text); } catch { throw new Error(`模型列表不是 JSON：${text.slice(0, 200)}`); }
    const models = Array.isArray(json?.data)
      ? json.data.map((item: any) => typeof item === 'string' ? item : item?.id).filter(Boolean)
      : Array.isArray(json?.models)
        ? json.models.map((item: any) => typeof item === 'string' ? item : item?.id || item?.name).filter(Boolean)
        : [];
    return { ok: true, models, raw: json };
  } catch (error: any) {
    return { ok: false, error: error?.message || String(error) };
  }
}

async function handleProbeModels(config: AiConfig, models: string[]) {
  const unique = Array.from(new Set(models.filter(Boolean))).slice(0, 30);
  const results: Array<{ model: string; ok: boolean; error?: string; raw?: string }> = [];
  for (const model of unique) {
    const probeConfig = { ...config, model };
    const sample: DetectedQuestion = {
      id: 'probe',
      type: 'single',
      question: '1 + 1 等于多少？',
      options: [
        { key: 'A', text: '1' },
        { key: 'B', text: '2' }
      ],
      elementIndex: 0
    };
    try {
      const data = await askQuestion(probeConfig, sample);
      results.push({ model, ok: true, raw: data.raw });
      return { ok: true, usableModel: model, results };
    } catch (error: any) {
      results.push({ model, ok: false, error: error?.message || String(error) });
    }
  }
  return { ok: false, results, error: '没有探测到可用模型' };
}

async function handleMinimalTest(config: AiConfig) {
  try {
    const data = await testMinimalResponse(config);
    return { ok: true, data };
  } catch (error: any) {
    return { ok: false, error: error?.message || String(error) };
  }
}
