import { EventSubmitForm } from '../../../components/event-submit-form';

export default function NewEventPage() {
  return (
    <div className="space-y-6">
      <section className="panel p-6">
        <p className="eyebrow">Manual Intake</p>
        <h1 className="mt-2 text-3xl font-semibold text-white">Submit a pipeline event</h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-mist/70">
          Start the debate loop with a pasted failure log or a GitHub pull request diff fetched
          through the orchestrator.
        </p>
      </section>
      <EventSubmitForm />
    </div>
  );
}
