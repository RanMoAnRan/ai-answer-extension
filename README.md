# AI 网页答题助手 Lite

一个基于 Chrome Extension Manifest V3 的网页答题辅助插件。插件会识别当前网页中的题目，调用用户配置的 OpenAI-compatible 接口分析答案，并尝试在页面上自动选中或填写答案。

> 说明：插件不会自动提交试卷或表单，只负责识别、分析和填答，最终提交仍由用户自行确认。

## 功能特性

- 支持 Chrome / Edge 等 Chromium 内核浏览器加载使用
- 支持 OpenAI-compatible API
  - `responses` 模式
  - `chat/completions` 模式
- 支持在设置页配置：
  - Base URL
  - API Key
  - API 类型
  - Model
  - Reasoning Effort
  - temperature / store 等高级参数
- 支持获取模型列表、自动探测可用模型、最小连通测试
- 支持识别常见题型：
  - 单选题
  - 多选题
  - 判断题
  - 填空题
  - 简答题 / 主观题
- 支持页面悬浮面板操作：
  - 识别并答题
  - 停止
  - 只答未完成题
  - 提交前检查
  - 重答失败题
  - 定位题目
- 已内置部分平台适配逻辑，并保留通用 DOM / 文本识别兜底能力

## 技术栈

- Vite
- React
- TypeScript
- Chrome Extension Manifest V3

## 项目结构

```text
.
├── manifest.json              # Chrome 插件清单
├── package.json               # npm 脚本与依赖
├── scripts-postbuild.js        # 构建后处理脚本
├── vite.config.ts             # Vite 构建配置
├── src
│   ├── ai                     # AI 请求、提示词、响应解析
│   ├── background             # 插件后台 service worker
│   ├── content                # 页面注入脚本、题目识别、填答、悬浮面板
│   ├── options                # 插件设置页
│   ├── popup                  # 插件弹窗页
│   └── types                  # 类型定义
└── dist                       # 构建产物，加载插件时使用
```

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 开发构建

```bash
npm run dev
```

该命令会以 watch 模式持续构建到 `dist/`。

### 3. 生产构建

```bash
npm run build
```

### 4. 打包 zip

```bash
npm run zip
```

执行后会生成 `ai-answer-extension.zip`。

## 浏览器加载方式

1. 打开 Chrome / Edge 扩展管理页面。
2. 开启“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择项目中的 `dist/` 目录。
5. 打开目标网页，点击浏览器工具栏中的插件图标。
6. 先进入“设置 API Key”完成接口配置，再点击“显示答题助手”。

## API 配置说明

设置页字段说明：

- `Base URL`：OpenAI-compatible 服务地址，例如 `https://api.example.com`。
- `API Key`：接口密钥，只保存在浏览器本地 `chrome.storage.local`。
- `API 类型`：
  - `responses`：请求 `/responses`。
  - `chat`：请求 `/chat/completions`。
- `Model`：模型名称，例如 `deepseek-chat`、`gpt-4.1-mini` 等。
- `Reasoning Effort`：推理强度，仅对兼容该参数的接口生效。
- `store`：是否允许上游保存请求，默认关闭。

如果不确定模型是否可用，可以先点击：

1. “获取模型列表”
2. “自动探测可用模型”
3. “最小连通测试”

## 常用命令

```bash
# 安装依赖
npm install

# watch 构建
npm run dev

# 类型检查
npm run typecheck

# 构建 dist
npm run build

# 构建并压缩插件
npm run zip
```

## 注意事项

- 插件需要用户自行配置 API Key，不会内置任何密钥。
- API Key 保存在浏览器本地，不会写入仓库文件。
- `dist/` 和 `ai-answer-extension.zip` 属于构建产物，默认不提交到 Git。
- 不同网页 DOM 结构不同，识别和自动填答可能需要针对平台继续适配。
- 插件不会自动提交答案，请在提交前自行检查。

## 开发建议

修改题目识别、平台适配或填答逻辑后，建议至少执行：

```bash
npm run typecheck
npm run build
```

然后在浏览器扩展管理页面刷新插件，并到目标页面重新验证。
