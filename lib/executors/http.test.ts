import { describe, expect, it } from "vitest";
import { httpExecutor } from "./http";
import type { HttpConfig } from "./http";
import type { RunEvent } from "../engine/types";

async function drive(
  configOverrides: Partial<HttpConfig> = {},
  options: { random?: () => number; secrets?: Record<string, string> } = {},
): Promise<RunEvent[]> {
  const events: RunEvent[] = [];
  const config: HttpConfig = {
    method: "GET",
    url: "https://api.example.com/status",
    headers: "{}",
    body: "",
    ...configOverrides,
  };

  const iterator = httpExecutor.run({
    config,
    inputs: {},
    signal: new AbortController().signal,
    nodeId: "http-1",
    nodeRunId: "test-run:http-1:1",
    random: options.random ?? (() => 0.1),
    secrets: options.secrets ?? {},
  });

  for await (const event of iterator) {
    events.push(event);
  }
  return events;
}

describe("httpExecutor", () => {
  it("fails when headers is malformed / invalid JSON", async () => {
    const events = await drive({ headers: "{ invalid json }" });
    const failedEvent = events.find((e) => e.type === "failed");

    expect(failedEvent).toBeDefined();
    expect(
      (failedEvent as Extract<RunEvent, { type: "failed" }>).error,
    ).toMatch(/Headers are not valid JSON:/);
  });

  it("fails when URL is invalid", async () => {
    const events = await drive({ url: "not-a-valid-url" });
    const failedEvent = events.find((e) => e.type === "failed");

    expect(failedEvent).toBeDefined();
    expect((failedEvent as Extract<RunEvent, { type: "failed" }>).error).toBe(
      "Not a valid URL: not-a-valid-url",
    );
  });

  it("succeeds when request resolves to 200", async () => {
    const events = await drive(
      {
        method: "POST",
        url: "https://api.example.com/data",
        headers: '{"Authorization": "Bearer token"}',
      },
      { random: () => 0.1 },
    );

    const succeededEvent = events.find((e) => e.type === "succeeded");
    expect(succeededEvent).toEqual({
      type: "succeeded",
      outputs: {
        status: 200,
        body: {
          ok: true,
          url: "https://api.example.com/data",
          method: "POST",
          receivedAt: null,
          headersResolved: 1,
        },
      },
    });
  });

  it("fails when response status is 500", async () => {
    const events = await drive(
      {
        method: "GET",
        url: "https://api.example.com/status",
      },
      { random: () => 0.95 },
    );

    const failedEvent = events.find((e) => e.type === "failed");
    expect(failedEvent).toEqual({
      type: "failed",
      error: "GET https://api.example.com/status responded 500",
    });
  });

  it("resolves secret references in URL and headers", async () => {
    const events = await drive(
      {
        url: "https://{{secret.HOST}}/api",
        headers: '{"Authorization": "Bearer {{secret.TOKEN}}"}',
      },
      {
        secrets: {
          HOST: "api.example.com",
          TOKEN: "secret-123",
        },
        random: () => 0.1,
      },
    );

    const succeededEvent = events.find((e) => e.type === "succeeded");
    expect(succeededEvent).toBeDefined();

    // System logs should show unresolved url/headers
    const logs = events.filter((e) => e.type === "log");
    expect(logs).toContainEqual({
      type: "log",
      stream: "system",
      text: "GET https://{{secret.HOST}}/api",
    });
    expect(logs).toContainEqual({
      type: "log",
      stream: "system",
      text: "  Authorization: Bearer {{secret.TOKEN}}",
    });
  });
});
