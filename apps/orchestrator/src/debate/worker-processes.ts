import { fork, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import type { PipelineEvent } from '@agentic-cicd/shared-types';

import { logger } from '../logger.js';
import {
  getEventRuntimeStatus,
  markEventCancelled,
  markEventCompleted,
  markEventRunning,
} from './runtime-state.js';

const debateWorkerPath = fileURLToPath(new URL('./run-debate-worker.js', import.meta.url));
const debateWorkers = new Map<string, ChildProcess>();

export function startDebateWorker(event: PipelineEvent): void {
  markEventRunning(event.eventId);

  const payload = Buffer.from(JSON.stringify(event), 'utf8').toString('base64');
  const child = fork(debateWorkerPath, [payload], {
    stdio: 'ignore',
  });

  debateWorkers.set(event.eventId, child);

  child.on('exit', (code, signal) => {
    debateWorkers.delete(event.eventId);

    if (getEventRuntimeStatus(event.eventId) === 'CANCELLED') {
      logger.info('Debate worker exited after cancellation.', {
        eventId: event.eventId,
        code,
        signal,
      });
      return;
    }

    markEventCompleted(event.eventId);

    if (code !== 0) {
      logger.error('Debate worker exited unexpectedly.', {
        eventId: event.eventId,
        code,
        signal,
      });
      return;
    }

    logger.info('Debate worker completed.', {
      eventId: event.eventId,
      code,
      signal,
    });
  });

  child.on('error', (error) => {
    debateWorkers.delete(event.eventId);
    markEventCompleted(event.eventId);
    logger.error('Failed to start debate worker.', {
      eventId: event.eventId,
      error,
    });
  });
}

export function cancelDebateWorker(eventId: string): boolean {
  const child = debateWorkers.get(eventId);
  const cancelled = markEventCancelled(eventId);

  if (child && !child.killed) {
    try {
      child.kill('SIGTERM');
    } catch (error) {
      logger.error('Failed to terminate debate worker.', { eventId, error });
    }
  }

  debateWorkers.delete(eventId);
  return cancelled;
}

