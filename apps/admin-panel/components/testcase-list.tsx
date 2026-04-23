'use client';

import { useRouter } from 'next/navigation';
import { startTransition, useState } from 'react';

import { trpcClient } from '../lib/trpc/client';

const SCENARIOS = [
  {
    id: 'risk-low',
    title: 'Low Risk: Formatting / Linter Error',
    description:
      'A benign ESLint and formatting failure with clear file references and no production impact.',
    tier: 'LOW',
    failureType: 'lint_error',
    errorLog: `ESLint found style issues during validation.

src/components/button.tsx:4:1
  error  Multiple spaces found before 'import'  no-multi-spaces

src/utils/format.ts:12:15
  error  Missing trailing comma  comma-dangle

src/hooks/useNavigation.ts:27:5
  warning  React Hook useEffect has a missing dependency: 'router'  react-hooks/exhaustive-deps

Command failed with exit code 1.`,
    color: 'border-green-500/20 bg-green-500/10 text-green-400',
    hover: 'hover:bg-green-500/20',
  },
  {
    id: 'risk-medium',
    title: 'Medium Risk: Failing Unit Test',
    description:
      'A localized unit-test regression with a concrete assertion mismatch and file-level evidence.',
    tier: 'MEDIUM',
    failureType: 'test_failure',
    errorLog: `FAIL src/__tests__/mathUtils.test.ts
  x calculates compound interest correctly (15 ms)

  ● calculates compound interest correctly

    expect(received).toBe(expected)

    Expected: 105.00
    Received: 100.50

      22 | it('calculates compound interest correctly', () => {
      23 |   const result = calculateInterest(100, 0.05, 1);
    > 24 |   expect(result).toBe(105.00);
         |                  ^
      25 | });

Test Suites: 1 failed, 4 passed
Tests:       1 failed, 19 passed`,
    color: 'border-orange-500/20 bg-orange-500/10 text-orange-400',
    hover: 'hover:bg-orange-500/20',
  },
  {
    id: 'risk-high',
    title: 'High Risk: Critical Dependency / Missing Root Module',
    description:
      'A critical dependency security alert plus a missing root module causing an immediate build stop.',
    tier: 'HIGH',
    failureType: 'build_failure',
    errorLog: `Error: Critical Vulnerability Detected!
[CVE-2026-99123] Arbitrary Code Execution via compromised package 'express-core'
Severity: CRITICAL
  --> Found in package.json dependencies lock
Build aggressively halted by security gate.

FATAL ERROR: Webpack failed to resolve module 'root-crypto-engine'.
Module not found: Error: Can't resolve 'root-crypto-engine' in '/src/auth'
Import trace:
./src/auth/secure-session.ts
./src/app/api/billing/route.ts

FAIL src/tests/billing-cycle.test.ts
  x integration test failed to start due to missing crypto engine

Lint Error: legacy_invoices table is deprecated and missing.`,
    color: 'border-red-500/20 bg-red-500/10 text-red-400',
    hover: 'hover:bg-red-500/20',
  },
];

export function TestcaseList() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState<string | null>(null);

  async function triggerScenario(scenario: (typeof SCENARIOS)[number]) {
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

      startTransition(() => {
        router.push(`/events/${response.eventId}`);
      });
    } catch (error) {
      console.error('Failed to trigger scenario:', error);
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
          className={`relative flex flex-col overflow-hidden rounded-2xl border ${scenario.color.split(' ')[0]} bg-[#0F1218] p-6 shadow-2xl transition-all`}
        >
          <div className={`absolute left-0 top-0 h-1 w-full ${scenario.color.split(' ')[1]}`} />
          <div className="mb-4 flex justify-between items-start">
            <span
              className={`rounded-sm px-3 py-1 text-xs font-black uppercase tracking-widest ${scenario.color}`}
            >
              {scenario.tier} RISK
            </span>
          </div>

          <h2 className="mb-2 text-xl font-bold tracking-wider text-white">{scenario.title}</h2>
          <p className="mb-6 flex-1 text-sm leading-relaxed text-mist/70">{scenario.description}</p>

          <div className="group relative mb-6 rounded-lg border border-white/5 bg-black/40 p-4">
            <span className="absolute -top-2 left-3 bg-[#0F1218] px-1 text-[9px] font-bold uppercase tracking-widest text-mist/40">
              Simulated Payload
            </span>
            <pre className="max-h-32 overflow-x-auto whitespace-pre-wrap text-[10px] font-mono text-mist/60">
              {scenario.errorLog}
            </pre>
          </div>

          <button
            onClick={() => triggerScenario(scenario)}
            disabled={Boolean(isSubmitting)}
            className={`w-full rounded-lg py-3 text-sm font-bold uppercase tracking-widest transition-all ${
              isSubmitting
                ? 'cursor-not-allowed bg-white/5 text-white/30'
                : `${scenario.color.split(' ')[1]} ${scenario.hover} text-white/90 shadow-black hover:shadow-lg`
            }`}
          >
            {isSubmitting === scenario.id ? 'Inducing Risk...' : 'Trigger Debate'}
          </button>
        </div>
      ))}
    </div>
  );
}
