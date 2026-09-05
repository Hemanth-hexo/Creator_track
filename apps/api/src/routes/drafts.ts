import type { FastifyInstance, RouteShorthandOptions } from "fastify";
import { z } from "zod";
import { generateEmailDraft } from "@photography-outreach/ai";
import { approveDraft, getDraft, rejectDraft, sendApprovedEmail, updateDraft } from "@photography-outreach/email";
import { authenticate } from "../auth.js";

export function registerDraftRoutes(app: FastifyInstance, opts: RouteShorthandOptions = {}) {
  app.post(
    "/api/opportunities/:id/drafts",
    { preHandler: authenticate, schema: { body: z.object({ force: z.boolean().optional() }) } },
    async (request) => {
      const { id } = request.params as { id: string };
      const { force } = (request.body as { force?: boolean }) ?? {};
      return generateEmailDraft({ opportunityId: id, force });
    },
  );

  app.get("/api/drafts/:id", { preHandler: authenticate }, async (request) => {
    const { id } = request.params as { id: string };
    return getDraft(id);
  });

  app.patch(
    "/api/drafts/:id",
    {
      preHandler: authenticate,
      schema: {
        body: z.object({ subject: z.string().optional(), body: z.string().optional(), cta: z.string().optional() }),
      },
    },
    async (request) => {
      const { id } = request.params as { id: string };
      const body = request.body as { subject?: string; body?: string; cta?: string };
      return updateDraft(id, { ...body, editedBy: request.actor?.id ?? "unknown" });
    },
  );

  app.post("/api/drafts/:id/approve", { preHandler: authenticate }, async (request) => {
    const { id } = request.params as { id: string };
    return approveDraft(id, request.actor?.id ?? "unknown");
  });

  app.post(
    "/api/drafts/:id/reject",
    { preHandler: authenticate, schema: { body: z.object({ reason: z.string().optional() }) } },
    async (request) => {
      const { id } = request.params as { id: string };
      const { reason } = (request.body as { reason?: string }) ?? {};
      return rejectDraft(id, request.actor?.id ?? "unknown", reason);
    },
  );

  app.post("/api/drafts/:id/send", { ...opts, preHandler: authenticate }, async (request) => {
    const { id } = request.params as { id: string };
    return sendApprovedEmail(id);
  });
}
