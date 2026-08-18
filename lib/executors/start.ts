import { z } from "zod";
import type { NodeExecutor } from "../engine/types";
import { sleep } from "../engine/rng";

const configSchema = z.object({
  payload: z.string().default("{}").meta({
    control: "code",
    label: "Trigger payload",
    description: "JSON handed to the first nodes as the run's initial input.",
  }),
});

export type StartConfig = z.infer<typeof configSchema>;

export const startExecutor: NodeExecutor<StartConfig> = {
  kind: "start",
  label: "Start",
  description: "Entry point. Emits the run's trigger payload.",
  icon: "Play",
  accent: "emerald",
  configSchema,
  ports: {
    inputs: [],
    outputs: [{ id: "out", label: "Payload", type: "json" }],
  },

  async *run(ctx) {
    yield { type: "log", stream: "system", text: "Run started" };
    await sleep(80, ctx.signal);

    let payload: unknown;
    try {
      payload = JSON.parse(ctx.config.payload || "{}");
    } catch (err) {
      yield {
        type: "failed",
        error: `Trigger payload is not valid JSON: ${(err as Error).message}`,
      };
      return;
    }

    yield {
      type: "log",
      stream: "stdout",
      text: `Payload: ${JSON.stringify(payload)}`,
    };
    yield { type: "succeeded", outputs: { out: payload } };
  },
};
