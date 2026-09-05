# Photography Outreach CRM — Architecture & Phase 1 Plan

## Context

The user is a photographer who wants to move from free shoots to paid work. This is a **brand-new, standalone repository** (`~/Desktop/Hexo_Tracker`, currently empty, not a git repo) — fully independent from their existing portfolio website (which lives elsewhere, e.g. `hexoframes-dino`/`HexoFrames` on their machine). We will never read, import, or modify anything from the portfolio project; it's only ever referenced as an external URL inside generated emails.

The system automates: discover events → score opportunities → (manually, in Phase 1) attach a contact → generate a personalized draft email → human review/edit → approve → send → log everything → follow up. Volume is intentionally small and quality-first — this is a CRM/automation tool for the user's own single-person use, not a spam machine.

Locked-in decisions from clarifying questions:
- **LLM**: pluggable provider abstraction — Anthropic and OpenAI both implemented, selected via env var.
- **Email sending**: SMTP via the user's own Gmail/Workspace account (nodemailer + app password), not a third-party ESP.
- **Tooling**: pnpm workspaces + Turborepo monorepo.

> **Update (post-Phase-1-build)**: Bandsintown was replaced as the *default* event discovery source with a
> web-search-based approach queried against configurable `DiscoveryQuery` rows (e.g. "upcoming electronic music
> events in Bengaluru, India") rather than artist names. The default implementation is `TavilyGroqEventProvider` —
> Tavily for search, Groq for extracting structured events from the results — chosen specifically because both
> have genuinely free tiers with no credit card required (an initial OpenAI-Responses-API version was built first,
> but OpenAI's `web_search_preview` tool needs a funded/paid account, which turned out to be a blocker). That
> `OpenAIWebSearchEventProvider` is kept as an opt-in alternative (`getOpenAIWebSearchProvider()`) for later if
> preferred, and `BandsintownProvider` is kept too, as a third working `EventProvider` implementation proving the
> abstraction holds across three genuinely different backends. `BANDSINTOWN_APP_ID` and a funded `OPENAI_API_KEY`
> are both optional now — the MVP only needs `TAVILY_API_KEY` and `GROQ_API_KEY` (also free) for outreach email
> generation itself, if you set `LLM_PROVIDER=groq`. See §4 below for the full design, including how confidence
> scoring and two-layer dedup (exact source-id + fuzzy artist/date/venue match) work for search-discovered events
> that have no natural stable ID.

---

## 1. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript everywhere | Shared types across api/web/mcp/packages |
| Monorepo | pnpm + Turborepo | Fast installs, task caching, matches requested `apps/`+`packages/` layout |
| Web frontend | Next.js (App Router) | Server components fit a dashboard well; user already suggested it |
| API | Fastify | Lightweight, fast, first-class TS + zod integration, easy to run cron in-process for Phase 1 |
| MCP server | `@modelcontextprotocol/sdk`, stdio transport | Standard MCP SDK; runs as its own process, imports the same service packages as the API |
| Database | PostgreSQL + Prisma | Mature migrations, strong TS DX, easy to add `pgvector` later for Phase 3 without a rewrite |
| Validation | zod | Used for env parsing, API request/response, and MCP tool input/output schemas |
| Email send | nodemailer (SMTP, Gmail/Workspace app password) | Per your choice — no new third-party account |
| LLM | `@anthropic-ai/sdk` + `openai` behind one `LLMProvider` interface | Per your choice — swappable via `LLM_PROVIDER` env var |
| Scheduling | `node-cron`, in-process inside `apps/api` | Phase 1 volume doesn't need a queue; avoids standing up Redis/BullMQ prematurely |
| Logging | `pino` structured logger | Cheap, fast, structured fields (section 15 requirements) |
| Testing | Vitest | Native ESM/TS, fast, plays well with Turborepo task graph |
| Containers | `docker-compose.yml` with **Postgres only** | Redis/queue infra deferred to Phase 4 — "don't add infra that isn't needed yet" |

Not included in Phase 1: Redis, BullMQ, pgvector extension (schema leaves room for it), Docker for the app itself (dev runs natively; compose only backs Postgres).

---

## 2. RAG: Phase 2/3, not Phase 1 — reasoning

Recommend against building RAG now:
- There is no corpus yet. The user is early in paid outreach — no library of past successful emails, no testimonials, minimal shoot history. RAG needs *something* to retrieve; right now there's nothing but a handful of static facts (services offered, honest experience, style, portfolio links).
- Those static facts fit trivially in a prompt as plain context — no embedding/retrieval needed to inject "I shoot low-light concert work, here's my portfolio" into a generation call.
- Building embeddings/pgvector/retrieval now is speculative infrastructure for data that doesn't exist yet — directly against the brief's own philosophy ("don't over-engineer").

What we do instead in Phase 1: a **static photographer-profile context** (services, honest experience bullets, style keywords, portfolio references) is loaded from the DB (`portfolio_references` table) and a small `photographer_profile` config and injected directly into every generation prompt, in full, every time.

Future-proofing without building it now: the schema already includes `knowledge_documents` and `portfolio_references` tables shaped so that in Phase 3, once there's a real body of past outreach emails and case studies, we add a `pgvector` extension + embedding column and a retrieval step — a clean additive migration, not a rewrite.

---

## 3. Database Schema (`packages/database`, Prisma)

Core tables (all with `id` (uuid), `created_at`; mutable ones get `updated_at`):

- **events** — `source`, `source_id` (unique together), `name`, `artist_name`, `artist_url`, `venue_name`, `venue_city/region/country`, `lat/lng`, `starts_at`, `event_url`, `confidence` (0-100, defaults 100 for structured-API sources), `discovery_source_url` (the page a web-search discovery found this event on), `raw_payload jsonb`, `first_discovered_at`, `last_updated_at`. Unique `(source, source_id)` → dedup at the DB layer, backstopped by application-level fuzzy dedup for sources with no natural stable ID (§4).
- **artists** — `name`, `source`, `source_id`, `external_urls jsonb`, `genres text[]`.
- **venues** — `name`, `city`, `region`, `country`, `lat/lng`, `website`.
- **organizations** — `name`, `type` (venue|promoter|artist_mgmt|label|other), `website`, `notes`.
- **contacts** — `organization_id?`, `name?`, `role?`, `email`, `phone?`, `social_links jsonb`, `source`, `source_url`, `confidence`. Every contact carries where it came from (section 3 requirement).
- **opportunities** — `event_id` (**unique** — one opportunity per event), `artist_id?`, `venue_id?`, `organization_id?`, `primary_contact_id?`, `score int`, `score_reasons jsonb`, `status` enum: `discovered → qualified → researching → contact_found → drafted → approved → sent → follow_up → replied → booked → completed`, plus `rejected`/`dead`.
- **email_drafts** — `opportunity_id`, `contact_id?`, `subject`, `body`, `personalization_reasoning`, `suggested_service`, `portfolio_reference`, `cta`, `status`: `draft|edited|approved|rejected|sent`.
- **email_versions** — append-only. `draft_id`, `version_type`: `generated|edited|sent`, `subject`, `body`, `model_used`, `generated_at`, `prompt_version`, `retrieved_context jsonb`, `created_by`. **Never updated in place** — every edit inserts a new row (section 7 requirement).
- **outreach** — `opportunity_id`, `email_draft_id` **unique** (idempotency: one send per draft), `recipient_email`, `sent_at`, `provider_message_id`, `status`: `sent|failed|bounced`, `error?`.
- **followups** — `opportunity_id`, `outreach_id`, `scheduled_for`, `status`: `scheduled|approved|sent|cancelled`. Partial unique index: one active `scheduled` followup per `outreach_id`.
- **activity_logs** — append-only. `opportunity_id?`, `event_id?`, `type` (event_discovered, opportunity_scored, contact_discovered, email_generated, email_edited, email_approved, email_rejected, email_sent, email_failed, followup_scheduled, ...), `message`, `metadata jsonb`, `actor`: `system|user|job`. Indexed on `(opportunity_id, created_at)` for the timeline view.
- **knowledge_documents**, **portfolio_references** — present now (empty/minimal), populated meaningfully starting Phase 3 RAG.
- **discovery_queries** — the standing web-search queries the discovery job runs (e.g. `"upcoming electronic music events in Bengaluru, India"`), each with an optional `location`, replacing the earlier artist-name watchlist now that discovery is location/genre-driven web search rather than artist-keyed API lookups (§4).
- **users** — single-user auth (`email`, `password_hash`).
- **job_runs** — `job_name`, `started_at`, `finished_at`, `status`, `stats jsonb`, `error?` — observability for the cron jobs.

Idempotency backstops (real DB constraints, not just app logic): unique `(events.source, source_id)`, unique `opportunities.event_id`, unique `outreach.email_draft_id`, partial-unique `followups` per outreach, unique `(contacts.organization_id, email)`.

---

## 4. Event Ingestion Pipeline (`packages/events`)

```
EventProvider (interface: fetchEvents(target): NormalizedEvent[])
  └── TavilyGroqEventProvider (default) — Tavily search + Groq extraction, both free-tier
  └── OpenAIWebSearchEventProvider (opt-in) — OpenAI Responses API + web_search_preview tool, needs a paid account
  └── BandsintownProvider (kept, not wired in by default — artist-keyed structured API)
  └── (later) TicketmasterProvider, SongkickProvider, a dedicated event API, ...
```

**Why web search instead of a dedicated event API**: there's no free, broadly-licensed event-discovery API that's genuinely city/genre-searchable (Bandsintown is artist-keyed only; Ticketmaster/Songkick require partner approval or have limited India coverage). `target` is a search query string (e.g. `"upcoming electronic music events in Bengaluru, India"`), configured via `DiscoveryQuery` rows on the Settings page, not an artist name.

**Why Tavily+Groq rather than one hosted tool**: `TavilyGroqEventProvider` deliberately splits retrieval and extraction into two independent free services instead of one paid hosted tool. Tavily's search API (free tier, no card, purpose-built for AI-agent use cases like this) does the retrieval; Groq (free-tier inference on an open model, no card) only turns the search results *we already fetched* into structured JSON — it's never allowed to search the web itself. That split enables the strongest anti-invention check available: every event's `sourceUrl` must be exactly one of the URLs we handed the model, checked in code (`validateDiscoveredEvents`'s `allowedSourceUrls`), not just requested by instruction — the model literally cannot cite a URL it wasn't given. `OpenAIWebSearchEventProvider` (kept as an opt-in alternative) works the same extraction way but delegates retrieval to OpenAI's hosted tool, so that stronger check isn't available there — it can only rely on the instruction-level guardrails below.

**Guardrails on the extraction step** (this is untrusted web content flowing through an LLM, so the same prompt-injection defense philosophy from §14 applies), shared by both providers via `packages/events/src/extraction.ts`:
- The prompt gives an explicit source-priority order (official venue/ticketing sites > official artist channels > established music press > general news > blogs/forums), and instructs the model to never invent an event, artist, venue, date, or URL — omit a field rather than guess it.
- Every event must carry a `sourceUrl` (the exact page the details came from) — validated as a required, well-formed URL; an item missing one is dropped, not defaulted. For `TavilyGroqEventProvider` specifically, it's further checked against the actual set of search-result URLs (see above).
- Every event carries a model-assigned `confidence` (0-100) reflecting source authority, specificity, and recency — persisted on `events.confidence` and shown in the UI, so a human reviewing the opportunity can see how much to trust it.
- The model's own output is still just an LLM response — never trusted as ground truth. It's validated against a strict zod schema, and any content it retrieved from the web is treated purely as data for extraction, not instructions, per the same guardrail used in the outreach-email prompt (§7).

**Dedup, two layers** (search-discovered events have no natural stable ID, unlike a ticketing API's event ID):
1. Exact match on `(source, source_id)` — `source_id` here is a deterministic hash of the event's own identifying fields (artist + venue + city + date), so re-running the same query is idempotent.
2. A fuzzy match (same artist, within a day of the same date, and matching venue or city — or neither side has location info at all) across *any* source, catching the case where two different search queries independently surface the same real event with different hashes. A fuzzy match never creates a second row; it only raises the existing row's confidence if the new discovery is more trustworthy, and logs the match. This logic (`findFuzzyDuplicate`) is a pure function, unit-tested without a database.

Flow: `discoverEvents()` loops active `DiscoveryQuery` rows → `provider.fetchEvents(query)` → upsert into `events` via the two-layer dedup above (insert → `event_discovered` log; changed/duplicate → `event_updated` log). No opportunity is created here — that's a separate step so scoring logic stays decoupled from ingestion.

---

## 5. Opportunity Scoring (`packages/opportunities`)

A small weighted rules engine, not a black box: an ordered array of rule objects (`{ id, description, evaluate(ctx) => points, direction }`) in a plain config file (`scoring-config.ts`) so weights are easy to tune without touching engine code. `scoreOpportunity(opportunity, ctx)` sums applicable rule points, clamps to 0–100, and returns `{ score, reasons: [{ rule, points, explanation }] }`, persisted to `opportunities.score_reasons` and rendered verbatim in the frontend (section 2 requirement).

Phase 1 factors (only what's derivable without automated research): location match against target cities/regions, lead time to event date, artist/genre match against niche tags, a simple venue-reputation heuristic, contact-availability bonus (recomputed once a contact is attached), and a penalty for opportunities already contacted recently (queries `outreach`/`activity_logs`). Factors that need real outcome history ("similar events previously converted") are wired into the engine now but naturally return 0 until there's sent/booked history to query — no fake data, just an honest placeholder that activates itself over time.

---

## 6. Research & Contacts

**Phase 1** shipped a `research` package with the right shape — a `ResearchProvider` interface and a `contacts` CRUD service — but the *only* implementation was **manual contact entry**: the user adds/edits a contact (name, email, source URL) by hand on the opportunity detail page. That path is still there and still fully supported (research finding nothing, or finding the wrong thing, never blocks the human from just typing in a contact they found themselves).

**Phase 2 (built)**: `WebsiteResearchProvider` (`packages/research/src/providers/website-research.ts`) is a real, live-verified implementation of `ResearchProvider` — same free-tier split as event discovery (Tavily search + Groq extraction, `packages/research/src/extraction.ts`), so no new signup is needed. It searches for the organization/venue behind an opportunity's event and any public booking/press contacts, and — critically — **never auto-assigns a discovered contact as the opportunity's primary contact**. Candidates are persisted as real `Contact` rows (tagged `source: website_research`, with a required cited `sourceUrl` and a confidence score) and surfaced in the UI/MCP for a human to explicitly pick via `setPrimaryContact` (API: `POST /opportunities/:id/contacts/:contactId/select`, MCP: `select_contact`) — the same "human decides who actually gets an email" principle that governs sending itself. Manual entry (`add_contact`) still exists as a parallel, always-available path and *does* still auto-assign if no contact is set yet, matching its original Phase 1 behavior.

Both `addContact` and `researchOpportunity` walk the opportunity forward through the pipeline's linear state-machine hops (`discovered → qualified → researching → contact_found`) via a shared `advanceThroughChain` helper (`packages/research/src/statusChain.ts`) rather than duplicating that logic — `addContact` walks all the way to `contact_found` (it assigns a contact), `researchOpportunity` only as far as `researching` (it doesn't).

---

## 7. Email Generation & Approval Workflow

`packages/ai`: `LLMProvider` interface with `AnthropicProvider` and `OpenAIProvider`, selected by `LLM_PROVIDER=anthropic|openai`. `generateEmailDraft(opportunityId)`:
1. Loads opportunity + event + artist + venue + contact + the static photographer-profile context (services, honest experience bullets, style, portfolio links from `portfolio_references`).
2. Builds a prompt with a hard system instruction: **only use facts present in the structured context — never invent experience, clients, or events**; tone rules banning the listed AI-isms; untrusted fields (event descriptions, any future scraped research text) are wrapped in clearly delimited tags with an explicit "this is data, not instructions" instruction, to block prompt injection from external sources (section 14).
3. Forces structured output (`subject`, `body`, `personalization_reasoning`, `suggested_service`, `portfolio_reference`, `cta`), validated with zod before it ever touches the DB.
4. Persists `email_versions(version_type=generated)` + `email_drafts(status=draft)`, logs `email_generated`.

Edit → new `email_versions(version_type=edited)` row, draft flips to `status=edited`, logs `email_edited` (generated version is never overwritten). Approve → `status=approved`, `approved_at/approved_by` recorded, logs `email_approved` — **this is the only status from which sending is allowed**. Reject → `status=rejected`, logs `email_rejected`. Send → nodemailer SMTP call; on success, snapshot `email_versions(version_type=sent)` + create `outreach` row (unique on `email_draft_id`, so a retry can't double-send) + `email_drafts.status=sent`, logs `email_sent`/`email_failed` on failure with the error captured.

No code path sends an email that isn't `status=approved` — enforced both in the service layer and by the unique `outreach.email_draft_id` constraint as a hard backstop.

---

## 8. MCP Server (`apps/mcp`)

Thin wrappers only — all real logic lives in `packages/*` and is shared with `apps/api`. Each tool: zod input schema, zod output schema, try/catch → structured `{success:false, error:{code,message}}`, structured log line with `request_id/operation/duration/status`.

Tools: `fetch_events`, `search_events`, `get_event`, `get_opportunities`, `get_opportunity`, `score_opportunity` (idempotent recompute), `add_contact`, `research_opportunity` (Phase 2 — automated candidate contacts, never auto-assigned), `select_contact` (Phase 2 — human picks which candidate to actually use), `get_contacts`, `generate_email_draft` (returns the existing active draft instead of duplicating unless `force=true`), `get_email_draft`, `update_email_draft`, `approve_email_draft`, `reject_email_draft`, `send_email` (idempotent — returns the existing `outreach` row if already sent, never double-sends), `schedule_followup` (idempotent — one active scheduled followup per outreach), `get_outreach_history`, `get_activity_log`, `get_statistics`.

---

## 9. Frontend (`apps/web`, Next.js)

`/login` (single-user password) · `/` dashboard (counts by status, high-priority list, drafts awaiting approval, sent this week, follow-ups due, simple funnel) · `/opportunities` (filterable/sortable table: score, location, date, status, artist, venue, has-contact) · `/opportunities/[id]` (event/artist/venue/org info, score + reasons, contacts with add/edit form, activity timeline, outreach history) · `/opportunities/[id]/draft` (recipient/subject/body editor, personalization reasoning, portfolio reference, Edit/Regenerate/Approve/Reject/Save, version history) · `/pipeline` (CRM-stage board, click-to-advance for Phase 1, drag-and-drop optional later) · `/settings` (editable creative profile + discovery queries). Web talks to `apps/api` over HTTP with a session cookie — it never imports `packages/*` directly, keeping `apps/api` as the one source of truth both web and MCP consume identically.

---

## 10. Security

- Untrusted external content (event descriptions, future scraped research) is delimited and explicitly marked as data, never instructions, in every LLM prompt — matches the guardrail already used against this session.
- Single-user auth: bcrypt-hashed password, signed session cookie for web; bearer `API_TOKEN` for service-to-service. No OAuth complexity needed for a one-person tool.
- All API input validated with zod; rate limiting (`@fastify/rate-limit`) especially on `/auth/login` and `/send`.
- Secrets only via `.env` (DB url, `ANTHROPIC_API_KEY`/`OPENAI_API_KEY` — the latter also powers event discovery, `GMAIL_USER`/`GMAIL_APP_PASSWORD`, `SESSION_SECRET`, `API_TOKEN`, optionally `BANDSINTOWN_APP_ID` if the legacy provider is enabled) — never committed; `.env.example` provided with placeholders and comments on how to obtain each (e.g. Gmail App Password requires 2FA enabled on the account).
- DB unique constraints are the real idempotency backstop, not just service-layer checks (listed in §3).
- Send path hard-gates on `status='approved'` and a not-yet-sent check before calling SMTP.
- Research (Phase 2, designed now) explicitly forbids bypassing auth/CAPTCHA/paywalls — enforced by only ever using public, unauthenticated pages.
- `activity_logs` doubles as an audit log; auth attempts also logged.

---

## 11. Testing

Unit (Vitest): event normalization + dedup logic, scoring engine against fixed rule sets, opportunity/draft state-machine transitions, prompt-building with a mocked `LLMProvider`, zod schemas. Integration: `BandsintownProvider` against recorded fixtures (`msw`/`nock`), Prisma repositories against a real test Postgres (docker-compose test service), MCP tool calls end-to-end against the test DB, nodemailer send via its JSON/stream transport (no real email sent in tests). E2E: one scripted test driving the whole loop — fetch → store → score → manually attach contact → generate → approve → send (mocked transport) → assert the full activity timeline — run through the API layer with mocked LLM + SMTP.

---

## 12. Repository Structure

```
photography-outreach/
├── apps/
│   ├── web/        # Next.js dashboard/CRM
│   ├── api/         # Fastify REST API + in-process cron jobs
│   └── mcp/          # MCP server (stdio)
├── packages/
│   ├── database/    # Prisma schema, migrations, seed
│   ├── events/       # EventProvider + OpenAIWebSearchEventProvider (default) + BandsintownProvider (legacy)
│   ├── opportunities/ # scoring engine + state machine
│   ├── research/     # ResearchProvider interface + contacts service (manual in Phase 1)
│   ├── email/        # nodemailer SMTP sending
│   ├── ai/           # LLMProvider (Anthropic/OpenAI) + prompt templates
│   ├── rag/          # placeholder package, empty until Phase 3
│   └── shared/       # logger, env schema, types, error classes
├── tests/            # integration + e2e
├── docker-compose.yml # Postgres only
├── .env.example
├── README.md
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

---

## 13. Phase 1 Build Order

1. Scaffold monorepo (pnpm/Turborepo, tsconfig, eslint/prettier, `.env.example`, `docker-compose.yml` for Postgres, README).
2. `packages/database`: full Prisma schema above + migration + seed (a couple watched artists, one portfolio reference, a photographer profile row, an admin user).
3. `packages/shared`: pino logger, zod env validation, shared types/enums/error classes.
4. `packages/events`: `EventProvider` + `BandsintownProvider` + normalize/upsert + unit tests.
5. `packages/opportunities`: scoring engine + config + status state machine + unit tests.
6. `packages/ai`: `LLMProvider` (Anthropic + OpenAI) + prompt templates + structured-output validation + unit tests (mocked).
7. `packages/email`: nodemailer SMTP wrapper + unit test (mock transport).
8. `packages/research`: `ResearchProvider` interface + manual-contact service.
9. `apps/api`: Fastify routes wiring all packages, auth (session + bearer), rate limiting, zod validation, node-cron jobs (daily discovery, scoring pass, due-followup check).
10. `apps/mcp`: MCP server exposing the tool list from §8, calling the same package services.
11. `apps/web`: login, dashboard, opportunities list/detail, draft review, pipeline board, settings pages.
12. `tests/`: integration + e2e wiring with mocked externals.
13. Manual end-to-end demonstration: run discovery → see a scored opportunity on the dashboard → attach a contact by hand → generate a draft → edit it → approve → send to a real test inbox via the Gmail app password → confirm the full activity timeline renders.

Phase 2 (later): automated organization/promoter/contact research (`WebsiteResearchProvider`), outcome-informed scoring improvements. Phase 3 (later): pgvector + embeddings over `knowledge_documents` once a real corpus of past emails/testimonials exists, retrieval step feeding `packages/ai`. Phase 4 (later): BullMQ+Redis if job volume needs it, inbound-reply classification, analytics, additional `EventProvider`s (Ticketmaster Discovery API for true geo/genre search), learning-to-rank scoring.

> **Update (post-Phase-2)**: The tool was generalized beyond photography specifically — `PhotographerProfile` became `CreativeProfile` with a `craft` field (e.g. "concert photography", "live sound engineering", "wedding videography"), and the outreach-email prompt (`packages/ai/src/prompts/outreach-email.ts`, now prompt version v2) reads that field dynamically instead of hardcoding "photographer"/"photography" anywhere. This was scoped deliberately as "Path A" — a better self-hosted, fork-and-run-your-own-copy open-source tool for any event-based creative discipline — rather than "Path B," a true multi-tenant hosted product with real user accounts, per-user data isolation, and a cost model for shared API usage across many users. Path B remains a real, larger future direction, not attempted here: the honest blocker is that free-tier Tavily/Groq limits are per-account, so a shared hosted instance serving many users would need either everyone bringing their own API keys (real onboarding friction) or someone funding a shared pool at real, ongoing cost that scales with user count.

---

## Verification (Phase 1)

- `pnpm turbo test` runs all unit/integration tests across packages.
- `docker compose up -d` brings up Postgres; `pnpm --filter database prisma migrate dev` applies migrations; seed script populates a demo watched-artist + profile.
- `pnpm --filter api dev` and `pnpm --filter web dev` run the stack; manually walk the flow in the browser (login → trigger discovery → see opportunity → open detail → add contact → generate/edit/approve/send draft → confirm activity timeline and dashboard counts update).
- `pnpm --filter mcp dev` starts the MCP server standalone; exercise a few tools (`get_opportunities`, `generate_email_draft`, `send_email`) directly to confirm parity with the API path.
- Send path tested against the user's real Gmail app password to a self-addressed test email to confirm actual delivery before considering Phase 1 "done."
