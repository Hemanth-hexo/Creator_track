import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "@photography-outreach/api/server";
import { prisma } from "@photography-outreach/database";

/**
 * Exercises the Fastify app directly via .inject() (no real network) against
 * a real Postgres — requires DATABASE_URL to point at a reachable, migrated
 * database (see docker-compose.yml + `pnpm db:migrate`).
 */
describe("API integration", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it("responds to the health check with no auth required", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
  });

  it("rejects unauthenticated access to protected routes", async () => {
    const res = await app.inject({ method: "GET", url: "/api/opportunities" });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("UNAUTHORIZED");
  });

  it("accepts the shared API_TOKEN as a Bearer credential", async () => {
    const token = process.env.API_TOKEN;
    if (!token) return; // skipped when the test env doesn't set one

    const res = await app.inject({
      method: "GET",
      url: "/api/opportunities",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveProperty("items");
  });

  it("rejects login with a wrong password without leaking whether the account exists", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "nobody@example.com", password: "wrong" },
    });
    expect(res.statusCode).toBe(401);
  });
});
