import type { FastifyInstance, RouteShorthandOptions } from "fastify";
import { z } from "zod";
import { clearSessionCookie, setSessionCookie, verifyLogin } from "../auth.js";

export function registerAuthRoutes(app: FastifyInstance, opts: RouteShorthandOptions = {}) {
  app.post(
    "/api/auth/login",
    { ...opts, schema: { body: z.object({ email: z.string().email(), password: z.string().min(1) }) } },
    async (request, reply) => {
      const { email, password } = request.body as { email: string; password: string };
      const user = await verifyLogin(email, password);
      if (!user) {
        reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Invalid email or password" } });
        return;
      }
      setSessionCookie(reply, user.id);
      return { ok: true };
    },
  );

  app.post("/api/auth/logout", async (_request, reply) => {
    clearSessionCookie(reply);
    return { ok: true };
  });
}
