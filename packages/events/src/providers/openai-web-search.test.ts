import { describe, it, expect, vi, beforeEach } from "vitest";
import { ProviderError } from "@photography-outreach/shared";

const mockCreate = vi.fn();

vi.mock("openai", () => ({
  default: vi.fn().mockImplementation(() => ({
    responses: { create: mockCreate },
  })),
}));

const { OpenAIWebSearchEventProvider } = await import("./openai-web-search.js");

const validEvent = {
  name: "Bicep Live",
  artistName: "Bicep",
  venueName: "Fandom",
  venueCity: "Bengaluru",
  venueCountry: "India",
  startsAt: "2026-11-15T19:00:00",
  eventUrl: "https://insider.in/bicep-bengaluru",
  sourceUrl: "https://insider.in/bicep-bengaluru",
  confidence: 85,
  description: "Electronic show.",
};

describe("OpenAIWebSearchEventProvider", () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it("throws if constructed without an API key", () => {
    expect(() => new OpenAIWebSearchEventProvider("")).toThrow(/OPENAI_API_KEY/);
  });

  it("normalizes valid, verified events with a stable derived sourceId", async () => {
    mockCreate.mockResolvedValue({ output_text: JSON.stringify([validEvent]) });
    const provider = new OpenAIWebSearchEventProvider("test-key");
    const events = await provider.fetchEvents("Bengaluru electronic events");

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      source: "openai_web_search",
      artistName: "Bicep",
      venueCity: "Bengaluru",
      confidence: 85,
      discoverySourceUrl: "https://insider.in/bicep-bengaluru",
    });
    expect(events[0].sourceId).toMatch(/^[0-9a-f]{32}$/);
  });

  it("derives the same sourceId for the same event across two searches (idempotency)", async () => {
    mockCreate.mockResolvedValue({ output_text: JSON.stringify([validEvent]) });
    const provider = new OpenAIWebSearchEventProvider("test-key");
    const first = await provider.fetchEvents("query A");
    const second = await provider.fetchEvents("query B");
    expect(first[0].sourceId).toBe(second[0].sourceId);
  });

  it("drops events missing a required sourceUrl instead of inventing one", async () => {
    const { sourceUrl: _drop, ...withoutSource } = validEvent;
    mockCreate.mockResolvedValue({ output_text: JSON.stringify([withoutSource]) });
    const provider = new OpenAIWebSearchEventProvider("test-key");
    const events = await provider.fetchEvents("query");
    expect(events).toHaveLength(0);
  });

  it("drops events with an unparseable date rather than throwing", async () => {
    mockCreate.mockResolvedValue({
      output_text: JSON.stringify([{ ...validEvent, startsAt: "not-a-date" }]),
    });
    const provider = new OpenAIWebSearchEventProvider("test-key");
    const events = await provider.fetchEvents("query");
    expect(events).toHaveLength(0);
  });

  it("returns an empty array when the model reports no events found", async () => {
    mockCreate.mockResolvedValue({ output_text: "[]" });
    const provider = new OpenAIWebSearchEventProvider("test-key");
    const events = await provider.fetchEvents("query with nothing");
    expect(events).toEqual([]);
  });

  it("handles a malformed (non-JSON) response gracefully instead of throwing", async () => {
    mockCreate.mockResolvedValue({ output_text: "Sorry, I couldn't find anything specific." });
    const provider = new OpenAIWebSearchEventProvider("test-key");
    const events = await provider.fetchEvents("query");
    expect(events).toEqual([]);
  });

  it("wraps a network/API failure in a ProviderError", async () => {
    mockCreate.mockRejectedValue(new Error("network down"));
    const provider = new OpenAIWebSearchEventProvider("test-key");
    await expect(provider.fetchEvents("query")).rejects.toBeInstanceOf(ProviderError);
  });
});
