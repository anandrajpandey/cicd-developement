import { TestcaseList } from '../../components/testcase-list';

export const metadata = {
  title: 'Test Cases | AI CI/CD',
};

export default function TestCasesPage() {
  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-white uppercase tracking-widest">
          Risk Injection Hub
        </h1>
        <p className="text-mist/70">
          Trigger predefined error scenarios to automatically induce targeted Risk Levels (LOW,
          MEDIUM, HIGH) through the live agent debate pipeline.
        </p>
      </header>

      <main className="flex-1">
        <TestcaseList />
      </main>
    </div>
  );
}
