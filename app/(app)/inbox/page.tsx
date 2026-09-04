import Link from "next/link";
import { requireUserId } from "@/lib/session";
import { listWorkflows } from "@/data/workflows";
import { PageHeader, Icon } from "@/components/shell";
import { formatRelative } from "@/lib/status";

/**
 * Everything waiting on the teacher, and nothing else.
 *
 * Built from real state — automations whose last run failed. When it's empty
 * it says so plainly rather than filling the space.
 */
export default async function InboxPage() {
  const userId = await requireUserId();
  const workflows = await listWorkflows(userId);

  const needsYou = workflows.filter((w) => w.lastRun?.status === "failed");
  const neverRun = workflows.filter((w) => !w.lastRun);

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon="Inbox"
        title="Inbox"
        meta={
          <span>
            {needsYou.length === 0
              ? "nothing waiting"
              : `${needsYou.length} waiting`}
          </span>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {needsYou.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <span className="bg-accent-soft text-accent flex size-11 items-center justify-center rounded-lg">
              <Icon name="CircleCheck" className="size-5" />
            </span>
            <h2 className="text-ink mt-4 font-serif text-[19px] italic">
              You&apos;re clear.
            </h2>
            <p className="text-ink-soft mt-2 max-w-xs text-[13px]">
              Nothing has failed and nothing needs a decision. Anything that
              breaks will land here.
            </p>
          </div>
        ) : (
          <ul>
            {needsYou.map((workflow) => (
              <li key={workflow.id}>
                <Link
                  href={`/runs/${workflow.lastRun!.id}`}
                  className="border-line hover:bg-panel focus-visible:outline-accent flex items-center gap-3 border-b px-4 py-3 focus-visible:outline-2 focus-visible:-outline-offset-2"
                >
                  {/* The one saturated mark: this is what needs you. */}
                  <span className="bg-now size-2 shrink-0 rounded-full" />
                  <span className="min-w-0 flex-1">
                    <span className="text-ink block truncate text-[13.5px] font-bold">
                      {workflow.name}
                    </span>
                    <span className="text-ink-soft block truncate text-[12px]">
                      Last run failed ·{" "}
                      {formatRelative(workflow.lastRun!.startedAt)}
                    </span>
                  </span>
                  <Icon name="ChevronRight" className="text-ink-faint size-4" />
                </Link>
              </li>
            ))}
          </ul>
        )}

        {neverRun.length > 0 && (
          <p className="text-ink-faint px-4 py-3 text-[12px]">
            {neverRun.length} automation
            {neverRun.length === 1 ? " has" : "s have"} never run.{" "}
            <Link
              href="/workflows"
              className="text-accent underline underline-offset-2"
            >
              Open automations
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
