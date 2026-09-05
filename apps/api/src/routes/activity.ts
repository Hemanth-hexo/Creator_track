import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getActivityLog } from "@photography-outreach/opportunities";
import { authenticate } from "../auth.js";

export function registerActivityRoutes(app: FastifyInstance) {
  app.get(
    "/api/activity",
    {
      preHandler: authenticate,
      schema: {
        querystring: z.object({
          opportunityId: z.string().optional(),
          since: z.coerce.date().optional(),
          limit: z.coerce.number().int().min(1).max(200).default(50),
        }),
      },
    },
    async (request) => {
      const { opportunityId, since, limit } = request.query as {
        opportunityId?: string;
        since?: Date;
        limit: number;
      };
      return getActivityLog({ opportunityId, since }, limit);
    },
  );
}
