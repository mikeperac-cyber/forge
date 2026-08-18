"use client";

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import {
  addEdge,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react";
import { Group, Panel as ResizablePanel, Separator } from "react-resizable-panels";
import { nanoid } from "nanoid";
import { EXECUTORS, defaultConfigFor } from "@/lib/engine/registry";
import { validateGraph } from "@/lib/engine/validate";
import type { GraphEdge, GraphNode, WorkflowGraph } from "@/lib/engine/types";
import {
  saveGraphAction,
  runWorkflowAction,
  cancelRunAction,
  renameWorkflowAction,
} from "@/actions/workflows";
import { PageHeader } from "@/components/shell/PageHeader";
import { Icon } from "@/components/shell/Icon";
import { InlineRename } from "@/components/shell/InlineRename";
import { NodeInspector } from "@/components/inspector/NodeInspector";
import { RunConsole } from "@/components/console/RunConsole";
import { useRunStream } from "@/components/console/use-run-stream";
import { NodeCard, type NodeCardData } from "./NodeCard";
import { cn } from "@/lib/cn";

/** Stable identity — React Flow warns and remounts nodes if this is recreated. */
const NODE_TYPES = Object.fromEntries(
  EXECUTORS.map((executor) => [executor.kind, NodeCard]),
);

interface Props {
  workflow: { id: string; name: string; slug: string; version: number };
  initialGraph: WorkflowGraph;
}

function toFlowNodes(graph: WorkflowGraph): Node[] {
  return graph.nodes.map((node) => ({
    id: node.id,
    type: node.kind,
    position: node.position,
    data: {
      kind: node.kind,
      label: node.data.label,
      config: node.data.config ?? {},
    } satisfies NodeCardData,
  }));
}

function toFlowEdges(graph: WorkflowGraph): Edge[] {
  return graph.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle ?? undefined,
    targetHandle: edge.targetHandle ?? undefined,
    // Branch paths read much better when the handle is on the wire.
    label: ["true", "false"].includes(edge.sourceHandle ?? "")
      ? edge.sourceHandle
      : undefined,
  }));
}

export function WorkflowCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}

function Canvas({ workflow, initialGraph }: Props) {
  const [nodes, setNodes, onNodesChange] = useNodesState(toFlowNodes(initialGraph));
  const [edges, setEdges, onEdgesChange] = useEdgesState(toFlowEdges(initialGraph));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [version, setVersion] = useState(workflow.version);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  const stream = useRunStream(runId);

  /** The domain graph, independent of React Flow's representation. */
  const graph: WorkflowGraph = useMemo(
    () => ({
      nodes: nodes.map<GraphNode>((node) => ({
        id: node.id,
        kind: (node.data as NodeCardData).kind,
        position: node.position,
        data: {
          label: (node.data as NodeCardData).label,
          config: (node.data as NodeCardData).config ?? {},
        },
      })),
      edges: edges.map<GraphEdge>((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle ?? null,
        targetHandle: edge.targetHandle ?? null,
      })),
    }),
    [nodes, edges],
  );

  // Validation walks the graph and hunts cycles. Dragging a node produces a new
  // graph object every frame, so running it eagerly would re-validate on every
  // pixel of movement. Deferring lets the drag stay at full framerate and lets
  // validation catch up when React has a spare moment.
  const deferredGraph = useDeferredValue(graph);
  const problems = useMemo(() => validateGraph(deferredGraph), [deferredGraph]);

  const selected = graph.nodes.find((n) => n.id === selectedId) ?? null;

  /**
   * Live status is painted on top of the stored graph rather than merged into
   * it, so a run never dirties the document.
   *
   * Identity matters here: React Flow memoises node components, so handing back
   * a fresh object for every node on each stream tick (~12×/sec) would re-render
   * the whole canvas. Nodes whose source object, status and progress are all
   * unchanged get their previous object back instead.
   */
  const displayNodes = useMemo(() => {
    let decorated = false;

    const result = nodes.map((node) => {
      const status = stream.nodeStatuses[node.id];
      const progress = stream.progress[node.id];

      // A node with no run state needs no overlay, so hand back the *source*
      // object. Its identity comes from `useNodesState`, which preserves
      // untouched nodes across updates — which is what keeps React Flow from
      // re-rendering the whole canvas on every stream tick.
      if (status === undefined && progress === undefined) return node;

      decorated = true;
      return {
        ...node,
        data: { ...(node.data as NodeCardData), status, progress },
      };
    });

    // Nothing decorated means nothing to re-render; keep the array identity too.
    return decorated ? result : nodes;
  }, [nodes, stream.nodeStatuses, stream.progress]);

  /* ------------------------------------------------------------ mutations */

  const markDirty = useCallback(() => setDirty(true), []);

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((current) =>
        addEdge({ ...connection, id: `e-${nanoid(8)}` }, current),
      );
      markDirty();
    },
    [setEdges, markDirty],
  );

  const addNode = useCallback(
    (kind: string) => {
      const id = `n-${nanoid(8)}`;
      setNodes((current) => [
        ...current,
        {
          id,
          type: kind,
          // Cascade slightly so repeated adds don't stack invisibly.
          position: { x: 120 + current.length * 28, y: 120 + current.length * 22 },
          data: {
            kind,
            label: undefined,
            config: defaultConfigFor(kind),
          } satisfies NodeCardData,
        },
      ]);
      setSelectedId(id);
      markDirty();
    },
    [setNodes, markDirty],
  );

  const changeConfig = useCallback(
    (nodeId: string, key: string, value: unknown) => {
      setNodes((current) =>
        current.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                data: {
                  ...(node.data as NodeCardData),
                  config: {
                    ...((node.data as NodeCardData).config ?? {}),
                    [key]: value,
                  },
                },
              }
            : node,
        ),
      );
      markDirty();
    },
    [setNodes, markDirty],
  );

  const changeLabel = useCallback(
    (nodeId: string, label: string) => {
      setNodes((current) =>
        current.map((node) =>
          node.id === nodeId
            ? { ...node, data: { ...(node.data as NodeCardData), label } }
            : node,
        ),
      );
      markDirty();
    },
    [setNodes, markDirty],
  );

  const deleteNode = useCallback(
    (nodeId: string) => {
      setNodes((current) => current.filter((node) => node.id !== nodeId));
      // Edges referencing a removed node would be silently dropped by the
      // scheduler, but leaving them would make the graph lie about itself.
      setEdges((current) =>
        current.filter((e) => e.source !== nodeId && e.target !== nodeId),
      );
      setSelectedId(null);
      markDirty();
    },
    [setNodes, setEdges, markDirty],
  );

  /* --------------------------------------------------------------- actions */

  const save = useCallback(() => {
    startSaving(async () => {
      const result = await saveGraphAction(workflow.id, graph);
      if (result?.ok) {
        setDirty(false);
        setVersion(result.version);
        setNotice(null);
      } else {
        setNotice(result?.error ?? "Save failed");
      }
    });
  }, [graph, workflow.id]);

  const run = useCallback(() => {
    startSaving(async () => {
      // Always persist first: running a graph that differs from what's stored
      // would make the recorded version meaningless.
      if (dirty) {
        const saved = await saveGraphAction(workflow.id, graph);
        if (!saved?.ok) {
          setNotice(saved?.error ?? "Save failed");
          return;
        }
        setDirty(false);
        setVersion(saved.version);
      }

      const result = await runWorkflowAction(workflow.id);
      if (result?.ok) {
        setRunId(result.runId);
        setNotice(null);
      } else {
        setNotice(result?.error ?? "Could not start run");
      }
    });
  }, [dirty, graph, workflow.id]);

  const cancel = useCallback(() => {
    if (runId) void cancelRunAction(runId);
  }, [runId]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        save();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save]);

  const isLive = runId !== null && stream.status === null;
  const errorCount = problems.filter((p) => p.severity === "error").length;

  /* ------------------------------------------------------------------ view */

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon="Workflow"
        title={
          <InlineRename
            value={workflow.name}
            onSave={(next) => renameWorkflowAction(workflow.id, next)}
            textClassName="text-[14px] font-semibold hover:text-accent"
            inputClassName="rounded border border-accent-line bg-canvas px-1 text-[14px] font-semibold text-ink outline-none"
          />
        }
        meta={
          <>
            <span>v{version}</span>
            <span>{graph.nodes.length} nodes</span>
            {dirty && <span className="text-warn">Unsaved changes</span>}
            {notice && <span className="text-bad">{notice}</span>}
          </>
        }
        tabs={[
          { href: `/w/${workflow.slug}`, label: "Canvas", icon: "Workflow" },
          { href: `/runs?w=${workflow.slug}`, label: "Runs", icon: "History" },
          {
            href: `/w/${workflow.slug}/versions`,
            label: "Versions",
            icon: "Clock",
          },
        ]}
        active={`/w/${workflow.slug}`}
        actions={
          <>
            <button
              type="button"
              onClick={save}
              disabled={!dirty || saving}
              className="flex items-center gap-1.5 rounded border border-line px-2 py-1 text-[12.5px] text-ink-soft hover:bg-line/50 disabled:opacity-40"
            >
              <Icon name="Save" className="size-3.5" />
              Save
            </button>
            <button
              type="button"
              onClick={isLive ? cancel : run}
              disabled={saving || errorCount > 0}
              title={errorCount > 0 ? "Fix problems before running" : undefined}
              className={cn(
                "flex items-center gap-1.5 rounded px-2.5 py-1 text-[12.5px] font-medium text-white disabled:opacity-40",
                isLive ? "bg-bad" : "bg-accent",
              )}
            >
              <Icon name={isLive ? "Square" : "Play"} className="size-3.5" />
              {isLive ? "Cancel" : "Run"}
            </button>
          </>
        }
      />

      <Group orientation="vertical" className="flex min-h-0 flex-1 flex-col">
        <ResizablePanel defaultSize={68} minSize={30}>
          <Group orientation="horizontal" className="flex h-full">
            <ResizablePanel defaultSize={76} minSize={40}>
              <div className="relative h-full">
                {/* palette */}
                <div className="absolute left-3 top-3 z-10 flex items-center gap-0.5 rounded-md border border-line bg-panel/95 p-1 shadow-sm backdrop-blur">
                  {EXECUTORS.map((executor) => (
                    <button
                      key={executor.kind}
                      type="button"
                      onClick={() => addNode(executor.kind)}
                      title={`Add ${executor.label} — ${executor.description}`}
                      className="flex items-center gap-1 rounded px-1.5 py-1 text-[11.5px] text-ink-soft hover:bg-line/60 hover:text-ink"
                    >
                      <Icon name={executor.icon} className="size-3.5" />
                      {executor.label}
                    </button>
                  ))}
                </div>

                <ReactFlow
                  nodes={displayNodes}
                  edges={edges}
                  nodeTypes={NODE_TYPES}
                  onNodesChange={(changes) => {
                    onNodesChange(changes);
                    if (changes.some((c) => c.type !== "select" && c.type !== "dimensions")) {
                      markDirty();
                    }
                  }}
                  onEdgesChange={(changes) => {
                    onEdgesChange(changes);
                    if (changes.some((c) => c.type !== "select")) markDirty();
                  }}
                  onConnect={onConnect}
                  onSelectionChange={({ nodes: selectedNodes }) =>
                    setSelectedId(selectedNodes[0]?.id ?? null)
                  }
                  fitView
                  proOptions={{ hideAttribution: true }}
                  defaultEdgeOptions={{ animated: false }}
                >
                  <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
                  <Controls showInteractive={false} />
                  <MiniMap
                    pannable
                    zoomable
                    className="!bg-panel"
                    maskColor="rgb(0 0 0 / 0.06)"
                  />
                </ReactFlow>
              </div>
            </ResizablePanel>

            <Separator className="w-px cursor-col-resize bg-line hover:bg-accent" />

            <ResizablePanel defaultSize={24} minSize={16} maxSize={40}>
              <div className="h-full border-l border-line bg-panel">
                <NodeInspector
                  node={selected}
                  onChangeConfig={changeConfig}
                  onChangeLabel={changeLabel}
                  onDelete={deleteNode}
                />
              </div>
            </ResizablePanel>
          </Group>
        </ResizablePanel>

        <Separator className="h-px cursor-row-resize bg-line hover:bg-accent" />

        <ResizablePanel defaultSize={32} minSize={10}>
          <div className="h-full border-t border-line">
            <RunConsole
              stream={stream}
              problems={problems}
              nodes={graph.nodes}
              runId={runId}
              onCancel={cancel}
              onSelectNode={setSelectedId}
            />
          </div>
        </ResizablePanel>
      </Group>
    </div>
  );
}
