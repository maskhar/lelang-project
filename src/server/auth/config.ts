import "server-only";
import { z } from "zod";

export function getAuthConfig() {
  const parsed = z.object({ origin: z.url(), secret: z.string().regex(/^[a-f0-9]{64,}$/), rateSecret: z.string().regex(/^[a-f0-9]{64,}$/) }).safeParse({
    origin: process.env.APP_BASE_URL,
    secret: process.env.AUTH_CSRF_SECRET,
    rateSecret: process.env.AUTH_RATE_LIMIT_SECRET,
  });
  if (!parsed.success) throw new Error("Auth configuration unavailable.");
  const base = new URL(parsed.data.origin);
  if (!["http:", "https:"].includes(base.protocol) || base.username || base.password || (base.protocol === "http:" && !["localhost", "127.0.0.1", "[::1]"].includes(base.hostname))) {
    throw new Error("Auth origin must use HTTPS outside localhost.");
  }
  return { origin: base.origin, secure: base.protocol === "https:", csrfSecret: parsed.data.secret, rateLimitSecret: parsed.data.rateSecret };
}
