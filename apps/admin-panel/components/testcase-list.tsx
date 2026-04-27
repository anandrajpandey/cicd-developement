'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { trpcClient } from '../lib/trpc/client';

const SCENARIOS = [
  {
    id: 'risk-low',
    title: 'Low Risk: Linter Warnings',
    description: 'ESLint style warnings on formatting and code quality. Safe to ignore with discussion.',
    tier: 'LOW',
    failureType: 'simulation_easy',
    errorLog: `ESLint Report: Lint warnings detected in the build.
  File: src/components/Header.tsx:14:32
    Warning: Multiple trailing spaces found. (no-trailing-spaces)
  File: src/utils/helpers.ts:42:1
    Warning: Unused variable 'tempVar' declared. (no-unused-vars)
  File: src/pages/Dashboard.tsx:8:5
    Warning: React Hook missing dependency: 'data'. (react-hooks/exhaustive-deps)
  
Build completed with 3 lint warnings. Consider fixing before merge.`,
    outline: 'border-lime-400/70',
    accent: 'text-lime-300',
    button: 'border-lime-400/40 text-lime-100 hover:bg-lime-400/10',
  },
  {
    id: 'risk-medium',
    title: 'Medium Risk: Test Failure (Migration Mismatch)',
    description:
      'Unit test failure due to schema mismatch after partial migration. Requires schema sync.',
    tier: 'MEDIUM',
    failureType: 'simulation_medium',
    errorLog: `Unit Test Failures Detected:

FAIL  src/__tests__/userService.test.ts
  X should fetch user profile correctly (234ms)
    AssertionError: expected null to equal Object {
      id: '123',
      email: 'test@example.com',
      role: 'admin'
    }
      at UserService.getProfile (src/services/userService.ts:45:11)
      at async Object.<anonymous> (src/__tests__/userService.test.ts:18:5)
  
  - should fetch user profile correctly
    The API response structure changed but migration script was not executed.
    Schema mismatch detected: expected 'profile' field but got 'user_profile' in database.

Test Summary: 1 failed, 23 passed (156ms total)`,
    outline: 'border-yellow-300/70',
    accent: 'text-yellow-200',
    button: 'border-yellow-300/40 text-yellow-100 hover:bg-yellow-300/10',
  },
  {
    id: 'risk-high',
    title: 'High Risk: Database Schema Constraint Violation',
    description:
      'Critical migration dropping table with 8 active foreign key dependencies. Will cause cascading failures.',
    tier: 'HIGH',
    failureType: 'simulation_hard',
    errorLog: `CRITICAL BUILD FAILURE: Database Migration Failed.

Error in migration 20260427_drop_legacy_tables.sql:
  CONSTRAINT VIOLATION: Cannot drop table 'invoices_v1' - 8 active foreign key constraints depend on it.
  Dependent objects: batch_jobs.reference_invoice_id, reports.invoice_source, webhooks.payload

Error in test: src/tests/integration/payments.test.ts
  X should process monthly billing cycles (1245ms)
    QueryFailedError: relation "invoices_v1" does not exist
      at ConnectionPool.query (src/db/pool.ts:89:15)
      at Billing.processInvoices (src/billing/processor.ts:142:8)
  
  CRITICAL: This PR drops critical table 'invoices_v1' that 5 microservices depend on.
  3 background workers will crash on deployment. Multiple data integrity issues detected.
  
Build Status: FAILED (0 tests passed, 1 critical failure).
Deployment blocked. Manual database intervention required.`,
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
          <div
            className={`absolute left-0 top-0 h-full w-[2px] ${scenario.outline.replace('border-', 'bg-')}`}
          />
          <div className="flex justify-between items-start mb-4">
            <span
              className={`border border-white/12 bg-white/[0.03] px-3 py-1 text-xs font-black uppercase tracking-widest ${scenario.accent}`}
            >
              {scenario.tier} RISK
            </span>
          </div>

          <h2 className="text-xl font-bold tracking-wider text-white mb-2">{scenario.title}</h2>
          <p className="mb-6 flex-1 text-sm leading-relaxed text-white/65">
            {scenario.description}
          </p>

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
