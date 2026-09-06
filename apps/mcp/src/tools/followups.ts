import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { approveFollowup, cancelFollowup, getApprovedFollowups, getDueFollowups, scheduleFollowup } from "@photography-outreach/email";
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

  server.tool(
    "get_due_followups",
    "Lists follow-ups scheduled for today or earlier that a human hasn't approved yet — never auto-sent.",
    {},
    wrapTool("get_due_followups", z.array(recordSchema), async () => getDueFollowups()),
  );

  server.tool(
    "get_approved_followups",
    "Lists follow-ups a human already approved but hasn't sent yet (generate + approve + send the draft on the opportunity to complete one).",
    {},
    wrapTool("get_approved_followups", z.array(recordSchema), async () => getApprovedFollowups()),
  );

  server.tool(
    "approve_followup",
    "A human signs off that a due follow-up should proceed. Required before its draft can be sent — sending an approved draft on the same opportunity automatically marks the matching approved follow-up as sent.",
    { followupId: z.string() },
    wrapTool("approve_followup", recordSchema, async ({ followupId }: { followupId: string }) => approveFollowup(followupId)),
  );

  server.tool(
    "cancel_followup",
    "Cancels a scheduled or approved follow-up — it won't be suggested again for this outreach.",
    { followupId: z.string() },
    wrapTool("cancel_followup", recordSchema, async ({ followupId }: { followupId: string }) => cancelFollowup(followupId)),
  );
}
