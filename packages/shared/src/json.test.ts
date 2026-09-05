import { describe, it, expect } from "vitest";
import { parseLooseJson } from "./json.js";
import { ValidationError } from "./errors.js";

describe("parseLooseJson", () => {
  it("parses plain JSON", () => {
    expect(parseLooseJson('{"a": 1}')).toEqual({ a: 1 });
  });

  it("strips markdown code fences", () => {
    expect(parseLooseJson('```json\n{"a": 1}\n```')).toEqual({ a: 1 });
    expect(parseLooseJson('```\n{"a": 1}\n```')).toEqual({ a: 1 });
  });

  it("throws a ValidationError on invalid JSON", () => {
    expect(() => parseLooseJson("not json")).toThrow(ValidationError);
  });
});
