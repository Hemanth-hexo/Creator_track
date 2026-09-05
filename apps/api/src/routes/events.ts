import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { discoverEvents, getDefaultEventProvider, getEvent, searchEvents } from "@photography-outreach/events";
import { processDiscoveredEvents } from "@photography-outreach/opportunities";
import { authenticate } from "../auth.js";
import { triggerJobAsync } from "../jobs/scheduler.js";

export function registerEventRoutes(app: FastifyInstance) {
  app.get(
    "/api/events",
    {
      preHandler: authenticate,
      schema: {
        querystring: z.object({
          city: z.string().optional(),
          artistName: z.string().optional(),
          dateFrom: z.coerce.date().optional(),
          dateTo: z.coerce.date().optional(),
          limit: z.coerce.number().int().min(1).max(100).default(25),
          cursor: z.string().optional(),
        }),
      },
    },
    async (request) => {
      const { limit, cursor, ...filters } = request.query as {
        city?: string;
        artistName?: string;
        dateFrom?: Date;
        dateTo?: Date;
        limit: number;
        cursor?: string;
      };
      return searchEvents(filters, limit, cursor);
    },
  );

  app.get("/api/events/:id", { preHandler: authenticate }, async (request) => {
    const { id } = request.params as { id: string };
    return getEvent(id);
  });

  // Discovery is several real search+LLM round trips and can run past a
  // host's proxy timeout, so this kicks the job off and returns immediately;
  // the caller polls GET /api/jobs/:id for the result (see routes/jobs.ts).
  app.post("/api/events/discover", { preHandler: authenticate }, async (_request, reply) => {
    const jobId = await triggerJobAsync("manual_event_discovery", async () => {
      const provider = getDefaultEventProvider();
      const discoveryStats = await discoverEvents(provider);
      const opportunityStats = await processDiscoveredEvents();
      return { discovery: discoveryStats, opportunities: opportunityStats };
    });
    reply.code(202);
    return { jobId, status: "running" };
  });
}
