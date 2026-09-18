import { loadEnvFile } from "node:process";
import pg from "pg";

// One-time local setup for the /login dev-role-login buttons (DEV_ROLE_LOGIN=1).
// Uses the migration-privileged role because the runtime app role is intentionally
// forbidden from inserting into app.profiles (see scripts/grant-runtime.sql).
loadEnvFile(".env.migration.local");
const target = new URL(process.env.DATABASE_MIGRATION_URL);
if (!["localhost", "127.0.0.1"].includes(target.hostname) || target.port !== "15432" || target.pathname !== "/lelang_properti_dev") {
  throw new Error("Dev role seed requires local development database.");
}

const roles = ["admin", "editor", "owner", "agent", "buyer"];
const client = new pg.Client({ connectionString: target.toString() });
try {
  await client.connect();
  for (const role of roles) {
    const email = "dev-" + role + "@lelang.local";
    await client.query("BEGIN");
    try {
      const inserted = await client.query("INSERT INTO app.profiles (email, name) VALUES ($1, $2) ON CONFLICT (lower(email)) DO NOTHING RETURNING id", [email, "Dev " + role]);
      const id = inserted.rows[0]?.id ?? (await client.query("SELECT id FROM app.profiles WHERE lower(email) = $1", [email])).rows[0].id;
      await client.query("INSERT INTO app.user_roles (user_id, role) VALUES ($1, $2) ON CONFLICT DO NOTHING", [id, role]);
      await client.query("UPDATE app.profiles SET status = 'active' WHERE id = $1", [id]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
  console.log("Dev role accounts ready: " + roles.map((role) => "dev-" + role + "@lelang.local").join(", "));
} finally {
  await client.end();
}
