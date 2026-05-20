import type { DetectedQuestion, QuestionType } from '../../types';

export function isLearninPage() {
  return location.host === 'www.learnin.com.cn' && location.href.includes('/user/#/user/student/course/');
}

export function detectLearninQuestions(): DetectedQuestion[] {
  const nodes = Array.from(document.querySelectorAll<HTMLElement>('.store-question-item-container'));
  return nodes.map((node, idx) => parseQuestionNode(node, idx)).filter(Boolean) as DetectedQuestion[];
}

function parseQuestionNode(node: HTMLElement, idx: number): DetectedQuestion | null {
  const vueQuestion = getVueQuestion(node);
  if (vueQuestion) {
    const type = mapType(vueQuestion.questionTypeCode);
    const options = Array.isArray(vueQuestion.optionList)
      ? vueQuestion.optionList.map((opt: any, i: number) => ({
          key: String.fromCharCode(65 + i),
          text: cleanHtml(opt?.content || ''),
          elementIndex: i
        })).filter((opt: any) => opt.text)
      : [];
    return {
      id: `learnin_${idx + 1}`,
      type,
      question: cleanHtml(vueQuestion.questionTitle || ''),
      options: type === 'judge' && options.length === 0 ? [
        { key: 'A', text: '正确', elementIndex: 0 },
        { key: 'B', text: '错误', elementIndex: 1 }
      ] : options,
      elementIndex: idx
    };
  }

  const title = cleanText((node.querySelector('.question-title') as HTMLElement | null)?.innerText || '');
  const optionNodes = Array.from(node.querySelectorAll<HTMLElement>('.question-info>.question-option-list>.option-item, .option-item'));
  const options = optionNodes.map((el, i) => ({
    key: String.fromCharCode(65 + i),
    text: cleanText(el.innerText).replace(/^[A-H][\.、．。\)）:：]?\s*/i, ''),
    elementIndex: i
  })).filter((opt) => opt.text);
  if (!title) return null;
  return {
    id: `learnin_${idx + 1}`,
    type: options.length >= 2 ? inferType(node, options.map((o) => o.text)) : 'short',
    question: title,
    options,
    elementIndex: idx
  };
}

export function fillLearninAnswer(question: DetectedQuestion, keys: string[]): { ok: boolean; message: string } {
  const node = document.querySelectorAll<HTMLElement>('.store-question-item-container')[question.elementIndex];
  if (!node) return { ok: false, message: 'learnin 未找到题目容器' };
  if (question.type === 'short' || question.type === 'blank') {
    return fillLearninSubjective(node, keys.join('\n').trim());
  }
  const optionNodes = Array.from(node.querySelectorAll<HTMLElement>('.question-info>.question-option-list>.option-item, .option-item'));
  let clicked = 0;
  for (const rawKey of keys) {
    const key = rawKey.trim().toUpperCase();
    const index = key === '正确' || key === '对' ? findJudgeIndex(question, true)
      : key === '错误' || key === '错' ? findJudgeIndex(question, false)
        : key.charCodeAt(0) - 65;
    const target = optionNodes[index];
    if (target && !isLearninSelected(target)) {
      const clickable = findLearninClickable(target);
      clickable.scrollIntoView({ block: 'center', inline: 'center' });
      fireClick(clickable);
      // learnin 的 Vue 选中状态有时绑定在父级 option-item，上面点子元素后再补一次父级点击。
      if (clickable !== target) fireClick(target);
      clicked++;
    }
  }
  return clicked > 0 ? { ok: true, message: `learnin 已选中 ${keys.join('、')}` } : { ok: true, message: `learnin 选项可能已选中 ${keys.join('、')}` };
}


function verifyLearninSelection(question: DetectedQuestion, keys: string[]): boolean {
  const node = document.querySelectorAll<HTMLElement>('.store-question-item-container')[question.elementIndex];
  if (!node) return false;
  const optionNodes = Array.from(node.querySelectorAll<HTMLElement>('.question-info>.question-option-list>.option-item, .option-item'));
  return keys.every((rawKey) => {
    const key = rawKey.trim().toUpperCase();
    const index = key === '正确' || key === '对' ? findJudgeIndex(question, true)
      : key === '错误' || key === '错' ? findJudgeIndex(question, false)
        : key.charCodeAt(0) - 65;
    const target = optionNodes[index];
    return Boolean(target && isLearninSelected(target));
  });
}

function verifyInputValue(input: HTMLInputElement | HTMLTextAreaElement, answer: string): boolean {
  const probe = answer.slice(0, Math.min(20, answer.length));
  return input.value.includes(probe);
}

function findLearninClickable(optionItem: HTMLElement): HTMLElement {
  return optionItem.querySelector<HTMLElement>('.option-index')
    || optionItem.querySelector<HTMLElement>('.option-content')
    || optionItem.querySelector<HTMLElement>('label, button, span, div')
    || optionItem;
}

function isLearninSelected(optionItem: HTMLElement): boolean {
  return optionItem.classList.contains('active')
    || Boolean(optionItem.querySelector('.active'))
    || optionItem.getAttribute('aria-checked') === 'true';
}

function fireClick(el: HTMLElement) {
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
  el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  el.click();
}

function getVueQuestion(node: any): any | null {
  return node?.__vue__?.question || node?.__vue__?.$data?.question || null;
}

function mapType(code: string): QuestionType {
  switch (code) {
    case 'single': return 'single';
    case 'multiple': return 'multiple';
    case 'judgment': return 'judge';
    case 'completion':
    case 'fill':
    case 'blank': return 'blank';
    default: return 'short';
  }
}

function inferType(node: HTMLElement, options: string[]): QuestionType {
  const header = cleanText((node.querySelector('.item-question-header>.header-left') as HTMLElement | null)?.innerText || '');
  if (/多选/.test(header)) return 'multiple';
  if (/判断/.test(header)) return 'judge';
  const normalized = options.map((o) => o.replace(/\s/g, ''));
  if (normalized.includes('正确') && normalized.includes('错误')) return 'judge';
  return 'single';
}

function findJudgeIndex(question: DetectedQuestion, value: boolean): number {
  const words = value ? ['正确', '对', '是', 'TRUE'] : ['错误', '错', '否', 'FALSE'];
  const index = question.options.findIndex((opt) => words.some((word) => opt.text.toUpperCase().includes(word)));
  return index >= 0 ? index : value ? 0 : 1;
}

function cleanHtml(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;
  return cleanText(div.innerText || div.textContent || html);
}

function cleanText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function fillLearninSubjective(node: HTMLElement, answer: string): { ok: boolean; message: string } {
  if (!answer) return { ok: false, message: 'learnin 主观题答案为空' };
  const input = node.querySelector<HTMLInputElement | HTMLTextAreaElement>('textarea, input[type="text"], input:not([type]), .el-textarea__inner');
  if (input) {
    setNativeValue(input, answer);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
    return verifyInputValue(input, answer) ? { ok: true, message: 'learnin 主观题已确认填入输入框' } : { ok: false, message: 'learnin 主观题已写入但读回校验失败' };
  }

  const editable = node.querySelector<HTMLElement>('[contenteditable="true"], .ql-editor, .w-e-text, .tox-edit-area iframe, .editor');
  if (editable) {
    if (editable.tagName.toLowerCase() === 'iframe') {
      const doc = (editable as HTMLIFrameElement).contentDocument;
      const body = doc?.body;
      if (body) {
        body.innerText = answer;
        body.dispatchEvent(new Event('input', { bubbles: true }));
        return (body.innerText || '').includes(answer.slice(0, Math.min(20, answer.length))) ? { ok: true, message: 'learnin 主观题已确认填入富文本 iframe' } : { ok: false, message: 'learnin 富文本 iframe 读回校验失败' };
      }
    }
    editable.focus();
    editable.innerText = answer;
    editable.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: answer }));
    editable.dispatchEvent(new Event('change', { bubbles: true }));
    editable.dispatchEvent(new Event('blur', { bubbles: true }));
    return (editable.innerText || '').includes(answer.slice(0, Math.min(20, answer.length))) ? { ok: true, message: 'learnin 主观题已确认填入富文本' } : { ok: false, message: 'learnin 富文本读回校验失败' };
  }

  const vue: any = (node as any).__vue__;
  const question = vue?.question || vue?.$data?.question;
  if (question && 'studentAnswer' in question) {
    question.studentAnswer = answer;
    return String(question.studentAnswer || '').includes(answer.slice(0, Math.min(20, answer.length))) ? { ok: true, message: 'learnin 主观题已确认写入 Vue studentAnswer' } : { ok: false, message: 'learnin Vue studentAnswer 校验失败' };
  }

  return { ok: false, message: 'learnin 未找到主观题输入区域' };
}

function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  setter?.call(el, value);
}
