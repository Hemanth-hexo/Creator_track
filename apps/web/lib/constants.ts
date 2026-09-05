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

export const PIPELINE_STAGES = [
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
] as const;

/** The primary forward path, used to offer a one-click "Advance" action on the pipeline board. */
export const NEXT_STAGE: Partial<Record<string, string>> = {
  discovered: "qualified",
  qualified: "researching",
  researching: "contact_found",
  contact_found: "drafted",
  drafted: "approved",
  approved: "sent",
  sent: "follow_up",
  follow_up: "replied",
  replied: "booked",
  booked: "completed",
};
