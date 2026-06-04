type LogLevel = 'info' | 'success' | 'error';
export type ResultStatus = 'pending' | 'success' | 'error';

export interface QuestionResultView {
  index: number;
  total: number;
  title: string;
  answer?: string;
  status: ResultStatus;
  message?: string;
}

export class Overlay {
  private root: HTMLDivElement;
  private logBox: HTMLDivElement;
  private resultBox: HTMLDivElement;
  private summaryBox: HTMLDivElement;
  private progressBox: HTMLDivElement;
  private runButton: HTMLButtonElement;
  private retryButton: HTMLButtonElement;
  private stopButton: HTMLButtonElement;
  private onRun: () => void;
  private onRetryFailed: () => void;
  private onRetryOne: (index: number) => void;
  private onLocateOne: (index: number) => void;
  private onStop: () => void;
  private onRunUnfinished: () => void;
  private onCheckBeforeSubmit: () => void;
  private onExportAnswers: () => void;

  constructor(
    onRun: () => void,
    isSubFrame = false,
    onRetryFailed: () => void = onRun,
    onRetryOne: (index: number) => void = () => {},
    onStop: () => void = () => {},
    onLocateOne: (index: number) => void = () => {},
    onRunUnfinished: () => void = onRun,
    onCheckBeforeSubmit: () => void = () => {},
    onExportAnswers: () => void = () => {}
  ) {
    this.onRun = onRun;
    this.onRetryFailed = onRetryFailed;
    this.onRetryOne = onRetryOne;
    this.onStop = onStop;
    this.onLocateOne = onLocateOne;
    this.onRunUnfinished = onRunUnfinished;
    this.onCheckBeforeSubmit = onCheckBeforeSubmit;
    this.onExportAnswers = onExportAnswers;
    this.root = document.createElement('div');
    this.root.id = 'ai-answer-helper-root';
    this.root.innerHTML = `
      <div class="aiah-panel">
        <div class="aiah-head">
          <strong>AI 答题助手${isSubFrame ? ' · 子页面' : ''}</strong>
          <button class="aiah-mini" title="收起/展开">—</button>
        </div>
        <div class="aiah-body">
          <div class="aiah-actions">
            <button class="aiah-run">识别并答题</button>
            <button class="aiah-stop">停止</button>
          </div>
          <button class="aiah-unfinished">只答未完成题</button>
          <button class="aiah-check">提交前检查</button>
          <button class="aiah-export">导出答案</button>
          <button class="aiah-retry">重答失败题</button>
          <button class="aiah-settings">设置 API</button>
          <div class="aiah-progress"><span></span><div><i></i></div></div>
          <div class="aiah-summary"></div>
          <div class="aiah-results"></div>
          <div class="aiah-log"></div>
        </div>
      </div>
    `;
    document.documentElement.appendChild(this.root);
    this.injectStyle();
    this.logBox = this.root.querySelector('.aiah-log')!;
    this.resultBox = this.root.querySelector('.aiah-results')!;
    this.summaryBox = this.root.querySelector('.aiah-summary')!;
    this.progressBox = this.root.querySelector('.aiah-progress')!;
    this.runButton = this.root.querySelector('.aiah-run')!;
    this.retryButton = this.root.querySelector('.aiah-retry')!;
    this.stopButton = this.root.querySelector('.aiah-stop')!;
    this.runButton.addEventListener('click', () => this.onRun());
    this.retryButton.addEventListener('click', () => this.onRetryFailed());
    this.stopButton.addEventListener('click', () => this.onStop());
    this.root.querySelector('.aiah-unfinished')?.addEventListener('click', () => this.onRunUnfinished());
    this.root.querySelector('.aiah-check')?.addEventListener('click', () => this.onCheckBeforeSubmit());
    this.root.querySelector('.aiah-export')?.addEventListener('click', () => this.onExportAnswers());
    this.resultBox.addEventListener('click', (event) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest<HTMLButtonElement>('[data-result-index]');
      if (!button) return;
      this.onLocateOne(Number(button.dataset.resultIndex));
    });
    this.resultBox.addEventListener('dblclick', (event) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest<HTMLButtonElement>('[data-retry-index]');
      if (!button) return;
      this.onRetryOne(Number(button.dataset.retryIndex));
    });
    this.root.querySelector('.aiah-settings')?.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS' });
    });
    this.root.querySelector('.aiah-mini')?.addEventListener('click', () => this.root.classList.toggle('aiah-collapsed'));
    this.enableDrag();
    this.restorePosition();
    this.setProgress(0, 0);
  }

  log(message: string, level: LogLevel = 'info') {
    const item = document.createElement('div');
    item.className = `aiah-log-item ${level}`;
    item.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    this.logBox.prepend(item);
  }

  setRunning(running: boolean) {
    this.runButton.disabled = running;
    this.retryButton.disabled = running;
    this.stopButton.disabled = !running;
    this.runButton.textContent = running ? '分析中...' : '识别并答题';
  }

  setProgress(done: number, total: number) {
    const percent = total > 0 ? Math.round((done / total) * 100) : 0;
    const text = total > 0 ? `进度：${done} / ${total}` : '';
    this.progressBox.querySelector('span')!.textContent = text;
    this.progressBox.querySelector<HTMLElement>('i')!.style.width = `${percent}%`;
    this.progressBox.classList.toggle('active', total > 0);
  }

  setSummary(message: string, level: LogLevel = 'info') {
    this.summaryBox.textContent = message;
    this.summaryBox.className = `aiah-summary ${message ? level : ''}`;
  }

  setResults(results: QuestionResultView[], activeIndex?: number) {
    this.resultBox.innerHTML = results.map((item) => {
      const cls = item.status === 'success' ? 'success' : item.status === 'error' ? 'error' : 'pending';
      const title = [`第${item.index + 1}题`, item.answer ? `答案：${item.answer}` : '', item.message || ''].filter(Boolean).join('\n');
      return `
        <button class="aiah-qbox ${cls} ${activeIndex === item.index ? 'active' : ''}" data-retry-index="${item.index}" data-result-index="${item.index}" title="${escapeHtml(title)}
单击定位题目，双击重答">
          ${item.index + 1}
        </button>
      `;
    }).join('');
    if (typeof activeIndex === 'number') {
      const active = this.resultBox.querySelector<HTMLElement>(`[data-result-index="${activeIndex}"]`);
      active?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
    }
  }

  private enableDrag() {
    const head = this.root.querySelector<HTMLElement>('.aiah-head');
    if (!head) return;
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;
    head.addEventListener('mousedown', (event) => {
      const target = event.target as HTMLElement;
      if (target.closest('button')) return;
      dragging = true;
      const rect = this.root.getBoundingClientRect();
      startX = event.clientX;
      startY = event.clientY;
      startLeft = rect.left;
      startTop = rect.top;
      document.body.style.userSelect = 'none';
      event.preventDefault();
    });
    window.addEventListener('mousemove', (event) => {
      if (!dragging) return;
      const left = Math.max(8, Math.min(window.innerWidth - 80, startLeft + event.clientX - startX));
      const top = Math.max(8, Math.min(window.innerHeight - 60, startTop + event.clientY - startY));
      this.setPosition(left, top);
    });
    window.addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging = false;
      document.body.style.userSelect = '';
      const rect = this.root.getBoundingClientRect();
      sessionStorage.setItem('ai-answer-helper-position', JSON.stringify({ left: rect.left, top: rect.top }));
    });
  }

  private restorePosition() {
    try {
      const raw = sessionStorage.getItem('ai-answer-helper-position');
      if (!raw) return;
      const pos = JSON.parse(raw);
      if (typeof pos.left === 'number' && typeof pos.top === 'number') this.setPosition(pos.left, pos.top);
    } catch {}
  }

  private setPosition(left: number, top: number) {
    this.root.style.left = `${left}px`;
    this.root.style.top = `${top}px`;
    this.root.style.right = 'auto';
    this.root.style.bottom = 'auto';
  }

  private injectStyle() {
    if (document.getElementById('ai-answer-helper-style')) return;
    const style = document.createElement('style');
    style.id = 'ai-answer-helper-style';
    style.textContent = `
      #ai-answer-helper-root { position: fixed; right: 18px; bottom: 18px; z-index: 2147483647; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #172033; }
      #ai-answer-helper-root .aiah-panel { width: 360px; background: white; border: 1px solid #dbe3ef; border-radius: 16px; box-shadow: 0 18px 50px rgba(15,23,42,.22); overflow: hidden; }
      #ai-answer-helper-root .aiah-head { height: 42px; display: flex; align-items: center; justify-content: space-between; padding: 0 12px; background: linear-gradient(135deg,#2563eb,#7c3aed); color: white; cursor: move; }
      #ai-answer-helper-root .aiah-mini { border: 0; background: rgba(255,255,255,.2); color: white; border-radius: 8px; width: 28px; height: 28px; cursor: pointer; }
      #ai-answer-helper-root .aiah-body { padding: 12px; }
      #ai-answer-helper-root.aiah-collapsed .aiah-body { display: none; }
      #ai-answer-helper-root .aiah-actions { display: grid; grid-template-columns: 1fr 74px; gap: 8px; }
      #ai-answer-helper-root .aiah-run, #ai-answer-helper-root .aiah-stop { border: 0; border-radius: 12px; padding: 10px; background: #2563eb; color: white; font-weight: 700; cursor: pointer; }
      #ai-answer-helper-root .aiah-stop { background: #ef4444; }
      #ai-answer-helper-root .aiah-unfinished, #ai-answer-helper-root .aiah-check, #ai-answer-helper-root .aiah-export, #ai-answer-helper-root .aiah-retry, #ai-answer-helper-root .aiah-settings { width: 100%; border: 0; border-radius: 12px; padding: 9px; margin-top: 8px; background: #e9eef8; color: #1e293b; font-weight: 700; cursor: pointer; }
      #ai-answer-helper-root .aiah-retry { background: #fff7ed; color: #9a3412; }
      #ai-answer-helper-root .aiah-check { background: #eef2ff; color: #3730a3; }
      #ai-answer-helper-root .aiah-export { background: #ecfdf5; color: #166534; }
      #ai-answer-helper-root button:disabled { opacity: .6; cursor: not-allowed; }
      #ai-answer-helper-root .aiah-progress { display: none; margin-top: 10px; font-size: 12px; color: #475569; }
      #ai-answer-helper-root .aiah-progress.active { display: block; }
      #ai-answer-helper-root .aiah-progress div { height: 8px; border-radius: 999px; background: #e2e8f0; overflow: hidden; margin-top: 5px; }
      #ai-answer-helper-root .aiah-progress i { display: block; height: 100%; width: 0; background: linear-gradient(90deg,#2563eb,#22c55e); transition: width .25s ease; }
      #ai-answer-helper-root .aiah-summary { display: none; margin-top: 10px; border-radius: 12px; padding: 10px; font-size: 13px; font-weight: 700; background: #f1f5f9; }
      #ai-answer-helper-root .aiah-summary.info, #ai-answer-helper-root .aiah-summary.success, #ai-answer-helper-root .aiah-summary.error { display: block; }
      #ai-answer-helper-root .aiah-summary.success { background: #dcfce7; color: #166534; }
      #ai-answer-helper-root .aiah-summary.error { background: #fee2e2; color: #991b1b; }
      #ai-answer-helper-root .aiah-results { margin-top: 10px; max-height: 170px; overflow: auto; display: grid; grid-template-columns: repeat(auto-fill, minmax(34px, 1fr)); gap: 8px; }
      #ai-answer-helper-root .aiah-qbox { height: 34px; min-width: 34px; border: 1px solid #cbd5e1; border-radius: 9px; background: #f8fafc; color: #334155; font-weight: 800; cursor: pointer; }
      #ai-answer-helper-root .aiah-qbox.success { background: #22c55e; border-color: #16a34a; color: white; }
      #ai-answer-helper-root .aiah-qbox.error { background: #ef4444; border-color: #dc2626; color: white; }
      #ai-answer-helper-root .aiah-qbox.pending { background: #f8fafc; color: #64748b; }
      #ai-answer-helper-root .aiah-qbox.active { outline: 3px solid rgba(37,99,235,.32); border-color: #2563eb; transform: translateY(-1px); }
      #ai-answer-helper-root .aiah-log { margin-top: 10px; max-height: 180px; overflow: auto; font-size: 12px; }
      #ai-answer-helper-root .aiah-log-item { border-radius: 10px; padding: 8px; margin-top: 6px; background: #f1f5f9; line-height: 1.4; }
      #ai-answer-helper-root .aiah-log-item.success { background: #dcfce7; color: #166534; }
      #ai-answer-helper-root .aiah-log-item.error { background: #fee2e2; color: #991b1b; }
    `;
    document.head.appendChild(style);
  }
}

function escapeHtml(text: string) {
  return text.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch] || ch));
}
