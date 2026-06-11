import type { ChatMessage } from '../types';

type ChatRole = 'user' | 'assistant' | 'error';

export class ChatOverlay {
  private panel: HTMLDivElement;
  private root: HTMLDivElement;
  private messages: HTMLDivElement;
  private input: HTMLTextAreaElement;
  private sendButton: HTMLButtonElement;
  private history: ChatMessage[] = [];
  private onChat: (messages: ChatMessage[]) => Promise<string>;

  constructor(onChat: (messages: ChatMessage[]) => Promise<string>) {
    this.onChat = onChat;
    this.root = document.createElement('div');
    this.root.id = 'ai-chat-helper-root';
    this.root.innerHTML = `
      <div class="aichat-panel">
        <div class="aichat-head">
          <strong>聊天助手</strong>
          <div class="aichat-head-actions">
            <button class="aichat-new" title="新建聊天">新建</button>
            <button class="aichat-mini" title="收起/展开">—</button>
            <button class="aichat-close" title="关闭">×</button>
          </div>
        </div>
        <div class="aichat-body">
          <div class="aichat-messages"></div>
          <div class="aichat-inputrow">
            <textarea class="aichat-input" rows="3" placeholder="输入问题，Enter 发送，Shift+Enter 换行"></textarea>
            <button class="aichat-send">发送</button>
          </div>
        </div>
        <div class="aichat-resize" title="拖动调整大小"></div>
      </div>
    `;
    document.documentElement.appendChild(this.root);
    this.injectStyle();
    this.panel = this.root.querySelector('.aichat-panel')!;
    this.messages = this.root.querySelector('.aichat-messages')!;
    this.input = this.root.querySelector('.aichat-input')!;
    this.sendButton = this.root.querySelector('.aichat-send')!;
    this.sendButton.addEventListener('click', () => this.send());
    this.input.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || event.shiftKey) return;
      event.preventDefault();
      this.send();
    });
    this.root.querySelector('.aichat-new')?.addEventListener('click', () => this.newChat());
    this.root.querySelector('.aichat-mini')?.addEventListener('click', () => this.root.classList.toggle('aichat-collapsed'));
    this.root.querySelector('.aichat-close')?.addEventListener('click', () => this.close());
    this.enableDrag();
    this.enableResize();
    this.restoreSize();
    if (!this.restorePosition()) this.setDefaultPosition();
    this.input.focus();
  }

  show() {
    this.root.classList.remove('aichat-hidden');
    this.input.focus();
  }

  close() {
    this.root.remove();
  }

  private async send() {
    const message = this.input.value.trim();
    if (!message || this.sendButton.disabled) return;
    this.input.value = '';
    const currentMessage: ChatMessage = { role: 'user', content: message };
    this.history.push(currentMessage);
    this.appendMessage('user', message);
    this.sendButton.disabled = true;
    this.sendButton.textContent = '发送中';
    try {
      const answer = await this.onChat([currentMessage]);
      this.history.push({ role: 'assistant', content: answer });
      this.appendMessage('assistant', answer);
    } catch (error) {
      this.appendMessage('error', error instanceof Error ? error.message : String(error));
    } finally {
      this.sendButton.disabled = false;
      this.sendButton.textContent = '发送';
      this.input.focus();
    }
  }

  private newChat() {
    this.history = [];
    this.messages.innerHTML = '';
    this.input.value = '';
    this.input.focus();
  }

  private appendMessage(role: ChatRole, text: string) {
    const item = document.createElement('div');
    item.className = `aichat-message ${role}`;
    item.textContent = text;
    this.messages.appendChild(item);
    this.messages.scrollTop = this.messages.scrollHeight;
  }

  private enableDrag() {
    const head = this.root.querySelector<HTMLElement>('.aichat-head');
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
      sessionStorage.setItem('ai-chat-helper-position', JSON.stringify({ left: rect.left, top: rect.top }));
    });
  }

  private restorePosition() {
    try {
      const raw = sessionStorage.getItem('ai-chat-helper-position');
      if (!raw) return false;
      const pos = JSON.parse(raw);
      if (typeof pos.left === 'number' && typeof pos.top === 'number') {
        this.setPosition(pos.left, pos.top);
        return true;
      }
    } catch {}
    return false;
  }

  private enableResize() {
    const handle = this.root.querySelector<HTMLElement>('.aichat-resize');
    if (!handle) return;
    let resizing = false;
    let startX = 0;
    let startY = 0;
    let startWidth = 0;
    let startHeight = 0;
    handle.addEventListener('mousedown', (event) => {
      resizing = true;
      const rect = this.panel.getBoundingClientRect();
      startX = event.clientX;
      startY = event.clientY;
      startWidth = rect.width;
      startHeight = rect.height;
      document.body.style.userSelect = 'none';
      event.preventDefault();
      event.stopPropagation();
    });
    window.addEventListener('mousemove', (event) => {
      if (!resizing) return;
      const rootRect = this.root.getBoundingClientRect();
      const width = Math.max(280, Math.min(window.innerWidth - rootRect.left - 8, startWidth + event.clientX - startX));
      const height = Math.max(260, Math.min(window.innerHeight - rootRect.top - 8, startHeight + event.clientY - startY));
      this.setSize(width, height);
    });
    window.addEventListener('mouseup', () => {
      if (!resizing) return;
      resizing = false;
      document.body.style.userSelect = '';
      const rect = this.panel.getBoundingClientRect();
      sessionStorage.setItem('ai-chat-helper-size', JSON.stringify({ width: rect.width, height: rect.height }));
    });
  }

  private restoreSize() {
    try {
      const raw = sessionStorage.getItem('ai-chat-helper-size');
      if (!raw) return;
      const size = JSON.parse(raw);
      if (typeof size.width === 'number' && typeof size.height === 'number') {
        this.setSize(
          Math.max(280, Math.min(window.innerWidth - 16, size.width)),
          Math.max(260, Math.min(window.innerHeight - 16, size.height))
        );
      }
    } catch {}
  }

  private setDefaultPosition() {
    this.root.style.left = 'auto';
    if (window.innerWidth >= 760) {
      this.root.style.right = '396px';
      this.root.style.top = 'auto';
      this.root.style.bottom = '18px';
    } else {
      this.root.style.right = '18px';
      this.root.style.top = '18px';
      this.root.style.bottom = 'auto';
    }
  }

  private setPosition(left: number, top: number) {
    this.root.style.left = `${left}px`;
    this.root.style.top = `${top}px`;
    this.root.style.right = 'auto';
    this.root.style.bottom = 'auto';
  }

  private setSize(width: number, height: number) {
    this.panel.style.width = `${width}px`;
    this.panel.style.height = `${height}px`;
  }

  private injectStyle() {
    if (document.getElementById('ai-chat-helper-style')) return;
    const style = document.createElement('style');
    style.id = 'ai-chat-helper-style';
    style.textContent = `
      #ai-chat-helper-root { position: fixed; right: 396px; bottom: 18px; z-index: 2147483647; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #172033; }
      #ai-chat-helper-root.aichat-hidden { display: none; }
      #ai-chat-helper-root .aichat-panel { position: relative; width: 360px; height: 460px; display: flex; flex-direction: column; background: white; border: 1px solid #dbe3ef; border-radius: 16px; box-shadow: 0 18px 50px rgba(15,23,42,.22); overflow: hidden; }
      #ai-chat-helper-root .aichat-head { height: 42px; display: flex; align-items: center; justify-content: space-between; padding: 0 12px; background: linear-gradient(135deg,#059669,#2563eb); color: white; cursor: move; }
      #ai-chat-helper-root .aichat-head-actions { display: flex; gap: 6px; }
      #ai-chat-helper-root .aichat-new, #ai-chat-helper-root .aichat-mini, #ai-chat-helper-root .aichat-close { border: 0; background: rgba(255,255,255,.2); color: white; border-radius: 8px; height: 28px; cursor: pointer; }
      #ai-chat-helper-root .aichat-new { width: 44px; font-size: 12px; font-weight: 700; }
      #ai-chat-helper-root .aichat-mini, #ai-chat-helper-root .aichat-close { width: 28px; }
      #ai-chat-helper-root .aichat-close { font-size: 18px; line-height: 28px; }
      #ai-chat-helper-root .aichat-body { flex: 1; min-height: 0; display: flex; flex-direction: column; padding: 12px; }
      #ai-chat-helper-root.aichat-collapsed .aichat-body { display: none; }
      #ai-chat-helper-root.aichat-collapsed .aichat-panel { height: auto !important; }
      #ai-chat-helper-root .aichat-messages { flex: 1; min-height: 120px; overflow: auto; display: flex; flex-direction: column; gap: 8px; font-size: 13px; }
      #ai-chat-helper-root .aichat-message { border-radius: 12px; padding: 8px 10px; line-height: 1.5; white-space: pre-wrap; word-break: break-word; }
      #ai-chat-helper-root .aichat-message.user { align-self: flex-end; max-width: 86%; background: #2563eb; color: white; }
      #ai-chat-helper-root .aichat-message.assistant { align-self: flex-start; max-width: 92%; background: #f1f5f9; color: #172033; }
      #ai-chat-helper-root .aichat-message.error { align-self: flex-start; max-width: 92%; background: #fee2e2; color: #991b1b; }
      #ai-chat-helper-root .aichat-inputrow { display: grid; grid-template-columns: 1fr 58px; gap: 8px; margin-top: 10px; }
      #ai-chat-helper-root .aichat-input { resize: vertical; min-height: 64px; max-height: 160px; border: 1px solid #cbd5e1; border-radius: 12px; padding: 8px; font: inherit; font-size: 13px; outline: none; }
      #ai-chat-helper-root .aichat-input:focus { border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37,99,235,.12); }
      #ai-chat-helper-root .aichat-send { border: 0; border-radius: 12px; background: #2563eb; color: white; font-weight: 800; cursor: pointer; }
      #ai-chat-helper-root .aichat-send:disabled { opacity: .6; cursor: not-allowed; }
      #ai-chat-helper-root .aichat-resize { position: absolute; right: 0; bottom: 0; width: 18px; height: 18px; cursor: nwse-resize; }
      #ai-chat-helper-root .aichat-resize::after { content: ""; position: absolute; right: 5px; bottom: 5px; width: 8px; height: 8px; border-right: 2px solid #94a3b8; border-bottom: 2px solid #94a3b8; }
    `;
    document.head.appendChild(style);
  }
}
