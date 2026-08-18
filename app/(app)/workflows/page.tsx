import Link from "next/link";
import { requireUserId } from "@/lib/session";
import { listWorkflows } from "@/data/workflows";
import { getRunStats } from "@/data/runs";
import { PageHeader } from "@/components/shell/PageHeader";
import { Icon } from "@/components/shell/Icon";
import { cn } from "@/lib/cn";
import { formatDuration, formatRelative, statusStyle } from "@/lib/status";

export default async function WorkflowsPage() {
  const userId = await requireUserId();
  const [workflows, stats] = await Promise.all([
    listWorkflows(userId),
    getRunStats(userId),
  ]);

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon="LayoutGrid"
        title="Workflows"
        tabs={[
          { href: "/workflows", label: "All", icon: "LayoutGrid" },
          { href: "/runs", label: "Runs", icon: "History" },
          { href: "/nodes", label: "Nodes", icon: "Boxes" },
          {
            href: "#schedules",
            label: "Schedules",
            icon: "Clock",
            disabled: true,
          },
          {
            href: "#secrets",
            label: "Secrets",
            icon: "Settings",
            disabled: true,
          },
        ]}
        active="/workflows"
        actions={
          <Link
            href="/workflows/new"
            className="bg-accent flex items-center gap-1.5 rounded px-2.5 py-1 text-[12.5px] font-medium text-white"
          >
            <Icon name="Plus" className="size-3.5" />
            New workflow
          </Link>
        }
      />

      <div className="border-line text-ink-soft flex items-center gap-4 border-b px-4 py-2 text-[12px]">
        <span>
          <strong className="text-ink font-semibold">{workflows.length}</strong>{" "}
          workflows
        </span>
        <span className="flex items-center gap-1.5">
          <span className="bg-ok size-1.5 rounded-full" />
          {stats.succeeded} succeeded
        </span>
        <span className="flex items-center gap-1.5">
          <span className="bg-bad size-1.5 rounded-full" />
          {stats.failed} failed
        </span>
        {stats.running > 0 && (
          <span className="text-busy flex items-center gap-1.5">
            <span className="bg-busy forge-pulse size-1.5 rounded-full" />
            {stats.running} running
          </span>
        )}
        <span className="ml-auto">
          median run {formatDuration(stats.medianMs)}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {workflows.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid [grid-template-columns:repeat(auto-fill,minmax(288px,1fr))] gap-3">
            {workflows.map((workflow) => {
              const style = workflow.lastRun
                ? statusStyle(workflow.lastRun.status)
                : null;

              return (
                <Link
                  key={workflow.id}
                  href={`/w/${workflow.slug}`}
                  className="group border-line bg-panel hover:border-accent-line flex flex-col rounded-lg border p-3 transition-colors"
                >
                  <div className="flex items-start gap-2.5">
                    <span className="bg-accent-soft text-accent flex size-8 shrink-0 items-center justify-center rounded">
                      <Icon name="Workflow" className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h2 className="group-hover:text-accent truncate text-[13px] font-semibold">
                        {workflow.name}
                      </h2>
                      <p className="text-ink-faint mt-0.5 line-clamp-2 text-[12px]">
                        {workflow.description ?? "No description"}
                      </p>
                    </div>
                    {style && (
                      <span
                        className={cn(
                          "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase",
                          style.badge,
                        )}
                      >
                        {style.label}
                      </span>
                    )}
                  </div>

                  <div className="mt-3">
                    <div className="text-ink-faint flex items-center justify-between text-[11px]">
                      <span>Success rate</span>
                      <span className="text-ink-soft font-medium">
                        {workflow.successRate === null
                          ? "—"
                          : `${workflow.successRate}%`}
                      </span>
                    </div>
                    <div className="bg-line mt-1 h-1 overflow-hidden rounded-full">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          (workflow.successRate ?? 0) >= 80
                            ? "bg-ok"
                            : (workflow.successRate ?? 0) >= 50
                              ? "bg-warn"
                              : "bg-bad",
                        )}
                        style={{ width: `${workflow.successRate ?? 0}%` }}
                      />
                    </div>
                  </div>

                  <div className="border-line text-ink-faint mt-3 flex items-center gap-3 border-t pt-2 text-[11px]">
                    <span>{workflow.nodeCount} nodes</span>
                    <span>{workflow.runCount} runs</span>
                    <span>v{workflow.version}</span>
                    <span className="ml-auto">
                      {formatRelative(workflow.updatedAt)}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <span className="bg-accent-soft text-accent flex size-12 items-center justify-center rounded-lg">
        <Icon name="Workflow" className="size-6" />
      </span>
      <h2 className="mt-3 text-[14px] font-semibold">No workflows yet</h2>
      <p className="text-ink-faint mt-1 max-w-xs text-[12.5px]">
        A workflow is a graph of steps — shell commands, model calls, HTTP
        requests — wired together and run on demand.
      </p>
      <Link
        href="/workflows/new"
        className="bg-accent mt-4 rounded px-3 py-1.5 text-[12.5px] font-medium text-white"
      >
        Create your first workflow
      </Link>
    </div>
  );
}
