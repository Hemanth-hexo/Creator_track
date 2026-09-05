import type { OrganizationType } from "@photography-outreach/database";

/**
 * Shape any automated research source must produce. Phase 1 shipped no
 * implementation of this interface — contacts were entered by hand (see
 * contacts.ts). Phase 2's WebsiteResearchProvider (providers/website-research.ts)
 * is the first real implementation; the interface stayed unchanged so it
 * slots in without touching any caller.
 *
 * Any implementation MUST NOT bypass authentication, CAPTCHAs, or paywalls,
 * and every discovered contact must record where it came from.
 */
export interface ResearchProvider {
  readonly name: string;
  research(input: { organizationName?: string; website?: string; venueName?: string; eventUrl?: string }): Promise<{
    organization?: { name: string; website?: string; type?: OrganizationType };
    contacts: Array<{
      name?: string;
      role?: string;
      email: string;
      phone?: string;
      sourceUrl: string;
      confidence: number;
    }>;
  }>;
}

export interface AddContactInput {
  opportunityId: string;
  name?: string;
  role?: string;
  email: string;
  phone?: string;
  organizationName?: string;
  source: string;
  sourceUrl?: string;
  confidence?: number;
}
