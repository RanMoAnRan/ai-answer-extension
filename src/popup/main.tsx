import React from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

function App() {
  const openOptions = () => chrome.runtime.openOptionsPage();
  const run = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: 'AI_ANSWER_SHOW' });
    window.close();
  };
  return (
    <main>
      <h3>AI 答题助手</h3>
      <button onClick={run}>显示答题助手</button>
      <button className="secondary" onClick={openOptions}>设置 API Key</button>
      <p>不会自动提交，只会尝试选中答案。</p>
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
