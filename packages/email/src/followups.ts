import { prisma } from "@photography-outreach/database";
import { ActivityActor, AppError, NotFoundError, createLogger } from "@photography-outreach/shared";

const logger = createLogger("email:followups");

/**
 * Schedules a follow-up suggestion N days after a sent outreach email.
 * Idempotent: one active "scheduled" follow-up per outreach — re-running the
 * daily follow-up job never creates duplicates.
 */
export async function scheduleFollowup(opportunityId: string, outreachId: string, daysFromNow = 5) {
  const existing = await prisma.followup.findFirst({ where: { outreachId, status: "scheduled" } });
  if (existing) return existing;

  const outreach = await prisma.outreach.findUnique({ where: { id: outreachId } });
  if (!outreach) throw new NotFoundError("Outreach", outreachId);

  const scheduledFor = new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000);
  const followup = await prisma.followup.create({
    data: { opportunityId, outreachId, scheduledFor, status: "scheduled" },
  });

  await prisma.activityLog.create({
    data: {
      opportunityId,
      type: "followup_scheduled",
      message: `Follow-up suggested for ${scheduledFor.toDateString()}`,
      actor: "job",
      metadata: { followupId: followup.id, outreachId },
    },
  });

  logger.info({ opportunityId, outreachId, followupId: followup.id }, "scheduleFollowup");
  return followup;
}

/** Finds a due, human-visible follow-up scheduled for today or earlier — surfaced for review, never auto-sent. */
export async function getDueFollowups() {
  return prisma.followup.findMany({
    where: { status: "scheduled", scheduledFor: { lte: new Date() } },
    include: { opportunity: { include: { event: true, primaryContact: true } } },
    orderBy: { scheduledFor: "asc" },
  });
}

/** Follow-ups a human already signed off on but hasn't sent yet — kept visible so an approval never silently falls out of view before the actual draft gets sent. */
export async function getApprovedFollowups() {
  return prisma.followup.findMany({
    where: { status: "approved" },
    include: { opportunity: { include: { event: true, primaryContact: true } } },
    orderBy: { scheduledFor: "asc" },
  });
}

/** A human explicitly signs off that this follow-up should proceed to drafting. Required before any send. */
export async function approveFollowup(followupId: string, actor: ActivityActor = "user") {
  const followup = await prisma.followup.findUnique({ where: { id: followupId } });
  if (!followup) throw new NotFoundError("Followup", followupId);
  if (followup.status !== "scheduled") {
    throw new AppError("CONFLICT", `Cannot approve a follow-up in status "${followup.status}"`);
  }
  const updated = await prisma.followup.update({ where: { id: followupId }, data: { status: "approved" } });
  await prisma.activityLog.create({
    data: {
      opportunityId: followup.opportunityId,
      type: "followup_approved",
      message: "Follow-up approved — generate and send its draft from the opportunity page",
      actor,
      metadata: { followupId },
    },
  });
  return updated;
}

export async function cancelFollowup(followupId: string, actor: ActivityActor = "user") {
  const followup = await prisma.followup.findUnique({ where: { id: followupId } });
  if (!followup) throw new NotFoundError("Followup", followupId);
  const updated = await prisma.followup.update({ where: { id: followupId }, data: { status: "cancelled" } });
  await prisma.activityLog.create({
    data: {
      opportunityId: followup.opportunityId,
      type: "followup_cancelled",
      message: "Follow-up cancelled",
      actor,
      metadata: { followupId },
    },
  });
  return updated;
}

/**
 * Links a (separately generated, edited, and approved) EmailDraft to an
 * approved follow-up and marks it sent once that draft's send has gone
 * through — reuses the exact same generate -> review -> approve -> send
 * pipeline as a first-contact email; this function only records the linkage.
 */
export async function markFollowupSent(followupId: string, draftId: string) {
  const followup = await prisma.followup.findUnique({ where: { id: followupId } });
  if (!followup) throw new NotFoundError("Followup", followupId);

  const updated = await prisma.followup.update({
    where: { id: followupId },
    data: { status: "sent", draftId },
  });

  await prisma.activityLog.create({
    data: {
      opportunityId: followup.opportunityId,
      type: "followup_sent",
      message: "Follow-up email sent",
      actor: "user",
      metadata: { followupId, draftId },
    },
  });

  return updated;
}
