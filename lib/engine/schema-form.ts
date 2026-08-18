import { z } from "zod";

/**
 * Turns an executor's `configSchema` into a field list the inspector can render.
 *
 * This is why adding a node kind costs no form code: the same schema that
 * validates config and types `ctx.config` also describes its own UI. Control
 * type is inferred from the Zod type, overridable via `.meta({ control })`.
 */

export type FieldControl =
  | "text"
  | "textarea"
  | "code"
  | "number"
  | "select"
  | "checkbox";

export interface FieldOption {
  value: string;
  label: string;
}

export interface FieldDef {
  name: string;
  label: string;
  description?: string;
  control: FieldControl;
  options?: FieldOption[];
  min?: number;
  max?: number;
  step?: number;
  required: boolean;
  defaultValue?: unknown;
  placeholder?: string;
}

interface FieldMeta {
  label?: string;
  description?: string;
  control?: FieldControl;
  placeholder?: string;
  step?: number;
}

/** Turn `maxTokens` into `Max tokens`. */
function humanise(name: string): string {
  const spaced = name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * `.default()` / `.optional()` / `.nullable()` wrap the real type, so peel them
 * off while accumulating metadata and noting whether a value is required.
 */
function unwrap(schema: z.ZodType) {
  let current = schema as z.ZodType & { def: Record<string, unknown> };
  const meta: FieldMeta = { ...((schema.meta?.() ?? {}) as FieldMeta) };
  let required = true;
  let defaultValue: unknown;

  for (;;) {
    const type = current.def.type as string;
    if (type === "default") {
      defaultValue = current.def.defaultValue;
      required = false;
    } else if (type === "optional" || type === "nullable") {
      required = false;
    } else {
      break;
    }
    current = current.def.innerType as typeof current;
    Object.assign(meta, (current.meta?.() ?? {}) as FieldMeta);
  }

  return { inner: current, meta, required, defaultValue };
}

function numericBounds(inner: { def: Record<string, unknown> }) {
  const checks = (inner.def.checks ?? []) as Array<{
    _zod?: { def?: { check?: string; value?: number } };
    def?: { check?: string; value?: number };
  }>;
  let min: number | undefined;
  let max: number | undefined;
  for (const raw of checks) {
    const c = raw._zod?.def ?? raw.def;
    if (!c) continue;
    if (c.check === "greater_than") min = c.value;
    if (c.check === "less_than") max = c.value;
  }
  return { min, max };
}

export function introspect(schema: z.ZodObject<z.ZodRawShape>): FieldDef[] {
  const shape = schema.def.shape as Record<string, z.ZodType>;

  return Object.entries(shape).map(([name, fieldSchema]) => {
    const { inner, meta, required, defaultValue } = unwrap(fieldSchema);
    const type = inner.def.type as string;

    const field: FieldDef = {
      name,
      label: meta.label ?? humanise(name),
      description: meta.description ?? fieldSchema.description,
      control: meta.control ?? "text",
      required,
      defaultValue,
      placeholder: meta.placeholder,
    };

    if (!meta.control) {
      if (type === "enum") field.control = "select";
      else if (type === "number") field.control = "number";
      else if (type === "boolean") field.control = "checkbox";
      else field.control = "text";
    }

    if (type === "enum") {
      const entries = (inner.def.entries ?? {}) as Record<string, string>;
      field.options = Object.values(entries).map((value) => ({
        value,
        label: humanise(value),
      }));
    }

    if (type === "number") {
      const { min, max } = numericBounds(inner);
      field.min = min;
      field.max = max;
      field.step = meta.step ?? (max !== undefined && max <= 2 ? 0.1 : 1);
    }

    return field;
  });
}
