export type QuestionType = 'single' | 'multiple' | 'judge' | 'blank' | 'short' | 'unknown';

export interface AnswerOption {
  key: string;
  text: string;
  elementIndex?: number;
}

export interface DetectedQuestion {
  id: string;
  type: QuestionType;
  question: string;
  options: AnswerOption[];
  elementIndex: number;
}

export interface AiConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature?: number;
  apiMode?: 'chat' | 'responses';
  reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high';
  store?: boolean;
}

export interface AiAnswer {
  answer: string | string[];
  confidence?: number;
  reason?: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}
