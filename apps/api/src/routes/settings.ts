import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@photography-outreach/database";
import { authenticate } from "../auth.js";

export function registerSettingsRoutes(app: FastifyInstance) {
  app.get("/api/settings/profile", { preHandler: authenticate }, async () => {
    return prisma.photographerProfile.findUnique({ where: { id: "default" } });
  });

  app.put(
    "/api/settings/profile",
    {
      preHandler: authenticate,
      schema: {
        body: z.object({
          displayName: z.string(),
          services: z.array(z.string()),
          experienceBullets: z.array(z.string()),
          styleKeywords: z.array(z.string()),
          targetCities: z.array(z.string()),
          targetGenres: z.array(z.string()),
          portfolioUrl: z.string().url().optional(),
        }),
      },
    },
    async (request) => {
      const body = request.body as {
        displayName: string;
        services: string[];
        experienceBullets: string[];
        styleKeywords: string[];
        targetCities: string[];
        targetGenres: string[];
        portfolioUrl?: string;
      };
      return prisma.photographerProfile.upsert({
        where: { id: "default" },
        update: body,
        create: { id: "default", ...body },
      });
    },
  );

  app.get("/api/settings/discovery-queries", { preHandler: authenticate }, async () => {
    return prisma.discoveryQuery.findMany({ orderBy: { query: "asc" } });
  });

  app.post(
    "/api/settings/discovery-queries",
    {
      preHandler: authenticate,
      schema: {
        body: z.object({ query: z.string().min(1), location: z.string().optional(), notes: z.string().optional() }),
      },
    },
    async (request) => {
      const { query, location, notes } = request.body as { query: string; location?: string; notes?: string };
      return prisma.discoveryQuery.upsert({
        where: { query },
        update: { active: true, location, notes },
        create: { query, location, notes, active: true },
      });
    },
  );

  app.patch(
    "/api/settings/discovery-queries/:id",
    { preHandler: authenticate, schema: { body: z.object({ active: z.boolean() }) } },
    async (request) => {
      const { id } = request.params as { id: string };
      const { active } = request.body as { active: boolean };
      return prisma.discoveryQuery.update({ where: { id }, data: { active } });
    },
  );
}
