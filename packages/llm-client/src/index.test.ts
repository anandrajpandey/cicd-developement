import test from 'node:test';
import assert from 'node:assert/strict';

import { createChatClient } from './index.js';

const messages = [{ role: 'user' as const, content: 'hello' }];

test('chat falls back to Ollama when Groq returns a retryable 503 error', async () => {
  let ollamaCalled = false;

  const chat = createChatClient({
    createGroqClient: () => ({
      chat: {
        completions: {
          create: async () => {
            throw { status: 503, message: 'temporarily unavailable' };
          },
        },
      },
    }),
    fetchFn: async () => {
      ollamaCalled = true;
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            message: {
              content: 'ollama fallback response',
            },
          };
        },
      };
    },
    sleepFn: async () => {},
    timeoutMs: 5,
  });

  const result = await chat(messages);
  assert.equal(result, 'ollama fallback response');
  assert.equal(ollamaCalled, true);
});

test('chat rethrows non-retryable Groq errors instead of falling back', async () => {
  const chat = createChatClient({
    createGroqClient: () => ({
      chat: {
        completions: {
          create: async () => {
            throw new Error('bad request');
          },
        },
      },
    }),
    fetchFn: async () => {
      throw new Error('ollama should not be called');
    },
    sleepFn: async () => {},
    timeoutMs: 5,
  });

  await assert.rejects(() => chat(messages), /bad request/);
});
