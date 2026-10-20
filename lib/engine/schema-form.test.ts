import { describe, expect, it } from "vitest";
import { z } from "zod";
import { introspect } from "./schema-form";

describe("introspect", () => {
  it("introspects a standard z.ZodObject", () => {
    const schema = z.object({
      name: z.string().meta({ label: "Name field", placeholder: "Enter name" }),
      count: z.number().default(10),
      active: z.boolean().default(true),
      choice: z.enum(["a", "b"]),
    });

    const fields = introspect(schema);
    expect(fields).toHaveLength(4);

    expect(fields[0]).toMatchObject({
      name: "name",
      label: "Name field",
      control: "text",
      placeholder: "Enter name",
      required: true,
    });

    expect(fields[1]).toMatchObject({
      name: "count",
      label: "Count",
      control: "number",
      required: false,
      defaultValue: 10,
    });

    expect(fields[2]).toMatchObject({
      name: "active",
      label: "Active",
      control: "checkbox",
      required: false,
      defaultValue: true,
    });

    expect(fields[3]).toMatchObject({
      name: "choice",
      label: "Choice",
      control: "select",
      options: [
        { value: "a", label: "A" },
        { value: "b", label: "B" },
      ],
    });
  });

  it("handles a wrapped z.ZodType schema without type coercion", () => {
    const schema: z.ZodType = z
      .object({
        query: z.string().default("test"),
      })
      .default({ query: "test" });

    const fields = introspect(schema);
    expect(fields).toHaveLength(1);
    expect(fields[0]).toMatchObject({
      name: "query",
      label: "Query",
      control: "text",
      required: false,
      defaultValue: "test",
    });
  });

  it("returns an empty array for non-object schemas", () => {
    const schema: z.ZodType = z.string();
    expect(introspect(schema)).toEqual([]);
  });
});
