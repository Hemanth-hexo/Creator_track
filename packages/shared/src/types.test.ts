import { describe, it, expect } from "vitest";
import { canTransitionOpportunity } from "./types.js";

describe("canTransitionOpportunity", () => {
  it("allows the documented forward path", () => {
    expect(canTransitionOpportunity("discovered", "qualified")).toBe(true);
    expect(canTransitionOpportunity("qualified", "researching")).toBe(true);
    expect(canTransitionOpportunity("drafted", "approved")).toBe(true);
    expect(canTransitionOpportunity("approved", "sent")).toBe(true);
    expect(canTransitionOpportunity("sent", "booked")).toBe(true);
  });

  it("allows dropping out to rejected/dead from any non-terminal state", () => {
    expect(canTransitionOpportunity("discovered", "rejected")).toBe(true);
    expect(canTransitionOpportunity("contact_found", "dead")).toBe(true);
  });

  it("rejects skipping stages", () => {
    expect(canTransitionOpportunity("discovered", "approved")).toBe(false);
    expect(canTransitionOpportunity("discovered", "sent")).toBe(false);
  });

  it("rejects moving backwards", () => {
    expect(canTransitionOpportunity("approved", "drafted")).toBe(false);
  });

  it("has no outgoing transitions from terminal states", () => {
    expect(canTransitionOpportunity("completed", "booked")).toBe(false);
    expect(canTransitionOpportunity("rejected", "discovered")).toBe(false);
    expect(canTransitionOpportunity("dead", "discovered")).toBe(false);
  });
});
