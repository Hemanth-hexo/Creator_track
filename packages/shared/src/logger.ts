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

const baseLogger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  transport:
    process.env.NODE_ENV === "development"
      ? { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss" } }
      : undefined,
});

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
