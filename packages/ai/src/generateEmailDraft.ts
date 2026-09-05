import { prisma } from "@photography-outreach/database";
import type { Prisma } from "@photography-outreach/database";
import { transitionOpportunityStatus } from "@photography-outreach/opportunities";
import { NotFoundError, ValidationError, createLogger, parseLooseJson, withLogging } from "@photography-outreach/shared";
import { getLLMProvider } from "./provider.js";
import { buildOutreachEmailPrompt, OUTREACH_EMAIL_PROMPT_VERSION } from "./prompts/outreach-email.js";
import { emailDraftOutputSchema } from "./schemas.js";

const logger = createLogger("ai:generateEmailDraft");

export interface GenerateEmailDraftOptions {
  opportunityId: string;
  /** Regenerate even if an active (non-terminal) draft already exists. */
  force?: boolean;
}

/**
 * Generates a personalized outreach email draft for an opportunity.
 * Idempotent by default: if a draft already exists in draft/edited status,
 * returns it instead of creating a duplicate — pass force:true to regenerate.
 */
export async function generateEmailDraft({ opportunityId, force = false }: GenerateEmailDraftOptions) {
  return withLogging(logger, { operation: "generateEmailDraft", opportunityId }, async () => {
    const opportunity = await prisma.opportunity.findUnique({
      where: { id: opportunityId },
      include: { event: true, organization: true, primaryContact: true },
    });
    if (!opportunity) throw new NotFoundError("Opportunity", opportunityId);

    if (!force) {
      const existing = await prisma.emailDraft.findFirst({
        where: { opportunityId, status: { in: ["draft", "edited", "approved"] } },
        orderBy: { createdAt: "desc" },
        include: { contact: true },
      });
      if (existing) return existing;
    }

    const profile = await prisma.photographerProfile.findUnique({ where: { id: "default" } });
    if (!profile) {
      throw new ValidationError(
        "No photographer profile configured — set one up on the Settings page before generating emails",
      );
    }

    const promptCtx = {
      photographer: {
        displayName: profile.displayName,
        services: profile.services,
        experienceBullets: profile.experienceBullets,
        styleKeywords: profile.styleKeywords,
        portfolioUrl: profile.portfolioUrl,
      },
      event: {
        name: opportunity.event.name,
        artistName: opportunity.event.artistName,
        venueName: opportunity.event.venueName,
        venueCity: opportunity.event.venueCity,
        startsAt: opportunity.event.startsAt.toISOString(),
        description: opportunity.event.description,
        eventUrl: opportunity.event.eventUrl,
      },
      organizationName: opportunity.organization?.name ?? null,
      contact: opportunity.primaryContact
        ? {
            name: opportunity.primaryContact.name,
            role: opportunity.primaryContact.role,
            email: opportunity.primaryContact.email,
          }
        : null,
    };

    const { system, prompt } = buildOutreachEmailPrompt(promptCtx);
    const provider = getLLMProvider();
    const result = await provider.generateText({ system, prompt });
    const parsed = emailDraftOutputSchema.parse(parseLooseJson(result.text));

    const draft = await prisma.$transaction(async (tx) => {
      const created = await tx.emailDraft.create({
        data: {
          opportunityId,
          contactId: opportunity.primaryContactId ?? undefined,
          subject: parsed.subject,
          body: parsed.body,
          personalizationReasoning: parsed.personalizationReasoning,
          suggestedService: parsed.suggestedService,
          portfolioReference: parsed.portfolioReference,
          cta: parsed.cta,
          status: "draft",
        },
        include: { contact: true },
      });

      await tx.emailVersion.create({
        data: {
          draftId: created.id,
          versionType: "generated",
          subject: parsed.subject,
          body: parsed.body,
          modelUsed: result.modelUsed,
          promptVersion: OUTREACH_EMAIL_PROMPT_VERSION,
          retrievedContext: promptCtx as unknown as Prisma.InputJsonValue,
          createdBy: `llm:${provider.name}`,
        },
      });

      await tx.activityLog.create({
        data: {
          opportunityId,
          type: "email_generated",
          message: `Draft generated: "${parsed.subject}"`,
          actor: "system",
          metadata: { draftId: created.id, modelUsed: result.modelUsed, provider: provider.name },
        },
      });

      return created;
    });

    if (opportunity.status === "contact_found") {
      await transitionOpportunityStatus(opportunityId, "drafted", "system");
    }

    return draft;
  });
}
