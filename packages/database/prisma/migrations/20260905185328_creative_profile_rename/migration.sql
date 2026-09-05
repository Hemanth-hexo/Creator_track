-- Renames photographer_profile -> creative_profile and adds a `craft`
-- column, generalizing the tool beyond photography specifically. Written by
-- hand (rename + add-column) rather than letting Prisma diff this as a
-- drop-and-recreate, since real seeded/edited profile data already exists
-- in this table and must not be lost.
ALTER TABLE "photographer_profile" RENAME TO "creative_profile";
ALTER TABLE "creative_profile" ADD COLUMN "craft" TEXT NOT NULL DEFAULT 'photography';
