import { LiveWorkflowMonitor } from '../../components/live-workflow-monitor';
import { TestcaseList } from '../../components/testcase-list';
import { listWorkflows } from '../../lib/orchestrator';

export const metadata = {
  title: 'Test Cases | AI CI/CD',
};

export default async function TestCasesPage() {
  const workflows = await listWorkflows();

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-white uppercase tracking-widest">
          Risk Injection Hub
        </h1>
        <p className="text-white/58">
          Trigger predefined error scenarios to automatically induce targeted Risk Levels (LOW,
          MEDIUM, HIGH) through the live agent debate pipeline.
        </p>
      </header>

      <main className="flex flex-1 flex-col gap-6">
        <div className="min-h-0">
          <TestcaseList />
        </div>
        <div className="min-h-0">
          <LiveWorkflowMonitor initialWorkflows={workflows} />
        </div>
      </main>
    </div>
  );
}
