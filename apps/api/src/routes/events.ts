import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { discoverEvents, getDefaultEventProvider, getEvent, searchEvents } from "@photography-outreach/events";
import { processDiscoveredEvents } from "@photography-outreach/opportunities";
import { authenticate } from "../auth.js";

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

  app.post("/api/events/discover", { preHandler: authenticate }, async () => {
    const provider = getDefaultEventProvider();
    const discoveryStats = await discoverEvents(provider);
    const opportunityStats = await processDiscoveredEvents();
    return { discovery: discoveryStats, opportunities: opportunityStats };
  });
}
