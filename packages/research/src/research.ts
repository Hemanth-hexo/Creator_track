import { prisma } from "@photography-outreach/database";
import type { OrganizationType } from "@photography-outreach/database";
import { NotFoundError, createLogger, withLogging } from "@photography-outreach/shared";
import { advanceThroughChain } from "./statusChain.js";
import type { ResearchProvider } from "./types.js";

const logger = createLogger("research:orchestration");

/**
 * Runs automated research for an opportunity (Phase 2): finds the
 * organization behind the event's venue/artist and any public booking/press
 * contacts, via the given ResearchProvider. Persists everything it finds as
 * real Contact rows tied to the (possibly newly-created) Organization, but
 * — per the human-review-first philosophy that governs email sending too —
 * never sets any of them as the opportunity's primary contact automatically.
 * A human picks which one to use via setPrimaryContact (contacts.ts).
 */
export async function researchOpportunity(opportunityId: string, provider: ResearchProvider) {
  return withLogging(logger, { operation: "researchOpportunity", opportunityId }, async () => {
    const opportunity = await prisma.opportunity.findUnique({
      where: { id: opportunityId },
      include: { event: true, organization: true },
    });
    if (!opportunity) throw new NotFoundError("Opportunity", opportunityId);

    const result = await provider.research({
      organizationName: opportunity.organization?.name,
      venueName: opportunity.event.venueName ?? undefined,
    });

    let organizationId = opportunity.organizationId ?? undefined;
    if (result.organization) {
      const orgType = (result.organization.type ?? "other") as OrganizationType;
      const org = await prisma.organization.upsert({
        where: { name_type: { name: result.organization.name, type: orgType } },
        update: { website: result.organization.website },
        create: {
          name: result.organization.name,
          type: orgType,
          website: result.organization.website,
        },
      });
      organizationId = org.id;
    }

    const savedContacts = [];
    for (const found of result.contacts) {
      const existing = await prisma.contact.findFirst({
        where: { email: found.email, organizationId: organizationId ?? null },
      });
      const contact =
        existing ??
        (await prisma.contact.create({
          data: {
            organizationId,
            name: found.name,
            role: found.role,
            email: found.email,
            phone: found.phone,
            source: provider.name,
            sourceUrl: found.sourceUrl,
            confidence: found.confidence,
          },
        }));
      savedContacts.push(contact);

      if (!existing) {
        await prisma.activityLog.create({
          data: {
            opportunityId,
            type: "contact_discovered",
            message: `Research found a candidate contact: ${contact.email} (source: ${provider.name})`,
            actor: "system",
            metadata: { contactId: contact.id, sourceUrl: found.sourceUrl, confidence: found.confidence },
          },
        });
      }
    }

    await prisma.activityLog.create({
      data: {
        opportunityId,
        type: "research_performed",
        message:
          savedContacts.length > 0
            ? `Research found ${savedContacts.length} candidate contact(s) — pick one to use`
            : "Research found no verifiable public contacts",
        actor: "system",
        metadata: { provider: provider.name, organizationFound: Boolean(result.organization) },
      },
    });

    const updates: { organizationId?: string } = {};
    if (organizationId && !opportunity.organizationId) updates.organizationId = organizationId;
    if (Object.keys(updates).length > 0) {
      await prisma.opportunity.update({ where: { id: opportunityId }, data: updates });
    }

    await advanceThroughChain(opportunityId, opportunity.status, ["qualified", "researching"], "discovered", "system");

    return { organization: result.organization, contacts: savedContacts };
  });
}
