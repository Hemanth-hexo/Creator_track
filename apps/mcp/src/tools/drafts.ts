import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { generateEmailDraft } from "@photography-outreach/ai";
import { approveDraft, getDraft, rejectDraft, sendApprovedEmail, updateDraft } from "@photography-outreach/email";
import { wrapTool } from "../toolHelper.js";
import { recordSchema } from "../schemas.js";

export function registerDraftTools(server: McpServer) {
  server.tool(
    "generate_email_draft",
    "Generates a personalized outreach email draft for an opportunity using the configured LLM and the static photographer profile. Never invents experience/clients beyond the profile. Idempotent by default: returns the existing active draft (draft/edited/approved) instead of creating a duplicate; pass force=true to regenerate anyway. The draft is NEVER sent by this tool — it always requires separate human approval.",
    { opportunityId: z.string(), force: z.boolean().optional() },
    wrapTool("generate_email_draft", recordSchema, async (input) =>
      generateEmailDraft(input as { opportunityId: string; force?: boolean }),
    ),
  );

  server.tool(
    "get_email_draft",
    "Fetches an email draft by id, including its full version history (generated/edited/sent) and linked contact.",
    { draftId: z.string() },
    wrapTool("get_email_draft", recordSchema, async ({ draftId }: { draftId: string }) => getDraft(draftId)),
  );

  server.tool(
    "update_email_draft",
    "Edits a draft's subject/body/CTA. The previous version is preserved (never overwritten) as a new email_versions row; the draft moves to 'edited' status.",
    { draftId: z.string(), subject: z.string().optional(), body: z.string().optional(), cta: z.string().optional(), editedBy: z.string().default("mcp") },
    wrapTool("update_email_draft", recordSchema, async (input) => {
      const { draftId, editedBy, ...rest } = input as {
        draftId: string;
        subject?: string;
        body?: string;
        cta?: string;
        editedBy: string;
      };
      return updateDraft(draftId, { ...rest, editedBy });
    }),
  );

  server.tool(
    "approve_email_draft",
    "Marks a draft as approved by a human. This is the ONLY status from which send_email is allowed — no draft can be sent without going through this tool (or the equivalent dashboard action) first.",
    { draftId: z.string(), approvedBy: z.string().default("mcp") },
    wrapTool("approve_email_draft", recordSchema, async ({ draftId, approvedBy }: { draftId: string; approvedBy: string }) =>
      approveDraft(draftId, approvedBy),
    ),
  );

  server.tool(
    "reject_email_draft",
    "Marks a draft as rejected, optionally with a reason. A new draft can be generated afterward via generate_email_draft.",
    { draftId: z.string(), rejectedBy: z.string().default("mcp"), reason: z.string().optional() },
    wrapTool("reject_email_draft", recordSchema, async (input) => {
      const { draftId, rejectedBy, reason } = input as { draftId: string; rejectedBy: string; reason?: string };
      return rejectDraft(draftId, rejectedBy, reason);
    }),
  );

  server.tool(
    "send_email",
    "Sends an approved draft via the configured SMTP account. Fails if the draft is not in 'approved' status. Idempotent: if this draft has already been sent, returns the existing outreach record instead of sending a second time — it can never double-send.",
    { draftId: z.string() },
    wrapTool("send_email", recordSchema, async ({ draftId }: { draftId: string }) => sendApprovedEmail(draftId)),
  );
}
