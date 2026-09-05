import type { FastifyInstance } from "fastify";
import { getStatistics } from "@photography-outreach/opportunities";
import { authenticate } from "../auth.js";

export function registerStatsRoutes(app: FastifyInstance) {
  app.get("/api/stats", { preHandler: authenticate }, async () => {
    return getStatistics();
  });
}
