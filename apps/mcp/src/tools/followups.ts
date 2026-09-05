import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { scheduleFollowup } from "@photography-outreach/email";
import { wrapTool } from "../toolHelper.js";
import { recordSchema } from "../schemas.js";

export function registerFollowupTools(server: McpServer) {
  server.tool(
    "schedule_followup",
    "Schedules a follow-up suggestion N days after a sent outreach email. Idempotent: one active scheduled follow-up per outreach — calling this again for the same outreach returns the existing one. This never sends anything by itself; a follow-up still goes through the full generate/review/approve/send pipeline like any other email.",
    { opportunityId: z.string(), outreachId: z.string(), daysFromNow: z.number().int().min(1).max(60).default(5) },
    wrapTool("schedule_followup", recordSchema, async (input) => {
      const { opportunityId, outreachId, daysFromNow } = input as {
        opportunityId: string;
        outreachId: string;
        daysFromNow: number;
      };
      return scheduleFollowup(opportunityId, outreachId, daysFromNow);
    }),
  );
}
