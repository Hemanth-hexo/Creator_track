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
  /** Per-item truncation cap applied when building the extraction prompt; defaults to MAX_CONTENT_CHARS. */
  maxChars?: number;
}

interface TavilyResponse {
  results: TavilyResult[];
}

const TAVILY_SEARCH_URL = "https://api.tavily.com/search";
const TAVILY_EXTRACT_URL = "https://api.tavily.com/extract";
const GROQ_BASE_URL = "https://api.groq.com/openai/v1";
const MAX_CONTENT_CHARS = 600;
const MAX_EVENT_PAGE_CHARS = 4000;

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

  async research(input: { organizationName?: string; website?: string; venueName?: string; eventUrl?: string }) {
    const subject = input.organizationName ?? input.venueName;
    if (!subject && !input.website && !input.eventUrl) {
      return { contacts: [] };
    }

    // The event's own page (poster/listing) often names exactly who handles
    // its press/photo access — e.g. "Media Partner: X" — which is a much
    // more targeted signal than a blind name search. It's fetched alongside,
    // not instead of, the generic search below (subjects are extracted from
    // both together, deduped by allowedSourceUrls in extract()).
    const eventPage = input.eventUrl ? await this.extractPage(input.eventUrl) : null;
    const results = [...(eventPage ? [eventPage] : [])];

    if (subject || input.website) {
      const query = [
        subject,
        input.website ? `(${input.website})` : "",
        "booking contact email press inquiries",
      ]
        .filter(Boolean)
        .join(" ");
      results.push(...(await this.search(query)));
    }

    if (results.length === 0) {
      logger.info({ subject, eventUrl: input.eventUrl, searchResults: 0, kept: 0, status: "ok" });
      return { contacts: [] };
    }

    const target = subject ?? input.eventUrl ?? "event page";
    const result = await this.extract(target, results);

    // The event page named someone (e.g. a media partner) but gave no direct
    // email for them — look that name up on its own before handing anything
    // back, the same way a human would follow up on a name they just read.
    let contacts = result.contacts;
    let organization = result.organization;
    if (result.mediaPartnerLead && contacts.length === 0) {
      const lead = await this.researchNamedLead(result.mediaPartnerLead.name);
      contacts = lead.contacts;
      organization = organization ?? lead.organization;
    }

    logger.info({
      subject,
      eventUrl: input.eventUrl,
      searchResults: results.length,
      mediaPartnerLead: result.mediaPartnerLead?.name,
      kept: contacts.length,
      status: "ok",
    });
    return { organization, contacts };
  }

  /** Follow-up search for a specific named entity (e.g. a media partner credited on an event page), reusing the same search+extract flow. */
  private async researchNamedLead(name: string) {
    const leadResults = await this.search(`${name} contact email press inquiries`);
    if (leadResults.length === 0) return { contacts: [] };
    return this.extract(name, leadResults);
  }

  /** Fetches the real, public content of one URL (the event's own page). Never throws — this is a supplementary signal, not the only path to a result. */
  private async extractPage(url: string): Promise<TavilyResult | null> {
    let response: Response;
    try {
      response = await fetch(TAVILY_EXTRACT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: this.tavilyApiKey, urls: [url] }),
      });
    } catch (error) {
      logger.warn({ url, err: error instanceof Error ? error.message : error }, "event_page_extract_failed");
      return null;
    }

    if (!response.ok) {
      logger.warn({ url, status: response.status }, "event_page_extract_failed");
      return null;
    }

    const payload = (await response.json()) as { results?: Array<{ url: string; raw_content?: string }> };
    const hit = payload.results?.[0];
    if (!hit?.raw_content) return null;

    return { title: url, url: hit.url, content: hit.raw_content, maxChars: MAX_EVENT_PAGE_CHARS };
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
            (() => {
              const limit = r.maxChars ?? MAX_CONTENT_CHARS;
              return r.content.length > limit ? `${r.content.slice(0, limit)}...` : r.content;
            })(),
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
