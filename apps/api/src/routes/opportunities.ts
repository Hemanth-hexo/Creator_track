import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  getOpportunityDetail,
  listOpportunities,
  runScoring,
  transitionOpportunityStatus,
} from "@photography-outreach/opportunities";
import { OPPORTUNITY_STATUSES } from "@photography-outreach/shared";
import { authenticate } from "../auth.js";

export function registerOpportunityRoutes(app: FastifyInstance) {
  app.get(
    "/api/opportunities",
    {
      preHandler: authenticate,
      schema: {
        querystring: z.object({
          status: z.string().optional(),
          minScore: z.coerce.number().int().optional(),
          city: z.string().optional(),
          artistName: z.string().optional(),
          hasContact: z.coerce.boolean().optional(),
          limit: z.coerce.number().int().min(1).max(500).default(25),
          cursor: z.string().optional(),
        }),
      },
    },
    async (request) => {
      const q = request.query as {
        status?: string;
        minScore?: number;
        city?: string;
        artistName?: string;
        hasContact?: boolean;
        limit: number;
        cursor?: string;
      };
      const status = q.status
        ? (q.status.split(",").filter((s) => (OPPORTUNITY_STATUSES as readonly string[]).includes(s)) as never)
        : undefined;
      return listOpportunities(
        { status, minScore: q.minScore, city: q.city, artistName: q.artistName, hasContact: q.hasContact },
        q.limit,
        q.cursor,
      );
    },
  );

  app.get("/api/opportunities/:id", { preHandler: authenticate }, async (request) => {
    const { id } = request.params as { id: string };
    return getOpportunityDetail(id);
  });

  app.post("/api/opportunities/:id/score", { preHandler: authenticate }, async (request) => {
    const { id } = request.params as { id: string };
    return runScoring(id, "user");
  });

  app.patch(
    "/api/opportunities/:id/status",
    {
      preHandler: authenticate,
      schema: { body: z.object({ status: z.enum(OPPORTUNITY_STATUSES) }) },
    },
    async (request) => {
      const { id } = request.params as { id: string };
      const { status } = request.body as { status: (typeof OPPORTUNITY_STATUSES)[number] };
      await transitionOpportunityStatus(id, status, "user");
      return getOpportunityDetail(id);
    },
  );
}
