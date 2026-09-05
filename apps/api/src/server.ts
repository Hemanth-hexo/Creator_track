import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from "fastify-type-provider-zod";
import { loadEnv } from "@photography-outreach/shared";
import { errorHandler } from "./errorHandler.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerEventRoutes } from "./routes/events.js";
import { registerOpportunityRoutes } from "./routes/opportunities.js";
import { registerContactRoutes } from "./routes/contacts.js";
import { registerDraftRoutes } from "./routes/drafts.js";
import { registerFollowupRoutes } from "./routes/followups.js";
import { registerActivityRoutes } from "./routes/activity.js";
import { registerStatsRoutes } from "./routes/stats.js";
import { registerSettingsRoutes } from "./routes/settings.js";

export async function buildServer() {
  const env = loadEnv();

  const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.setErrorHandler(errorHandler);

  await app.register(cookie, { secret: env.SESSION_SECRET });
  await app.register(cors, { origin: true, credentials: true });
  await app.register(rateLimit, { max: 100, timeWindow: "1 minute" });

  // Auth and send endpoints get a tighter limit — they're the highest-consequence routes.
  const strict = { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } };

  await app.register(async (instance) => {
    registerAuthRoutes(instance, strict);
  });
  await app.register(async (instance) => {
    registerEventRoutes(instance);
    registerOpportunityRoutes(instance);
    registerContactRoutes(instance);
    registerDraftRoutes(instance, strict);
    registerFollowupRoutes(instance);
    registerActivityRoutes(instance);
    registerStatsRoutes(instance);
    registerSettingsRoutes(instance);
  });

  app.get("/health", async () => ({ status: "ok" }));

  return app;
}
