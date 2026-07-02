import type { FeedbackEvent, ResolutionResult } from '../types';

export const FEEDBACK_STORAGE_KEY = 'flight-school-local-ibar-feedback';

function safeRead(): FeedbackEvent[] {
  try {
    const raw = localStorage.getItem(FEEDBACK_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function safeWrite(events: FeedbackEvent[]) {
  try {
    localStorage.setItem(FEEDBACK_STORAGE_KEY, JSON.stringify(events.slice(0, 100)));
  } catch {
    // Demo storage can be unavailable in private or locked-down browser contexts.
  }
}

function createId() {
  if ('randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function getFeedbackEvents() {
  return safeRead();
}

export function storeFeedback(result: ResolutionResult, rating: FeedbackEvent['rating']) {
  const event: FeedbackEvent = {
    id: createId(),
    command: result.rawCommand,
    rating,
    parserUsed: result.parserUsed,
    responseState: result.responseState,
    matchedDestination: result.matchedDestinationTitle,
    route: result.route,
    confidence: result.confidence,
    resultTimestamp: result.timestamp,
    timestamp: new Date().toISOString()
  };
  const events = [event, ...safeRead()];
  safeWrite(events);
  return events;
}
