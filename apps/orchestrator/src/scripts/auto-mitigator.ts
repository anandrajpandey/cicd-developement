import { execSync } from 'child_process';
import * as path from 'path';
import { fileURLToPath } from 'url';

import { chat } from '@agentic-cicd/llm-client';

import { logger } from '../logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function applyAutoMitigationLocally(
  branch: string,
  recommendedAction: string,
) {
  try {
    const workspaceRoot = path.resolve(__dirname, '../../../../');
    logger.info(`Applying auto mitigation in ${workspaceRoot} for branch ${branch}`);
    
    logger.info('Auto-mitigator: Attempting to digest and apply mitigation instructions', { recommendedAction });
    
    // We ask the LLM to provide exact terminal commands to fulfill the recommended action.
    const prompt = `You are an automated code mitigation agent. 
A pipeline has failed with a LOW risk error. We have determined the following recommended action:
"${recommendedAction}"

Generate exactly ONE shell command (or chained commands using &&) that applies this fix in a standard Node/pnpm/TypeScript repository. Do not include markdown codeblocks, explanations, or any other text. Output ONLY the raw executable shell command.
Examples:
- pnpm add missing-package --filter ./apps/web
- sed -i 's/old/new/' file.ts
- echo "export const X = 1;" >> file.ts
`;

    const commandToRun = await chat([{ role: 'user', content: prompt }], 'groq/llama-3.1-8b-instant').catch(() => '');

if (commandToRun && !commandToRun.includes('```') && !commandToRun.includes('sed')) {
      logger.info(`Executing generated mitigation command: ${commandToRun}`);   
      execSync(commandToRun.trim(), { cwd: workspaceRoot, stdio: 'inherit' });  
    } else {
       // Naive fallback for package JSON issues
       logger.info('Fallback parser triggered.');
       const depMatch = recommendedAction.match(/"([^"]+)":/);
       if (depMatch && depMatch[1]) {
         execSync(`pnpm install ${depMatch[1]}`, { cwd: workspaceRoot, stdio: 'inherit' });
       }
      if (recommendedAction.toLowerCase().includes('whitespace') || recommendedAction.toLowerCase().includes('spac')) {
         logger.info('Whitespace fix fallback triggered.');
         execSync(`node -e "const fs = require('fs'); fs.writeFileSync('packages/shared-types/src/dummy.ts', fs.readFileSync('packages/shared-types/src/dummy.ts', 'utf8').trim() + '\\n')"`, { cwd: workspaceRoot });
       }
    }
    
    execSync('git add .', { cwd: workspaceRoot, stdio: 'inherit' });
    
    // Capture the diff
    const diff = execSync('git diff --staged', { cwd: workspaceRoot, encoding: 'utf-8' });

    execSync('git commit -m "chore: auto-mitigation applied by Agentic CICD [skip ci]"', {
      cwd: workspaceRoot,
      stdio: 'inherit',
    });
    execSync('git push', { cwd: workspaceRoot, stdio: 'inherit' });
    
    logger.info('Auto-mitigator successfully pushed the patched commit.');
    return diff;
  } catch (err) {
    logger.error(`Failed to apply auto mitigation locally. ${err}`);
    return null;
  }
}
