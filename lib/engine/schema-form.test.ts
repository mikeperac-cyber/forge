import { describe, expect, it } from "vitest";
import { z } from "zod";
import { introspect } from "./schema-form";

describe("introspect", () => {
  it("introspects simple primitive fields (string, number, boolean)", () => {
    const schema = z.object({
      strField: z.string(),
      numField: z.number(),
      boolField: z.boolean(),
    });

    const fields = introspect(schema);

    expect(fields).toEqual([
      {
        name: "strField",
        label: "Str Field",
        description: undefined,
        control: "text",
        required: true,
        defaultValue: undefined,
        placeholder: undefined,
      },
      {
        name: "numField",
        label: "Num Field",
        description: undefined,
        control: "number",
        required: true,
        defaultValue: undefined,
        placeholder: undefined,
        min: undefined,
        max: undefined,
        step: 1,
      },
      {
        name: "boolField",
        label: "Bool Field",
        description: undefined,
        control: "checkbox",
        required: true,
        defaultValue: undefined,
        placeholder: undefined,
      },
    ]);
  });

  it("humanises field names into labels properly", () => {
    const schema = z.object({
      camelCaseName: z.string(),
      snake_case_name: z.string(),
      "kebab-case-name": z.string(),
      maxTokens: z.string(),
    });

    const fields = introspect(schema);

    expect(fields.map((f) => f.label)).toEqual([
      "Camel Case Name",
      "Snake case name",
      "Kebab case name",
      "Max Tokens",
    ]);
  });

  it("handles unwrapping default, optional, and nullable modifiers", () => {
    const schema = z.object({
      withDefault: z.string().default("hello"),
      isOptional: z.string().optional(),
      isNullable: z.number().nullable(),
      optionalWithDefault: z.number().default(42).optional(),
    });

    const fields = introspect(schema);

    const withDefault = fields.find((f) => f.name === "withDefault")!;
    expect(withDefault.required).toBe(false);
    expect(withDefault.defaultValue).toBe("hello");

    const isOptional = fields.find((f) => f.name === "isOptional")!;
    expect(isOptional.required).toBe(false);
    expect(isOptional.defaultValue).toBeUndefined();

    const isNullable = fields.find((f) => f.name === "isNullable")!;
    expect(isNullable.required).toBe(false);
    expect(isNullable.defaultValue).toBeUndefined();

    const optionalWithDefault = fields.find(
      (f) => f.name === "optionalWithDefault",
    )!;
    expect(optionalWithDefault.required).toBe(false);
    expect(optionalWithDefault.defaultValue).toBe(42);
  });

  it("respects explicit meta overrides (label, control, description, placeholder, step)", () => {
    const schema = z.object({
      codeSnippet: z.string().meta({
        label: "Custom Label",
        control: "code",
        description: "Meta description",
        placeholder: "e.g. const x = 1;",
      }),
      customNumber: z.number().meta({ step: 0.05 }),
    });

    const fields = introspect(schema);

    expect(fields[0]).toMatchObject({
      name: "codeSnippet",
      label: "Custom Label",
      control: "code",
      description: "Meta description",
      placeholder: "e.g. const x = 1;",
    });

    expect(fields[1]).toMatchObject({
      name: "customNumber",
      control: "number",
      step: 0.05,
    });
  });

  it("handles Zod .describe() for field descriptions", () => {
    const schema = z.object({
      apiKey: z.string().describe("Your secret API key"),
    });

    const fields = introspect(schema);

    expect(fields[0].description).toBe("Your secret API key");
  });

  it("introspects enum fields into select controls with options", () => {
    const schema = z.object({
      role: z.enum(["admin", "user_member", "guest"]),
    });

    const fields = introspect(schema);

    expect(fields[0]).toEqual({
      name: "role",
      label: "Role",
      description: undefined,
      control: "select",
      required: true,
      defaultValue: undefined,
      placeholder: undefined,
      options: [
        { value: "admin", label: "Admin" },
        { value: "user_member", label: "User member" },
        { value: "guest", label: "Guest" },
      ],
    });
  });

  it("handles numeric bounds (min, max) and calculates step appropriately", () => {
    const schema = z.object({
      standardNumber: z.number().gt(0).lt(100),
      smallNumber: z.number().gt(0).lt(1),
      exactBoundary: z.number().gt(0).lt(2),
    });

    const fields = introspect(schema);

    const standard = fields.find((f) => f.name === "standardNumber")!;
    expect(standard.min).toBe(0);
    expect(standard.max).toBe(100);
    expect(standard.step).toBe(1);

    const small = fields.find((f) => f.name === "smallNumber")!;
    expect(small.min).toBe(0);
    expect(small.max).toBe(1);
    expect(small.step).toBe(0.1);

    const exact = fields.find((f) => f.name === "exactBoundary")!;
    expect(exact.min).toBe(0);
    expect(exact.max).toBe(2);
    expect(exact.step).toBe(0.1);
  });
});
