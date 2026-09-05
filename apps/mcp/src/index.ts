import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadEnv, createLogger } from "@photography-outreach/shared";
import { registerEventTools } from "./tools/events.js";
import { registerOpportunityTools } from "./tools/opportunities.js";
import { registerContactTools } from "./tools/contacts.js";
import { registerDraftTools } from "./tools/drafts.js";
import { registerFollowupTools } from "./tools/followups.js";
import { registerActivityTools } from "./tools/activity.js";

const logger = createLogger("mcp:main");

async function main() {
  loadEnv(); // fail fast on misconfiguration before accepting any tool calls

  const server = new McpServer({ name: "photography-outreach", version: "0.1.0" });

  registerEventTools(server);
  registerOpportunityTools(server);
  registerContactTools(server);
  registerDraftTools(server);
  registerFollowupTools(server);
  registerActivityTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("mcp_server_started");
}

main().catch((error) => {
  logger.error({ err: error instanceof Error ? error.message : error }, "mcp_startup_failed");
  process.exitCode = 1;
});
