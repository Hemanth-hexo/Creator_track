import { describe, it, expect, vi, beforeEach } from "vitest";
import { ProviderError } from "@photography-outreach/shared";

const mockGroqCreate = vi.fn();

vi.mock("openai", () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: { completions: { create: mockGroqCreate } },
  })),
}));

const { TavilyGroqEventProvider } = await import("./tavily-groq.js");

const tavilyResult = {
  title: "Bicep live at Fandom, Bengaluru",
  url: "https://insider.in/bicep-bengaluru",
  content: "Bicep will play Fandom Bengaluru on 15 Nov 2026, doors 7pm.",
  published_date: "2026-09-01",
};

function mockTavilyFetch(results: unknown[] = [tavilyResult]) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ results }),
    }),
  );
}

const validExtractedEvent = {
  name: "Bicep Live",
  artistName: "Bicep",
  venueName: "Fandom",
  venueCity: "Bengaluru",
  venueCountry: "India",
  startsAt: "2026-11-15T19:00:00",
  eventUrl: "https://insider.in/bicep-bengaluru",
  sourceUrl: "https://insider.in/bicep-bengaluru",
  confidence: 80,
  description: "Electronic show.",
};

describe("TavilyGroqEventProvider", () => {
  beforeEach(() => {
    mockGroqCreate.mockReset();
  });

  it("throws if constructed without a Tavily key", () => {
    expect(() => new TavilyGroqEventProvider("", "groq-key")).toThrow(/TAVILY_API_KEY/);
  });

  it("throws if constructed without a Groq key", () => {
    expect(() => new TavilyGroqEventProvider("tavily-key", "")).toThrow(/GROQ_API_KEY/);
  });

  it("returns an empty array without calling Groq when Tavily finds nothing", async () => {
    mockTavilyFetch([]);
    const provider = new TavilyGroqEventProvider("tavily-key", "groq-key");
    const events = await provider.fetchEvents("nothing happening anywhere");
    expect(events).toEqual([]);
    expect(mockGroqCreate).not.toHaveBeenCalled();
  });

  it("extracts and normalizes an event found in the search results", async () => {
    mockTavilyFetch();
    mockGroqCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify([validExtractedEvent]) } }],
    });

    const provider = new TavilyGroqEventProvider("tavily-key", "groq-key");
    const events = await provider.fetchEvents("Bengaluru electronic events");

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      source: "tavily_groq_web_search",
      artistName: "Bicep",
      confidence: 80,
      discoverySourceUrl: "https://insider.in/bicep-bengaluru",
    });
  });

  it("drops an event whose sourceUrl wasn't actually in the search results (anti-invention check)", async () => {
    mockTavilyFetch();
    mockGroqCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify([{ ...validExtractedEvent, sourceUrl: "https://not-a-real-result.example.com" }]),
          },
        },
      ],
    });

    const provider = new TavilyGroqEventProvider("tavily-key", "groq-key");
    const events = await provider.fetchEvents("Bengaluru electronic events");
    expect(events).toEqual([]);
  });

  it("wraps a Tavily search failure in a ProviderError", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, statusText: "Server Error", text: async () => "boom" }));
    const provider = new TavilyGroqEventProvider("tavily-key", "groq-key");
    await expect(provider.fetchEvents("query")).rejects.toBeInstanceOf(ProviderError);
  });

  it("wraps a Groq extraction failure in a ProviderError", async () => {
    mockTavilyFetch();
    mockGroqCreate.mockRejectedValue(new Error("groq is down"));
    const provider = new TavilyGroqEventProvider("tavily-key", "groq-key");
    await expect(provider.fetchEvents("query")).rejects.toBeInstanceOf(ProviderError);
  });
});
