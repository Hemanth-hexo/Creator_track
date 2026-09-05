import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getActivityLog, getStatistics } from "@photography-outreach/opportunities";
import { getOutreachHistory } from "@photography-outreach/email";
import { wrapTool } from "../toolHelper.js";
import { recordSchema, statisticsSchema } from "../schemas.js";

export function registerActivityTools(server: McpServer) {
  server.tool(
    "get_outreach_history",
    "Lists every outreach (sent email) record for an opportunity, most recent first, including linked follow-ups.",
    { opportunityId: z.string() },
    wrapTool("get_outreach_history", z.array(recordSchema), async ({ opportunityId }: { opportunityId: string }) =>
      getOutreachHistory(opportunityId),
    ),
  );

  server.tool(
    "get_activity_log",
    "Fetches the activity timeline — optionally scoped to one opportunity and/or a since-timestamp — most recent first.",
    { opportunityId: z.string().optional(), since: z.string().datetime().optional(), limit: z.number().int().min(1).max(200).optional() },
    wrapTool("get_activity_log", z.array(recordSchema), async (input) => {
      const { opportunityId, since, limit } = input as { opportunityId?: string; since?: string; limit?: number };
      return getActivityLog({ opportunityId, since: since ? new Date(since) : undefined }, limit);
    }),
  );

  server.tool(
    "get_statistics",
    "Returns dashboard-level aggregate statistics: opportunity counts by pipeline status, drafts awaiting approval, emails sent this week, and follow-ups currently due.",
    {},
    wrapTool("get_statistics", statisticsSchema, async () => getStatistics()),
  );
}
