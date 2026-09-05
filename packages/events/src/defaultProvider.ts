import { loadEnv } from "@photography-outreach/shared";
import { TavilyGroqEventProvider } from "./providers/tavily-groq.js";
import { OpenAIWebSearchEventProvider } from "./providers/openai-web-search.js";
import type { EventProvider } from "./types.js";

/**
 * The MVP's default discovery provider — Tavily (search) + Groq
 * (extraction), both of which have genuinely free tiers with no credit card
 * required. Centralized here so the API route, MCP tool, and cron job all
 * fail the same clear way if the required keys are missing, instead of
 * three slightly different checks drifting apart.
 */
export function getDefaultEventProvider(): EventProvider {
  const env = loadEnv();
  if (!env.TAVILY_API_KEY) {
    throw new Error(
      "TAVILY_API_KEY is required for event discovery — get a free key (no card required) at tavily.com",
    );
  }
  if (!env.GROQ_API_KEY) {
    throw new Error(
      "GROQ_API_KEY is required for event discovery — get a free key (no card required) at console.groq.com",
    );
  }
  return new TavilyGroqEventProvider(env.TAVILY_API_KEY, env.GROQ_API_KEY, env.GROQ_MODEL);
}

/**
 * Opt-in alternative if you'd rather use OpenAI's hosted web_search tool
 * (needs a funded OpenAI account) instead of the default Tavily+Groq path.
 * Not wired into the API route/cron job/MCP tool — swap it in manually in
 * defaultProvider.ts if you prefer its search quality.
 */
export function getOpenAIWebSearchProvider(): EventProvider {
  const env = loadEnv();
  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required to use OpenAIWebSearchEventProvider");
  }
  return new OpenAIWebSearchEventProvider(env.OPENAI_API_KEY, env.OPENAI_MODEL);
}
