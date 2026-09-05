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

  it("falls back to the searched subject name for organization when a contact is found but the model didn't name one", async () => {
    mockTavilyFetch();
    mockGroqCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ contacts: validResult.contacts }) } }],
    });

    const provider = new WebsiteResearchProvider("tavily-key", "groq-key");
    const result = await provider.research({ venueName: "Fandom Bengaluru" });

    expect(result.contacts).toHaveLength(1);
    expect(result.organization).toMatchObject({ name: "Fandom Bengaluru" });
  });

  describe("eventUrl (media-partner discovery)", () => {
    const eventUrl = "https://example.com/events/summer-fest";

    function mockTavilyRoutes(extractResponse: { ok: boolean; rawContent?: string }, searchResults: unknown[]) {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation(async (url: string) => {
          if (String(url).includes("/extract")) {
            if (!extractResponse.ok) {
              return { ok: false, status: 404, text: async () => "not found" };
            }
            return { ok: true, status: 200, json: async () => ({ results: [{ url: eventUrl, raw_content: extractResponse.rawContent }] }) };
          }
          return { ok: true, status: 200, json: async () => ({ results: searchResults }) };
        }),
      );
    }

    it("fetches the event's own page via Tavily extract and lets it contribute a contact", async () => {
      mockTavilyRoutes(
        { ok: true, rawContent: "Summer Fest lineup. Press inquiries: press@loudandclear.com" },
        [],
      );
      mockGroqCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                contacts: [{ email: "press@loudandclear.com", role: "Press", sourceUrl: eventUrl, confidence: 60 }],
              }),
            },
          },
        ],
      });

      const provider = new WebsiteResearchProvider("tavily-key", "groq-key");
      const result = await provider.research({ eventUrl });

      expect(result.contacts).toHaveLength(1);
      expect(result.contacts[0]).toMatchObject({ email: "press@loudandclear.com", sourceUrl: eventUrl });
    });

    it("looks up a media-partner lead named on the event page when no direct contact is found there", async () => {
      const leadResult = {
        title: "Loud & Clear Magazine — Contact",
        url: "https://loudandclear.example.com/contact",
        content: "Reach the editorial desk at press@loudandclear.com for press and partnership inquiries.",
      };
      mockTavilyRoutes({ ok: true, rawContent: "Summer Fest lineup. Media Partner: Loud & Clear Magazine." }, [leadResult]);

      mockGroqCreate
        .mockResolvedValueOnce({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  contacts: [],
                  mediaPartnerLead: { name: "Loud & Clear Magazine", sourceUrl: eventUrl },
                }),
              },
            },
          ],
        })
        .mockResolvedValueOnce({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  contacts: [{ email: "press@loudandclear.com", role: "Editorial", sourceUrl: leadResult.url, confidence: 55 }],
                }),
              },
            },
          ],
        });

      const provider = new WebsiteResearchProvider("tavily-key", "groq-key");
      const result = await provider.research({ eventUrl });

      expect(result.contacts).toHaveLength(1);
      expect(result.contacts[0]).toMatchObject({ email: "press@loudandclear.com", sourceUrl: leadResult.url });
      expect(result.organization).toMatchObject({ name: "Loud & Clear Magazine" });
      expect(mockGroqCreate).toHaveBeenCalledTimes(2);
    });

    it("falls back to the generic name search when the event page can't be fetched", async () => {
      mockTavilyRoutes({ ok: false }, [tavilyResult]);
      mockGroqCreate.mockResolvedValue({ choices: [{ message: { content: JSON.stringify(validResult) } }] });

      const provider = new WebsiteResearchProvider("tavily-key", "groq-key");
      const result = await provider.research({ venueName: "Fandom Bengaluru", eventUrl });

      expect(result.contacts).toHaveLength(1);
      expect(result.contacts[0]).toMatchObject({ email: "bookings@fandombengaluru.com" });
    });
  });
});
