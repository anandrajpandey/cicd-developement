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
    color: 'border-green-500/20 bg-green-500/10 text-green-400',
    hover: 'hover:bg-green-500/20'
  },
  {
    id: 'risk-medium',
    title: 'Medium Risk: Failing Unit Test',
    description: 'A localized unit test failure on a non-critical utility module preventing a passing CI.',
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
    color: 'border-orange-500/20 bg-orange-500/10 text-orange-400',
    hover: 'hover:bg-orange-500/20'
  },
  {
    id: 'risk-high',
    title: 'High Risk: Critical Dependency Security Exploit / Missing Root Module',
    description: 'A severe CVE vulnerability or missing critical dependency causing a catastrophic build failure.',
    tier: 'HIGH',
    failureType: 'build_failure',
    errorLog: `Error: Critical Vulnerability Detected!
[CVE-2026-99123] Arbitrary Code Execution via compromised package 'express-core'
Severity: CRITICAL
  --> Found in package.json dependencies lock
Build aggressively halted by security gate.

FATAL ERROR: In addition, Webpack failed to resolve module 'root-crypto-engine'.
Module not found: Error: Can't resolve 'root-crypto-engine' in '/src/auth'`,
    color: 'border-red-500/20 bg-red-500/10 text-red-400',
    hover: 'hover:bg-red-500/20'
  }
];

export function TestcaseList() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState<string | null>(null);

  async function triggerScenario(scenario: typeof SCENARIOS[0]) {
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
      router.push(`/events/${response.eventId}`);
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
          className={`flex flex-col p-6 rounded-2xl border ${scenario.color.split(' ')[0]} bg-[#0F1218] transition-all relative overflow-hidden shadow-2xl`}
        >
          <div className={`absolute top-0 left-0 w-full h-1 ${scenario.color.split(' ')[1]}`} />
          <div className="flex justify-between items-start mb-4">
            <span className={`text-xs font-black uppercase tracking-widest px-3 py-1 rounded-sm ${scenario.color}`}>
              {scenario.tier} RISK
            </span>
          </div>
          
          <h2 className="text-xl font-bold tracking-wider text-white mb-2">{scenario.title}</h2>
          <p className="text-mist/70 text-sm leading-relaxed mb-6 flex-1">
            {scenario.description}
          </p>

          <div className="bg-black/40 rounded-lg p-4 mb-6 border border-white/5 relative group">
            <span className="text-[9px] uppercase font-bold tracking-widest text-mist/40 absolute -top-2 left-3 bg-[#0F1218] px-1">Simulated Payload</span>
            <pre className="text-[10px] text-mist/60 font-mono whitespace-pre-wrap overflow-x-auto max-h-32 scrollbar-thin scrollbar-thumb-white/10">
              {scenario.errorLog}
            </pre>
          </div>

          <button
            onClick={() => triggerScenario(scenario)}
            disabled={!!isSubmitting}
            className={`w-full py-3 rounded-lg text-sm font-bold uppercase tracking-widest transition-all
              ${isSubmitting ? 'bg-white/5 text-white/30 cursor-not-allowed' : `${scenario.color.split(' ')[1]} ${scenario.hover} text-white/90 hover:shadow-lg shadow-black`}`}
          >
            {isSubmitting === scenario.id ? 'Inducing Risk...' : 'Trigger Debate'}
          </button>
        </div>
      ))}
    </div>
  );
}