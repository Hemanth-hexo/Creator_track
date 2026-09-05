import { randomUUID } from "node:crypto";
import type { ZodType } from "zod";
import { createLogger, toErrorResponse } from "@photography-outreach/shared";

const logger = createLogger("mcp:tools");

/**
 * Wraps every MCP tool handler with the same guarantees: a request id,
 * structured logging (operation/duration/status), output validated against
 * a strict zod schema before it's returned, and errors turned into a
 * structured {success:false, error} payload instead of a thrown exception
 * reaching the transport.
 */
export function wrapTool<TInput, TOutput>(
  operation: string,
  outputSchema: ZodType<TOutput>,
  fn: (input: TInput) => Promise<TOutput>,
) {
  return async (input: TInput) => {
    const requestId = randomUUID();
    const start = Date.now();
    try {
      const result = await fn(input);
      const validated = outputSchema.parse(result);
      logger.info({ requestId, operation, durationMs: Date.now() - start, status: "ok" });
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ success: true, data: validated }, null, 2) }],
      };
    } catch (error) {
      const errorResponse = toErrorResponse(error);
      logger.error({ requestId, operation, durationMs: Date.now() - start, status: "error", error: errorResponse });
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ success: false, error: errorResponse }, null, 2) }],
        isError: true,
      };
    }
  };
}
