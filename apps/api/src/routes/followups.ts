import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  approveFollowup,
  cancelFollowup,
  getApprovedFollowups,
  getDueFollowups,
  getOutreachHistory,
  scheduleFollowup,
} from "@photography-outreach/email";
import { authenticate } from "../auth.js";

export function registerFollowupRoutes(app: FastifyInstance) {
  app.get("/api/followups/due", { preHandler: authenticate }, async () => {
    return getDueFollowups();
  });

  app.get("/api/followups/approved", { preHandler: authenticate }, async () => {
    return getApprovedFollowups();
  });

  app.get("/api/opportunities/:id/outreach", { preHandler: authenticate }, async (request) => {
    const { id } = request.params as { id: string };
    return getOutreachHistory(id);
  });

  app.post(
    "/api/outreach/:outreachId/followups",
    {
      preHandler: authenticate,
      schema: { body: z.object({ opportunityId: z.string(), daysFromNow: z.number().int().min(1).max(60).default(5) }) },
    },
    async (request) => {
      const { outreachId } = request.params as { outreachId: string };
      const { opportunityId, daysFromNow } = request.body as { opportunityId: string; daysFromNow: number };
      return scheduleFollowup(opportunityId, outreachId, daysFromNow);
    },
  );

  app.post("/api/followups/:id/approve", { preHandler: authenticate }, async (request) => {
    const { id } = request.params as { id: string };
    return approveFollowup(id);
  });

  app.post("/api/followups/:id/cancel", { preHandler: authenticate }, async (request) => {
    const { id } = request.params as { id: string };
    return cancelFollowup(id);
  });
}
