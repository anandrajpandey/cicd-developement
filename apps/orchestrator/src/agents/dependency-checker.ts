import type { DebateAgent } from './types.js';

import { dependencyCheckerPrompt } from '../prompts/dependency-checker.js';
import { analyzeWithPrompt, challengeWithPrompt, rebuttalWithPrompt } from './utils.js';

export const dependencyCheckerAgent: DebateAgent = {
  agentId: 'dependency_checker',
  analyze(event) {
    return analyzeWithPrompt('dependency_checker', dependencyCheckerPrompt, event);
  },
  challenge(myFinding, otherFindings) {
    return challengeWithPrompt(
      'dependency_checker',
      dependencyCheckerPrompt,
      myFinding,
      otherFindings,
    );
  },
  rebuttal(myFinding, challenge) {
    return rebuttalWithPrompt('dependency_checker', dependencyCheckerPrompt, myFinding, challenge);
  },
};
