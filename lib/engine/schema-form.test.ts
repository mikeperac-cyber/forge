import { describe, expect, it } from "vitest";
import { z } from "zod";
import { introspect } from "./schema-form";

describe("schema-form introspect", () => {
  it("introspects string fields with humanised label and default control 'text'", () => {
    const schema = z.object({
      apiKey: z.string().describe("The API key for authentication"),
      maxTokensCount: z.string(),
    });

    const fields = introspect(schema);

    expect(fields).toEqual([
      {
        name: "apiKey",
        label: "Api Key",
        description: "The API key for authentication",
        control: "text",
        required: true,
        defaultValue: undefined,
        placeholder: undefined,
      },
      {
        name: "maxTokensCount",
        label: "Max Tokens Count",
        description: undefined,
        control: "text",
        required: true,
        defaultValue: undefined,
        placeholder: undefined,
      },
    ]);
  });

  it("unwraps modifiers (.default, .optional, .nullable) and extracts default values & required state", () => {
    const schema = z.object({
      reqField: z.string(),
      optField: z.string().optional(),
      nullableField: z.string().nullable(),
      defaultField: z.string().default("hello"),
      chainedField: z.string().default("world").optional().nullable(),
    });

    const fields = introspect(schema);

    const getField = (name: string) => fields.find((f) => f.name === name);

    expect(getField("reqField")).toMatchObject({
      required: true,
      defaultValue: undefined,
    });
    expect(getField("optField")).toMatchObject({
      required: false,
      defaultValue: undefined,
    });
    expect(getField("nullableField")).toMatchObject({
      required: false,
      defaultValue: undefined,
    });
    expect(getField("defaultField")).toMatchObject({
      required: false,
      defaultValue: "hello",
    });
    expect(getField("chainedField")).toMatchObject({
      required: false,
      defaultValue: "world",
    });
  });

  it("introspects enum fields with control 'select' and humanised option labels", () => {
    enum Status {
      PENDING = "PENDING",
      IN_PROGRESS = "IN_PROGRESS",
      COMPLETED_SUCCESS = "COMPLETED_SUCCESS",
    }

    const schema = z.object({
      status: z.nativeEnum(Status),
    });

    const fields = introspect(schema);

    expect(fields).toEqual([
      {
        name: "status",
        label: "Status",
        description: undefined,
        control: "select",
        required: true,
        defaultValue: undefined,
        placeholder: undefined,
        options: [
          { value: "PENDING", label: "PENDING" },
          { value: "IN_PROGRESS", label: "IN PROGRESS" },
          { value: "COMPLETED_SUCCESS", label: "COMPLETED SUCCESS" },
        ],
      },
    ]);
  });

  it("introspects boolean fields with control 'checkbox'", () => {
    const schema = z.object({
      enabled: z.boolean().default(true),
    });

    const fields = introspect(schema);

    expect(fields).toEqual([
      {
        name: "enabled",
        label: "Enabled",
        description: undefined,
        control: "checkbox",
        required: false,
        defaultValue: true,
        placeholder: undefined,
      },
    ]);
  });

  it("introspects number fields with min, max, and step calculation", () => {
    const schema = z.object({
      unbounded: z.number(),
      boundedHighMax: z.number().min(1).max(10),
      boundedLowMax: z.number().min(0).max(1),
    });

    const fields = introspect(schema);

    const unbounded = fields.find((f) => f.name === "unbounded");
    expect(unbounded).toMatchObject({
      control: "number",
      min: undefined,
      max: undefined,
      step: 1,
    });

    const boundedHigh = fields.find((f) => f.name === "boundedHighMax");
    expect(boundedHigh).toMatchObject({
      control: "number",
      min: 1,
      max: 10,
      step: 1,
    });

    const boundedLow = fields.find((f) => f.name === "boundedLowMax");
    expect(boundedLow).toMatchObject({
      control: "number",
      min: 0,
      max: 1,
      step: 0.1,
    });
  });

  it("respects custom .meta() overrides (label, description, control, placeholder, step)", () => {
    const schema = z.object({
      customCode: z.string().meta({
        label: "Custom Code Editor",
        description: "Write raw Javascript code here",
        control: "code",
        placeholder: "console.log('hello');",
      }),
      customNumber: z.number().min(0).max(10).meta({
        step: 0.5,
      }),
    });

    const fields = introspect(schema);

    expect(fields.find((f) => f.name === "customCode")).toEqual({
      name: "customCode",
      label: "Custom Code Editor",
      description: "Write raw Javascript code here",
      control: "code",
      required: true,
      defaultValue: undefined,
      placeholder: "console.log('hello');",
    });

    expect(fields.find((f) => f.name === "customNumber")).toMatchObject({
      name: "customNumber",
      control: "number",
      min: 0,
      max: 10,
      step: 0.5,
    });
  });
});
