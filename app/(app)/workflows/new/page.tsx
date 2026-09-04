import { createWorkflowAction } from "@/actions/workflows";
import { PageHeader } from "@/components/shell";

export default function NewWorkflowPage() {
  return (
    <div className="flex h-full flex-col">
      <PageHeader icon="Plus" title="New workflow" />

      <div className="flex-1 overflow-y-auto p-6">
        <form action={createWorkflowAction} className="max-w-md space-y-3">
          <label className="block">
            <span className="text-ink-soft mb-1 block text-[12px] font-medium">
              Name
            </span>
            <input
              name="name"
              required
              autoFocus
              placeholder="Nightly build"
              className="border-line bg-canvas focus:border-accent w-full rounded border px-2.5 py-1.5 text-[13px] outline-none"
            />
          </label>

          <label className="block">
            <span className="text-ink-soft mb-1 block text-[12px] font-medium">
              Description
            </span>
            <textarea
              name="description"
              rows={3}
              placeholder="What this workflow does."
              className="border-line bg-canvas focus:border-accent w-full resize-y rounded border px-2.5 py-1.5 text-[13px] outline-none"
            />
          </label>

          <button
            type="submit"
            className="bg-accent rounded px-3 py-1.5 text-[12.5px] font-medium text-white"
          >
            Create workflow
          </button>
        </form>
      </div>
    </div>
  );
}
