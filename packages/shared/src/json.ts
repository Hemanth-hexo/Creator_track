import { ValidationError } from "./errors.js";

/** LLMs sometimes wrap JSON in markdown fences despite instructions — strip those before parsing. */
export function parseLooseJson(text: string): unknown {
  const trimmed = text.trim();
  const withoutFences = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(withoutFences);
  } catch (error) {
    throw new ValidationError("LLM output was not valid JSON", {
      raw: text,
      cause: error instanceof Error ? error.message : error,
    });
  }
}
