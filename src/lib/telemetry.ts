import type { ResolutionResult, TelemetryEvent } from '../types';

export function addTelemetry(
  result: ResolutionResult,
  current: TelemetryEvent[],
  meta: Pick<TelemetryEvent, 'durationMs' | 'modelStatusAtStart' | 'localModelAttempted'>
): TelemetryEvent[] {
  const event: TelemetryEvent = {
    command: result.rawCommand,
    parserUsed: result.parserUsed,
    responseState: result.responseState,
    matchedDestination: result.matchedDestinationTitle,
    confidence: result.confidence,
    timestamp: result.timestamp,
    routeHandoff: result.responseState === 'resolved' && Boolean(result.route) ? 'success' : 'blocked',
    durationMs: meta.durationMs,
    modelStatusAtStart: meta.modelStatusAtStart,
    localModelAttempted: meta.localModelAttempted
  };
  return [event, ...current].slice(0, 10);
}
