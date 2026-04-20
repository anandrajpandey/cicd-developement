import { pipelineEvents, db } from './index.js';

async function main() {
  await db.delete(pipelineEvents);
  console.log('Cleared pipeline events and dependent debate records.');
}

main()
  .catch((error) => {
    console.error('Failed to clear debate data.', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$client.end();
  });
