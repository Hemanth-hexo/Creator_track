import OpenAI from "openai";
import { createLogger, parseLooseJson, ProviderError, wrapUntrustedContent } from "@photography-outreach/shared";
import { EXTRACTION_SYSTEM_PROMPT, normalizeDiscoveredEvent, validateDiscoveredEvents } from "../extraction.js";
import type { EventProvider, NormalizedEvent } from "../types.js";

const logger = createLogger("events:tavily-groq");

interface TavilyResult {
  title: string;
  url: string;
  content: string;
  published_date?: string;
}

interface TavilyResponse {
  results: TavilyResult[];
}

const TAVILY_SEARCH_URL = "https://api.tavily.com/search";
const GROQ_BASE_URL = "https://api.groq.com/openai/v1";

/**
 * The default event discovery provider. Splits retrieval and extraction
 * into two separate, independently-free services rather than one paid
 * hosted "search" tool:
 *  - Tavily's search API (retrieval) — a free tier built for exactly this
 *    kind of AI-agent use case, no credit card required.
 *  - Groq (extraction/structuring) — free-tier inference on an open model,
 *    also no credit card required, used only to turn the search results we
 *    already fetched into structured JSON. It never gets to search the web
 *    itself, which lets us enforce the strongest possible anti-invention
 *    check: every event's sourceUrl must be one of the URLs we actually
 *    handed it (see extraction.ts's allowedSourceUrls check) — the model
 *    literally cannot cite a URL it wasn't given.
 */
export class TavilyGroqEventProvider implements EventProvider {
  readonly name = "tavily_groq_web_search";
  private readonly groqClient: OpenAI;

  constructor(
    private readonly tavilyApiKey: string,
    groqApiKey: string,
    private readonly groqModel: string = "openai/gpt-oss-120b",
    // Kept small deliberately — free-tier Groq rate limits are tight (as low as
    // 8000 tokens/minute on some models), and each result's content is also
    // truncated in extract() below to stay comfortably under that.
    private readonly maxSearchResults = 5,
  ) {
    if (!tavilyApiKey) throw new Error("TavilyGroqEventProvider requires a non-empty TAVILY_API_KEY");
    if (!groqApiKey) throw new Error("TavilyGroqEventProvider requires a non-empty GROQ_API_KEY");
    this.groqClient = new OpenAI({ apiKey: groqApiKey, baseURL: GROQ_BASE_URL });
  }

  async fetchEvents(target: string): Promise<NormalizedEvent[]> {
    const start = Date.now();
    const results = await this.search(target);
    if (results.length === 0) {
      logger.info({ target, searchResults: 0, kept: 0, durationMs: Date.now() - start, status: "ok" });
      return [];
    }

    const extracted = await this.extract(target, results);
    logger.info({
      target,
      searchResults: results.length,
      kept: extracted.length,
      durationMs: Date.now() - start,
      status: "ok",
    });
    return extracted;
  }

  private async search(target: string): Promise<TavilyResult[]> {
    let response: Response;
    try {
      response = await fetch(TAVILY_SEARCH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: this.tavilyApiKey,
          query: `${target} — upcoming dates, venue, ticket link`,
          search_depth: "advanced",
          topic: "general",
          max_results: this.maxSearchResults,
          include_answer: false,
          include_raw_content: false,
        }),
      });
    } catch (error) {
      throw new ProviderError("tavily", `Search request failed for "${target}"`, {
        cause: error instanceof Error ? error.message : error,
      });
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new ProviderError("tavily", `Search failed for "${target}": ${response.status} ${response.statusText}`, {
        body,
      });
    }

    const payload = (await response.json()) as TavilyResponse;
    return Array.isArray(payload.results) ? payload.results : [];
  }

  private async extract(target: string, results: TavilyResult[]): Promise<NormalizedEvent[]> {
    const allowedSourceUrls = new Set(results.map((r) => r.url));

    // Free-tier Groq rate limits are tight (as low as 8000 tokens/minute on
    // some models) — truncate each snippet rather than passing full page
    // content, which is far more than needed to extract event details anyway.
    const MAX_CONTENT_CHARS = 600;
    const resultsBlock = results
      .map((r) =>
        wrapUntrustedContent(
          r.url,
          [
            `Title: ${r.title}`,
            r.published_date ? `Published: ${r.published_date}` : "",
            "",
            r.content.length > MAX_CONTENT_CHARS ? `${r.content.slice(0, MAX_CONTENT_CHARS)}...` : r.content,
          ]
            .filter(Boolean)
            .join("\n"),
        ),
      )
      .join("\n\n");

    const userPrompt = [
      `SEARCH_QUERY: "${target}"`,
      "",
      "Below are web search results for this query. Extract every distinct real event described in them, following the rules exactly. Use ONLY information found in these results — do not use outside knowledge, and do not use any URL other than the ones shown as each block's source attribute.",
      "",
      resultsBlock,
    ].join("\n");

    let responseText: string;
    try {
      const completion = await this.groqClient.chat.completions.create({
        model: this.groqModel,
        max_tokens: 2000,
        messages: [
          { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
      });
      responseText = completion.choices[0]?.message?.content ?? "";
    } catch (error) {
      throw new ProviderError("groq", `Extraction failed for "${target}"`, {
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

    const events = validateDiscoveredEvents(parsed, { target, allowedSourceUrls });
    return events.map((event) => normalizeDiscoveredEvent(this.name, event));
  }
}
