import type { Server as HttpServer } from 'node:http';

import { Server as SocketIOServer } from 'socket.io';

import type { AgentFinding, Challenge, Decision, PipelineEvent, Rebuttal } from '@agentic-cicd/shared-types';

let io: SocketIOServer | null = null;

export interface DebateRealtimePayloads {
  'debate:started': {
    eventId: string;
    repository: string;
    branch: string;
    failureType: string;
  };
  'round:0:complete': {
    eventId: string;
    findings: AgentFinding[];
  };
  'round:1:complete': {
    eventId: string;
    challenges: Challenge[];
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

export function initializeRealtime(server: HttpServer): SocketIOServer {
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

  return io;
}

export function emitDebateEvent<K extends keyof DebateRealtimePayloads>(
  eventName: K,
  eventId: string,
  payload: DebateRealtimePayloads[K],
): void {
  if (!io) {
    return;
  }

  io.to(`debate:${eventId}`).emit(eventName, payload);
}

export function createDebateStartedPayload(event: PipelineEvent): DebateRealtimePayloads['debate:started'] {
  return {
    eventId: event.eventId,
    repository: event.repository,
    branch: event.branch,
    failureType: event.failureType,
  };
}
