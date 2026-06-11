import React from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

function App() {
  const openOptions = () => chrome.runtime.openOptionsPage();
  const run = async () => {
    await showHelper('AI_ANSWER_SHOW');
  };
  const openChat = async () => {
    await showHelper('AI_CHAT_SHOW');
  };
  const showHelper = async (type: 'AI_ANSWER_SHOW' | 'AI_CHAT_SHOW') => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    try {
      await showContentHelper(tab.id, type);
      window.close();
    } catch (error) {
      alert(error instanceof Error ? error.message : String(error));
    }
  };
  return (
    <main>
      <h3>AI 答题助手</h3>
      <button onClick={run}>显示答题助手</button>
      <button onClick={openChat}>聊天助手</button>
      <button className="secondary" onClick={openOptions}>设置 API Key</button>
      <p>不会自动提交，只会尝试选中答案。</p>
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<App />);

async function showContentHelper(tabId: number, type: 'AI_ANSWER_SHOW' | 'AI_CHAT_SHOW') {
  try {
    await sendShowMessage(tabId, type);
    return;
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: ['assets/content.js']
    });
    await sendShowMessage(tabId, type);
  }
}

function sendShowMessage(tabId: number, type: 'AI_ANSWER_SHOW' | 'AI_CHAT_SHOW') {
  return new Promise<void>((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, { type }, () => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve();
    });
  });
}
