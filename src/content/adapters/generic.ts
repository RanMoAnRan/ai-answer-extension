import type { DetectedQuestion, QuestionType } from '../../types';
import { detectLearninQuestions, isLearninPage } from './learnin';
import { detectPlatformQuestions, getCurrentPlatformRule } from './platforms';

const optionSelector = 'label, .option, .answer-option, .el-radio, .el-checkbox, .ant-radio-wrapper, .ant-checkbox-wrapper, li, [role="radio"], [role="checkbox"]';
const inputSelector = 'input[type="radio"], input[type="checkbox"]';
const optionLineRe = /^([A-Ha-hＡ-Ｈａ-ｈ])\s*[\.、．。\)）:：]\s*(.+)$/;

export function detectQuestions(): DetectedQuestion[] {
  if (isLearninPage()) {
    const learninQuestions = detectLearninQuestions();
    if (learninQuestions.length) return learninQuestions;
  }

  if (getCurrentPlatformRule()) {
    const platformQuestions = detectPlatformQuestions();
    if (platformQuestions.length) return platformQuestions;
  }

  const formQuestions = detectByInputs();
  if (formQuestions.length) return formQuestions;

  const domBlockQuestions = detectByDomBlocks();
  if (domBlockQuestions.length) return domBlockQuestions;

  return detectByTextBlocks();
}

function detectByInputs(): DetectedQuestion[] {
  const inputs = Array.from(document.querySelectorAll<HTMLInputElement>(inputSelector));
  const groups = new Map<string, HTMLInputElement[]>();
  inputs.forEach((input, index) => {
    const key = input.name || `__input_${index}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(input);
  });

  const questions: DetectedQuestion[] = [];
  Array.from(groups.values()).forEach((group, idx) => {
    if (!group.length) return;
    const root = findQuestionRoot(group[0]);
    const questionText = extractQuestionText(root, group[0]);
    const options = group.map((input, optionIndex) => ({
      key: String.fromCharCode(65 + optionIndex),
      text: extractInputLabel(input),
      elementIndex: optionIndex
    })).filter((o) => o.text);
    if (!questionText || options.length < 2) return;

    questions.push({
      id: `q_${idx + 1}`,
      type: detectType(questionText, group, options.map((o) => o.text)),
      question: questionText,
      options,
      elementIndex: idx
    });
  });
  return questions;
}

function detectByDomBlocks(): DetectedQuestion[] {
  const containers = Array.from(document.querySelectorAll<HTMLElement>([
    '.question', '.question-item', '.questionLi', '.exam-question', '.topic', '.subject', '.paper-question',
    '[class*="question"]', '[class*="Question"]', '[class*="topic"]', '[class*="subject"]'
  ].join(','))).filter(isVisible);
  const questions: DetectedQuestion[] = [];
  const seen = new Set<string>();

  for (const container of containers) {
    const lines = visibleText(container).split('\n').map((line) => line.trim()).filter(Boolean);
    const options = extractOptionsFromLines(lines);
    if (options.length < 2) continue;
    const questionLines = lines.filter((line) => !optionLineRe.test(line));
    const question = clean(questionLines.slice(0, 4).join(' ')).slice(0, 500);
    if (!question || question.length < 2) continue;
    const hash = `${question}|${options.map((o) => o.text).join('|')}`;
    if (seen.has(hash)) continue;
    seen.add(hash);
    const idx = questions.length;
    questions.push({
      id: `q_${idx + 1}`,
      type: detectType(question, [], options.map((o) => o.text)),
      question,
      options: options.map((o, i) => ({ ...o, elementIndex: i })),
      elementIndex: idx
    });
  }
  return questions;
}

function detectByTextBlocks(): DetectedQuestion[] {
  const text = document.body.innerText || '';
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const questions: DetectedQuestion[] = [];
  let current: { question: string; options: string[] } | null = null;

  for (const line of lines) {
    const option = line.match(optionLineRe);
    if (option) {
      current?.options.push(option[2].trim());
    } else if (/^\d+[\.、．\)]\s*/.test(line) || /[？?]$/.test(line) || /单选|多选|判断/.test(line)) {
      if (current && current.options.length >= 2) pushTextQuestion(questions, current);
      current = { question: line.replace(/^\d+[\.、．\)]\s*/, '').trim(), options: [] };
    }
  }
  if (current && current.options.length >= 2) pushTextQuestion(questions, current);
  return questions;
}

function extractOptionsFromLines(lines: string[]) {
  return lines.map((line) => {
    const match = line.match(optionLineRe);
    if (!match) return null;
    const key = normalizeOptionKey(match[1]);
    return { key, text: clean(match[2]) };
  }).filter(Boolean) as Array<{ key: string; text: string }>;
}

function pushTextQuestion(list: DetectedQuestion[], current: { question: string; options: string[] }) {
  const idx = list.length;
  list.push({
    id: `q_${idx + 1}`,
    type: detectType(current.question, [], current.options),
    question: current.question,
    options: current.options.map((text, i) => ({ key: String.fromCharCode(65 + i), text, elementIndex: i })),
    elementIndex: idx
  });
}

function findQuestionRoot(input: HTMLElement): HTMLElement {
  let el: HTMLElement | null = input;
  for (let i = 0; i < 6 && el?.parentElement; i++) {
    el = el.parentElement;
    const count = el.querySelectorAll(inputSelector).length;
    if (count >= 2 && count <= 12) return el;
  }
  return input.parentElement || input;
}

function extractQuestionText(root: HTMLElement, input: HTMLInputElement): string {
  const cloned = root.cloneNode(true) as HTMLElement;
  cloned.querySelectorAll(optionSelector).forEach((el) => el.remove());
  let text = clean(cloned.innerText);
  if (!text || text.length < 2) {
    const heading = root.querySelector('h1,h2,h3,h4,.title,.question-title,.stem,[class*="title"],[class*="stem"]');
    text = clean((heading as HTMLElement | null)?.innerText || '');
  }
  if (!text) {
    const container = input.closest('form, body') as HTMLElement;
    text = clean(container?.innerText?.split('\n').find((line) => line.includes('？') || line.includes('?')) || '');
  }
  return text.slice(0, 500);
}

function extractInputLabel(input: HTMLInputElement): string {
  const byId = input.id ? document.querySelector(`label[for="${CSS.escape(input.id)}"]`) as HTMLElement | null : null;
  if (byId?.innerText) return clean(byId.innerText);
  const label = input.closest('label') as HTMLElement | null;
  if (label?.innerText) return clean(label.innerText);
  const parent = input.parentElement;
  return clean(parent?.innerText || input.value || '');
}

function detectType(question: string, inputs: HTMLInputElement[], options: string[]): QuestionType {
  if (inputs.some((i) => i.type === 'checkbox')) return 'multiple';
  const normalizedOptions = options.map((o) => o.replace(/\s/g, ''));
  if (normalizedOptions.length === 2 && ((normalizedOptions.includes('正确') && normalizedOptions.includes('错误')) || (normalizedOptions.includes('对') && normalizedOptions.includes('错')))) return 'judge';
  if (/多选|多项|不定项|选择.*?项/.test(question)) return 'multiple';
  if (/判断|正误|对错/.test(question)) return 'judge';
  return options.length ? 'single' : 'unknown';
}

function visibleText(el: HTMLElement): string {
  return (el.innerText || '').replace(/\r/g, '\n');
}

function isVisible(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect();
  const style = getComputedStyle(el);
  return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
}

function normalizeOptionKey(key: string): string {
  const code = key.toUpperCase().charCodeAt(0);
  if (code >= 65313 && code <= 65320) return String.fromCharCode(code - 65248);
  return key.toUpperCase();
}

function clean(text: string): string {
  return text.replace(/\s+/g, ' ').replace(/^[A-Ha-hＡ-Ｈａ-ｈ][\.、．。\)）:：]\s*/, '').trim();
}
