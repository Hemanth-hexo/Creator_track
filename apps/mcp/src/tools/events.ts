import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { discoverEvents, getDefaultEventProvider, getEvent, searchEvents } from "@photography-outreach/events";
import { processDiscoveredEvents } from "@photography-outreach/opportunities";
import { wrapTool } from "../toolHelper.js";
import { pageSchema, recordSchema } from "../schemas.js";

export function registerEventTools(server: McpServer) {
  server.tool(
    "fetch_events",
    "Triggers event discovery: runs every active discovery query (a web-search query, e.g. \"upcoming electronic music events in Bengaluru, India\") through the configured discovery provider (Tavily search + Groq extraction by default, both free-tier), upserts results (deduplicated by exact match and by fuzzy artist/date/venue match), and creates/scores opportunities for any new events. Safe to call repeatedly — it never creates duplicate events.",
    {},
    wrapTool(
      "fetch_events",
      z.object({
        discovery: z.object({
          provider: z.string(),
          targetsProcessed: z.number(),
          eventsSeen: z.number(),
          eventsCreated: z.number(),
          eventsUpdated: z.number(),
          duplicatesSkipped: z.number(),
          errors: z.array(z.object({ target: z.string(), message: z.string() })),
        }),
        opportunities: z.object({ processed: z.number() }),
      }),
      async () => {
        const provider = getDefaultEventProvider();
        const discovery = await discoverEvents(provider);
        const opportunities = await processDiscoveredEvents();
        return { discovery, opportunities };
      },
    ),
  );

  server.tool(
    "search_events",
    "Searches stored events by city, artist name, and/or date range. Returns a paginated list ordered by start date.",
    {
      city: z.string().optional(),
      artistName: z.string().optional(),
      dateFrom: z.string().datetime().optional(),
      dateTo: z.string().datetime().optional(),
      limit: z.number().int().min(1).max(100).optional(),
      cursor: z.string().optional(),
    },
    wrapTool("search_events", pageSchema, async (input) => {
      const { limit = 25, cursor, dateFrom, dateTo, ...rest } = input as {
        city?: string;
        artistName?: string;
        dateFrom?: string;
        dateTo?: string;
        limit?: number;
        cursor?: string;
      };
      return searchEvents(
        { ...rest, dateFrom: dateFrom ? new Date(dateFrom) : undefined, dateTo: dateTo ? new Date(dateTo) : undefined },
        limit,
        cursor,
      );
    }),
  );

  server.tool(
    "get_event",
    "Fetches one event by id, including its normalized artist and venue records.",
    { eventId: z.string() },
    wrapTool("get_event", recordSchema, async ({ eventId }: { eventId: string }) => getEvent(eventId)),
  );
}
