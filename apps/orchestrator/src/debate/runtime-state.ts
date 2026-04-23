export type EventRuntimeStatus = 'RUNNING' | 'CANCELLED' | 'COMPLETED';

const eventRuntimeStates = new Map<string, EventRuntimeStatus>();

export function markEventRunning(eventId: string): void {
  eventRuntimeStates.set(eventId, 'RUNNING');
}

export function markEventCancelled(eventId: string): boolean {
  const current = eventRuntimeStates.get(eventId);

  if (current === 'COMPLETED') {
    return false;
  }

  eventRuntimeStates.set(eventId, 'CANCELLED');
  return true;
}

export function markEventCompleted(eventId: string): void {
  eventRuntimeStates.set(eventId, 'COMPLETED');
}

export function getEventRuntimeStatus(eventId: string): EventRuntimeStatus | null {
  return eventRuntimeStates.get(eventId) ?? null;
}

export function isEventCancelled(eventId: string): boolean {
  return eventRuntimeStates.get(eventId) === 'CANCELLED';
}
