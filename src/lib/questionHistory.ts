import type { QuestionEvent } from '../types';

export const QUESTION_HISTORY_STORAGE_KEY = 'flight-school-local-ibar-questions';
export const QUESTION_HISTORY_LIMIT = 100;

function safeRead(): QuestionEvent[] {
  try {
    const raw = localStorage.getItem(QUESTION_HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function safeWrite(events: QuestionEvent[]) {
  try {
    localStorage.setItem(QUESTION_HISTORY_STORAGE_KEY, JSON.stringify(events.slice(0, QUESTION_HISTORY_LIMIT)));
  } catch {
    // Demo storage can be unavailable in private or locked-down browser contexts.
  }
}

function createId() {
  if ('randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function getQuestionHistory() {
  return safeRead();
}

export function storeQuestion(question: string) {
  const cleanQuestion = question.trim();
  if (!cleanQuestion) return safeRead();

  const event: QuestionEvent = {
    id: createId(),
    question: cleanQuestion,
    timestamp: new Date().toISOString()
  };
  const events = [event, ...safeRead()];
  safeWrite(events);
  return events;
}
