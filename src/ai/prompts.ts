import type { DetectedQuestion } from '../types';

export function buildAnswerPrompt(question: DetectedQuestion): string {
  const options = question.options.map((opt) => `${opt.key}. ${opt.text}`).join('\n');
  const typeLabel: Record<string, string> = {
    single: '单选题',
    multiple: '多选题',
    judge: '判断题',
    blank: '填空题',
    short: '简答题',
    unknown: '未知题型'
  };

  if (question.type === 'blank') {
    return [
      '你是英语填空题助手。必须只输出一行 JSON，不要 Markdown，不要解释。',
      '如果题目要求根据中文释义、词性、首字母补全英文单词，只返回完整英文单词，保持正常小写，除非专有名词必须大写。',
      '如果有多个空，answer 使用数组；如果只有一个空，answer 使用字符串。',
      '输出示例：{"answer":"recognize","confidence":0.9}',
      '不确定时输出 {"answer":"","confidence":0,"reason":"不确定"}。',
      '',
      `题型：${typeLabel[question.type]}`,
      `题目：${question.question}`,
      options ? `选项：\n${options}` : '选项：无'
    ].join('\n');
  }

  return [
    '你是一个严谨的答题分析助手。请根据题目和选项给出最可能的答案。',
    '必须只输出一行 JSON，不要 Markdown，不要解释性文字。',
    question.type === 'single' || question.type === 'multiple' || question.type === 'judge'
      ? 'JSON 格式：{"answer":["A"],"confidence":0.8}'
      : 'JSON 格式：{"answer":"简洁答案","confidence":0.8}',
    '单选题 answer 为一个选项字母数组，例如 ["B"]。',
    '多选题 answer 为多个选项字母数组，例如 ["A","C"]。',
    '判断题 answer 为 ["正确"] 或 ["错误"]。',
    '填空题/简答题/主观题 answer 为字符串，例如 {"answer":"简洁答案","confidence":0.8}。',
    '主观题答案要直接可填写，不要输出“答案：”前缀，不要解释过程。',
    '不确定时输出 {"answer":[],"confidence":0,"reason":"不确定"}。',
    '',
    `题型：${typeLabel[question.type] || question.type}`,
    `题目：${question.question}`,
    options ? `选项：\n${options}` : '选项：无'
  ].join('\n');
}
