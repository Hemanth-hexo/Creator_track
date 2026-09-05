import { z } from "zod";

/**
 * Prisma's nested include results are large and change shape with the
 * schema; rather than hand-duplicating the whole Prisma schema in zod, list
 * outputs are validated on structure (an array of records + pagination
 * cursor) and single-entity outputs are validated as a non-null record.
 * Scalar-shaped results (score, stats) get fully strict schemas below.
 */
export const recordSchema = z.record(z.string(), z.unknown());

export const pageSchema = z.object({
  items: z.array(recordSchema),
  nextCursor: z.string().nullable(),
});

export const scoreReasonSchema = z.object({
  rule: z.string(),
  points: z.number(),
  explanation: z.string(),
});

export const scoreResultSchema = z.object({
  score: z.number().int().min(0).max(100),
  reasons: z.array(scoreReasonSchema),
});

export const statisticsSchema = z.object({
  byStatus: z.record(z.string(), z.number()),
  draftedCount: z.number(),
  awaitingApprovalCount: z.number(),
  sentThisWeek: z.number(),
  followupsDue: z.number(),
});
