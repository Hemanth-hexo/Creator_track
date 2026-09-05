import { loadEnv, createLogger } from "@photography-outreach/shared";
import { buildServer } from "./server.js";
import { startScheduler } from "./jobs/scheduler.js";

const logger = createLogger("api:main");

async function main() {
  const env = loadEnv();
  const app = await buildServer();

  await app.listen({ port: env.API_PORT, host: "0.0.0.0" });
  logger.info({ port: env.API_PORT }, "api_listening");

  startScheduler();
}

main().catch((error) => {
  logger.error({ err: error instanceof Error ? error.message : error }, "api_startup_failed");
  process.exitCode = 1;
});
