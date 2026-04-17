type LogLevel = "info" | "warn" | "error";

interface LogContext {
  [key: string]: any;
}

function getTimestamp(): string {
  const now = new Date();
  return now.toISOString();
}

export function log(level: LogLevel, message: string, context?: LogContext): void {
  const timestamp = getTimestamp();
  const contextStr = context && Object.keys(context).length > 0 ? ` ${JSON.stringify(context)}` : "";
  const levelUpper = level.toUpperCase().padEnd(5);

  const logLine = `[${timestamp}] [${levelUpper}] ${message}${contextStr}`;

  if (level === "error") {
    console.error(logLine);
  } else if (level === "warn") {
    console.warn(logLine);
  } else {
    console.log(logLine);
  }
}

export function logInfo(message: string, context?: LogContext): void {
  log("info", message, context);
}

export function logWarn(message: string, context?: LogContext): void {
  log("warn", message, context);
}

export function logError(message: string, context?: LogContext): void {
  log("error", message, context);
}
