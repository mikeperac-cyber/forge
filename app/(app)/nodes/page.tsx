import { EXECUTORS } from "@/lib/engine/registry";
import { introspect } from "@/lib/engine/schema-form";
import { PageHeader } from "@/components/shell/PageHeader";
import { Icon } from "@/components/shell/Icon";

/**
 * Generated entirely from the executor registry — no hand-written docs to fall
 * out of date. Adding a node kind adds a card here automatically.
 */
export default function NodesPage() {
  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon="Boxes"
        title="Nodes"
        meta={<span>{EXECUTORS.length} kinds available</span>}
        tabs={[
          { href: "/workflows", label: "All", icon: "LayoutGrid" },
          { href: "/runs", label: "Runs", icon: "History" },
          { href: "/nodes", label: "Nodes", icon: "Boxes" },
        ]}
        active="/nodes"
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(320px,1fr))]">
          {EXECUTORS.map((executor) => {
            const fields = introspect(executor.configSchema as never);
            return (
              <article
                key={executor.kind}
                className="rounded-lg border border-line bg-panel p-3"
              >
                <header className="flex items-center gap-2">
                  <span className="flex size-6 items-center justify-center rounded bg-accent-soft text-accent">
                    <Icon name={executor.icon} className="size-3.5" />
                  </span>
                  <h2 className="text-[13px] font-semibold">{executor.label}</h2>
                  <code className="ml-auto rounded bg-line px-1.5 py-0.5 font-mono text-[10.5px] text-ink-faint">
                    {executor.kind}
                  </code>
                </header>

                <p className="mt-2 text-[12px] text-ink-soft">
                  {executor.description}
                </p>

                <dl className="mt-3 space-y-1 border-t border-line pt-2 text-[11.5px]">
                  <Row
                    label="Inputs"
                    value={
                      executor.ports.inputs.map((p) => p.label).join(", ") || "—"
                    }
                  />
                  <Row
                    label="Outputs"
                    value={
                      executor.ports.outputs.map((p) => p.label).join(", ") || "—"
                    }
                  />
                  <Row
                    label="Config"
                    value={fields.map((f) => f.label).join(", ") || "—"}
                  />
                </dl>
              </article>
            );
          })}
        </div>

        <p className="mt-4 text-[12px] text-ink-faint">
          All node kinds currently run against the simulated executor.{" "}
          <code className="font-mono">transform</code> and{" "}
          <code className="font-mono">branch</code> are exceptions — they
          evaluate for real, because they are pure functions over data.
        </p>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-16 shrink-0 text-ink-faint">{label}</dt>
      <dd className="min-w-0 flex-1 text-ink-soft">{value}</dd>
    </div>
  );
}
