import "server-only";
import { parseAuthOrigin, parseAuthSecrets } from "@/server/env";

export function getAuthConfig() {
  let origin: ReturnType<typeof parseAuthOrigin>;
  let secrets: ReturnType<typeof parseAuthSecrets>;
  try {
    origin = parseAuthOrigin(process.env.APP_BASE_URL);
    secrets = parseAuthSecrets();
  } catch {
    throw new Error("Auth configuration unavailable.");
  }
  return { origin: origin.origin, secure: origin.secure, csrfSecret: secrets.csrfSecret, rateLimitSecret: secrets.rateLimitSecret };
}
