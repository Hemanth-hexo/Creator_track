import { prisma } from "@photography-outreach/database";
import { NotFoundError, ValidationError } from "@photography-outreach/shared";
import { advanceThroughChain } from "./statusChain.js";
import type { AddContactInput } from "./types.js";

const CONTACT_FOUND_CHAIN = ["qualified", "researching", "contact_found"] as const;

/**
 * Manual, human-sourced contact entry — the Phase 1 stand-in for automated
 * research (see types.ts). Idempotent: re-adding the same email for the same
 * organization returns the existing contact rather than duplicating it.
 */
export async function addContact(input: AddContactInput) {
  if (!input.email || !input.email.includes("@")) {
    throw new ValidationError("A valid email address is required");
  }

  const opportunity = await prisma.opportunity.findUnique({ where: { id: input.opportunityId } });
  if (!opportunity) throw new NotFoundError("Opportunity", input.opportunityId);

  let organizationId: string | undefined;
  if (input.organizationName) {
    const org = await prisma.organization.upsert({
      where: { name_type: { name: input.organizationName, type: "other" } },
      update: {},
      create: { name: input.organizationName, type: "other" },
    });
    organizationId = org.id;
  }

  let contact = await prisma.contact.findFirst({
    where: { email: input.email, organizationId: organizationId ?? null },
  });

  if (!contact) {
    contact = await prisma.contact.create({
      data: {
        organizationId,
        name: input.name,
        role: input.role,
        email: input.email,
        phone: input.phone,
        source: input.source,
        sourceUrl: input.sourceUrl,
        confidence: input.confidence ?? 80,
      },
    });
    await prisma.activityLog.create({
      data: {
        opportunityId: input.opportunityId,
        type: "contact_discovered",
        message: `Contact added: ${contact.email} (source: ${input.source})`,
        actor: "user",
        metadata: { contactId: contact.id, source: input.source, sourceUrl: input.sourceUrl },
      },
    });
  }

  const updates: { organizationId?: string; primaryContactId?: string } = {};
  if (!opportunity.primaryContactId) updates.primaryContactId = contact.id;
  if (organizationId && !opportunity.organizationId) updates.organizationId = organizationId;
  if (Object.keys(updates).length > 0) {
    await prisma.opportunity.update({ where: { id: opportunity.id }, data: updates });
  }

  await advanceThroughChain(opportunity.id, opportunity.status, [...CONTACT_FOUND_CHAIN], "discovered", "user");

  return contact;
}

/**
 * Explicitly makes one existing contact the opportunity's primary contact —
 * used both by manual re-selection and by the "use this suggested contact"
 * action after automated research. Unlike addContact's implicit
 * only-if-unset behavior, this always applies the human's explicit choice.
 */
export async function setPrimaryContact(opportunityId: string, contactId: string, actor: "user" | "system" = "user") {
  const [opportunity, contact] = await Promise.all([
    prisma.opportunity.findUnique({ where: { id: opportunityId } }),
    prisma.contact.findUnique({ where: { id: contactId } }),
  ]);
  if (!opportunity) throw new NotFoundError("Opportunity", opportunityId);
  if (!contact) throw new NotFoundError("Contact", contactId);

  await prisma.opportunity.update({ where: { id: opportunityId }, data: { primaryContactId: contactId } });
  await prisma.activityLog.create({
    data: {
      opportunityId,
      type: "contact_discovered",
      message: `Selected ${contact.email} as the contact to use`,
      actor,
      metadata: { contactId },
    },
  });

  await advanceThroughChain(opportunityId, opportunity.status, [...CONTACT_FOUND_CHAIN], "discovered", actor);
  return contact;
}

export async function getContacts(opportunityId: string) {
  const opportunity = await prisma.opportunity.findUnique({
    where: { id: opportunityId },
    include: { primaryContact: true, organization: { include: { contacts: true } } },
  });
  if (!opportunity) throw new NotFoundError("Opportunity", opportunityId);

  const contacts = opportunity.organization?.contacts ?? (opportunity.primaryContact ? [opportunity.primaryContact] : []);
  return contacts;
}
