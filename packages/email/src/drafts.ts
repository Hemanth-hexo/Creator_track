import { prisma } from "@photography-outreach/database";
import { transitionOpportunityStatus } from "@photography-outreach/opportunities";
import { AppError, NotFoundError, ValidationError, createLogger } from "@photography-outreach/shared";

const logger = createLogger("email:drafts");

export interface UpdateDraftInput {
  subject?: string;
  body?: string;
  cta?: string;
  editedBy: string;
}

/**
 * Edits a draft. Per the versioning requirement, the previously generated
 * (or previously edited) content is never overwritten — every edit appends a
 * new email_versions row, and the draft's own fields move to the new values.
 */
export async function updateDraft(draftId: string, input: UpdateDraftInput) {
  const draft = await prisma.emailDraft.findUnique({ where: { id: draftId } });
  if (!draft) throw new NotFoundError("EmailDraft", draftId);
  if (draft.status === "sent") {
    throw new AppError("CONFLICT", "Cannot edit a draft that has already been sent");
  }

  const nextSubject = input.subject ?? draft.subject;
  const nextBody = input.body ?? draft.body;
  const nextCta = input.cta ?? draft.cta ?? undefined;

  return prisma.$transaction(async (tx) => {
    const updated = await tx.emailDraft.update({
      where: { id: draftId },
      data: { subject: nextSubject, body: nextBody, cta: nextCta, status: "edited" },
    });

    await tx.emailVersion.create({
      data: {
        draftId,
        versionType: "edited",
        subject: nextSubject,
        body: nextBody,
        createdBy: input.editedBy,
      },
    });

    await tx.activityLog.create({
      data: {
        opportunityId: draft.opportunityId,
        type: "email_edited",
        message: `Draft edited by ${input.editedBy}`,
        actor: "user",
        metadata: { draftId },
      },
    });

    return updated;
  });
}

export async function approveDraft(draftId: string, approvedBy: string) {
  const draft = await prisma.emailDraft.findUnique({ where: { id: draftId } });
  if (!draft) throw new NotFoundError("EmailDraft", draftId);
  if (!["draft", "edited"].includes(draft.status)) {
    throw new AppError("CONFLICT", `Cannot approve a draft in status "${draft.status}"`);
  }
  if (!draft.contactId) {
    throw new ValidationError("Cannot approve a draft with no recipient contact attached");
  }

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.emailDraft.update({
      where: { id: draftId },
      data: { status: "approved", approvedAt: new Date(), approvedBy },
    });
    await tx.activityLog.create({
      data: {
        opportunityId: draft.opportunityId,
        type: "email_approved",
        message: `Draft approved by ${approvedBy}`,
        actor: "user",
        metadata: { draftId },
      },
    });
    return result;
  });

  const opportunity = await prisma.opportunity.findUnique({ where: { id: draft.opportunityId } });
  if (opportunity?.status === "drafted") {
    await transitionOpportunityStatus(draft.opportunityId, "approved", "user");
  }

  logger.info({ draftId, approvedBy }, "approveDraft");
  return updated;
}

export async function rejectDraft(draftId: string, rejectedBy: string, reason?: string) {
  const draft = await prisma.emailDraft.findUnique({ where: { id: draftId } });
  if (!draft) throw new NotFoundError("EmailDraft", draftId);
  if (draft.status === "sent") {
    throw new AppError("CONFLICT", "Cannot reject a draft that has already been sent");
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.emailDraft.update({
      where: { id: draftId },
      data: { status: "rejected", rejectedAt: new Date(), rejectionReason: reason },
    });
    await tx.activityLog.create({
      data: {
        opportunityId: draft.opportunityId,
        type: "email_rejected",
        message: `Draft rejected by ${rejectedBy}${reason ? `: ${reason}` : ""}`,
        actor: "user",
        metadata: { draftId, reason },
      },
    });
    return updated;
  });
}

export async function getDraft(draftId: string) {
  const draft = await prisma.emailDraft.findUnique({
    where: { id: draftId },
    include: { versions: { orderBy: { generatedAt: "asc" } }, contact: true, outreach: true },
  });
  if (!draft) throw new NotFoundError("EmailDraft", draftId);
  return draft;
}
