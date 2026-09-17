import path from "node:path";
import { z } from "zod";

const hexSecret = z.string().regex(/^[a-f0-9]{64,}$/, "wajib hex minimal 64 karakter");

const serverEnvironmentSchema = z.object({
  DATABASE_URL: z.string().url().refine((value) => ["postgres:", "postgresql:"].includes(new URL(value).protocol), "Gunakan URL PostgreSQL.").optional(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type ServerEnvironment = z.infer<typeof serverEnvironmentSchema>;

let cachedEnvironment: ServerEnvironment | undefined;

export function getServerEnvironment(): ServerEnvironment {
  if (!cachedEnvironment) {
    cachedEnvironment = serverEnvironmentSchema.parse({ DATABASE_URL: process.env.DATABASE_URL, NODE_ENV: process.env.NODE_ENV });
  }

  return cachedEnvironment;
}

export function resetServerEnvironment() {
  cachedEnvironment = undefined;
}

export function parseAuthOrigin(value: unknown) {
  const origin = z.url().parse(value);
  const base = new URL(origin);
  if (!["http:", "https:"].includes(base.protocol) || base.username || base.password || (base.protocol === "http:" && !["localhost", "127.0.0.1", "[::1]"].includes(base.hostname))) {
    throw new Error("Auth origin must use HTTPS outside localhost.");
  }
  return { origin: base.origin, secure: base.protocol === "https:" };
}

export function parseStorageRoot(value: unknown) {
  if (typeof value !== "string" || !value || !path.isAbsolute(value)) throw new Error("STORAGE_ROOT harus path absolut di luar repository.");
  const resolved = path.normalize(value);
  const relative = path.relative(process.cwd(), resolved);
  if (!relative || (!relative.startsWith(".." + path.sep) && relative !== ".." && !path.isAbsolute(relative))) {
    throw new Error("STORAGE_ROOT tidak boleh di dalam repository.");
  }
  return resolved;
}

export function parseAuthSecrets() {
  return z.object({ csrfSecret: hexSecret, rateLimitSecret: hexSecret }).parse({
    csrfSecret: process.env.AUTH_CSRF_SECRET,
    rateLimitSecret: process.env.AUTH_RATE_LIMIT_SECRET,
  });
}

export function assertBootEnvironment(scope: "app" | "worker" = "app") {
  const problems: string[] = [];
  const check = (name: string, run: () => unknown) => { try { run(); } catch { problems.push(name); } };

  check("DATABASE_URL", () => { if (!serverEnvironmentSchema.parse({ DATABASE_URL: process.env.DATABASE_URL, NODE_ENV: process.env.NODE_ENV }).DATABASE_URL) throw new Error("kosong"); });
  check("STORAGE_ROOT", () => parseStorageRoot(process.env.STORAGE_ROOT));

  if (scope === "app") {
    check("APP_BASE_URL", () => parseAuthOrigin(process.env.APP_BASE_URL));
    check("AUTH_CSRF_SECRET / AUTH_RATE_LIMIT_SECRET", parseAuthSecrets);
    check("GOOGLE_CLIENT_ID", () => z.string().endsWith(".apps.googleusercontent.com").parse(process.env.GOOGLE_CLIENT_ID));
    check("GOOGLE_CLIENT_SECRET", () => z.string().min(1).parse(process.env.GOOGLE_CLIENT_SECRET));
    check("GOOGLE_REDIRECT_URI", () => {
      const expected = parseAuthOrigin(process.env.APP_BASE_URL).origin + "/api/v1/auth/google/callback";
      if (process.env.GOOGLE_REDIRECT_URI !== expected) throw new Error("tidak cocok dengan APP_BASE_URL");
    });
  }

  if (problems.length) throw new Error("Konfigurasi environment tidak valid: " + problems.join(", ") + ". Periksa .env.local terhadap .env.example.");
}
