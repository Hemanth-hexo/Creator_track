import type { FastifyInstance } from "fastify";
import { prisma } from "@photography-outreach/database";
import { authenticate } from "../auth.js";
import { NotFoundError } from "@photography-outreach/shared";

export function registerJobRoutes(app: FastifyInstance) {
  app.get("/api/jobs/:id", { preHandler: authenticate }, async (request) => {
    const { id } = request.params as { id: string };
    const job = await prisma.jobRun.findUnique({ where: { id } });
    if (!job) throw new NotFoundError("Job", id);
    return job;
  });
}
