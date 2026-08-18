import Link from "next/link";
import { requireUserId } from "@/lib/session";
import { listWorkflows } from "@/data/workflows";
import { PageHeader } from "@/components/shell/PageHeader";
import { Icon } from "@/components/shell/Icon";
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
            <span className="flex size-11 items-center justify-center rounded-lg bg-accent-soft text-accent">
              <Icon name="CircleCheck" className="size-5" />
            </span>
            <h2 className="mt-4 font-serif text-[19px] italic text-ink">
              You&apos;re clear.
            </h2>
            <p className="mt-2 max-w-xs text-[13px] text-ink-soft">
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
                  className="flex items-center gap-3 border-b border-line px-4 py-3 hover:bg-panel focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
                >
                  {/* The one saturated mark: this is what needs you. */}
                  <span className="size-2 shrink-0 rounded-full bg-now" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-bold text-ink">
                      {workflow.name}
                    </span>
                    <span className="block truncate text-[12px] text-ink-soft">
                      Last run failed · {formatRelative(workflow.lastRun!.startedAt)}
                    </span>
                  </span>
                  <Icon name="ChevronRight" className="size-4 text-ink-faint" />
                </Link>
              </li>
            ))}
          </ul>
        )}

        {neverRun.length > 0 && (
          <p className="px-4 py-3 text-[12px] text-ink-faint">
            {neverRun.length} automation{neverRun.length === 1 ? " has" : "s have"} never
            run.{" "}
            <Link href="/workflows" className="text-accent underline underline-offset-2">
              Open automations
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
