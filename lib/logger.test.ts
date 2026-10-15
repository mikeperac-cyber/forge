import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { logger } from "./logger";

describe("logger", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleInfoSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    consoleInfoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs error message with context and error object", () => {
    const err = new Error("db connection failed");
    logger.error("persistence failed", { runId: "run_123" }, err);

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    const logStr = consoleErrorSpy.mock.calls[0][0];
    const parsed = JSON.parse(logStr);

    expect(parsed.level).toBe("error");
    expect(parsed.message).toBe("persistence failed");
    expect(parsed.context).toEqual({ runId: "run_123" });
    expect(parsed.error.message).toBe("db connection failed");
    expect(parsed.error.name).toBe("Error");
    expect(parsed.timestamp).toBeDefined();
  });

  it("logs info message with context", () => {
    logger.info("run started", { runId: "run_456" });

    expect(consoleInfoSpy).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(consoleInfoSpy.mock.calls[0][0]);

    expect(parsed.level).toBe("info");
    expect(parsed.message).toBe("run started");
    expect(parsed.context).toEqual({ runId: "run_456" });
    expect(parsed.error).toBeUndefined();
  });

  it("handles string error objects gracefully", () => {
    logger.error(
      "something went wrong",
      { runId: "run_789" },
      "raw error message",
    );

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(consoleErrorSpy.mock.calls[0][0]);

    expect(parsed.level).toBe("error");
    expect(parsed.error).toEqual({ message: "raw error message" });
  });
});
