import { z } from "zod";

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
