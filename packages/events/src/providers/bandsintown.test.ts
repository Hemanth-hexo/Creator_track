import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BandsintownProvider } from "./bandsintown.js";
import { ProviderError } from "@photography-outreach/shared";

const sampleEvent = {
  id: "bit-123",
  url: "https://bandsintown.com/e/bit-123",
  datetime: "2026-11-01T20:00:00",
  description: "Live show",
  venue: { name: "The Venue", city: "Brooklyn", region: "NY", country: "United States", latitude: "40.6", longitude: "-73.9" },
  artist: { name: "Test Artist", url: "https://bandsintown.com/a/test-artist" },
  title: "Test Artist at The Venue",
};

describe("BandsintownProvider", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("throws if constructed without an app id", () => {
    expect(() => new BandsintownProvider("")).toThrow(/app_id/);
  });

  it("normalizes a raw event into the common NormalizedEvent shape", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [sampleEvent],
    });

    const provider = new BandsintownProvider("test-app-id");
    const events = await provider.fetchEvents("Test Artist");

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      source: "bandsintown",
      sourceId: "bit-123",
      artistName: "Test Artist",
      venueCity: "Brooklyn",
      lat: 40.6,
      lng: -73.9,
    });
    expect(events[0].startsAt).toBeInstanceOf(Date);
  });

  it("returns an empty array for an unknown artist (404)", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 404 });
    const provider = new BandsintownProvider("test-app-id");
    const events = await provider.fetchEvents("Nobody Real");
    expect(events).toEqual([]);
  });

  it("throws a ProviderError on a non-404 failure response", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      text: async () => "boom",
    });
    const provider = new BandsintownProvider("test-app-id");
    await expect(provider.fetchEvents("Test Artist")).rejects.toBeInstanceOf(ProviderError);
  });
});
