import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUserId } from "@/lib/session";
import { getRun } from "@/data/runs";
import { PageHeader } from "@/components/shell";
import { RunDetail, type NodeRunDetail } from "@/components/timeline/RunDetail";
import { RerunButton } from "@/components/timeline/RerunButton";
import { cn } from "@/lib/cn";
import { formatDuration, formatRelative, statusStyle } from "@/lib/status";
import type { WorkflowGraph } from "@/lib/engine/types";

export default async function RunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const userId = await requireUserId();

  const run = await getRun(userId, id);
  if (!run) notFound();

  const graph = run.workflow.graph as unknown as WorkflowGraph;
  const labels = new Map(
    (graph?.nodes ?? []).map((n) => [n.id, n.data.label ?? n.kind]),
  );

  // A retried node has one row per attempt. Group them so the rest of the UI
  // keeps its "one entry per node" contract — RunTimeline in particular only
  // ever learns about the span from the first attempt's start to the latest
  // attempt's finish, which is an honest wall-clock picture (delay included)
  // without needing to know attempts exist at all.
  const byNode = new Map<string, typeof run.nodeRuns>();
  for (const nodeRun of run.nodeRuns) {
    const list = byNode.get(nodeRun.nodeId) ?? [];
    list.push(nodeRun);
    byNode.set(nodeRun.nodeId, list);
  }

  // Dates and JSON columns cross the server/client boundary, so serialise
  // explicitly rather than relying on whatever the framework infers.
  const nodes: NodeRunDetail[] = [...byNode.entries()].map(
    ([nodeId, attemptRows]) => {
      const sorted = [...attemptRows].sort((a, b) => a.attempt - b.attempt);
      const first = sorted[0];
      const latest = sorted[sorted.length - 1];

      return {
        nodeId,
        label: labels.get(nodeId) ?? nodeId,
        kind: latest.kind,
        status: latest.status,
        startedAt: first.startedAt?.toISOString() ?? null,
        finishedAt: latest.finishedAt?.toISOString() ?? null,
        input: latest.input ?? null,
        output: latest.output ?? null,
        error: latest.error,
        attempts: sorted.map((row) => ({
          attempt: row.attempt,
          status: row.status,
          startedAt: row.startedAt?.toISOString() ?? null,
          finishedAt: row.finishedAt?.toISOString() ?? null,
          error: row.error,
        })),
      };
    },
  );

  const style = statusStyle(run.status);
  const duration = run.finishedAt
    ? run.finishedAt.getTime() - run.startedAt.getTime()
    : null;

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon="Activity"
        title={`${run.workflow.name} · run`}
        meta={
          <>
            <span
              className={cn(
                "rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase",
                style.badge,
              )}
            >
              {style.label}
            </span>
            <span>v{run.version}</span>
            <span>{formatDuration(duration)}</span>
            <span>{formatRelative(run.startedAt)}</span>
          </>
        }
        tabs={[
          {
            href: `/w/${run.workflow.slug}`,
            label: "Canvas",
            icon: "Workflow",
          },
          {
            href: `/runs?w=${run.workflow.slug}`,
            label: "All runs",
            icon: "History",
          },
          {
            href: `/w/${run.workflow.slug}/versions`,
            label: "Versions",
            icon: "Clock",
          },
        ]}
        actions={
          <>
            <RerunButton runId={run.id} version={run.version} />
            <Link
              href={`/w/${run.workflow.slug}`}
              className="border-line text-ink-soft hover:bg-line/50 rounded border px-2 py-1 text-[12.5px]"
            >
              Open canvas
            </Link>
          </>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {run.error && (
          <p className="border-line bg-bad-soft text-bad border-b px-4 py-2 text-[12.5px]">
            {run.error}
          </p>
        )}

        <RunDetail
          runId={run.id}
          nodes={nodes}
          runStart={run.startedAt.toISOString()}
          runEnd={run.finishedAt?.toISOString() ?? null}
          isLive={run.finishedAt === null}
        />
      </div>
    </div>
  );
}
