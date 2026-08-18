"use client";

import { useMemo } from "react";
import { getExecutor } from "@/lib/engine/registry";
import { introspect, type FieldDef } from "@/lib/engine/schema-form";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/shell/Icon";
import type { GraphNode } from "@/lib/engine/types";

interface Props {
  node: GraphNode | null;
  onChangeConfig: (nodeId: string, key: string, value: unknown) => void;
  onChangeLabel: (nodeId: string, label: string) => void;
  onDelete: (nodeId: string) => void;
}

export function NodeInspector({
  node,
  onChangeConfig,
  onChangeLabel,
  onDelete,
}: Props) {
  const executor = node ? getExecutor(node.kind) : undefined;

  // Introspection is pure and cheap, but it runs on every keystroke otherwise.
  const fields = useMemo(
    () => (executor ? introspect(executor.configSchema as never) : []),
    [executor],
  );

  const issues = useMemo(() => {
    if (!executor || !node) return new Map<string, string>();
    const parsed = executor.configSchema.safeParse(node.data.config ?? {});
    if (parsed.success) return new Map<string, string>();
    return new Map(
      parsed.error.issues.map((issue) => [
        String(issue.path[0] ?? ""),
        issue.message,
      ]),
    );
  }, [executor, node]);

  if (!node || !executor) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <Icon name="Settings" className="size-5 text-ink-faint" />
        <p className="text-[12.5px] text-ink-faint">
          Select a node to edit its configuration.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 border-b border-line px-3 py-2">
        <Icon name={executor.icon} className="size-3.5 text-ink-soft" />
        <span className="text-[12px] font-semibold uppercase tracking-wider text-ink-faint">
          {executor.label}
        </span>
        <button
          type="button"
          onClick={() => onDelete(node.id)}
          title="Delete node"
          className="ml-auto rounded p-1 text-ink-faint hover:bg-bad-soft hover:text-bad"
        >
          <Icon name="Trash2" className="size-3.5" />
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        <p className="text-[12px] text-ink-faint">{executor.description}</p>

        <Field label="Label">
          <input
            value={node.data.label ?? ""}
            placeholder={executor.label}
            onChange={(e) => onChangeLabel(node.id, e.target.value)}
            className="w-full rounded border border-line bg-canvas px-2 py-1 text-[12.5px] outline-none focus:border-accent"
          />
        </Field>

        {fields.map((field) => (
          <SchemaField
            key={field.name}
            field={field}
            value={node.data.config?.[field.name]}
            error={issues.get(field.name)}
            onChange={(value) => onChangeConfig(node.id, field.name, value)}
          />
        ))}

        <div className="border-t border-line pt-2">
          <p className="text-[11px] text-ink-faint">
            Ports:{" "}
            {[
              ...executor.ports.inputs.map((p) => `↳ ${p.label}`),
              ...executor.ports.outputs.map((p) => `↦ ${p.label}`),
            ].join("  ") || "none"}
          </p>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-medium text-ink-soft">
        {label}
      </span>
      {children}
      {hint && !error && (
        <span className="mt-1 block text-[11px] text-ink-faint">{hint}</span>
      )}
      {error && <span className="mt-1 block text-[11px] text-bad">{error}</span>}
    </label>
  );
}

/**
 * The payoff of `configSchema` doing triple duty: this switch is the entire
 * form layer, and it never needs to know which node kinds exist.
 */
function SchemaField({
  field,
  value,
  error,
  onChange,
}: {
  field: FieldDef;
  value: unknown;
  error?: string;
  onChange: (value: unknown) => void;
}) {
  const base = cn(
    "w-full rounded border bg-canvas px-2 py-1 text-[12.5px] outline-none",
    error ? "border-bad" : "border-line focus:border-accent",
  );

  const current = value ?? field.defaultValue ?? "";

  return (
    <Field label={field.label} hint={field.description} error={error}>
      {field.control === "select" ? (
        <select
          value={String(current)}
          onChange={(e) => onChange(e.target.value)}
          className={base}
        >
          {field.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : field.control === "checkbox" ? (
        <input
          type="checkbox"
          checked={Boolean(current)}
          onChange={(e) => onChange(e.target.checked)}
          className="size-3.5 accent-[var(--accent)]"
        />
      ) : field.control === "number" ? (
        <input
          type="number"
          value={Number(current)}
          min={field.min}
          max={field.max}
          step={field.step}
          onChange={(e) => onChange(e.target.valueAsNumber)}
          className={base}
        />
      ) : field.control === "textarea" || field.control === "code" ? (
        <textarea
          value={String(current)}
          rows={field.control === "code" ? 3 : 4}
          placeholder={field.placeholder}
          spellCheck={field.control !== "code"}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            base,
            "resize-y",
            field.control === "code" && "font-mono text-[11.5px]",
          )}
        />
      ) : (
        <input
          value={String(current)}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={base}
        />
      )}
    </Field>
  );
}
