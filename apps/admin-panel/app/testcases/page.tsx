import { LiveWorkflowMonitor } from '../../components/live-workflow-monitor';
import { TestcaseList } from '../../components/testcase-list';
import { getTrpcCaller } from '../../lib/trpc/server';

export const metadata = {
  title: 'Test Cases | AI CI/CD',
};

export default async function TestCasesPage() {
  const caller = await getTrpcCaller();
  const workflows = await caller.workflows();

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-white uppercase tracking-widest">
          Risk Injection Hub
        </h1>
        <p className="text-mist/70">
          Trigger predefined error scenarios to automatically induce targeted Risk Levels (LOW, MEDIUM, HIGH) through the live agent debate pipeline.
        </p>
      </header>

      <main className="flex-1 space-y-6">
        <TestcaseList />
        <LiveWorkflowMonitor initialWorkflows={workflows} />
      </main>
    </div>
  );
}
