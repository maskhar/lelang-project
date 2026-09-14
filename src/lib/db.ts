import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { seedProperties, type Property } from "./properties";

const directory = process.env.PROPERTY_DATA_DIR || path.join(process.cwd(), "data");
mkdirSync(directory, { recursive: true });
const database = new DatabaseSync(path.join(directory, "lelang-properti.sqlite"));
database.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS properties (id INTEGER PRIMARY KEY AUTOINCREMENT, payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY);");
database.exec("BEGIN IMMEDIATE");
try {
  if (!database.prepare("SELECT name FROM migrations WHERE name = ?").get("initial-properties")) {
    const insert = database.prepare("INSERT OR IGNORE INTO properties (id, payload) VALUES (?, ?)");
    for (const property of seedProperties) insert.run(property.id, JSON.stringify(property));
    database.prepare("INSERT INTO migrations (name) VALUES (?)").run("initial-properties");
    database.prepare("INSERT INTO migrations (name) VALUES (?)").run("prices-to-rupiah-v1");
  }
  if (!database.prepare("SELECT name FROM migrations WHERE name = ?").get("prices-to-rupiah-v1")) {
    const rows = database.prepare("SELECT id, payload FROM properties").all();
    const update = database.prepare("UPDATE properties SET payload = ? WHERE id = ?");
    for (const row of rows) {
      const property = JSON.parse(String(row.payload));
      property.price = Number(property.price) * 1_000_000;
      if (property.bid != null) property.bid = Number(property.bid) * 1_000_000;
      update.run(JSON.stringify(property), Number(row.id));
    }
    database.prepare("INSERT INTO migrations (name) VALUES (?)").run("prices-to-rupiah-v1");
  }
  database.exec("COMMIT");
} catch (error) {
  database.exec("ROLLBACK");
  throw error;
}
export function getProperties(): Property[] {
  return database.prepare("SELECT id, payload FROM properties ORDER BY id DESC").all().map((row) => ({ ...JSON.parse(String(row.payload)), id: Number(row.id) }));
}
export function getProperty(id: number): Property | undefined {
  const row = database.prepare("SELECT id, payload FROM properties WHERE id = ?").get(id) as { id: number; payload: string } | undefined;
  return row ? { ...JSON.parse(row.payload), id: row.id } : undefined;
}
export function createProperty(input: Omit<Property, "id">): Property {
  const property = { ...input, createdAt: new Date().toISOString() };
  const result = database.prepare("INSERT INTO properties (payload) VALUES (?)").run(JSON.stringify(property));
  return { ...property, id: Number(result.lastInsertRowid) };
}
