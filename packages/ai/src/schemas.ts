import { z } from "zod";

export const emailDraftOutputSchema = z.object({
  subject: z.string().min(1).max(150),
  body: z.string().min(1),
  personalizationReasoning: z
    .string()
    .describe("Why this email is personalized this way — what specific facts about the recipient drove it"),
  suggestedService: z.string(),
  portfolioReference: z.string(),
  cta: z.string(),
});

export type EmailDraftOutput = z.infer<typeof emailDraftOutputSchema>;
