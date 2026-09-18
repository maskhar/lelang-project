import "server-only";
import { getServerEnvironment } from "@/server/env";
import { getAuthConfig } from "./config";

// Local review shortcut: sign in as a synthetic account for one role without Google.
// Guarded so it can never exist on a deployed environment. Every condition must hold:
//   1. NODE_ENV is not production
//   2. DEV_ROLE_LOGIN=1 is set explicitly (absent means off)
//   3. the auth origin is plain http on localhost, never an https deployment
//   4. DATABASE_URL points at the loopback development database
export const devLoginRoles = ["admin", "editor", "owner", "agent", "buyer"] as const;
export type DevLoginRole = (typeof devLoginRoles)[number];

export function isDevRoleLoginEnabled() {
  if (getServerEnvironment().NODE_ENV === "production") return false;
  if (process.env.DEV_ROLE_LOGIN !== "1") return false;
  try {
    if (getAuthConfig().secure) return false;
    const target = new URL(process.env.DATABASE_URL || "");
    if (!["localhost", "127.0.0.1"].includes(target.hostname) || target.port !== "15432" || target.pathname !== "/lelang_properti_dev") return false;
  } catch {
    return false;
  }
  return true;
}

export function devLoginEmail(role: DevLoginRole) {
  return "dev-" + role + "@lelang.local";
}
