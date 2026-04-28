import Groq from 'groq-sdk';

export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

const DEFAULT_GROQ_MODEL = 'llama-3.1-8b-instant';
const DEFAULT_OLLAMA_MODEL = 'mistral:7b';
const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_RETRIES = 3;
const RETRYABLE_STATUS_CODES = new Set([429, 503]);

class LlmClientError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly status?: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'LlmClientError';
  }
}

interface GroqCompletionClient {
  chat: {
    completions: {
      create: (params: { model: string; messages: ChatMessage[]; temperature: number }) => Promise<{
        choices: Array<{
          message?: {
            content?: string | null;
          };
        }>;
      }>;
    };
  };
}

interface FetchResponseLike {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

interface ChatClientDependencies {
  createGroqClient?: (apiKey?: string) => GroqCompletionClient;
  fetchFn?: (
    input: string,
    init: {
      method: string;
      headers: Record<string, string>;
      body: string;
      signal: AbortSignal;
    },
  ) => Promise<FetchResponseLike>;
  sleepFn?: (ms: number) => Promise<void>;
  timeoutMs?: number;
}

export interface ChatRequestOptions {
  groqApiKey?: string;
  ollamaBaseUrl?: string;
  ollamaModel?: string;
}

export type ChatClient = (
  messages: ChatMessage[],
  model?: string,
  options?: ChatRequestOptions,
) => Promise<string>;

function getGroqClient(apiKey?: string): GroqCompletionClient {
  if (!apiKey) {
    throw new LlmClientError('GROQ_API_KEY is required for Groq requests.', false);
  }

  return new Groq({ apiKey });
}

function getOllamaBaseUrl(override?: string): string {
  return override ?? process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function getRetryDelay(attempt: number): number {
  return 250 * 2 ** attempt;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function getErrorStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }

  if ('status' in error && typeof error.status === 'number') {
    return error.status;
  }

  return undefined;
}

function isRetryableError(error: unknown): boolean {
  if (error instanceof LlmClientError) {
    return error.retryable;
  }

  if (isAbortError(error)) {
    return true;
  }

  const status = getErrorStatus(error);
  return status !== undefined && RETRYABLE_STATUS_CODES.has(status);
}

function toLlmClientError(error: unknown, provider: 'groq' | 'ollama'): LlmClientError {
  if (error instanceof LlmClientError) {
    return error;
  }

  if (isAbortError(error)) {
    return new LlmClientError(`${provider} request timed out.`, true, undefined, {
      cause: error,
    });
  }

  const status = getErrorStatus(error);
  const retryable = status !== undefined && RETRYABLE_STATUS_CODES.has(status);
  const message = error instanceof Error ? error.message : `Unknown ${provider} request failure.`;

  return new LlmClientError(message, retryable, status, { cause: error });
}

async function withRetries<T>(
  operation: () => Promise<T>,
  sleepFn: (ms: number) => Promise<void>,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (!isRetryableError(error) || attempt === MAX_RETRIES - 1) {
        throw error;
      }

      await sleepFn(getRetryDelay(attempt));
    }
  }

  throw lastError;
}

async function requestGroq(
  messages: ChatMessage[],
  model: string,
  deps: Required<ChatClientDependencies>,
  groqApiKey?: string,
): Promise<string> {
  const groq = deps.createGroqClient(groqApiKey);

  try {
    const completion = await withRetries(
      () =>
        groq.chat.completions.create({
          model,
          messages,
          temperature: 0.2,
        }),
      deps.sleepFn,
    );

    const content = completion.choices[0]?.message?.content;

    if (typeof content !== 'string' || content.trim().length === 0) {
      throw new LlmClientError('Groq returned an empty response.', false);
    }

    return content;
  } catch (error) {
    throw toLlmClientError(error, 'groq');
  }
}

async function requestOllama(
  messages: ChatMessage[],
  model: string,
  deps: Required<ChatClientDependencies>,
  ollamaBaseUrl?: string,
): Promise<string> {
  try {
    const response = await withRetries(async () => {
      const request = await deps.fetchFn(`${getOllamaBaseUrl(ollamaBaseUrl)}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          stream: false,
          messages,
          options: {
            temperature: 0.2,
          },
        }),
        signal: AbortSignal.timeout(deps.timeoutMs),
      });

      if (!request.ok) {
        throw new LlmClientError(
          `Ollama request failed with status ${request.status}.`,
          RETRYABLE_STATUS_CODES.has(request.status),
          request.status,
        );
      }

      return request;
    }, deps.sleepFn);

    const payload = (await response.json()) as {
      message?: {
        content?: string;
      };
    };

    const content = payload.message?.content;

    if (typeof content !== 'string' || content.trim().length === 0) {
      throw new LlmClientError('Ollama returned an empty response.', false);
    }

    return content;
  } catch (error) {
    throw toLlmClientError(error, 'ollama');
  }
}

export function createChatClient(overrides: ChatClientDependencies = {}): ChatClient {
  const deps: Required<ChatClientDependencies> = {
    createGroqClient: overrides.createGroqClient ?? getGroqClient,
    fetchFn:
      overrides.fetchFn ?? ((input, init) => fetch(input, init) as Promise<FetchResponseLike>),
    sleepFn: overrides.sleepFn ?? sleep,
    timeoutMs: overrides.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  };

  return async function chat(
    messages: ChatMessage[],
    model = DEFAULT_GROQ_MODEL,
    options: ChatRequestOptions = {},
  ): Promise<string> {
    const groqApiKey = options.groqApiKey;
    const ollamaModel = options.ollamaModel ?? DEFAULT_OLLAMA_MODEL;
    const ollamaBaseUrl = options.ollamaBaseUrl;

    const forceOllama = process.env.SIMULATION_FORCE_OLLAMA === 'true';
    const groqProvided = !forceOllama && typeof groqApiKey === 'string' && groqApiKey.trim().length > 0;
    const maskedGroq = groqProvided
      ? groqApiKey!.length > 8
        ? `${groqApiKey!.slice(0, 4)}...${groqApiKey!.slice(-4)}`
        : '***short***'
      : 'none';

    console.info(
      `[llm-client] chat() called model=${model} groqProvided=${groqProvided} groqMask=${maskedGroq} ollamaModel=${ollamaModel} forceOllama=${forceOllama}`,
    );

    if (!groqApiKey) {
      return requestOllama(messages, ollamaModel, deps, ollamaBaseUrl);
    }

    try {
      return await Promise.race([
        requestGroq(messages, model, deps, groqApiKey),
        new Promise<string>((_, reject) => {
          setTimeout(() => {
            reject(new LlmClientError('groq request timed out.', true));
          }, deps.timeoutMs);
        }),
      ]);
    } catch (error) {
      const normalizedError = toLlmClientError(error, 'groq');
      console.warn('Groq failed, falling back to Ollama. Groq error:', error);

      if (!normalizedError.retryable) {
        return requestOllama(messages, ollamaModel, deps, ollamaBaseUrl);
      }

      return requestOllama(messages, ollamaModel, deps, ollamaBaseUrl);
    }
  };
}

// Allow a deterministic mock mode for local simulations and CI where external LLMs
// should not be contacted. Set `SIMULATION_MOCK_LLM=true` in the env to enable.
const SIMULATION_MOCK = process.env.SIMULATION_MOCK_LLM === 'true';

if (SIMULATION_MOCK) {
  console.info('[llm-client] SIMULATION_MOCK_LLM is active — returning deterministic responses');
}

export const chat: ChatClient = SIMULATION_MOCK
  ? async (messages: ChatMessage[], model = DEFAULT_GROQ_MODEL) => {
      const promptSummary = messages
        .slice(-1)
        .map((m) => `${m.role}:${(m.content || '').slice(0, 120)}`)
        .join(' | ');
      return `SIMULATION_RESPONSE model=${model} prompt=${promptSummary}`;
    }
  : createChatClient();
