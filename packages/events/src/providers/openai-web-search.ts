import OpenAI from "openai";
import { createLogger, parseLooseJson, ProviderError } from "@photography-outreach/shared";
import { EXTRACTION_SYSTEM_PROMPT, normalizeDiscoveredEvent, validateDiscoveredEvents } from "../extraction.js";
import type { EventProvider, NormalizedEvent } from "../types.js";

const logger = createLogger("events:openai-web-search");

/**
 * NOT the default provider — see defaultProvider.ts, which uses
 * TavilyGroqEventProvider instead (both Tavily and Groq have genuinely free
 * tiers; OpenAI's web_search_preview tool needs a funded, paid API account).
 * Kept as a working alternative: swap it in via defaultProvider.ts once
 * OpenAI billing is set up, if its search quality is preferred.
 *
 * Discovers events via the OpenAI Responses API's hosted web_search tool —
 * a general-purpose web search, not a dedicated event database. The model
 * searches the live web itself (unlike TavilyGroqEventProvider, where we
 * control exactly what search results are handed to the LLM), and we
 * extract + validate structured event data from its response.
 */
export class OpenAIWebSearchEventProvider implements EventProvider {
  readonly name = "openai_web_search";
  private readonly client: OpenAI;

  constructor(
    apiKey: string,
    private readonly model: string = "gpt-4o",
  ) {
    if (!apiKey) {
      throw new Error("OpenAIWebSearchEventProvider requires a non-empty OPENAI_API_KEY");
    }
    this.client = new OpenAI({ apiKey });
  }

  /**
   * `target` is a search query, e.g. "upcoming electronic music events in
   * Bengaluru, India" — not an artist name (this provider is location/genre
   * driven, unlike the artist-keyed BandsintownProvider).
   */
  async fetchEvents(target: string): Promise<NormalizedEvent[]> {
    const start = Date.now();
    let responseText: string;

    try {
      const response = await this.client.responses.create({
        model: this.model,
        tools: [{ type: "web_search_preview" }],
        input: [
          { role: "developer", content: EXTRACTION_SYSTEM_PROMPT },
          {
            role: "user",
            content: `Search the web for upcoming live music events matching: "${target}". Look up to 90 days ahead. Return every distinct real event you can verify, following the source and confidence rules exactly.`,
          },
        ],
      });
      responseText = response.output_text ?? "";
    } catch (error) {
      throw new ProviderError("openai_web_search", `Web search failed for "${target}"`, {
        cause: error instanceof Error ? error.message : error,
      });
    }

    let parsed: unknown;
    try {
      parsed = parseLooseJson(responseText);
    } catch (error) {
      logger.warn({ target, responseText, err: error instanceof Error ? error.message : error }, "unparseable_response");
      return [];
    }

    const events = validateDiscoveredEvents(parsed, { target });

    logger.info({ target, kept: events.length, durationMs: Date.now() - start, status: "ok" });

    return events.map((event) => normalizeDiscoveredEvent(this.name, event));
  }
}
