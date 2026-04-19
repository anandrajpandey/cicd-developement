import { readFile } from 'node:fs/promises';
import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { sql } from 'drizzle-orm';

import { db, pool } from './client.js';

async function migrate(): Promise<void> {
  const migrationsDir = resolve(process.cwd(), 'drizzle');
  const migrationFiles = (await readdir(migrationsDir))
    .filter((entry) => entry.endsWith('.sql'))
    .sort((left, right) => left.localeCompare(right));

  for (const migrationFile of migrationFiles) {
    const migrationPath = resolve(migrationsDir, migrationFile);
    const migrationSql = await readFile(migrationPath, 'utf8');

    const statements = migrationSql
      .split(/;\s*\r?\n/)
      .map((statement) => statement.trim())
      .filter((statement) => statement.length > 0);

    for (const statement of statements) {
      await db.execute(sql.raw(statement));
    }
  }
}

migrate()
  .then(async () => {
    await pool.end();
  })
  .catch(async (error: unknown) => {
    console.error('Failed to apply database migration.', error);
    await pool.end();
    process.exitCode = 1;
  });
