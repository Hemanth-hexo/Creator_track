import { prisma } from "@photography-outreach/database";
import { transitionOpportunityStatus } from "@photography-outreach/opportunities";
import { AppError, NotFoundError, createLogger, withLogging } from "@photography-outreach/shared";
import { markFollowupSent } from "./followups.js";
import { sendMail } from "./transport.js";

const logger = createLogger("email:send");

/**
 * Sends an approved draft. This is the one function in the whole system
 * that is allowed to put an email on the wire, and it enforces every
 * safety rail:
 *  - draft.status MUST be "approved" (never "draft"/"edited" — no first-contact
 *    email is ever sent without a human explicitly approving it)
 *  - a draft can only ever produce one Outreach row: outreach.email_draft_id
 *    is unique, so a retry (or a double-click, or a re-run of the same MCP
 *    tool call) returns the existing send instead of sending twice.
 */
export async function sendApprovedEmail(draftId: string) {
  return withLogging(logger, { operation: "sendApprovedEmail", draftId }, async () => {
    const existingOutreach = await prisma.outreach.findUnique({ where: { emailDraftId: draftId } });
    if (existingOutreach) {
      logger.info({ draftId, outreachId: existingOutreach.id }, "sendApprovedEmail:already_sent");
      return existingOutreach;
    }

    const draft = await prisma.emailDraft.findUnique({
      where: { id: draftId },
      include: { contact: true, opportunity: true },
    });
    if (!draft) throw new NotFoundError("EmailDraft", draftId);
    if (draft.status !== "approved") {
      throw new AppError(
        "CONFLICT",
        `Cannot send draft in status "${draft.status}" — only approved drafts may be sent`,
      );
    }
    if (!draft.contact) {
      throw new AppError("VALIDATION_ERROR", "Draft has no recipient contact attached");
    }

    try {
      const result = await sendMail({ to: draft.contact.email, subject: draft.subject, text: draft.body });

      const outreach = await prisma.$transaction(async (tx) => {
        await tx.emailVersion.create({
          data: {
            draftId,
            versionType: "sent",
            subject: draft.subject,
            body: draft.body,
            createdBy: "system",
          },
        });

        const outreach = await tx.outreach.create({
          data: {
            opportunityId: draft.opportunityId,
            emailDraftId: draftId,
            recipientEmail: draft.contact!.email,
            sentAt: new Date(),
            providerMessageId: result.messageId,
            status: "sent",
          },
        });

        await tx.emailDraft.update({ where: { id: draftId }, data: { status: "sent" } });

        await tx.activityLog.create({
          data: {
            opportunityId: draft.opportunityId,
            type: "email_sent",
            message: `Email sent to ${draft.contact!.email}`,
            actor: "user",
            metadata: { draftId, outreachId: outreach.id, providerMessageId: result.messageId },
          },
        });

        return outreach;
      });

      await transitionOpportunityStatus(draft.opportunityId, "sent", "user");

      // If this send is fulfilling an approved follow-up, link and close it
      // out — this is the one place a follow-up's lifecycle actually
      // reaches "sent," since a follow-up email goes through the exact same
      // generate/approve/send pipeline as a first-contact one and isn't
      // otherwise distinguishable from it.
      const approvedFollowup = await prisma.followup.findFirst({
        where: { opportunityId: draft.opportunityId, status: "approved" },
      });
      if (approvedFollowup) {
        await markFollowupSent(approvedFollowup.id, draftId);
      }

      return outreach;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await prisma.activityLog.create({
        data: {
          opportunityId: draft.opportunityId,
          type: "email_failed",
          message: `Send failed: ${message}`,
          actor: "system",
          metadata: { draftId, error: message },
        },
      });
      throw error;
    }
  });
}
