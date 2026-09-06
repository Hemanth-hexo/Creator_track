import pino from "pino";

/**
 * Structured fields every log line should carry when relevant, per the
 * project's observability requirements: request_id, job_id, event_id,
 * opportunity_id, contact_id, operation, provider, duration, status, error.
 */
export interface LogContext {
  requestId?: string;
  jobId?: string;
  eventId?: string;
  opportunityId?: string;
  contactId?: string;
  draftId?: string;
  operation?: string;
  provider?: string;
  durationMs?: number;
  status?: string;
  [key: string]: unknown;
}

// apps/mcp talks to clients over stdio, using stdout as the literal JSON-RPC
// wire — any log line written there corrupts the protocol stream for a real
// MCP client. Every log line goes to stderr instead, for every app, not just
// apps/mcp: apps/api doesn't care which fd its logs land on (Render and
// friends capture both), so there's no reason to special-case it.
const baseLogger =
  process.env.NODE_ENV === "development"
    ? pino({
        level: process.env.LOG_LEVEL ?? "info",
        transport: {
          target: "pino-pretty",
          // pino-pretty is itself a transport with its own destination —
          // passing a stream as pino()'s second argument isn't allowed
          // alongside `transport`, so stderr is set here instead.
          options: { colorize: true, translateTime: "HH:MM:ss", destination: 2 },
        },
      })
    : pino({ level: process.env.LOG_LEVEL ?? "info" }, pino.destination(2));

export type Logger = pino.Logger;

export function createLogger(scope: string): Logger {
  return baseLogger.child({ scope });
}

/**
 * Times an operation and logs a single structured line on completion,
 * success or failure, with duration and status always present.
 */
export async function withLogging<T>(
  logger: Logger,
  context: LogContext,
  fn: () => Promise<T>,
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    logger.info({ ...context, durationMs: Date.now() - start, status: "ok" }, context.operation);
    return result;
  } catch (error) {
    logger.error(
      {
        ...context,
        durationMs: Date.now() - start,
        status: "error",
        err: error instanceof Error ? { message: error.message, stack: error.stack } : error,
      },
      context.operation,
    );
    throw error;
  }
}
