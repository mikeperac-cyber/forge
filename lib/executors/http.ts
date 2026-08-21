import { z } from "zod";
import type { NodeExecutor } from "../engine/types";
import { sleep } from "../engine/rng";
import { resolveSecrets } from "../secrets";

const configSchema = z.object({
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("GET"),
  url: z
    .string()
    .min(1)
    .meta({ placeholder: "https://api.example.com/status" }),
  headers: z.string().default("{}").meta({
    control: "code",
    description:
      "JSON object of request headers. A value may reference {{secret.NAME}}.",
  }),
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

    // Validated on the resolved form — a `{{secret.NAME}}` reference should
    // fail here if what it resolves to isn't actually a valid URL, not only
    // if the literal placeholder text happens to look like one.
    const resolvedUrl = resolveSecrets(url, ctx.secrets);
    try {
      new URL(resolvedUrl);
    } catch {
      yield { type: "failed", error: `Not a valid URL: ${url}` };
      return;
    }

    // Resolved so a real HTTP call would carry the actual value. Never
    // logged and never put in `outputs` — both are persisted and displayed,
    // so this stays local to the (simulated) request itself. Everywhere
    // else in this function uses the unresolved `url`/`headers`.
    const resolvedHeaders = Object.fromEntries(
      Object.entries(parsedHeaders).map(([key, value]) => [
        key,
        resolveSecrets(value, ctx.secrets),
      ]),
    );

    yield { type: "log", stream: "system", text: `${method} ${url}` };
    for (const [key, value] of Object.entries(parsedHeaders)) {
      yield { type: "log", stream: "system", text: `  ${key}: ${value}` };
    }

    const latency = 120 + ctx.random() * 700;
    await sleep(latency, ctx.signal);

    const status = ctx.random() < 0.9 ? 200 : 500;
    const body = {
      ok: status === 200,
      url,
      method,
      receivedAt: null,
      // Evidence resolution actually ran, without exposing any value it
      // resolved to.
      headersResolved: Object.keys(resolvedHeaders).length,
    };

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
