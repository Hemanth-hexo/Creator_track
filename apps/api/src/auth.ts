import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import bcrypt from "bcryptjs";
import { prisma } from "@photography-outreach/database";
import { loadEnv } from "@photography-outreach/shared";

const SESSION_COOKIE = "session";
const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

declare module "fastify" {
  interface FastifyRequest {
    actor?: { type: "user" | "service"; id: string };
  }
}

export async function verifyLogin(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return null;
  const valid = await bcrypt.compare(password, user.passwordHash);
  return valid ? user : null;
}

export function setSessionCookie(reply: FastifyReply, userId: string) {
  reply.setCookie(SESSION_COOKIE, userId, {
    signed: true,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export function clearSessionCookie(reply: FastifyReply) {
  reply.clearCookie(SESSION_COOKIE, { path: "/" });
}

/**
 * Auth gate used on every non-public route: accepts either a signed session
 * cookie (the web dashboard) or a Bearer API_TOKEN (the MCP server / scripts
 * calling the API directly). Neither path is optional — there is no
 * unauthenticated access to opportunity/contact/send endpoints.
 */
export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  const env = loadEnv();

  const authHeader = request.headers.authorization;
  if (authHeader?.startsWith("Bearer ") && env.API_TOKEN) {
    const token = authHeader.slice("Bearer ".length);
    if (token === env.API_TOKEN) {
      request.actor = { type: "service", id: "mcp" };
      return;
    }
  }

  const raw = request.cookies[SESSION_COOKIE];
  if (raw) {
    const unsigned = request.unsignCookie(raw);
    if (unsigned.valid && unsigned.value) {
      request.actor = { type: "user", id: unsigned.value };
      return;
    }
  }

  reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Login required" } });
}

export function registerAuthDecorators(app: FastifyInstance) {
  app.decorate("authenticate", authenticate);
}
