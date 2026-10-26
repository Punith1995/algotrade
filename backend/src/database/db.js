/**
 * Application state store — JSON file, with OPTIONAL PostgreSQL durability.
 *
 * Default (no config needed): everything persists to data/db.json.
 *
 * PostgreSQL mode — set DATABASE_URL in backend/.env and the same state
 * additionally syncs to Postgres every few seconds and restores from it
 * on boot (survives disk loss / machine moves / redeploys):
 *
 *   1. Create the database once:   psql -U postgres -c "CREATE DATABASE algotrade;"
 *   2. backend/.env:               DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/algotrade
 *   3. Restart the backend — look for "[db] PostgreSQL connected".
 *
 * The table (app_state) is created automatically. No migrations needed.
 */
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "../../data");
const DB_FILE = path.join(DATA_DIR, "db.json");
let db = { signals: [], trades: [], alerts: [], positions: [], watchlist: null, settings: {} };
let dirty = false;
let pool = null;

try {
  if (fs.existsSync(DB_FILE)) db = { ...db, ...JSON.parse(fs.readFileSync(DB_FILE, "utf8")) };
} catch (e) { console.warn("[db] fresh database:", e.message); }

function flushFile() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DB_FILE, JSON.stringify(db));
}

async function flushPg() {
  if (!pool) return;
  try {
    await pool.query(
      `INSERT INTO app_state (id, data, updated) VALUES ('main', $1, now())
       ON CONFLICT (id) DO UPDATE SET data = $1, updated = now()`,
      [JSON.stringify(db)]
    );
  } catch (e) { console.warn("[db] Postgres sync failed:", e.message); }
}

function flush() {
  if (!dirty) return;
  flushFile();
  flushPg();
  dirty = false;
}
setInterval(flush, 5000).unref();
process.on("exit", flushFile);

/** Call once at boot (server.js). Safe no-op without DATABASE_URL. */
async function initPostgres() {
  const url = process.env.DATABASE_URL;
  if (!url) return false;
  try {
    const { Pool } = require("pg");
    pool = new Pool({ connectionString: url, max: 3 });
    await pool.query(`CREATE TABLE IF NOT EXISTS app_state (
      id text PRIMARY KEY, data jsonb NOT NULL, updated timestamptz NOT NULL DEFAULT now())`);
    const { rows } = await pool.query("SELECT data, updated FROM app_state WHERE id = 'main'");
    if (rows.length) {
      const fileTime = fs.existsSync(DB_FILE) ? fs.statSync(DB_FILE).mtimeMs : 0;
      const pgTime = new Date(rows[0].updated).getTime();
      if (pgTime > fileTime) {
        db = { ...db, ...rows[0].data };
        flushFile();
        console.log("[db] Restored newer state from PostgreSQL.");
      }
    }
    console.log("[db] PostgreSQL connected — state syncs to Postgres (durable across restarts/machines).");
    return true;
  } catch (e) {
    pool = null;
    console.error(`[db] PostgreSQL connection failed (${e.message}) — continuing with the JSON file. Check DATABASE_URL and that Postgres is running.`);
    return false;
  }
}

module.exports = {
  get: (col) => db[col],
  set: (col, val) => { db[col] = val; dirty = true; },
  push: (col, item, max = 5000) => {
    if (!db[col]) db[col] = [];
    db[col].push(item);
    if (db[col].length > max) db[col] = db[col].slice(-max);
    dirty = true;
  },
  initPostgres,
  /** "postgres" when DATABASE_URL is set and connected, else "json-file". */
  mode: () => (process.env.DATABASE_URL ? "postgres" : "json-file"),
};
