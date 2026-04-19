import Groq from 'groq-sdk';

export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

const DEFAULT_GROQ_MODEL = 'llama-3.3-70b-versatile';
const DEFAULT_OLLAMA_MODEL = 'mistral:7b';
const DEFAULT_TIMEOUT_MS = 10_000;
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

function getGroqClient(): Groq {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new LlmClientError('GROQ_API_KEY is required for Groq requests.', false);
  }

  return new Groq({ apiKey });
}

function getOllamaBaseUrl(): string {
  return process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
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
  const message =
    error instanceof Error ? error.message : `Unknown ${provider} request failure.`;

  return new LlmClientError(message, retryable, status, { cause: error });
}

async function withRetries<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (!isRetryableError(error) || attempt === MAX_RETRIES - 1) {
        throw error;
      }

      await sleep(getRetryDelay(attempt));
    }
  }

  throw lastError;
}

async function requestGroq(messages: ChatMessage[], model = DEFAULT_GROQ_MODEL): Promise<string> {
  const groq = getGroqClient();

  try {
    const completion = await withRetries(() =>
      groq.chat.completions.create({
        model,
        messages,
        temperature: 0.2,
      }),
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
  model = DEFAULT_OLLAMA_MODEL,
): Promise<string> {
  try {
    const response = await withRetries(async () => {
      const request = await fetch(`${getOllamaBaseUrl()}/api/chat`, {
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
        signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
      });

      if (!request.ok) {
        throw new LlmClientError(
          `Ollama request failed with status ${request.status}.`,
          RETRYABLE_STATUS_CODES.has(request.status),
          request.status,
        );
      }

      return request;
    });

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

export async function chat(messages: ChatMessage[], model = DEFAULT_GROQ_MODEL): Promise<string> {
  try {
    return await Promise.race([
      requestGroq(messages, model),
      new Promise<string>((_, reject) => {
        setTimeout(() => {
          reject(new LlmClientError('groq request timed out.', true));
        }, DEFAULT_TIMEOUT_MS);
      }),
    ]);
  } catch (error) {
    const normalizedError = toLlmClientError(error, 'groq');

    if (!normalizedError.retryable) {
      throw normalizedError;
    }

    return requestOllama(messages);
  }
}
