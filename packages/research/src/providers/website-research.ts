import OpenAI from "openai";
import { createLogger, parseLooseJson, ProviderError, wrapUntrustedContent } from "@photography-outreach/shared";
import { RESEARCH_SYSTEM_PROMPT, validateResearchResult } from "../extraction.js";
import type { ResearchProvider } from "../types.js";

const logger = createLogger("research:website-research");

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
const MAX_CONTENT_CHARS = 600;

/**
 * The Phase 2 automated research provider — same split as event discovery
 * (packages/events/src/providers/tavily-groq.ts): Tavily does retrieval
 * (free tier, no card), Groq only structures the search results we already
 * fetched (free tier, no card), never searching the web itself. That split
 * lets us enforce that every contact's sourceUrl is exactly one of the URLs
 * we actually retrieved — the model cannot cite a fabricated source.
 *
 * Never bypasses auth/CAPTCHA/paywalls: it only ever sees public search
 * result snippets, the same as a human doing a Google search would.
 */
export class WebsiteResearchProvider implements ResearchProvider {
  readonly name = "website_research";
  private readonly groqClient: OpenAI;

  constructor(
    private readonly tavilyApiKey: string,
    groqApiKey: string,
    private readonly groqModel: string = "openai/gpt-oss-120b",
    private readonly maxSearchResults = 5,
  ) {
    if (!tavilyApiKey) throw new Error("WebsiteResearchProvider requires a non-empty TAVILY_API_KEY");
    if (!groqApiKey) throw new Error("WebsiteResearchProvider requires a non-empty GROQ_API_KEY");
    this.groqClient = new OpenAI({ apiKey: groqApiKey, baseURL: GROQ_BASE_URL });
  }

  async research(input: { organizationName?: string; website?: string; venueName?: string }) {
    const subject = input.organizationName ?? input.venueName;
    if (!subject && !input.website) {
      return { contacts: [] };
    }

    const query = [
      subject,
      input.website ? `(${input.website})` : "",
      "booking contact email press inquiries",
    ]
      .filter(Boolean)
      .join(" ");

    const results = await this.search(query);
    if (results.length === 0) {
      logger.info({ query, searchResults: 0, kept: 0, status: "ok" });
      return { contacts: [] };
    }

    const result = await this.extract(query, results);
    logger.info({ query, searchResults: results.length, kept: result.contacts.length, status: "ok" });
    return result;
  }

  private async search(query: string): Promise<TavilyResult[]> {
    let response: Response;
    try {
      response = await fetch(TAVILY_SEARCH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: this.tavilyApiKey,
          query,
          search_depth: "advanced",
          topic: "general",
          max_results: this.maxSearchResults,
          include_answer: false,
          include_raw_content: false,
        }),
      });
    } catch (error) {
      throw new ProviderError("tavily", `Search request failed for "${query}"`, {
        cause: error instanceof Error ? error.message : error,
      });
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new ProviderError("tavily", `Search failed for "${query}": ${response.status} ${response.statusText}`, {
        body,
      });
    }

    const payload = (await response.json()) as TavilyResponse;
    return Array.isArray(payload.results) ? payload.results : [];
  }

  private async extract(query: string, results: TavilyResult[]) {
    const allowedSourceUrls = new Set(results.map((r) => r.url));

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
      `RESEARCH_TARGET: "${query}"`,
      "",
      "Below are web search results for this query. Extract any real, verifiable organization details and booking/press contacts described in them, following the rules exactly. Use ONLY information found in these results — do not use outside knowledge, and do not use any URL other than the ones shown as each block's source attribute.",
      "",
      resultsBlock,
    ].join("\n");

    let responseText: string;
    try {
      const completion = await this.groqClient.chat.completions.create({
        model: this.groqModel,
        max_tokens: 1500,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: RESEARCH_SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
      });
      responseText = completion.choices[0]?.message?.content ?? "";
    } catch (error) {
      throw new ProviderError("groq", `Research extraction failed for "${query}"`, {
        cause: error instanceof Error ? error.message : error,
      });
    }

    let parsed: unknown;
    try {
      parsed = parseLooseJson(responseText);
    } catch (error) {
      logger.warn({ query, responseText, err: error instanceof Error ? error.message : error }, "unparseable_response");
      return { contacts: [] };
    }

    return validateResearchResult(parsed, { target: query, allowedSourceUrls });
  }
}
