import { z } from "zod";
import type { NodeExecutor } from "../engine/types";

const configSchema = z.object({
  label: z
    .string()
    .default("Done")
    .meta({ description: "Shown on the canvas and in the run summary." }),
});

export type EndConfig = z.infer<typeof configSchema>;

export const endExecutor: NodeExecutor<EndConfig> = {
  kind: "end",
  label: "End",
  description: "Terminal node. Collects whatever reached it as the run result.",
  icon: "CircleCheck",
  accent: "slate",
  configSchema,
  ports: {
    inputs: [{ id: "in", label: "Result", type: "any" }],
    outputs: [],
  },

  async *run(ctx) {
    const result = ctx.inputs.in;
    yield {
      type: "log",
      stream: "system",
      text: `${ctx.config.label}: ${JSON.stringify(result ?? null)}`,
    };
    yield { type: "succeeded", outputs: { result } };
  },
};
