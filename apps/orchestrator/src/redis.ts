import { Redis, type Redis as RedisClient } from 'ioredis';

import { logger } from './logger.js';

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
const debateEventsChannel = 'debate-events';

let publisher: RedisClient | null = null;
let subscriber: RedisClient | null = null;
let subscriberInitialized = false;

function createRedisClient(role: 'publisher' | 'subscriber'): RedisClient {
  const client = new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: null,
  });

  client.on('error', (error: Error) => {
    logger.error(`Redis ${role} error.`, { error });
  });

  return client;
}

export async function getRedisPublisher(): Promise<RedisClient> {
  if (!publisher) {
    publisher = createRedisClient('publisher');
    await publisher.connect();
  }

  return publisher;
}

export async function initializeRedisSubscriber(
  onMessage: (channel: string, payload: string) => void,
): Promise<void> {
  if (subscriberInitialized) {
    return;
  }

  if (!subscriber) {
    subscriber = createRedisClient('subscriber');
    await subscriber.connect();
  }

  subscriber.on('message', onMessage);
  await subscriber.subscribe(debateEventsChannel);
  subscriberInitialized = true;
}

export async function publishDebateEvent(payload: string): Promise<void> {
  const redisPublisher = await getRedisPublisher();
  await redisPublisher.publish(debateEventsChannel, payload);
}

export function getDebateEventsChannel(): string {
  return debateEventsChannel;
}
