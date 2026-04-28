import test from 'node:test';
import assert from 'node:assert/strict';

import { parseModelJson } from './model-json.js';

test('parseModelJson repairs multiline strings in model JSON output', () => {
  const payload = `{
    "hypothesis": "lint issue",
    "evidence": ["one"],
    "confidence": 0.8,
    "proposedRemediation": "File: src/app.tsx
Change:
Remove trailing spaces"
  }`;

  const parsed = parseModelJson<{ proposedRemediation: string }>(payload);

  assert.equal(
    parsed.proposedRemediation,
    'File: src/app.tsx\nChange:\nRemove trailing spaces',
  );
});

test('parseModelJson repairs single-quoted keys and strings', () => {
  const payload = `{
    'hypothesis': 'lint issue',
    'evidence': ['one'],
    'confidence': 0.8,
    'proposedRemediation': 'Run eslint --fix'
  }`;

  const parsed = parseModelJson<{ hypothesis: string; proposedRemediation: string }>(payload);

  assert.equal(parsed.hypothesis, 'lint issue');
  assert.equal(parsed.proposedRemediation, 'Run eslint --fix');
});
