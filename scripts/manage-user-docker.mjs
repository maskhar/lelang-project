import { loadEnvFile } from "node:process";
import pg from "pg";

// Padanan manage-local-user.mjs untuk stack Docker produksi. Target dibangun dari .env.docker.local
// dan tetap dipaksa loopback 127.0.0.1; tidak ada signup publik, role hanya diberikan operator.
const [command, ...argumentsList] = process.argv.slice(2);
const values = new Map();
for (let index = 0; index < argumentsList.length; index += 2) {
  const key = argumentsList[index];
  const value = argumentsList[index + 1];
  if (!key?.startsWith("--") || !value || values.has(key)) throw new Error("Argumen tidak valid.");
  values.set(key, value);
}

function usage() {
  throw new Error("Gunakan: docker:user:approve -- --email <email> --name <nama> --role admin|editor; docker:user:disable -- --email <email>; docker:user:enable -- --email <email>; docker:user:role -- --email <email> --role admin|editor");
}

function email() {
  const value = values.get("--email")?.trim().toLowerCase();
  if (!value || value.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) usage();
  return value;
}

function role() {
  const value = values.get("--role");
  if (!["admin", "editor", "owner", "agent", "buyer"].includes(value)) usage();
  return value;
}

function name() {
  const value = values.get("--name")?.trim();
  if (!value || value.length > 120) usage();
  return value;
}

try {
  loadEnvFile(".env.docker.local");
} catch {
  throw new Error("Buat .env.docker.local dari .env.docker.example terlebih dahulu.");
}
const port = process.env.POSTGRES_PORT || "15433";
const password = process.env.POSTGRES_MIGRATOR_PASSWORD;
if (!/^\d+$/.test(port) || !password) throw new Error("POSTGRES_PORT dan POSTGRES_MIGRATOR_PASSWORD wajib terisi pada .env.docker.local.");
const target = new URL("postgresql://127.0.0.1");
target.username = "lelang_migrator";
target.password = password;
target.port = port;
target.pathname = "/" + (process.env.POSTGRES_DB || "lelang_properti_prod");

const client = new pg.Client({ connectionString: target.toString() });
try {
  await client.connect();
  if (command === "approve") {
    const userEmail = email();
    const userName = name();
    const userRole = role();
    await client.query("BEGIN");
    try {
      const profile = await client.query("INSERT INTO app.profiles (email, name) VALUES ($1, $2) ON CONFLICT (lower(email)) DO NOTHING RETURNING id", [userEmail, userName]);
      if (profile.rowCount !== 1) throw new Error("Akun sudah ada. Gunakan docker:user:role atau docker:user:enable secara eksplisit.");
      await client.query("INSERT INTO app.user_roles (user_id, role) VALUES ($1, $2) ON CONFLICT DO NOTHING", [profile.rows[0].id, userRole]);
      await client.query("INSERT INTO app.audit_logs (action, entity_type, entity_id, metadata) VALUES ('auth.profile.approved', 'profile', $1, jsonb_build_object('role', $2::text))", [profile.rows[0].id, userRole]);
      await client.query("COMMIT");
      console.log("Akun disetujui. Login Google pertama dapat mengikat identitas akun ini.");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  } else if (command === "disable" || command === "enable") {
    const userEmail = email();
    const status = command === "disable" ? "disabled" : "active";
    await client.query("BEGIN");
    try {
      const profile = await client.query("UPDATE app.profiles SET status = $1, updated_at = now() WHERE email = $2 RETURNING id", [status, userEmail]);
      if (profile.rowCount !== 1) throw new Error("Akun tidak ditemukan.");
      if (command === "disable") await client.query("UPDATE app.user_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL", [profile.rows[0].id]);
      await client.query("INSERT INTO app.audit_logs (action, entity_type, entity_id, metadata) VALUES ($1, 'profile', $2, jsonb_build_object('status', $3::text))", ["auth.profile." + status, profile.rows[0].id, status]);
      await client.query("COMMIT");
      console.log(command === "disable" ? "Akun dinonaktifkan dan sesi aktif dicabut." : "Akun diaktifkan.");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  } else if (command === "role") {
    const userEmail = email();
    const userRole = role();
    await client.query("BEGIN");
    try {
      const profile = await client.query("SELECT id FROM app.profiles WHERE email = $1 FOR UPDATE", [userEmail]);
      if (profile.rowCount !== 1) throw new Error("Akun tidak ditemukan.");
      await client.query("DELETE FROM app.user_roles WHERE user_id = $1", [profile.rows[0].id]);
      await client.query("INSERT INTO app.user_roles (user_id, role) VALUES ($1, $2)", [profile.rows[0].id, userRole]);
      await client.query("UPDATE app.user_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL", [profile.rows[0].id]);
      await client.query("INSERT INTO app.audit_logs (action, entity_type, entity_id, metadata) VALUES ('auth.profile.role_changed', 'profile', $1, jsonb_build_object('role', $2::text))", [profile.rows[0].id, userRole]);
      await client.query("COMMIT");
      console.log("Role diperbarui dan sesi aktif dicabut.");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  } else {
    usage();
  }
} catch {
  console.error("Operasi gagal; perubahan dibatalkan. Periksa argumen, status akun, dan koneksi database produksi. Approval hanya untuk akun baru.");
  process.exitCode = 1;
} finally {
  await client.end();
}
