import { loadEnv } from "@photography-outreach/shared";
import { AnthropicProvider } from "./providers/anthropic.js";
import { OpenAIProvider } from "./providers/openai.js";
import { GroqProvider } from "./providers/groq.js";

export interface GenerateOptions {
  system: string;
  prompt: string;
  maxTokens?: number;
}

export interface GenerateResult {
  text: string;
  modelUsed: string;
}

/**
 * Every LLM backend the app can use implements this one method. Swapping
 * providers is a config change (LLM_PROVIDER env var), never a code change
 * anywhere that calls generateText.
 */
export interface LLMProvider {
  readonly name: string;
  generateText(options: GenerateOptions): Promise<GenerateResult>;
}

let cachedProvider: LLMProvider | undefined;

export function getLLMProvider(): LLMProvider {
  if (cachedProvider) return cachedProvider;
  const env = loadEnv();

  if (env.LLM_PROVIDER === "anthropic") {
    if (!env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is required when LLM_PROVIDER=anthropic");
    cachedProvider = new AnthropicProvider(env.ANTHROPIC_API_KEY, env.ANTHROPIC_MODEL);
  } else if (env.LLM_PROVIDER === "groq") {
    if (!env.GROQ_API_KEY) throw new Error("GROQ_API_KEY is required when LLM_PROVIDER=groq");
    cachedProvider = new GroqProvider(env.GROQ_API_KEY, env.GROQ_MODEL);
  } else {
    if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required when LLM_PROVIDER=openai");
    cachedProvider = new OpenAIProvider(env.OPENAI_API_KEY, env.OPENAI_MODEL);
  }
  return cachedProvider;
}

/** Test-only: inject a fake provider instead of hitting a real API. */
export function setLLMProviderForTesting(provider: LLMProvider | undefined): void {
  cachedProvider = provider;
}
