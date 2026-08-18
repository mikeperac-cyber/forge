import { z } from "zod";
import type { NodeExecutor } from "../engine/types";
import { sleep } from "../engine/rng";

const configSchema = z.object({
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("GET"),
  url: z
    .string()
    .min(1)
    .meta({ placeholder: "https://api.example.com/status" }),
  headers: z
    .string()
    .default("{}")
    .meta({ control: "code", description: "JSON object of request headers." }),
  body: z
    .string()
    .default("")
    .meta({ control: "code", description: "Request body. Ignored for GET." }),
});

export type HttpConfig = z.infer<typeof configSchema>;

export const httpExecutor: NodeExecutor<HttpConfig> = {
  kind: "http",
  label: "HTTP",
  description: "Call an HTTP endpoint.",
  icon: "Globe",
  accent: "blue",
  configSchema,
  ports: {
    inputs: [{ id: "in", label: "Input", type: "any" }],
    outputs: [
      { id: "status", label: "Status", type: "number" },
      { id: "body", label: "Body", type: "json" },
    ],
  },

  async *run(ctx) {
    const { method, url, headers } = ctx.config;

    // Validated here rather than only in the inspector, because config can
    // reach the engine from a seeded or imported graph that never saw a form.
    let parsedHeaders: Record<string, string>;
    try {
      parsedHeaders = JSON.parse(headers || "{}");
    } catch (err) {
      yield {
        type: "failed",
        error: `Headers are not valid JSON: ${(err as Error).message}`,
      };
      return;
    }

    try {
      new URL(url);
    } catch {
      yield { type: "failed", error: `Not a valid URL: ${url}` };
      return;
    }

    yield { type: "log", stream: "system", text: `${method} ${url}` };
    for (const [key, value] of Object.entries(parsedHeaders)) {
      yield { type: "log", stream: "system", text: `  ${key}: ${value}` };
    }

    const latency = 120 + ctx.random() * 700;
    await sleep(latency, ctx.signal);

    const status = ctx.random() < 0.9 ? 200 : 500;
    const body = { ok: status === 200, url, method, receivedAt: null };

    yield {
      type: "log",
      stream: status === 200 ? "stdout" : "stderr",
      text: `← ${status} in ${latency.toFixed(0)}ms`,
    };

    if (status >= 400) {
      yield { type: "failed", error: `${method} ${url} responded ${status}` };
      return;
    }

    yield { type: "succeeded", outputs: { status, body } };
  },
};
