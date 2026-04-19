import type { DebateAgent } from './types.js';

import { buildAnalyzerPrompt } from '../prompts/build-analyzer.js';
import { analyzeWithPrompt, challengeWithPrompt, rebuttalWithPrompt } from './utils.js';

export const buildAnalyzerAgent: DebateAgent = {
  agentId: 'build_analyzer',
  analyze(event) {
    return analyzeWithPrompt('build_analyzer', buildAnalyzerPrompt, event);
  },
  challenge(myFinding, otherFindings) {
    return challengeWithPrompt('build_analyzer', buildAnalyzerPrompt, myFinding, otherFindings);
  },
  rebuttal(myFinding, challenge) {
    return rebuttalWithPrompt('build_analyzer', buildAnalyzerPrompt, myFinding, challenge);
  },
};
