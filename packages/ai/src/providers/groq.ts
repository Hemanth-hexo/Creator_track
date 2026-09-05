import OpenAI from "openai";
import { ProviderError } from "@photography-outreach/shared";
import type { GenerateOptions, GenerateResult, LLMProvider } from "../provider.js";

const GROQ_BASE_URL = "https://api.groq.com/openai/v1";

/**
 * Free-tier LLM option (no credit card required, unlike OpenAI/Anthropic
 * paid accounts) — Groq's API is OpenAI-compatible, so this reuses the
 * `openai` SDK pointed at Groq's base URL rather than adding a new
 * dependency. Same LLMProvider interface as Anthropic/OpenAI, so nothing
 * downstream (generateEmailDraft, its prompt, its zod validation) needs to
 * know which backend is actually running.
 */
export class GroqProvider implements LLMProvider {
  readonly name = "groq";
  private readonly client: OpenAI;

  constructor(
    apiKey: string,
    private readonly model: string,
  ) {
    this.client = new OpenAI({ apiKey, baseURL: GROQ_BASE_URL });
  }

  async generateText({ system, prompt, maxTokens = 1500 }: GenerateOptions): Promise<GenerateResult> {
    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
      });

      const text = response.choices[0]?.message?.content ?? "";
      return { text, modelUsed: this.model };
    } catch (error) {
      throw new ProviderError("groq", "Failed to generate text", {
        cause: error instanceof Error ? error.message : error,
      });
    }
  }
}
