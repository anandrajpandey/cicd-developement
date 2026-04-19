import type { DebateAgent } from './types.js';

import { codeReviewerPrompt } from '../prompts/code-reviewer.js';
import { analyzeWithPrompt, challengeWithPrompt, rebuttalWithPrompt } from './utils.js';

export const codeReviewerAgent: DebateAgent = {
  agentId: 'code_reviewer',
  analyze(event) {
    return analyzeWithPrompt('code_reviewer', codeReviewerPrompt, event);
  },
  challenge(myFinding, otherFindings) {
    return challengeWithPrompt('code_reviewer', codeReviewerPrompt, myFinding, otherFindings);
  },
  rebuttal(myFinding, challenge) {
    return rebuttalWithPrompt('code_reviewer', codeReviewerPrompt, myFinding, challenge);
  },
};
