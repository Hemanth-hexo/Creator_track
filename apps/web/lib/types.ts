export interface EventRecord {
  id: string;
  name: string;
  artistName: string;
  venueName: string | null;
  venueCity: string | null;
  startsAt: string;
  eventUrl: string | null;
  description: string | null;
  source: string;
  confidence: number | null;
  discoverySourceUrl: string | null;
}

export interface ContactRecord {
  id: string;
  name: string | null;
  role: string | null;
  email: string;
  phone: string | null;
  source: string;
  sourceUrl: string | null;
}

export interface ScoreReason {
  rule: string;
  points: number;
  explanation: string;
}

export interface OpportunityRecord {
  id: string;
  eventId: string;
  score: number;
  scoreReasons: ScoreReason[] | null;
  status: string;
  event: EventRecord;
  primaryContact: ContactRecord | null;
  organization: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface EmailVersionRecord {
  id: string;
  versionType: "generated" | "edited" | "sent";
  subject: string;
  body: string;
  modelUsed: string | null;
  generatedAt: string;
  createdBy: string | null;
}

export interface EmailDraftRecord {
  id: string;
  opportunityId: string;
  subject: string;
  body: string;
  personalizationReasoning: string | null;
  suggestedService: string | null;
  portfolioReference: string | null;
  cta: string | null;
  status: "draft" | "edited" | "approved" | "rejected" | "sent";
  versions: EmailVersionRecord[];
  contact: ContactRecord | null;
}

export interface ActivityLogRecord {
  id: string;
  type: string;
  message: string;
  actor: string;
  createdAt: string;
  metadata: Record<string, unknown> | null;
}

export interface OpportunityDetail extends OpportunityRecord {
  emailDrafts: EmailDraftRecord[];
  activityLogs: ActivityLogRecord[];
  outreach: Array<{ id: string; recipientEmail: string; sentAt: string | null; status: string }>;
  followups: Array<{ id: string; scheduledFor: string; status: string }>;
}

export interface Statistics {
  byStatus: Record<string, number>;
  draftedCount: number;
  awaitingApprovalCount: number;
  sentThisWeek: number;
  followupsDue: number;
}

export interface PhotographerProfile {
  id: string;
  displayName: string;
  services: string[];
  experienceBullets: string[];
  styleKeywords: string[];
  targetCities: string[];
  targetGenres: string[];
  portfolioUrl: string | null;
}

export interface DiscoveryQuery {
  id: string;
  query: string;
  location: string | null;
  active: boolean;
  notes: string | null;
}
