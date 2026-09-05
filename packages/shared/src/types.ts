/**
 * Central status/enum vocabulary shared by every package and by the Prisma
 * schema's string enums (kept as plain string unions here so packages that
 * don't depend on Prisma — e.g. ai/email prompt code — don't need it either).
 */

export const OPPORTUNITY_STATUSES = [
  "discovered",
  "qualified",
  "researching",
  "contact_found",
  "drafted",
  "approved",
  "sent",
  "follow_up",
  "replied",
  "booked",
  "completed",
  "rejected",
  "dead",
] as const;
export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number];

export const EMAIL_DRAFT_STATUSES = ["draft", "edited", "approved", "rejected", "sent"] as const;
export type EmailDraftStatus = (typeof EMAIL_DRAFT_STATUSES)[number];

export const EMAIL_VERSION_TYPES = ["generated", "edited", "sent"] as const;
export type EmailVersionType = (typeof EMAIL_VERSION_TYPES)[number];

export const OUTREACH_STATUSES = ["sent", "failed", "bounced"] as const;
export type OutreachStatus = (typeof OUTREACH_STATUSES)[number];

export const FOLLOWUP_STATUSES = ["scheduled", "approved", "sent", "cancelled"] as const;
export type FollowupStatus = (typeof FOLLOWUP_STATUSES)[number];

export const ORGANIZATION_TYPES = ["venue", "promoter", "artist_mgmt", "label", "other"] as const;
export type OrganizationType = (typeof ORGANIZATION_TYPES)[number];

export const ACTIVITY_LOG_TYPES = [
  "event_discovered",
  "event_updated",
  "opportunity_created",
  "opportunity_scored",
  "research_performed",
  "contact_discovered",
  "email_generated",
  "email_edited",
  "email_approved",
  "email_rejected",
  "email_sent",
  "email_failed",
  "followup_scheduled",
  "followup_sent",
  "response_received",
  "opportunity_status_changed",
] as const;
export type ActivityLogType = (typeof ACTIVITY_LOG_TYPES)[number];

export type ActivityActor = "system" | "user" | "job";

/**
 * Valid forward transitions for an opportunity's pipeline stage. Anything not
 * listed here (other than the terminal "rejected"/"dead" escape hatches,
 * reachable from any non-terminal state) is an invalid transition.
 */
export const OPPORTUNITY_TRANSITIONS: Record<OpportunityStatus, OpportunityStatus[]> = {
  discovered: ["qualified", "rejected", "dead"],
  qualified: ["researching", "rejected", "dead"],
  researching: ["contact_found", "qualified", "rejected", "dead"],
  contact_found: ["drafted", "rejected", "dead"],
  drafted: ["approved", "rejected", "dead"],
  approved: ["sent", "rejected", "dead"],
  sent: ["follow_up", "replied", "booked", "dead"],
  follow_up: ["replied", "booked", "dead"],
  replied: ["booked", "dead"],
  booked: ["completed", "dead"],
  completed: [],
  rejected: [],
  dead: [],
};

export function canTransitionOpportunity(
  from: OpportunityStatus,
  to: OpportunityStatus,
): boolean {
  return OPPORTUNITY_TRANSITIONS[from]?.includes(to) ?? false;
}
