import Anthropic from "@anthropic-ai/sdk";
import { ProviderError } from "@photography-outreach/shared";
import type { GenerateOptions, GenerateResult, LLMProvider } from "../provider.js";

export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    private readonly model: string,
  ) {
    this.client = new Anthropic({ apiKey });
  }

  async generateText({ system, prompt, maxTokens = 1500 }: GenerateOptions): Promise<GenerateResult> {
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: prompt }],
      });

      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("\n");

      return { text, modelUsed: this.model };
    } catch (error) {
      throw new ProviderError("anthropic", "Failed to generate text", {
        cause: error instanceof Error ? error.message : error,
      });
    }
  }
}
