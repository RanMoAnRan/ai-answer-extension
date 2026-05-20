import type { AiAnswer, DetectedQuestion } from '../types';
import { fillLearninAnswer, isLearninPage } from './adapters/learnin';
import { fillPlatformAnswer, getCurrentPlatformRule } from './adapters/platforms';

const inputSelector = 'input[type="radio"], input[type="checkbox"]';

export function fillAnswer(question: DetectedQuestion, answer: AiAnswer): { ok: boolean; message: string } {
  const keys = Array.isArray(answer.answer) ? answer.answer : [answer.answer];
  const rawKeys = keys.map((k) => String(k).trim()).filter(Boolean);
  const normalizedKeys = shouldUppercaseAnswer(question)
    ? rawKeys.map((k) => k.toUpperCase())
    : rawKeys;
  if (!normalizedKeys.length) return { ok: false, message: 'AI 未给出可用答案' };

  if (isLearninPage() && question.id.startsWith('learnin_')) {
    const learninResult = fillLearninAnswer(question, normalizedKeys);
    if (learninResult.ok) return learninResult;
  }

  const platformRule = getCurrentPlatformRule();
  if (platformRule && question.id.startsWith(`${platformRule.id}_`)) {
    const platformResult = fillPlatformAnswer(question, normalizedKeys);
    if (platformResult.ok) return platformResult;
  }

  const inputResult = fillByInputs(question, normalizedKeys);
  if (inputResult.ok) return inputResult;

  const domResult = fillByVisibleOptions(question, normalizedKeys);
  if (domResult.ok) return domResult;

  return { ok: false, message: `${inputResult.message}；也未找到可点击的文本选项` };
}

function shouldUppercaseAnswer(question: DetectedQuestion) {
  return question.type === 'single' || question.type === 'multiple' || question.type === 'judge';
}

function fillByInputs(question: DetectedQuestion, normalizedKeys: string[]) {
  const inputs = Array.from(document.querySelectorAll<HTMLInputElement>(inputSelector));
  const groups = new Map<string, HTMLInputElement[]>();
  inputs.forEach((input, index) => {
    const key = input.name || `__input_${index}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(input);
  });
  const group = Array.from(groups.values())[question.elementIndex];
  if (!group) return { ok: false, message: '未找到页面 input 选项控件' };

  let clicked = 0;
  normalizedKeys.forEach((key) => {
    let index = optionIndexFromKey(question, key);
    const input = group[index];
    if (input && !input.checked) {
      input.click();
      input.dispatchEvent(new Event('change', { bubbles: true }));
      clicked++;
    }
  });
  return clicked > 0 ? { ok: true, message: `已选中 ${normalizedKeys.join('、')}` } : { ok: true, message: '答案可能已选中' };
}

function fillByVisibleOptions(question: DetectedQuestion, normalizedKeys: string[]) {
  let clicked = 0;
  for (const key of normalizedKeys) {
    const index = optionIndexFromKey(question, key);
    const option = question.options[index];
    if (!option) continue;
    const el = findClickableOptionElement(option.key, option.text);
    if (el) {
      el.click();
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      clicked++;
    }
  }
  return clicked > 0 ? { ok: true, message: `已按文本选中 ${normalizedKeys.join('、')}` } : { ok: false, message: '未找到可点击的文本选项' };
}

function findClickableOptionElement(key: string, text: string): HTMLElement | null {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>('label, li, button, div, span, [role="radio"], [role="checkbox"], .option, .answer-option, .el-radio, .el-checkbox, .ant-radio-wrapper, .ant-checkbox-wrapper'));
  const normalizedText = normalize(text);
  const keyPrefix = new RegExp(`^${escapeRegExp(key)}\\s*[\\.、．。\\)）:：]`, 'i');
  const match = candidates
    .filter(isVisible)
    .filter((el) => {
      const t = normalize(el.innerText || el.textContent || '');
      return t === normalizedText || t.includes(normalizedText) || keyPrefix.test(t);
    })
    .sort((a, b) => clickableScore(b) - clickableScore(a))[0];
  return findBestClickable(match || null);
}

function findBestClickable(el: HTMLElement | null): HTMLElement | null {
  if (!el) return null;
  const clickable = el.closest('label, button, li, [role="radio"], [role="checkbox"], .option, .answer-option, .el-radio, .el-checkbox, .ant-radio-wrapper, .ant-checkbox-wrapper') as HTMLElement | null;
  return clickable || el;
}

function clickableScore(el: HTMLElement): number {
  let score = 0;
  const tag = el.tagName.toLowerCase();
  if (['label', 'button', 'li'].includes(tag)) score += 3;
  if (el.getAttribute('role')) score += 2;
  if (/option|radio|checkbox|answer/i.test(el.className || '')) score += 2;
  score -= Math.min((el.innerText || '').length / 200, 5);
  return score;
}

function optionIndexFromKey(question: DetectedQuestion, key: string): number {
  if (key === '正确' || key === '对') return findJudgeIndex(question, true);
  if (key === '错误' || key === '错') return findJudgeIndex(question, false);
  return key.charCodeAt(0) - 65;
}

function findJudgeIndex(question: DetectedQuestion, value: boolean): number {
  const trueWords = ['正确', '对', '是', 'TRUE'];
  const falseWords = ['错误', '错', '否', 'FALSE'];
  const words = value ? trueWords : falseWords;
  const index = question.options.findIndex((opt) => words.some((word) => opt.text.toUpperCase().includes(word)));
  return index >= 0 ? index : value ? 0 : 1;
}

function normalize(text: string): string {
  return text.replace(/\s+/g, '').trim();
}

function isVisible(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect();
  const style = getComputedStyle(el);
  return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
