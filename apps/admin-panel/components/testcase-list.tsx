'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { trpcClient } from '../lib/trpc/client';

const SCENARIOS = [
  {
    id: 'risk-low',
    title: 'Low Risk: Formatting / Linter Error',
    description: 'A benign Prettier or ESLint style warning. Unlikely to cause production outages.',
    tier: 'LOW',
    failureType: 'lint_error',
    errorLog: `Warning: Multiple spaces found before 'import' declaration. (no-multi-spaces)
  at src/components/button.tsx:4:1
Warning: Missing trailing comma. (comma-dangle)
  at src/utils/format.ts:12:15
Warning: React hook missing dependency: 'router'. (react-hooks/exhaustive-deps)`,
    outline: 'border-lime-400/70',
    accent: 'text-lime-300',
    button: 'border-lime-400/40 text-lime-100 hover:bg-lime-400/10',
  },
  {
    id: 'risk-medium',
    title: 'Medium Risk: Failing Unit Test',
    description:
      'A localized unit test failure on a non-critical utility module preventing a passing CI.',
    tier: 'MEDIUM',
    failureType: 'test_failure',
    errorLog: `FAIL  src/__tests__/mathUtils.test.ts
  ✕ calculates compound interest correctly (15 ms)

  â—  calculates compound interest correctly

    expect(received).toBe(expected) // Object.is equality

    Expected: 105.00
    Received: 100.50

      22 |   it('calculates compound interest correctly', () => {
      23 |     const result = calculateInterest(100, 0.05, 1);
    > 24 |     expect(result).toBe(105.00);
         |                    ^`,
    outline: 'border-yellow-300/70',
    accent: 'text-yellow-200',
    button: 'border-yellow-300/40 text-yellow-100 hover:bg-yellow-300/10',
  },
  {
    id: 'risk-high',
    title: 'High Risk: Critical Dependency Security Exploit / Missing Root Module',
    description:
      'A severe CVE vulnerability or missing critical dependency causing a catastrophic build failure.',
    tier: 'HIGH',
    failureType: 'integration_test_failure',
    errorLog: `Error: Critical Vulnerability Detected!
[CVE-2026-99123] Arbitrary Code Execution via compromised package 'express-core'
Severity: CRITICAL
  --> Found in package.json dependencies lock
Build aggressively halted by security gate.

FATAL ERROR: In addition, Webpack failed to resolve module 'root-crypto-engine'.
Module not found: Error: Can't resolve 'root-crypto-engine' in '/src/auth'

FAIL  src/tests/billing-cycle.test.ts
  ✖ integration test failed to start due to missing crypto engine

Lint Error: legacy_invoices table is deprecated and missing.`,
    outline: 'border-red-400/70',
    accent: 'text-red-200',
    button: 'border-red-400/40 text-red-100 hover:bg-red-400/10',
  },
];

export function TestcaseList() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState<string | null>(null);

  async function triggerScenario(scenario: (typeof SCENARIOS)[0]) {
    setIsSubmitting(scenario.id);
    try {
      const payload = {
        eventId: crypto.randomUUID(),
        repository: 'agentic-testers/dummy-repo',
        commitSha: '5a2b1c9d',
        branch: 'feature/test-risks',
        failureType: scenario.failureType,
        errorLog: scenario.errorLog,
        timestamp: new Date().toISOString(),
      };

      const response = await trpcClient.submitEvent.mutate(payload);
      router.push(`/events/${response.eventId}?from=testcases`);
    } catch (err) {
      console.error('Failed to trigger scenario:', err);
      alert('Failed to trigger the test case. See console.');
    } finally {
      setIsSubmitting(null);
    }
  }

  return (
    <div className="grid gap-6 md:grid-cols-3">
      {SCENARIOS.map((scenario) => (
        <div
          key={scenario.id}
          className={`relative flex flex-col overflow-hidden border bg-[#090909] p-6 shadow-[0_24px_60px_rgba(0,0,0,0.35)] transition-all ${scenario.outline}`}
        >
          <div className={`absolute left-0 top-0 h-full w-[2px] ${scenario.outline.replace('border-', 'bg-')}`} />
          <div className="flex justify-between items-start mb-4">
            <span
              className={`border border-white/12 bg-white/[0.03] px-3 py-1 text-xs font-black uppercase tracking-widest ${scenario.accent}`}
            >
              {scenario.tier} RISK
            </span>
          </div>

          <h2 className="text-xl font-bold tracking-wider text-white mb-2">{scenario.title}</h2>
          <p className="mb-6 flex-1 text-sm leading-relaxed text-white/65">{scenario.description}</p>

          <div className="relative mb-6 border border-white/8 bg-black/50 p-4">
            <span className="absolute -top-2 left-3 bg-[#090909] px-1 text-[9px] font-bold uppercase tracking-widest text-white/35">
              Simulated Payload
            </span>
            <pre className="scrollbar-thin max-h-32 overflow-x-auto whitespace-pre-wrap font-mono text-[10px] text-white/45 scrollbar-thumb-white/10">
              {scenario.errorLog}
            </pre>
          </div>

          <button
            onClick={() => triggerScenario(scenario)}
            disabled={!!isSubmitting}
            className={`w-full border px-4 py-3 text-sm font-bold uppercase tracking-widest transition-all ${
              isSubmitting
                ? 'cursor-not-allowed border-white/10 bg-white/[0.03] text-white/30'
                : `${scenario.button}`
            }`}
          >
            {isSubmitting === scenario.id ? 'Inducing Risk...' : 'Trigger Debate'}
          </button>
        </div>
      ))}
    </div>
  );
}
