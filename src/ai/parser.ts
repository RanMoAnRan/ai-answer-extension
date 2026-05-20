import type { AiAnswer } from '../types';

export function parseAiAnswer(raw: string): AiAnswer {
  const text = raw.trim();
  const direct = tryParse(text);
  if (direct) return normalize(direct);

  const codeMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (codeMatch) {
    const parsed = tryParse(codeMatch[1].trim());
    if (parsed) return normalize(parsed);
  }

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    const parsed = tryParse(text.slice(start, end + 1));
    if (parsed) return normalize(parsed);
  }

  throw new Error('AI 返回不是有效 JSON');
}

function tryParse(text: string): any | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function normalize(value: any): AiAnswer {
  const answer = value?.answer;
  if (!Array.isArray(answer) && typeof answer !== 'string') {
    throw new Error('AI JSON 缺少 answer 字段');
  }
  return {
    answer,
    confidence: typeof value.confidence === 'number' ? value.confidence : undefined,
    reason: typeof value.reason === 'string' ? value.reason : undefined
  };
}
