import type { AiConfig, DetectedQuestion } from '../types';
import { detectQuestions } from './adapters/generic';
import { fillAnswer } from './filler';
import { Overlay, type QuestionResultView } from './overlay';

let overlay: Overlay | null = null;
let lastFailedIndexes: number[] = [];
let stopRequested = false;
let currentResults: QuestionResultView[] = [];
let answerStateObserver: MutationObserver | null = null;
let syncTimer: number | null = null;

function ensureOverlay() {
  if (!overlay) overlay = new Overlay(runAnswerFlow, window.top !== window, retryFailedQuestions, retryOneQuestion, stopAnswerFlow, locateQuestion, runUnfinishedQuestions, checkBeforeSubmit);
  startAnswerStateObserver();
  return overlay;
}

async function getConfig(): Promise<AiConfig | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get(['aiConfig'], (res: any) => resolve(res.aiConfig || null));
  });
}

async function ask(config: AiConfig, question: DetectedQuestion): Promise<any> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'AI_ASK', config, question }, resolve);
  });
}

async function runAnswerFlow(targetIndexes?: number[]) {
  const ui = ensureOverlay();
  stopRequested = false;
  ui.setRunning(true);
  try {
    const config = await getConfig();
    if (!config?.apiKey || !config?.baseUrl || !config?.model) {
      ui.log('请先在插件设置页配置 Base URL、API Key 和 Model', 'error');
      return;
    }

    const questions = detectQuestions();
    const runIndexes = targetIndexes?.length ? targetIndexes.filter((idx) => questions[idx]) : questions.map((_, idx) => idx);
    ui.log(targetIndexes?.length ? `准备重答 ${runIndexes.length} 道题` : `识别到 ${questions.length} 道题`);
    if (!targetIndexes?.length && questions.length > 0 && !window.confirm(`检测到 ${questions.length} 道题，是否开始答题？`)) {
      ui.log('已取消答题', 'info');
      return;
    }
    if (!questions.length || !runIndexes.length) return;

    if (!targetIndexes?.length) {
      currentResults = questions.map((question, index) => ({
        index,
        total: questions.length,
        title: question.question.slice(0, 30),
        status: 'pending'
      }));
    } else if (!currentResults.length || currentResults.length !== questions.length) {
      currentResults = questions.map((question, index) => ({ index, total: questions.length, title: question.question.slice(0, 30), status: 'pending' }));
    }
    ui.setSummary('', 'info');
    ui.setProgress(0, runIndexes.length);
    ui.setResults(currentResults);

    let successCount = 0;
    let failCount = 0;
    const failedIndexes: number[] = [];
    for (const i of runIndexes) {
      if (stopRequested) {
        ui.log('已停止答题', 'error');
        break;
      }
      const question = questions[i];
      const prefix = `第 ${i + 1}/${questions.length} 题`;
      ui.setProgress(successCount + failCount, runIndexes.length);
      updateResult(ui, i, { status: 'pending', message: '分析中' });
      ui.log(`${prefix} 分析：${question.question.slice(0, 42)}...`);
      const res = await ask(config, question);
      if (!res?.ok) {
        failCount++;
        failedIndexes.push(i);
        updateResult(ui, i, { status: 'error', message: 'AI失败' });
        ui.log(`${prefix} AI 失败：${res?.error || '未知错误'}`, 'error');
        continue;
      }
      const parsed = res.data.parsed;
      const answerText = Array.isArray(parsed.answer) ? parsed.answer.join('、') : parsed.answer;
      ui.log(`${prefix} AI 答案：${answerText || '空'}，置信度：${parsed.confidence ?? '未返回'}`);
      const fill = fillAnswer(question, parsed);
      if (fill.ok) successCount++; else { failCount++; failedIndexes.push(i); }
      ui.setProgress(successCount + failCount, runIndexes.length);
      updateResult(ui, i, { status: fill.ok ? 'success' : 'error', answer: answerText || '', message: fill.message });
      ui.log(`${prefix} ${fill.message}`, fill.ok ? 'success' : 'error');
      await sleep(350);
    }
    lastFailedIndexes = failedIndexes;
    const summary = `${targetIndexes?.length ? '重答完成' : '答题完成'}：本次 ${runIndexes.length} 题，成功 ${successCount} 题，失败 ${failCount} 题`;
    ui.setProgress(successCount + failCount, runIndexes.length);
    ui.log(summary, failCount ? 'error' : 'success');
    ui.setSummary(summary, failCount ? 'error' : 'success');
  } finally {
    ui.setRunning(false);
  }
}

function updateResult(ui: Overlay, index: number, patch: Partial<QuestionResultView>) {
  currentResults[index] = { ...currentResults[index], ...patch };
  ui.setResults(currentResults, index);
}

function retryFailedQuestions() {
  const ui = ensureOverlay();
  if (!lastFailedIndexes.length) {
    ui.log('没有可重答的失败题', 'info');
    return;
  }
  runAnswerFlow([...lastFailedIndexes]);
}

function retryOneQuestion(index: number) {
  runAnswerFlow([index]);
}

function locateQuestion(index: number) {
  const ui = ensureOverlay();
  const node = document.querySelectorAll<HTMLElement>('.store-question-item-container')[index];
  if (!node) {
    ui.log(`未找到第 ${index + 1} 题位置`, 'error');
    return;
  }
  node.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
  node.style.outline = '3px solid #2563eb';
  node.style.outlineOffset = '4px';
  window.setTimeout(() => {
    node.style.outline = '';
    node.style.outlineOffset = '';
  }, 1600);
  ui.log(`已定位到第 ${index + 1} 题`, 'info');
}

function runUnfinishedQuestions() {
  const ui = ensureOverlay();
  const questions = detectQuestions();
  const unfinished = questions.map((q, idx) => isQuestionAnswered(q, idx) ? -1 : idx).filter((idx) => idx >= 0);
  if (!unfinished.length) {
    ui.log('未发现未完成题', 'success');
    ui.setSummary('未发现未完成题', 'success');
    return;
  }
  runAnswerFlow(unfinished);
}

function checkBeforeSubmit() {
  const ui = ensureOverlay();
  syncResultsFromPage();
  const questions = detectQuestions();
  const unfinished = questions.map((q, idx) => isQuestionAnswered(q, idx) ? -1 : idx).filter((idx) => idx >= 0);
  const summary = unfinished.length ? `提交前检查：还有 ${unfinished.length} 道题未完成：${unfinished.map((i) => i + 1).join('、')}` : `提交前检查：${questions.length} 道题均已完成`;
  ui.log(summary, unfinished.length ? 'error' : 'success');
  ui.setSummary(summary, unfinished.length ? 'error' : 'success');
}

function isQuestionAnswered(question: DetectedQuestion, index: number): boolean {
  const node = document.querySelectorAll<HTMLElement>('.store-question-item-container')[index];
  if (!node) return currentResults[index]?.status === 'success';
  if (question.type === 'single' || question.type === 'multiple' || question.type === 'judge') {
    return Boolean(node.querySelector('.option-item.active, .active'));
  }
  const input = node.querySelector<HTMLInputElement | HTMLTextAreaElement>('textarea, input[type="text"], input:not([type]), .el-textarea__inner');
  if (input && input.value.trim()) return true;
  const editable = node.querySelector<HTMLElement>('[contenteditable="true"], .ql-editor, .w-e-text, .editor');
  if (editable && (editable.innerText || '').trim()) return true;
  const vue: any = (node as any).__vue__;
  const q = vue?.question || vue?.$data?.question;
  return Boolean(q?.studentAnswer || q?.answer);
}

function startAnswerStateObserver() {
  if (answerStateObserver) return;
  answerStateObserver = new MutationObserver(() => scheduleSyncResultsFromPage());
  answerStateObserver.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['class', 'value', 'aria-checked']
  });
  document.addEventListener('input', scheduleSyncResultsFromPage, true);
  document.addEventListener('change', scheduleSyncResultsFromPage, true);
  document.addEventListener('click', scheduleSyncResultsFromPage, true);
}

function scheduleSyncResultsFromPage() {
  if (syncTimer) window.clearTimeout(syncTimer);
  syncTimer = window.setTimeout(() => syncResultsFromPage(), 250);
}

function syncResultsFromPage() {
  if (!overlay || !currentResults.length) return;
  const questions = detectQuestions();
  let changed = false;
  currentResults = currentResults.map((item, idx) => {
    const question = questions[idx];
    if (!question) return item;
    if (isQuestionAnswered(question, idx) && item.status !== 'success') {
      changed = true;
      return {
        ...item,
        status: 'success',
        message: item.message && !item.message.includes('手动') ? item.message : '已手动完成'
      };
    }
    return item;
  });
  if (changed) {
    lastFailedIndexes = lastFailedIndexes.filter((idx) => currentResults[idx]?.status !== 'success');
    overlay.setResults(currentResults);
  }
}

function stopAnswerFlow() {
  stopRequested = true;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

chrome.runtime.onMessage.addListener((message: any) => {
  if (message?.type === 'AI_ANSWER_SHOW') {
    ensureOverlay();
  }
  if (message?.type === 'AI_ANSWER_RUN') {
    ensureOverlay();
    runAnswerFlow();
  }
});
