/**
 * Intentionally empty in Phase 1 — see the "RAG: Phase 2/3, not Phase 1"
 * section of the architecture plan for why. Phase 1 personalization uses a
 * static photographer-profile context injected directly into prompts
 * (packages/ai/src/prompts/outreach-email.ts), which needs no retrieval step.
 *
 * When there's a real corpus of past outreach emails/case studies to
 * retrieve from (Phase 3), this package will hold: a pgvector-backed
 * embedding pipeline over `knowledge_documents`, and a retrieve() function
 * returning the top-k relevant documents for a given event/opportunity,
 * consumed by packages/ai's prompt builder.
 */
export {};
