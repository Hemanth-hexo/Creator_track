import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@photography-outreach/database";
import { ensureOpportunityForEvent, getOpportunityDetail, runScoring } from "@photography-outreach/opportunities";
import { addContact } from "@photography-outreach/research";
import { generateEmailDraft, setLLMProviderForTesting } from "@photography-outreach/ai";
import { approveDraft, getOutreachHistory, sendApprovedEmail, setTransportForTesting } from "@photography-outreach/email";

/**
 * Drives the whole Phase 1 loop end to end against a real Postgres (see
 * docker-compose.yml): fetch/store an event -> score -> attach a contact
 * (Phase 1's manual research stand-in) -> generate -> approve -> send
 * (mocked SMTP) -> verify the full activity timeline. The LLM and SMTP are
 * mocked; everything else — Prisma writes, scoring, the state machine, the
 * approval gate, idempotent send — is exercised for real.
 *
 * Requires DATABASE_URL to point at a reachable Postgres with migrations
 * applied: `docker compose up -d && pnpm db:migrate` from the repo root.
 */
describe("Phase 1 end-to-end outreach flow", () => {
  const sourceId = `e2e-${Date.now()}`;
  let eventId: string;

  beforeAll(async () => {
    await prisma.creativeProfile.upsert({
      where: { id: "default" },
      update: {},
      create: {
        id: "default",
        displayName: "E2E Test Photographer",
        craft: "concert photography",
        services: ["Concert photography"],
        experienceBullets: ["Shot free concerts for a local venue"],
        styleKeywords: ["low-light"],
        targetCities: ["Brooklyn"],
        targetGenres: ["electronic"],
        portfolioUrl: "https://example.com/portfolio",
      },
    });

    const event = await prisma.event.create({
      data: {
        source: "bandsintown",
        sourceId,
        name: "E2E Test Show",
        artistName: "E2E Test Artist",
        venueName: "E2E Test Venue",
        venueCity: "Brooklyn",
        venueCountry: "United States",
        startsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        eventUrl: "https://example.com/event",
        description: "A test show for the E2E suite.",
      },
    });
    eventId = event.id;

    setLLMProviderForTesting({
      name: "mock",
      async generateText() {
        return {
          modelUsed: "mock-model",
          text: JSON.stringify({
            subject: "Covering your Brooklyn show?",
            body: "Hi Jane, I'd love to shoot the E2E Test Show. Portfolio linked below — happy to send more samples.",
            personalizationReasoning: "Event is in a target city and genre.",
            suggestedService: "Concert photography",
            portfolioReference: "https://example.com/portfolio",
            cta: "Let me know if you'd like to see more samples.",
          }),
        };
      },
    });

    setTransportForTesting({
      // Minimal stand-in for nodemailer's Transporter — only sendMail is used by packages/email.
      sendMail: async () => ({ messageId: "test-message-id-123" }),
    } as never);
  });

  afterAll(async () => {
    setLLMProviderForTesting(undefined);
    setTransportForTesting(undefined);
    await prisma.activityLog.deleteMany({ where: { event: { sourceId } } }).catch(() => {});
    const opp = await prisma.opportunity.findUnique({ where: { eventId } });
    if (opp) {
      await prisma.outreach.deleteMany({ where: { opportunityId: opp.id } });
      await prisma.emailVersion.deleteMany({ where: { draft: { opportunityId: opp.id } } });
      await prisma.emailDraft.deleteMany({ where: { opportunityId: opp.id } });
      await prisma.activityLog.deleteMany({ where: { opportunityId: opp.id } });
      await prisma.opportunity.delete({ where: { id: opp.id } });
    }
    await prisma.contact.deleteMany({ where: { email: "jane@e2e-test.example.com" } });
    await prisma.event.delete({ where: { id: eventId } });
    await prisma.$disconnect();
  });

  it("creates and scores an opportunity for the discovered event", async () => {
    const { id, created } = await ensureOpportunityForEvent(eventId);
    expect(created).toBe(true);
    const result = await runScoring(id, "job");
    expect(result.score).toBeGreaterThan(0);
  });

  it("attaches a manually-verified contact and advances the pipeline", async () => {
    const opp = await prisma.opportunity.findUniqueOrThrow({ where: { eventId } });
    const contact = await addContact({
      opportunityId: opp.id,
      email: "jane@e2e-test.example.com",
      name: "Jane Doe",
      role: "Booking Manager",
      organizationName: "E2E Test Promoter",
      source: "manual",
      sourceUrl: "https://example.com/promoter",
    });
    expect(contact.email).toBe("jane@e2e-test.example.com");

    const detail = await getOpportunityDetail(opp.id);
    expect(detail.status).toBe("contact_found");
    expect(detail.primaryContactId).toBe(contact.id);
  });

  it("generates a draft that never invents unverified experience", async () => {
    const opp = await prisma.opportunity.findUniqueOrThrow({ where: { eventId } });
    const draft = await generateEmailDraft({ opportunityId: opp.id });
    expect(draft.status).toBe("draft");
    expect(draft.subject).toBeTruthy();

    const detail = await getOpportunityDetail(opp.id);
    expect(detail.status).toBe("drafted");
  });

  it("refuses to send until the draft is approved, then sends exactly once", async () => {
    const opp = await prisma.opportunity.findUniqueOrThrow({ where: { eventId } });
    const draft = await prisma.emailDraft.findFirstOrThrow({ where: { opportunityId: opp.id } });

    await expect(sendApprovedEmail(draft.id)).rejects.toThrow(/only approved drafts/i);

    await approveDraft(draft.id, "e2e-test-user");
    const outreach = await sendApprovedEmail(draft.id);
    expect(outreach.status).toBe("sent");

    // Idempotency: sending again returns the same outreach record, never a second send.
    const secondAttempt = await sendApprovedEmail(draft.id);
    expect(secondAttempt.id).toBe(outreach.id);

    const history = await getOutreachHistory(opp.id);
    expect(history).toHaveLength(1);
  });

  it("records a complete, ordered activity timeline for the opportunity", async () => {
    const opp = await prisma.opportunity.findUniqueOrThrow({ where: { eventId } });
    const detail = await getOpportunityDetail(opp.id);
    const types = detail.activityLogs.map((l) => l.type);

    expect(types).toEqual(
      expect.arrayContaining([
        "opportunity_created",
        "opportunity_scored",
        "contact_discovered",
        "opportunity_status_changed",
        "email_generated",
        "email_approved",
        "email_sent",
      ]),
    );
    expect(detail.status).toBe("sent");
  });
});
