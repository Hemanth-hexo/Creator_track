-- Enforces "one active scheduled follow-up per outreach" at the database
-- level (Prisma's schema DSL has no partial-unique-index syntax, so this is
-- hand-written). The application layer (packages/email/src/followups.ts)
-- already checks for an existing scheduled follow-up before creating one;
-- this is the hard backstop against a race or a bypass of that check.
CREATE UNIQUE INDEX "followups_one_scheduled_per_outreach"
  ON "followups" ("outreach_id")
  WHERE "status" = 'scheduled';
