import OpenAI from "openai";
import { ProviderError } from "@photography-outreach/shared";
import type { GenerateOptions, GenerateResult, LLMProvider } from "../provider.js";

export class OpenAIProvider implements LLMProvider {
  readonly name = "openai";
  private readonly client: OpenAI;

  constructor(
    apiKey: string,
    private readonly model: string,
  ) {
    this.client = new OpenAI({ apiKey });
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
      throw new ProviderError("openai", "Failed to generate text", {
        cause: error instanceof Error ? error.message : error,
      });
    }
  }
}
