import { loadEnvFile } from "node:process";
import pg from "pg";

const [command, ...argumentsList] = process.argv.slice(2);
const values = new Map();
for (let index = 0; index < argumentsList.length; index += 2) {
  const key = argumentsList[index];
  const value = argumentsList[index + 1];
  if (!key?.startsWith("--") || !value || values.has(key)) throw new Error("Argumen tidak valid.");
  values.set(key, value);
}

function usage() {
  throw new Error("Gunakan: user:approve --email <email> --name <nama> --role admin|editor; user:disable --email <email>; user:enable --email <email>; user:role --email <email> --role admin|editor");
}

function email() {
  const value = values.get("--email")?.trim().toLowerCase();
  if (!value || value.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) usage();
  return value;
}

function role() {
  const value = values.get("--role");
  if (value !== "admin" && value !== "editor") usage();
  return value;
}

function name() {
  const value = values.get("--name")?.trim();
  if (!value || value.length > 120) usage();
  return value;
}

loadEnvFile(".env.migration.local");
const target = new URL(process.env.DATABASE_MIGRATION_URL);
if (!['localhost', '127.0.0.1'].includes(target.hostname) || target.port !== '15432' || target.pathname !== '/lelang_properti_dev') {
  throw new Error("Manajemen akun bootstrap hanya menerima database development loopback.");
}

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
      if (profile.rowCount !== 1) throw new Error("Akun sudah ada. Gunakan user:role atau user:enable secara eksplisit.");
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
  console.error("Operasi gagal; perubahan dibatalkan. Periksa argumen, status akun, dan koneksi database lokal. Approval hanya untuk akun baru.");
  process.exitCode = 1;
} finally {
  await client.end();
}
