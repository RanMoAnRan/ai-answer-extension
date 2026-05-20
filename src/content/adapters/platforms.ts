import type { DetectedQuestion, QuestionType } from '../../types';

interface PlatformRule {
  id: string;
  isPage: () => boolean;
  questionSelector: string;
  titleSelector: string;
  optionSelector: string;
  typeSelector?: string;
  clickableSelector?: string;
}

const rules: PlatformRule[] = [
  {
    id: 'chaoxing',
    isPage: () => /(^|\.)chaoxing\.com$/.test(location.hostname),
    questionSelector: '.questionLi',
    titleSelector: 'h3, h3.mark_name',
    optionSelector: 'ul li .after, .answer_p, .answerBg, ul.mark_letter li',
    typeSelector: 'input[name^="answertype"], input[name^="type"]',
    clickableSelector: '.answerBg, label, li, .after, .answer_p'
  },
  {
    id: 'zhihuishu',
    isPage: () => location.hostname.includes('zhihuishu.com'),
    questionSelector: '.examPaper_box > div:nth-child(2) > div:not(.examPaper_partTit), .questionType, .subjecttype-div.clearfloat',
    titleSelector: '.subject_describe.dynamic-fonts div:first-child, .subject_describe, .subjectTitle-p',
    optionSelector: '.subject_node .nodeLab .label.clearfix .node_detail, .examquestions-answer, .TitleOptions-div label',
    typeSelector: '.subject_type span:first-child, .newZy_TItle, .subjecttopic-div',
    clickableSelector: '.nodeLab, label, .examquestions-answer, .TitleOptions-div label'
  },
  {
    id: 'ouchn',
    isPage: () => location.hostname.includes('ouchn.edu.cn') || location.hostname.includes('ouchn.cn'),
    questionSelector: '.everyQuest',
    titleSelector: '.topicTitle',
    optionSelector: '.optionList .topicTitle, .optionList li, .optionList label',
    typeSelector: '.question-box .tag',
    clickableSelector: '.optionList li, .optionList label, .optionList .topicTitle'
  },
  {
    id: 'qingshu',
    isPage: () => location.hostname.includes('qingshuxuetang.com'),
    questionSelector: '.paper-container > .question-detail-container, .question-detail-container',
    titleSelector: '.question-detail-description',
    optionSelector: '.question-detail-options .question-detail-option .option-description, .question-detail-options .question-detail-option .option-description-preview',
    typeSelector: '.question-detail-type-desc',
    clickableSelector: '.question-detail-option, label, input'
  }
];

export function getCurrentPlatformRule(): PlatformRule | null {
  return rules.find((rule) => rule.isPage()) || null;
}

export function detectPlatformQuestions(): DetectedQuestion[] {
  const rule = getCurrentPlatformRule();
  if (!rule) return [];
  const nodes = Array.from(document.querySelectorAll<HTMLElement>(rule.questionSelector)).filter(isVisible);
  return nodes.map((node, idx) => parseNode(rule, node, idx)).filter(Boolean) as DetectedQuestion[];
}

export function fillPlatformAnswer(question: DetectedQuestion, keys: string[]): { ok: boolean; message: string } {
  const rule = getCurrentPlatformRule();
  if (!rule || !question.id.startsWith(`${rule.id}_`)) return { ok: false, message: '非当前平台题目' };
  const node = document.querySelectorAll<HTMLElement>(rule.questionSelector)[question.elementIndex];
  if (!node) return { ok: false, message: `${rule.id} 未找到题目容器` };
  if (question.type === 'short' || question.type === 'blank') return fillSubjective(rule.id, node, keys.join('\n'));

  const optionNodes = Array.from(node.querySelectorAll<HTMLElement>(rule.clickableSelector || rule.optionSelector)).filter(isVisible);
  let clicked = 0;
  for (const rawKey of keys) {
    const key = rawKey.trim().toUpperCase();
    const index = key === '正确' || key === '对' ? findJudgeIndex(question, true)
      : key === '错误' || key === '错' ? findJudgeIndex(question, false)
        : key.charCodeAt(0) - 65;
    const target = optionNodes[index] || findOptionByText(node, question.options[index]?.text || '', rule.clickableSelector || rule.optionSelector);
    if (target) {
      target.scrollIntoView({ block: 'center', inline: 'nearest' });
      fireClick(target);
      clicked++;
    }
  }
  return clicked > 0 ? { ok: true, message: `${rule.id} 已选中 ${keys.join('、')}` } : { ok: false, message: `${rule.id} 未找到可点击选项` };
}

function parseNode(rule: PlatformRule, node: HTMLElement, idx: number): DetectedQuestion | null {
  const title = cleanText((node.querySelector(rule.titleSelector) as HTMLElement | null)?.innerText || '');
  const optionEls = Array.from(node.querySelectorAll<HTMLElement>(rule.optionSelector)).filter(isVisible);
  const options = optionEls.map((el, i) => ({
    key: String.fromCharCode(65 + i),
    text: cleanOptionText(el.innerText || el.textContent || ''),
    elementIndex: i
  })).filter((opt) => opt.text && opt.text.length < 500);
  if (!title) return null;
  const typeText = rule.typeSelector ? readTypeText(node, rule.typeSelector) : '';
  const type = inferType(typeText || title, options.map((o) => o.text));
  return {
    id: `${rule.id}_${idx + 1}`,
    type: options.length >= 2 ? type : (type === 'blank' ? 'blank' : 'short'),
    question: title,
    options,
    elementIndex: idx
  };
}

function readTypeText(node: HTMLElement, selector: string) {
  const el = node.querySelector(selector) as HTMLInputElement | HTMLElement | null;
  if (!el) return '';
  if ('value' in el && el.value) return el.value;
  return el.innerText || el.textContent || '';
}

function inferType(text: string, options: string[]): QuestionType {
  const compact = text.replace(/\s/g, '');
  if (/多选|多项|不定项|multiple|checkbox|1/.test(compact) && /多选|多项|不定项|multiple|checkbox/.test(compact)) return 'multiple';
  if (/判断|正误|对错|judg|truefalse|3/.test(compact) && (/判断|正误|对错|judg|truefalse/.test(compact) || isJudgeOptions(options))) return 'judge';
  if (/填空|completion|blank|fill/.test(compact)) return 'blank';
  if (/简答|问答|论述|主观|short|essay/.test(compact)) return 'short';
  if (isJudgeOptions(options)) return 'judge';
  return options.length ? 'single' : 'short';
}

function isJudgeOptions(options: string[]) {
  const normalized = options.map((o) => o.replace(/\s/g, ''));
  return normalized.includes('正确') && normalized.includes('错误') || normalized.includes('对') && normalized.includes('错');
}

function fillSubjective(platform: string, node: HTMLElement, answer: string): { ok: boolean; message: string } {
  const input = node.querySelector<HTMLElement>('textarea, input[type="text"], input:not([type]), [contenteditable="true"], .ql-editor, .w-e-text, .editor');
  if (!input) return { ok: false, message: `${platform} 未找到输入框` };
  if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) {
    const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(input as HTMLInputElement | HTMLTextAreaElement, answer);
  } else {
    input.innerText = answer;
  }
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  input.dispatchEvent(new Event('blur', { bubbles: true }));
  return { ok: true, message: `${platform} 主观题已填入` };
}

function findOptionByText(node: HTMLElement, text: string, selector: string) {
  if (!text) return null;
  const compact = normalize(text);
  return Array.from(node.querySelectorAll<HTMLElement>(selector)).find((el) => normalize(el.innerText || '').includes(compact)) || null;
}

function findJudgeIndex(question: DetectedQuestion, value: boolean): number {
  const words = value ? ['正确', '对', '是', 'TRUE'] : ['错误', '错', '否', 'FALSE'];
  const index = question.options.findIndex((opt) => words.some((word) => opt.text.toUpperCase().includes(word)));
  return index >= 0 ? index : value ? 0 : 1;
}

function fireClick(el: HTMLElement) {
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
  el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  el.click();
}

function cleanOptionText(text: string) {
  return cleanText(text).replace(/^[A-Ha-hＡ-Ｈａ-ｈ][\.、．。\)）:：]?\s*/, '');
}

function cleanText(text: string) {
  return text.replace(/\s+/g, ' ').trim();
}

function normalize(text: string) {
  return text.replace(/\s+/g, '').trim();
}

function isVisible(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect();
  const style = getComputedStyle(el);
  return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
}
