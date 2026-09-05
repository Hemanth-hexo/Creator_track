import { loadEnv } from "@photography-outreach/shared";
import { WebsiteResearchProvider } from "./providers/website-research.js";
import type { ResearchProvider } from "./types.js";

/**
 * Same free-tier stack as event discovery (Tavily search + Groq extraction)
 * — reuses the same TAVILY_API_KEY/GROQ_API_KEY/GROQ_MODEL env vars, no
 * separate signup needed.
 */
export function getDefaultResearchProvider(): ResearchProvider {
  const env = loadEnv();
  if (!env.TAVILY_API_KEY) {
    throw new Error("TAVILY_API_KEY is required for automated research — get a free key at tavily.com");
  }
  if (!env.GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY is required for automated research — get a free key at console.groq.com");
  }
  return new WebsiteResearchProvider(env.TAVILY_API_KEY, env.GROQ_API_KEY, env.GROQ_MODEL);
}
