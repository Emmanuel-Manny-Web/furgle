// One-off data migration from the legacy SQLite database (naaturalis.db) to
// PostgreSQL. Idempotent: re-running it skips rows that already exist.
//
// Usage:
//   node migrate-sqlite-to-pg.js
//
// Env:
//   DATABASE_URL  - PostgreSQL connection string (required; read from .env).
//   DATABASE_SSL  - set "true" if the Postgres endpoint requires TLS.
//   SQLITE_PATH   - path to the SQLite file (defaults to ./naaturalis.db).
//
// Recommended flow: run this against a FRESH Postgres database, then start the
// server (its seed step becomes a no-op via ON CONFLICT DO NOTHING).

require("./env");

const path = require("path");
const { DatabaseSync } = require("node:sqlite");
const { init, pool } = require("./db");

const SQLITE_PATH = process.env.SQLITE_PATH || path.join(__dirname, "naaturalis.db");

// Parents before children so foreign keys resolve in order.
const TABLES = [
  "settings",
  "products",
  "users",
  "coupons",
  "announcements",
  "investments",
  "deposits",
  "withdrawals",
  "transactions",
  "referrals",
  "coupon_redemptions",
  "activity_log",
  "password_resets",
  "manual_adjustments",
  "daily_claims",
  "admin_alerts",
];

const BATCH = 500;

async function pgColumns(client, table) {
  const r = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`,
    [table]
  );
  return r.rows.map((x) => x.column_name);
}

async function migrateTable(client, sqlite, table, pgCols) {
  const sqliteCols = sqlite.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  const cols = pgCols.filter((c) => sqliteCols.includes(c));
  if (cols.length === 0) {
    console.log(`  ${table}: no common columns, skipped`);
    return 0;
  }
  const rows = sqlite.prepare(`SELECT * FROM ${table}`).all();
  if (rows.length === 0) {
    console.log(`  ${table}: 0 rows`);
    return 0;
  }

  const colList = cols.map((c) => `"${c}"`).join(", ");
  let inserted = 0;

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const values = [];
    const params = [];
    let n = 1;
    for (const row of batch) {
      const placeholders = cols.map((c) => {
        const v = row[c];
        params.push(v === undefined ? null : v);
        return "$" + n++;
      });
      values.push("(" + placeholders.join(", ") + ")");
    }
    const sql = `INSERT INTO ${table} (${colList}) VALUES ${values.join(", ")} ON CONFLICT DO NOTHING`;
    const r = await client.query(sql, params);
    inserted += r.rowCount;
  }

  console.log(`  ${table}: ${rows.length} rows (${inserted} inserted)`);
  return inserted;
}

async function main() {
  await init();
  console.log("SQLite source:", SQLITE_PATH);
  const sqlite = new DatabaseSync(SQLITE_PATH, { readOnly: true });

  // Run the entire migration on a single connection with FK enforcement
  // disabled, so rows can load in bulk without ordering/orphan issues.
  const client = await pool.connect();
  await client.query("SET session_replication_role = replica");
  let total = 0;
  try {
    for (const table of TABLES) {
      const pgCols = await pgColumns(client, table);
      total += await migrateTable(client, sqlite, table, pgCols);
    }
  } finally {
    await client.query("SET session_replication_role = DEFAULT");
    client.release();
  }

  sqlite.close();
  console.log("Migration complete. Total rows inserted:", total);
  await pool.end();
}

main().catch((err) => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});
