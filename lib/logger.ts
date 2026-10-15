type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  [key: string]: unknown;
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: LogContext;
  error?: {
    name?: string;
    message?: string;
    stack?: string;
    [key: string]: unknown;
  };
}

function formatError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  if (error !== null && error !== undefined) {
    return { message: String(error) };
  }
  return undefined;
}

function log(
  level: LogLevel,
  message: string,
  context?: LogContext,
  error?: unknown,
) {
  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...(context && Object.keys(context).length > 0 ? { context } : {}),
    ...(error !== undefined ? { error: formatError(error) } : {}),
  };

  const formatted = JSON.stringify(entry);

  switch (level) {
    case "error":
      console.error(formatted);
      break;
    case "warn":
      console.warn(formatted);
      break;
    case "info":
      console.info(formatted);
      break;
    case "debug":
      console.debug(formatted);
      break;
  }
}

export const logger = {
  debug: (message: string, context?: LogContext, error?: unknown) =>
    log("debug", message, context, error),
  info: (message: string, context?: LogContext, error?: unknown) =>
    log("info", message, context, error),
  warn: (message: string, context?: LogContext, error?: unknown) =>
    log("warn", message, context, error),
  error: (message: string, context?: LogContext, error?: unknown) =>
    log("error", message, context, error),
};
