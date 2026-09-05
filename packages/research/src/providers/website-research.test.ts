import { describe, it, expect, vi, beforeEach } from "vitest";
import { ProviderError } from "@photography-outreach/shared";

const mockGroqCreate = vi.fn();

vi.mock("openai", () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: { completions: { create: mockGroqCreate } },
  })),
}));

const { WebsiteResearchProvider } = await import("./website-research.js");

const tavilyResult = {
  title: "Fandom Bengaluru — Contact & Bookings",
  url: "https://fandombengaluru.com/contact",
  content: "For bookings and press inquiries, email bookings@fandombengaluru.com or call the venue office.",
  published_date: "2026-01-01",
};

function mockTavilyFetch(results: unknown[] = [tavilyResult]) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ results }) }),
  );
}

const validResult = {
  organization: { name: "Fandom Bengaluru", website: "https://fandombengaluru.com", type: "venue" },
  contacts: [
    {
      name: null,
      role: "Bookings",
      email: "bookings@fandombengaluru.com",
      phone: null,
      sourceUrl: "https://fandombengaluru.com/contact",
      confidence: 75,
    },
  ],
};

describe("WebsiteResearchProvider", () => {
  beforeEach(() => {
    mockGroqCreate.mockReset();
  });

  it("throws if constructed without a Tavily key", () => {
    expect(() => new WebsiteResearchProvider("", "groq-key")).toThrow(/TAVILY_API_KEY/);
  });

  it("throws if constructed without a Groq key", () => {
    expect(() => new WebsiteResearchProvider("tavily-key", "")).toThrow(/GROQ_API_KEY/);
  });

  it("returns no contacts when neither organizationName, venueName, nor website is given", async () => {
    const provider = new WebsiteResearchProvider("tavily-key", "groq-key");
    const result = await provider.research({});
    expect(result.contacts).toEqual([]);
  });

  it("extracts organization and contact details, normalizing null to undefined", async () => {
    mockTavilyFetch();
    mockGroqCreate.mockResolvedValue({ choices: [{ message: { content: JSON.stringify(validResult) } }] });

    const provider = new WebsiteResearchProvider("tavily-key", "groq-key");
    const result = await provider.research({ venueName: "Fandom Bengaluru" });

    expect(result.organization).toMatchObject({ name: "Fandom Bengaluru", type: "venue" });
    expect(result.contacts).toHaveLength(1);
    expect(result.contacts[0]).toMatchObject({ email: "bookings@fandombengaluru.com", confidence: 75 });
    expect(result.contacts[0].name).toBeUndefined();
  });

  it("drops a contact whose sourceUrl wasn't actually in the search results", async () => {
    mockTavilyFetch();
    mockGroqCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              contacts: [{ ...validResult.contacts[0], sourceUrl: "https://not-a-real-result.example.com" }],
            }),
          },
        },
      ],
    });

    const provider = new WebsiteResearchProvider("tavily-key", "groq-key");
    const result = await provider.research({ venueName: "Fandom Bengaluru" });
    expect(result.contacts).toEqual([]);
  });

  it("wraps a Tavily search failure in a ProviderError", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, statusText: "Server Error", text: async () => "boom" }));
    const provider = new WebsiteResearchProvider("tavily-key", "groq-key");
    await expect(provider.research({ venueName: "X" })).rejects.toBeInstanceOf(ProviderError);
  });
});
