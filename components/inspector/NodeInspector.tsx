"use client";

import { useMemo } from "react";
import { getExecutor } from "@/lib/engine/registry";
import { introspect, type FieldDef } from "@/lib/engine/schema-form";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/shell";
import { DEFAULT_RUN_OPTIONS, type GraphNode } from "@/lib/engine/types";

interface Props {
  node: GraphNode | null;
  onChangeConfig: (nodeId: string, key: string, value: unknown) => void;
  onChangeLabel: (nodeId: string, label: string) => void;
  onChangeRetry: (
    nodeId: string,
    key: "maxAttempts" | "retryDelayMs",
    value: number | undefined,
  ) => void;
  onDelete: (nodeId: string) => void;
}

export function NodeInspector({
  node,
  onChangeConfig,
  onChangeLabel,
  onChangeRetry,
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
        <Icon name="Settings" className="text-ink-faint size-5" />
        <p className="text-ink-faint text-[12.5px]">
          Select a node to edit its configuration.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <header className="border-line flex items-center gap-2 border-b px-3 py-2">
        <Icon name={executor.icon} className="text-ink-soft size-3.5" />
        <span className="text-ink-faint text-[12px] font-semibold tracking-wider uppercase">
          {executor.label}
        </span>
        <button
          type="button"
          onClick={() => onDelete(node.id)}
          title="Delete node"
          className="text-ink-faint hover:bg-bad-soft hover:text-bad ml-auto rounded p-1"
        >
          <Icon name="Trash2" className="size-3.5" />
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        <p className="text-ink-faint text-[12px]">{executor.description}</p>

        <Field label="Label">
          <input
            value={node.data.label ?? ""}
            placeholder={executor.label}
            onChange={(e) => onChangeLabel(node.id, e.target.value)}
            className="border-line bg-canvas focus:border-accent w-full rounded border px-2 py-1 text-[12.5px] outline-none"
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

        <div className="border-line space-y-2 border-t pt-2">
          <p className="text-ink-faint text-[11px] font-medium tracking-wide uppercase">
            Retries
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Max attempts">
              <input
                type="number"
                min={1}
                max={5}
                step={1}
                placeholder={String(DEFAULT_RUN_OPTIONS.maxAttempts)}
                value={node.data.retry?.maxAttempts ?? ""}
                onChange={(e) =>
                  onChangeRetry(
                    node.id,
                    "maxAttempts",
                    e.target.value === "" ? undefined : e.target.valueAsNumber,
                  )
                }
                className="border-line bg-canvas focus:border-accent w-full rounded border px-2 py-1 text-[12.5px] outline-none"
              />
            </Field>
            <Field label="Delay (ms)">
              <input
                type="number"
                min={0}
                max={60_000}
                step={500}
                placeholder={String(DEFAULT_RUN_OPTIONS.retryDelayMs)}
                value={node.data.retry?.retryDelayMs ?? ""}
                onChange={(e) =>
                  onChangeRetry(
                    node.id,
                    "retryDelayMs",
                    e.target.value === "" ? undefined : e.target.valueAsNumber,
                  )
                }
                className="border-line bg-canvas focus:border-accent w-full rounded border px-2 py-1 text-[12.5px] outline-none"
              />
            </Field>
          </div>
          <p className="text-ink-faint text-[11px]">
            Blank uses the run&rsquo;s default (
            {DEFAULT_RUN_OPTIONS.maxAttempts} attempts,{" "}
            {DEFAULT_RUN_OPTIONS.retryDelayMs}ms delay).
          </p>
        </div>

        <div className="border-line border-t pt-2">
          <p className="text-ink-faint text-[11px]">
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
      <span className="text-ink-soft mb-1 block text-[12px] font-medium">
        {label}
      </span>
      {children}
      {hint && !error && (
        <span className="text-ink-faint mt-1 block text-[11px]">{hint}</span>
      )}
      {error && (
        <span className="text-bad mt-1 block text-[11px]">{error}</span>
      )}
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
