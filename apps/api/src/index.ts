import { loadEnv, createLogger } from "@photography-outreach/shared";
import { buildServer } from "./server.js";
import { startScheduler } from "./jobs/scheduler.js";

const logger = createLogger("api:main");

async function main() {
  const env = loadEnv();
  const app = await buildServer();

  // Hosts like Render/Railway assign their own PORT and require the app to
  // bind to it — API_PORT remains the default for local dev.
  const port = process.env.PORT ? Number(process.env.PORT) : env.API_PORT;

  await app.listen({ port, host: "0.0.0.0" });
  logger.info({ port }, "api_listening");

  startScheduler();
}

main().catch((error) => {
  logger.error({ err: error instanceof Error ? error.message : error }, "api_startup_failed");
  process.exitCode = 1;
});
