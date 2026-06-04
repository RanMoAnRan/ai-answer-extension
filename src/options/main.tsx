import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { AiConfig } from '../types';
import './style.css';

const defaultConfig: AiConfig = {
  baseUrl: 'https://api.deepseek.com',
  apiKey: '',
  model: 'deepseek-chat',
  temperature: 0.1,
  apiMode: 'chat',
  reasoningEffort: 'medium',
  store: false
};

function App() {
  const [config, setConfig] = useState<AiConfig>(defaultConfig);
  const [status, setStatus] = useState('');
  const [models, setModels] = useState<string[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    chrome.storage.local.get(['aiConfig'], (res: any) => {
      if (res.aiConfig) setConfig({ ...defaultConfig, ...res.aiConfig });
    });
  }, []);

  const save = () => {
    chrome.storage.local.set({ aiConfig: config }, () => setStatus('已保存到本机浏览器'));
  };

  const test = () => {
    setStatus('正在测试 AI 连接...');
    chrome.runtime.sendMessage({ type: 'AI_TEST', config }, (res: any) => {
      if (res?.ok) {
        setStatus(`测试成功：${res.data.raw}`);
      } else {
        setStatus(`测试失败：${res?.error || '未知错误'}`);
      }
    });
  };

  const minimalTest = () => {
    setStatus('正在做最小连通测试，请求内容等价于 curl：只回答 OK...');
    chrome.runtime.sendMessage({ type: 'AI_MINIMAL_TEST', config }, (res: any) => {
      if (res?.ok) {
        setStatus(`最小测试成功：${res.data.raw}`);
      } else {
        setStatus(`最小测试失败：${res?.error || '未知错误'}`);
      }
    });
  };

  const fetchModels = () => {
    setStatus('正在获取模型列表...');
    setModels([]);
    chrome.runtime.sendMessage({ type: 'AI_MODELS', config }, (res: any) => {
      if (res?.ok) {
        const list = Array.from(new Set((res.models || []) as string[]));
        setModels(list);
        setStatus(list.length ? `获取成功：共 ${list.length} 个模型，点击下方模型名可填入。` : '获取成功，但接口没有返回可识别的模型 ID。');
      } else {
        setStatus(`获取失败：${res?.error || '未知错误'}`);
      }
    });
  };

  const probeModels = () => {
    if (!models.length) {
      setStatus('请先点击“获取模型列表”，再自动探测可用模型。');
      return;
    }
    setStatus(`正在探测可用模型，最多测试前 ${Math.min(models.length, 30)} 个...`);
    chrome.runtime.sendMessage({ type: 'AI_PROBE_MODELS', config, models }, (res: any) => {
      if (res?.ok && res.usableModel) {
        setConfig({ ...config, model: res.usableModel });
        setStatus(`探测成功，可用模型：${res.usableModel}。已自动填入 Model，请点“保存配置”。`);
      } else {
        const lines = (res?.results || []).slice(0, 10).map((r: any) => `${r.model}: ${r.ok ? 'OK' : (r.error || '失败')}`);
        setStatus(`探测失败：${res?.error || '没有可用模型'}\n${lines.join('\n')}`);
      }
    });
  };

  return (
    <main className="page">
      <section className="card">
        <h1>AI 网页答题助手 Lite</h1>
        <p className="desc">配置 OpenAI-compatible 接口。Key 只保存在浏览器本地 storage.local。</p>

        <label>Base URL</label>
        <input value={config.baseUrl} onChange={(e) => setConfig({ ...config, baseUrl: e.target.value })} placeholder="https://api.deepseek.com" />

        <label>API Key</label>
        <input type="password" value={config.apiKey} onChange={(e) => setConfig({ ...config, apiKey: e.target.value })} placeholder="sk-..." />

        <label>API 类型</label>
        <select value={config.apiMode || 'chat'} onChange={(e) => setConfig({ ...config, apiMode: e.target.value as 'chat' | 'responses' })}>
          <option value="responses">responses</option>
          <option value="chat">chat</option>
        </select>

        <label>Model</label>
        <input value={config.model} onChange={(e) => setConfig({ ...config, model: e.target.value })} placeholder="deepseek-chat" />

        <button className="advanced-toggle" onClick={() => setShowAdvanced(!showAdvanced)}>
          {showAdvanced ? '收起高级设置' : '展开高级设置'}
        </button>

        {showAdvanced && (
          <div className="advanced-box">
            <label>Reasoning Effort</label>
            <select value={config.reasoningEffort || 'medium'} onChange={(e) => setConfig({ ...config, reasoningEffort: e.target.value as 'minimal' | 'low' | 'medium' | 'high' })}>
              <option value="medium">medium</option>
              <option value="low">low</option>
              <option value="minimal">minimal</option>
              <option value="high">high</option>
            </select>

            <label className="checkline">
              <input type="checkbox" checked={config.store ?? false} onChange={(e) => setConfig({ ...config, store: e.target.checked })} />
              store
            </label>
          </div>
        )}

        <div className="actions">
          <button onClick={save}>保存配置</button>
          <button className="secondary" onClick={minimalTest}>连通测试</button>
          <button className="secondary" onClick={fetchModels}>获取模型列表</button>
        </div>

        {models.length > 0 && (
          <div className="models">
            {models.map((model) => (
              <button key={model} className={model === config.model ? 'model active' : 'model'} onClick={() => setConfig({ ...config, model })}>
                {model}
              </button>
            ))}
          </div>
        )}

        {status && <pre className="status">{status}</pre>}
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
