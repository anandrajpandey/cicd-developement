import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { config } from 'dotenv';

let loaded = false;

function findEnvPath(startDir: string): string | null {
  let currentDir = startDir;

  while (true) {
    const candidate = resolve(currentDir, '.env');
    if (existsSync(candidate)) {
      return candidate;
    }

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      return null;
    }

    currentDir = parentDir;
  }
}

export function loadEnv(): void {
  if (loaded) {
    return;
  }

  const envPath = findEnvPath(process.cwd());

  if (envPath) {
    config({ path: envPath });
  }

  loaded = true;
}
