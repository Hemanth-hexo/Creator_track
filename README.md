# Photography Outreach CRM

A standalone system for discovering paid photography opportunities (concerts/events), scoring them, researching contacts, generating personalized outreach emails, and tracking everything through to a booking — with a human required to review and approve every email before it's ever sent.

**This is a fully independent project.** It does not import, modify, or depend on any existing photography portfolio website. The portfolio is only ever referenced as an external URL inside generated emails.

See [`docs/architecture.md`](./docs/architecture.md) for the full design (tech stack rationale, database schema, RAG decision, MCP tools, security model, phased roadmap).

## Pipeline

```
Discover Events (OpenAI web search) → Score Opportunities → Attach a Contact (manual in Phase 1)
  → Generate Draft (LLM) → Human Review → Approve → Send (SMTP) → Track → Follow Up
```

## Repository layout

```
apps/
  web/    Next.js dashboard/CRM (login, opportunities, pipeline, draft review, settings)
  api/    Fastify REST API + in-process cron jobs (daily discovery, follow-up checks)
  mcp/    MCP server exposing the same operations as tools (stdio transport)
packages/
  database/      Prisma schema, migrations, seed data
  events/        EventProvider abstraction + OpenAIWebSearchEventProvider (default) + BandsintownProvider (legacy, off by default)
  opportunities/ Scoring engine + pipeline state machine
  research/      Manual contact entry (Phase 1) behind a ResearchProvider interface for Phase 2
  ai/            LLMProvider abstraction (Anthropic + OpenAI) + outreach email prompt
  email/         SMTP sending, draft lifecycle (edit/approve/reject), follow-up scheduling
  rag/           Empty placeholder — see the RAG section of the architecture doc for why
  shared/        Logger, env validation, shared types/enums, error classes
tests/
  integration/   Fastify app tested via .inject() against a real test Postgres
  e2e/           Full discover → score → contact → draft → approve → send flow
```

## Prerequisites

- Node.js 20+
- pnpm (`corepack enable` or `npm install -g pnpm`)
- Docker (for local Postgres)
- A free [Tavily](https://tavily.com) API key (search) and a free [Groq](https://console.groq.com/keys) API key (extraction) — no credit card required for either; these power event discovery by default
- Optionally, an Anthropic or OpenAI API key if you'd rather use one of those for outreach email generation instead of Groq (`LLM_PROVIDER=groq` also works and needs no separate signup — see `.env.example`)
- A Gmail/Google Workspace account with 2-Step Verification enabled, to create an [App Password](https://myaccount.google.com/apppasswords)

## Setup

```bash
cp .env.example .env
# fill in .env: DATABASE_URL is already correct for the docker-compose Postgres below

pnpm install
docker compose up -d
pnpm db:migrate
pnpm db:generate
pnpm db:seed
```

Generate your admin login credentials before seeding if you want to log in immediately:

```bash
node -e "console.log(require('bcryptjs').hashSync('your-password', 10))"
# put the output in ADMIN_PASSWORD_HASH in .env, then re-run: pnpm db:seed
```

## Running

```bash
pnpm dev
```

This starts the API (`http://localhost:4000`) and the web dashboard (`http://localhost:3000`) together via Turborepo. Log in with `ADMIN_EMAIL` / the password you hashed above.

Run the MCP server standalone (e.g. to register it with an MCP-compatible client):

```bash
pnpm --filter @photography-outreach/mcp dev
```

## Testing

```bash
pnpm test          # unit tests across all packages (no external services needed)
pnpm db:migrate     # apply migrations to your local Postgres first, then:
pnpm --filter @photography-outreach/integration test
pnpm --filter @photography-outreach/e2e test
```

Unit tests mock external HTTP/LLM/SMTP calls. Integration and e2e tests need a real, migrated Postgres (the `docker-compose.yml` one is fine) but never call the real OpenAI/Anthropic/SMTP services — those are mocked in-process.

## Demonstrating the full Phase 1 flow manually

1. Add/edit discovery queries on the **Settings** page — each is a web-search query, e.g. "upcoming electronic music events in Bengaluru, India". Be specific about location and genre; two are seeded by default.
2. Click **Run event discovery** on the Dashboard.
3. Open a high-scoring opportunity, read its score explanation.
4. Add a contact you've manually verified (name/email/source).
5. Generate a draft, edit it if you want, approve it.
6. Send it — check your test inbox for the real email.
7. Scroll the opportunity's activity timeline to see every step logged.

## Security notes

- Never commit `.env`. Copy `.env.example` and fill in real values locally only.
- The send path only ever fires for drafts in `approved` status, and a unique DB constraint makes a double-send impossible even under a retry.
- All external event/web content is wrapped and explicitly marked as untrusted data before it ever reaches an LLM prompt — see `packages/shared/src/security.ts` and `packages/ai/src/prompts/outreach-email.ts`. Event discovery's web-search extraction (`packages/events/src/extraction.ts`, used by both `providers/tavily-groq.ts` and `providers/openai-web-search.ts`) applies the same principle: fetched web content is data to extract facts from, never instructions to follow, and every discovered event requires a real, verified `sourceUrl` — for the default Tavily+Groq provider this is checked against the actual search results, not just requested by instruction, so the model cannot invent one.
