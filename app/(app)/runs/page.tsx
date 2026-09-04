import Link from "next/link";
import { requireUserId } from "@/lib/session";
import { listRuns } from "@/data/runs";
import { getWorkflow } from "@/data/workflows";
import { PageHeader, Icon } from "@/components/shell";
import { cn } from "@/lib/cn";
import { formatDuration, formatRelative, statusStyle } from "@/lib/status";

export default async function RunsPage({
  searchParams,
}: {
  searchParams: Promise<{ w?: string }>;
}) {
  const { w: slug } = await searchParams;
  const userId = await requireUserId();

  // The workflow sub-tab links here with ?w=<slug>. Resolving the slug through
  // the scoped data layer means an unknown or foreign slug narrows to nothing
  // rather than silently showing every run.
  const workflow = slug ? await getWorkflow(userId, slug) : null;
  const filtered = Boolean(slug);

  const runs =
    filtered && !workflow
      ? []
      : await listRuns(userId, { workflowId: workflow?.id, limit: 100 });

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon="History"
        title="Runs"
        meta={<span>{runs.length} recent</span>}
        tabs={[
          { href: "/workflows", label: "All", icon: "LayoutGrid" },
          { href: "/runs", label: "Runs", icon: "History" },
          { href: "/nodes", label: "Nodes", icon: "Boxes" },
        ]}
        active="/runs"
      />

      {filtered && (
        <div className="border-line flex items-center gap-2 border-b px-4 py-1.5 text-[12px]">
          <span className="text-ink-faint">Filtered to</span>
          <span className="bg-accent-soft text-accent flex items-center gap-1.5 rounded px-1.5 py-0.5">
            <Icon name="Workflow" className="size-3" />
            {workflow?.name ?? slug}
          </span>
          <Link
            href="/runs"
            className="text-ink-faint hover:text-ink flex items-center gap-1"
            aria-label="Clear filter"
          >
            <Icon name="X" className="size-3" />
            Clear
          </Link>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {runs.length === 0 ? (
          <p className="text-ink-faint p-6 text-center text-[12.5px]">
            {filtered && !workflow
              ? "That workflow doesn't exist."
              : filtered
                ? "No runs for this workflow yet."
                : "No runs yet. Open a workflow and press Run."}
          </p>
        ) : (
          <table className="w-full text-[12.5px]">
            <thead className="bg-panel text-ink-faint sticky top-0 text-left text-[11px] tracking-wider uppercase">
              <tr className="border-line border-b">
                <th className="px-4 py-2 font-semibold">Status</th>
                <th className="px-4 py-2 font-semibold">Workflow</th>
                <th className="px-4 py-2 font-semibold">Steps</th>
                <th className="px-4 py-2 font-semibold">Duration</th>
                <th className="px-4 py-2 font-semibold">Started</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => {
                const style = statusStyle(run.status);
                const duration = run.finishedAt
                  ? run.finishedAt.getTime() - run.startedAt.getTime()
                  : null;

                return (
                  <tr
                    key={run.id}
                    className="border-line hover:bg-line/30 border-b"
                  >
                    <td className="px-4 py-1.5">
                      <Link
                        href={`/runs/${run.id}`}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[10.5px] font-semibold tracking-wide uppercase",
                          style.badge,
                        )}
                      >
                        {style.label}
                      </Link>
                    </td>
                    <td className="px-4 py-1.5">
                      <Link
                        href={`/runs/${run.id}`}
                        className="hover:text-accent"
                      >
                        {run.workflow.name}
                      </Link>
                      <Link
                        href={`/w/${run.workflow.slug}`}
                        className="text-ink-faint hover:text-accent ml-1.5"
                        title="Open canvas"
                      >
                        v{run.version}
                      </Link>
                    </td>
                    <td className="text-ink-soft px-4 py-1.5">
                      {run._count.nodeRuns}
                    </td>
                    <td className="text-ink-soft px-4 py-1.5 font-mono">
                      {run.status === "running"
                        ? "running…"
                        : formatDuration(duration)}
                    </td>
                    <td className="text-ink-faint px-4 py-1.5">
                      {formatRelative(run.startedAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
