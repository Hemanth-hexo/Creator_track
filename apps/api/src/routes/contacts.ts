import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { addContact, getContacts, getDefaultResearchProvider, researchOpportunity, setPrimaryContact } from "@photography-outreach/research";
import { authenticate } from "../auth.js";

export function registerContactRoutes(app: FastifyInstance) {
  app.get("/api/opportunities/:id/contacts", { preHandler: authenticate }, async (request) => {
    const { id } = request.params as { id: string };
    return getContacts(id);
  });

  app.post(
    "/api/opportunities/:id/contacts",
    {
      preHandler: authenticate,
      schema: {
        body: z.object({
          name: z.string().optional(),
          role: z.string().optional(),
          email: z.string().email(),
          phone: z.string().optional(),
          organizationName: z.string().optional(),
          sourceUrl: z.string().url().optional(),
        }),
      },
    },
    async (request) => {
      const { id } = request.params as { id: string };
      const body = request.body as {
        name?: string;
        role?: string;
        email: string;
        phone?: string;
        organizationName?: string;
        sourceUrl?: string;
      };
      return addContact({ opportunityId: id, ...body, source: "manual" });
    },
  );

  app.post("/api/opportunities/:id/research", { preHandler: authenticate }, async (request) => {
    const { id } = request.params as { id: string };
    const provider = getDefaultResearchProvider();
    return researchOpportunity(id, provider);
  });

  app.post(
    "/api/opportunities/:id/contacts/:contactId/select",
    { preHandler: authenticate },
    async (request) => {
      const { id, contactId } = request.params as { id: string; contactId: string };
      return setPrimaryContact(id, contactId, "user");
    },
  );
}
