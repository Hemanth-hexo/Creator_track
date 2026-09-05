import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { AppError, createLogger, toErrorResponse } from "@photography-outreach/shared";
import { ZodError } from "zod";

const logger = createLogger("api:errors");

const STATUS_BY_CODE: Record<string, number> = {
  NOT_FOUND: 404,
  VALIDATION_ERROR: 400,
  INVALID_STATE_TRANSITION: 409,
  CONFLICT: 409,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  RATE_LIMITED: 429,
  PROVIDER_ERROR: 502,
  INTERNAL_ERROR: 500,
};

export function errorHandler(error: FastifyError | Error, request: FastifyRequest, reply: FastifyReply) {
  if (error instanceof ZodError) {
    reply.code(400).send({ error: { code: "VALIDATION_ERROR", message: "Invalid request", details: error.issues } });
    return;
  }

  if (error instanceof AppError) {
    const status = STATUS_BY_CODE[error.code] ?? 500;
    if (status >= 500) logger.error({ requestId: request.id, err: error }, "unhandled_app_error");
    reply.code(status).send({ error: toErrorResponse(error) });
    return;
  }

  // Fastify's own errors (route validation, malformed body, rate limiting, etc.) already carry
  // the correct statusCode — respect it instead of collapsing everything to a generic 500.
  const fastifyError = error as FastifyError;
  if (typeof fastifyError.statusCode === "number" && fastifyError.statusCode < 500) {
    reply.code(fastifyError.statusCode).send({
      error: { code: fastifyError.code ?? "VALIDATION_ERROR", message: fastifyError.message },
    });
    return;
  }

  logger.error({ requestId: request.id, err: error }, "unhandled_error");
  reply.code(fastifyError.statusCode ?? 500).send({ error: { code: "INTERNAL_ERROR", message: "Internal server error" } });
}
