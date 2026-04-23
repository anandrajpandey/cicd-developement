import type { Server as HttpServer } from 'node:http';

import { Server as SocketIOServer } from 'socket.io';

import type {
  AgentFinding,
  Challenge,
  Decision,
  PipelineEvent,
  Rebuttal,
} from '@agentic-cicd/shared-types';

import { logger } from './logger.js';
import { initializeRedisSubscriber, publishDebateEvent } from './redis.js';

let io: SocketIOServer | null = null;
const REALTIME_PUBLISH_TIMEOUT_MS = 1_500;

export interface DebateRealtimePayloads {
  'debate:started': {
    eventId: string;
    repository: string;
    branch: string;
    failureType: string;
  };
  'round:0:finding': {
    eventId: string;
    agentId: AgentFinding['agentId'];
    finding: AgentFinding;
  };
  'round:0:complete': {
    eventId: string;
    findings: AgentFinding[];
  };
  'round:1:challenge': {
    eventId: string;
    challenge: Challenge;
  };
  'round:1:complete': {
    eventId: string;
    challenges: Challenge[];
  };
  'round:2:rebuttal': {
    eventId: string;
    rebuttal: Rebuttal;
  };
  'round:2:complete': {
    eventId: string;
    rebuttals: Rebuttal[];
  };
  'decision:ready': {
    eventId: string;
    decision: Decision;
  };
}

interface DebateEventEnvelope<
  K extends keyof DebateRealtimePayloads = keyof DebateRealtimePayloads,
> {
  eventName: K;
  eventId: string;
  payload: DebateRealtimePayloads[K];
}

async function handleRedisMessage(_channel: string, rawPayload: string): Promise<void> {
  if (!io) {
    return;
  }

  try {
    const message = JSON.parse(rawPayload) as DebateEventEnvelope;
    io.to(`debate:${message.eventId}`).emit(message.eventName, message.payload);
    io.emit(message.eventName, message.payload);
  } catch (error) {
    logger.error('Failed to parse debate event from Redis.', { error, rawPayload });
  }
}

export async function initializeRealtime(server: HttpServer): Promise<SocketIOServer> {
  if (io) {
    return io;
  }

  io = new SocketIOServer(server, {
    cors: {
      origin: '*',
    },
  });

  io.on('connection', (socket) => {
    socket.on('debate:subscribe', (eventId: string) => {
      socket.join(`debate:${eventId}`);
    });

    socket.on('debate:unsubscribe', (eventId: string) => {
      socket.leave(`debate:${eventId}`);
    });
  });

  await initializeRedisSubscriber((channel, payload) => {
    void handleRedisMessage(channel, payload);
  });

  return io;
}

export async function emitDebateEvent<K extends keyof DebateRealtimePayloads>(
  eventName: K,
  eventId: string,
  payload: DebateRealtimePayloads[K],
): Promise<void> {
  const message: DebateEventEnvelope<K> = {
    eventName,
    eventId,
    payload,
  };

  try {
    await Promise.race([
      publishDebateEvent(JSON.stringify(message)),
      new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Realtime publish timed out after ${REALTIME_PUBLISH_TIMEOUT_MS}ms.`));
        }, REALTIME_PUBLISH_TIMEOUT_MS);
      }),
    ]);
  } catch (error) {
    logger.error('Failed to publish debate event to Redis.', {
      error,
      eventName,
      eventId,
    });

    if (io) {
      io.to(`debate:${eventId}`).emit(eventName, payload);
      io.emit(eventName, payload);
    }
  }
}

export function createDebateStartedPayload(
  event: PipelineEvent,
): DebateRealtimePayloads['debate:started'] {
  return {
    eventId: event.eventId,
    repository: event.repository,
    branch: event.branch,
    failureType: event.failureType,
  };
}
