import { describe, it, expect } from "vitest";
import { mapWithConcurrency } from "./concurrency.js";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("mapWithConcurrency", () => {
  it("preserves input order in the results regardless of completion order", async () => {
    const items = [30, 10, 20];
    const results = await mapWithConcurrency(items, 3, async (ms) => {
      await delay(ms);
      return ms;
    });
    expect(results).toEqual([30, 10, 20]);
  });

  it("never runs more than `limit` tasks at once", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const items = Array.from({ length: 6 }, (_, i) => i);

    await mapWithConcurrency(items, 2, async (i) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await delay(10);
      inFlight--;
      return i;
    });

    expect(maxInFlight).toBeLessThanOrEqual(2);
  });

  it("runs every item exactly once", async () => {
    const seen: number[] = [];
    const items = [1, 2, 3, 4, 5];
    await mapWithConcurrency(items, 2, async (i) => {
      seen.push(i);
      return i;
    });
    expect(seen.sort()).toEqual(items);
  });

  it("handles an empty input without hanging", async () => {
    const results = await mapWithConcurrency<number, number>([], 3, async (i) => i);
    expect(results).toEqual([]);
  });

  it("propagates a rejection from any task", async () => {
    await expect(
      mapWithConcurrency([1, 2, 3], 2, async (i) => {
        if (i === 2) throw new Error("boom");
        return i;
      }),
    ).rejects.toThrow("boom");
  });
});
