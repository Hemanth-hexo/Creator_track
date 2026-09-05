import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getOpportunityDetail, listOpportunities, runScoring } from "@photography-outreach/opportunities";
import { OPPORTUNITY_STATUSES } from "@photography-outreach/shared";
import { wrapTool } from "../toolHelper.js";
import { pageSchema, recordSchema, scoreResultSchema } from "../schemas.js";

export function registerOpportunityTools(server: McpServer) {
  server.tool(
    "get_opportunities",
    "Lists opportunities with optional filters (status, minimum score, city, artist name, whether a contact is attached) and pagination, ordered by score descending.",
    {
      status: z.enum(OPPORTUNITY_STATUSES).array().optional(),
      minScore: z.number().int().min(0).max(100).optional(),
      city: z.string().optional(),
      artistName: z.string().optional(),
      hasContact: z.boolean().optional(),
      limit: z.number().int().min(1).max(100).optional(),
      cursor: z.string().optional(),
    },
    wrapTool("get_opportunities", pageSchema, async (input) => {
      const { limit = 25, cursor, ...filters } = input as {
        status?: (typeof OPPORTUNITY_STATUSES)[number][];
        minScore?: number;
        city?: string;
        artistName?: string;
        hasContact?: boolean;
        limit?: number;
        cursor?: string;
      };
      return listOpportunities(filters, limit, cursor);
    }),
  );

  server.tool(
    "get_opportunity",
    "Fetches full detail for one opportunity: event/artist/venue, organization, primary contact, score + reasons, email drafts and their versions, outreach history, follow-ups, and the full activity timeline.",
    { opportunityId: z.string() },
    wrapTool("get_opportunity", recordSchema, async ({ opportunityId }: { opportunityId: string }) =>
      getOpportunityDetail(opportunityId),
    ),
  );

  server.tool(
    "score_opportunity",
    "Recomputes and persists the opportunity score and its explanation. Idempotent — safe to call repeatedly; each call logs a fresh opportunity_scored activity entry with the current reasons.",
    { opportunityId: z.string() },
    wrapTool(
      "score_opportunity",
      scoreResultSchema,
      async ({ opportunityId }: { opportunityId: string }) => runScoring(opportunityId, "system"),
    ),
  );
}
