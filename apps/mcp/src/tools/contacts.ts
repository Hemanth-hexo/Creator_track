import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  addContact,
  getContacts,
  getDefaultResearchProvider,
  researchOpportunity,
  setPrimaryContact,
} from "@photography-outreach/research";
import { wrapTool } from "../toolHelper.js";
import { recordSchema } from "../schemas.js";

export function registerContactTools(server: McpServer) {
  server.tool(
    "add_contact",
    "Manually attaches a human-verified contact (name/email/etc.) to an opportunity, and makes it the opportunity's contact right away. Every contact must record where it came from. Idempotent: re-adding the same email for the same organization returns the existing contact.",
    {
      opportunityId: z.string(),
      name: z.string().optional(),
      role: z.string().optional(),
      email: z.string().email(),
      phone: z.string().optional(),
      organizationName: z.string().optional(),
      sourceUrl: z.string().url().optional(),
    },
    wrapTool("add_contact", recordSchema, async (input) => {
      const { opportunityId, ...rest } = input as {
        opportunityId: string;
        name?: string;
        role?: string;
        email: string;
        phone?: string;
        organizationName?: string;
        sourceUrl?: string;
      };
      return addContact({ opportunityId, ...rest, source: "manual" });
    }),
  );

  server.tool(
    "get_contacts",
    "Lists the contacts known for an opportunity (via its attached organization, or its primary contact) — includes both manually-added and research-discovered candidates.",
    { opportunityId: z.string() },
    wrapTool("get_contacts", z.array(recordSchema), async ({ opportunityId }: { opportunityId: string }) =>
      getContacts(opportunityId),
    ),
  );

  server.tool(
    "research_opportunity",
    "Runs automated research (web search + extraction, free-tier by default) to find the organization behind the event and any public booking/press contacts. Never bypasses auth/CAPTCHA/paywalls, and never invents an email — every candidate contact requires a real cited source URL. Persists candidates as contacts but does NOT set any of them as the opportunity's primary contact automatically — call select_contact to choose one, keeping a human in the loop for who actually gets emailed.",
    { opportunityId: z.string() },
    wrapTool("research_opportunity", recordSchema, async ({ opportunityId }: { opportunityId: string }) => {
      const provider = getDefaultResearchProvider();
      return researchOpportunity(opportunityId, provider);
    }),
  );

  server.tool(
    "select_contact",
    "Marks one existing contact (manually added or research-discovered) as the opportunity's primary contact to use for outreach, and advances the pipeline accordingly. This is the human-in-the-loop step after research_opportunity surfaces candidates.",
    { opportunityId: z.string(), contactId: z.string() },
    wrapTool("select_contact", recordSchema, async (input) => {
      const { opportunityId, contactId } = input as { opportunityId: string; contactId: string };
      return setPrimaryContact(opportunityId, contactId, "user");
    }),
  );
}
