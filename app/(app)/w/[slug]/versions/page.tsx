import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUserId } from "@/lib/session";
import { getWorkflow } from "@/data/workflows";
import { listVersions } from "@/data/versions";
import { diffGraphs, summariseDiff } from "@/lib/engine/diff";
import { PageHeader } from "@/components/shell/PageHeader";

import { RestoreVersionButton } from "@/components/versions/RestoreVersionButton";
import { cn } from "@/lib/cn";
import { formatRelative } from "@/lib/status";

export default async function VersionsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const userId = await requireUserId();

  const workflow = await getWorkflow(userId, slug);
  if (!workflow) notFound();

  const versions = await listVersions(userId, workflow.id);

  // Each row describes what *that* version introduced, so diff it against the
  // one immediately below it in the (descending) list.
  const rows = versions.map((entry, index) => {
    const previous = versions[index + 1];
    const diff = previous ? diffGraphs(previous.graph, entry.graph) : null;
    return { entry, diff };
  });

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon="Clock"
        title={workflow.name}
        meta={<span>{versions.length} versions</span>}
        tabs={[
          { href: `/w/${workflow.slug}`, label: "Canvas", icon: "Workflow" },
          { href: `/runs?w=${workflow.slug}`, label: "Runs", icon: "History" },
          { href: `/w/${workflow.slug}/versions`, label: "Versions", icon: "Clock" },
        ]}
        active={`/w/${workflow.slug}/versions`}
        actions={
          <Link
            href={`/w/${workflow.slug}`}
            className="rounded border border-line px-2 py-1 text-[12.5px] text-ink-soft hover:bg-line/50"
          >
            Open canvas
          </Link>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {rows.map(({ entry, diff }) => (
          <article
            key={entry.version}
            className={cn(
              "flex items-start gap-3 border-b border-line px-4 py-2.5",
              entry.isCurrent && "bg-accent-soft/40",
            )}
          >
            <span
              className={cn(
                "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded font-mono text-[11px] font-semibold",
                entry.isCurrent
                  ? "bg-accent text-white"
                  : "bg-line text-ink-soft",
              )}
            >
              v{entry.version}
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[12.5px] font-medium">
                  {entry.note ?? (entry.isCurrent ? "Current version" : "Saved")}
                </span>
                {entry.isCurrent && (
                  <span className="rounded bg-accent px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-white">
                    Live
                  </span>
                )}
              </div>

              <p className="mt-0.5 text-[12px] text-ink-faint">
                {diff ? summariseDiff(diff) : "Initial version"}
                {" · "}
                {entry.graph.nodes.length} nodes, {entry.graph.edges.length}{" "}
                connections
                {" · "}
                {formatRelative(entry.createdAt)}
              </p>

              {diff && !diff.identical && (
                <ul className="mt-1.5 space-y-0.5">
                  {diff.nodesAdded.map((node) => (
                    <Change key={`a-${node.id}`} kind="add">
                      {node.data.label ?? node.kind}
                    </Change>
                  ))}
                  {diff.nodesRemoved.map((node) => (
                    <Change key={`r-${node.id}`} kind="remove">
                      {node.data.label ?? node.kind}
                    </Change>
                  ))}
                  {diff.nodesChanged.map((change) => (
                    <Change key={`c-${change.after.id}`} kind="edit">
                      {change.after.data.label ?? change.after.kind}
                      <span className="ml-1.5 font-mono text-[10.5px] text-ink-faint">
                        {change.fields.join(", ")}
                      </span>
                    </Change>
                  ))}
                  {diff.edgesAdded.length > 0 && (
                    <Change kind="add">
                      {diff.edgesAdded.length} connection
                      {diff.edgesAdded.length === 1 ? "" : "s"}
                    </Change>
                  )}
                  {diff.edgesRemoved.length > 0 && (
                    <Change kind="remove">
                      {diff.edgesRemoved.length} connection
                      {diff.edgesRemoved.length === 1 ? "" : "s"}
                    </Change>
                  )}
                </ul>
              )}
            </div>

            {!entry.isCurrent && (
              <RestoreVersionButton
                workflowId={workflow.id}
                version={entry.version}
              />
            )}
          </article>
        ))}

        {versions.length <= 1 && (
          <p className="p-6 text-center text-[12.5px] text-ink-faint">
            Only one version so far. Saving the canvas archives the previous
            graph here.
          </p>
        )}
      </div>
    </div>
  );
}

function Change({
  kind,
  children,
}: {
  kind: "add" | "remove" | "edit";
  children: React.ReactNode;
}) {
  const marks = { add: "+", remove: "−", edit: "~" } as const;
  const tone = {
    add: "text-ok",
    remove: "text-bad",
    edit: "text-warn",
  } as const;

  return (
    <li className="flex items-baseline gap-1.5 text-[12px] text-ink-soft">
      <span className={cn("font-mono", tone[kind])}>{marks[kind]}</span>
      <span className="min-w-0 truncate">{children}</span>
    </li>
  );
}
