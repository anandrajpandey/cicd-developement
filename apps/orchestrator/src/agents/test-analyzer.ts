import type { DebateAgent } from './types.js';

import { testAnalyzerPrompt } from '../prompts/test-analyzer.js';
import { analyzeWithPrompt, challengeWithPrompt, rebuttalWithPrompt } from './utils.js';

export const testAnalyzerAgent: DebateAgent = {
  agentId: 'test_analyzer',
  analyze(event) {
    return analyzeWithPrompt('test_analyzer', testAnalyzerPrompt, event);
  },
  challenge(myFinding, otherFindings) {
    return challengeWithPrompt('test_analyzer', testAnalyzerPrompt, myFinding, otherFindings);
  },
  rebuttal(myFinding, challenge) {
    return rebuttalWithPrompt('test_analyzer', testAnalyzerPrompt, myFinding, challenge);
  },
};
