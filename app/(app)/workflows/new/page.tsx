import { createWorkflowAction } from "@/actions/workflows";
import { PageHeader } from "@/components/shell/PageHeader";

export default function NewWorkflowPage() {
  return (
    <div className="flex h-full flex-col">
      <PageHeader icon="Plus" title="New workflow" />

      <div className="flex-1 overflow-y-auto p-6">
        <form action={createWorkflowAction} className="max-w-md space-y-3">
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-ink-soft">
              Name
            </span>
            <input
              name="name"
              required
              autoFocus
              placeholder="Nightly build"
              className="w-full rounded border border-line bg-canvas px-2.5 py-1.5 text-[13px] outline-none focus:border-accent"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-ink-soft">
              Description
            </span>
            <textarea
              name="description"
              rows={3}
              placeholder="What this workflow does."
              className="w-full resize-y rounded border border-line bg-canvas px-2.5 py-1.5 text-[13px] outline-none focus:border-accent"
            />
          </label>

          <button
            type="submit"
            className="rounded bg-accent px-3 py-1.5 text-[12.5px] font-medium text-white"
          >
            Create workflow
          </button>
        </form>
      </div>
    </div>
  );
}
