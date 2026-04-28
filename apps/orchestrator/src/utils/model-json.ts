import { jsonrepair } from 'jsonrepair';

function escapeControlCharactersInStrings(input: string): string {
  let result = '';
  let inString = false;
  let escaping = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];

    if (escaping) {
      result += char;
      escaping = false;
      continue;
    }

    if (char === '\\') {
      result += char;
      escaping = true;
      continue;
    }

    if (char === '"') {
      result += char;
      inString = !inString;
      continue;
    }

    if (inString) {
      if (char === '\n') {
        result += '\\n';
        continue;
      }

      if (char === '\r') {
        result += '\\r';
        continue;
      }

      if (char === '\t') {
        result += '\\t';
        continue;
      }
    }

    result += char;
  }

  return result;
}

export function extractJsonObject(input: string, source = 'model response'): string {
  const startIndex = input.indexOf('{');
  const endIndex = input.lastIndexOf('}');

  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    throw new Error(`No JSON object found in ${source}.`);
  }

  return input.slice(startIndex, endIndex + 1);
}

export function parseModelJson<T>(input: string, source = 'model response'): T {
  const rawObject = extractJsonObject(input, source);

  try {
    return JSON.parse(rawObject) as T;
  } catch {
    const sanitized = escapeControlCharactersInStrings(rawObject);
    const repaired = jsonrepair(sanitized);
    return JSON.parse(repaired) as T;
  }
}
