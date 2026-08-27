const { Pool } = require("pg");

const DATABASE_URL = process.env.DATABASE_URL || "postgres://localhost:5432/furgle";

const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 20,
  // Railway (and most hosted Postgres) requires TLS with a self-signed cert.
  // Enable it by default; set DATABASE_SSL=false to connect without TLS.
  ssl: process.env.DATABASE_SSL === "false" ? undefined : { rejectUnauthorized: false },
});

// SQLite's datetime('now') emits "YYYY-MM-DD HH:MM:SS" in UTC. Match it so
// existing TEXT timestamp columns and string comparisons behave identically.
const NOW_UTC = "to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')";

// Convert SQLite "?" placeholders to Postgres "$1, $2, ..." in order.
function toPg(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => "$" + (++i));
}

// Normalize params: allow either (...args) or a single array argument.
function norm(args) {
  return args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
}

// Build a get/all/run/exec facade bound to a given query function (pool or a
// dedicated client), so transaction bodies share the same helpers.
function makeExecutor(query) {
  return {
    async get(sql, ...args) {
      const r = await query(toPg(sql), norm(args));
      return r.rows[0];
    },
    async all(sql, ...args) {
      const r = await query(toPg(sql), norm(args));
      return r.rows;
    },
    async run(sql, ...args) {
      const r = await query(toPg(sql), norm(args));
      return { changes: r.rowCount };
    },
    async exec(sql) {
      await query(sql, []);
    },
  };
}

const db = {
  pool,
  ...makeExecutor((text, params) => pool.query(text, params)),

  // Run fn(tx) inside a single transaction. tx has get/all/run bound to the
  // same connection; everything commits atomically or rolls back on error.
  async transaction(fn) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const tx = makeExecutor((text, params) => client.query(text, params));
      const result = await fn(tx);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      try { await client.query("ROLLBACK"); } catch {}
      throw err;
    } finally {
      client.release();
    }
  },
};

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      phone TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      password_hash TEXT NOT NULL,
      wallet_balance DOUBLE PRECISION NOT NULL DEFAULT 0,
      total_earnings DOUBLE PRECISION NOT NULL DEFAULT 0,
      referral_earnings DOUBLE PRECISION NOT NULL DEFAULT 0,
      referral_code TEXT UNIQUE NOT NULL,
      referred_by TEXT,
      bank_name TEXT,
      account_number TEXT,
      account_name TEXT,
      bank_code TEXT,
      is_admin INTEGER NOT NULL DEFAULT 0,
      is_blocked INTEGER NOT NULL DEFAULT 0,
      security_question_1 TEXT,
      security_answer_1_hash TEXT,
      security_question_2 TEXT,
      security_answer_2_hash TEXT,
      has_withdrawal_pin INTEGER NOT NULL DEFAULT 0,
      withdrawal_pin_hash TEXT,
      withdrawal_pin_locked INTEGER NOT NULL DEFAULT 0,
      last_daily_claim_at TEXT,
      created_at TEXT NOT NULL DEFAULT ${NOW_UTC}
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      image_url TEXT NOT NULL DEFAULT '',
      price DOUBLE PRECISION NOT NULL,
      daily_profit_percent DOUBLE PRECISION NOT NULL,
      daily_profit_amount DOUBLE PRECISION NOT NULL,
      duration_days INTEGER NOT NULL,
      min_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
      max_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT ${NOW_UTC}
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS investments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      product_id TEXT NOT NULL REFERENCES products(id),
      product_name TEXT NOT NULL,
      amount DOUBLE PRECISION NOT NULL,
      daily_profit_percent DOUBLE PRECISION NOT NULL,
      daily_profit_amount DOUBLE PRECISION NOT NULL,
      duration_days INTEGER NOT NULL,
      days_paid INTEGER NOT NULL DEFAULT 0,
      total_profit_paid DOUBLE PRECISION NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      last_payout_at TEXT,
      paused_at TEXT,
      pause_reason TEXT,
      auto_resume_at TEXT,
      cancelled_at TEXT,
      cancel_reason TEXT,
      started_at TEXT NOT NULL DEFAULT ${NOW_UTC},
      completed_at TEXT
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS deposits (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      amount DOUBLE PRECISION NOT NULL,
      reference TEXT UNIQUE NOT NULL,
      method TEXT NOT NULL DEFAULT 'paystack',
      status TEXT NOT NULL DEFAULT 'pending',
      account_name TEXT,
      account_number TEXT,
      bank_name TEXT,
      gateway_id TEXT,
      nomba_deposit_type TEXT,
      virtual_account_number TEXT,
      created_at TEXT NOT NULL DEFAULT ${NOW_UTC},
      updated_at TEXT NOT NULL DEFAULT ${NOW_UTC},
      pay_order_id TEXT,
      next_poll_at TEXT,
      last_polled_at TEXT
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS withdrawals (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      amount DOUBLE PRECISION NOT NULL,
      fee DOUBLE PRECISION NOT NULL DEFAULT 0,
      net_amount DOUBLE PRECISION NOT NULL,
      reference TEXT UNIQUE NOT NULL,
      method TEXT NOT NULL DEFAULT 'nomba',
      status TEXT NOT NULL DEFAULT 'pending',
      bank_name TEXT,
      account_number TEXT,
      account_name TEXT,
      bank_code TEXT,
      nomba_reference TEXT,
      failure_reason TEXT,
      created_at TEXT NOT NULL DEFAULT ${NOW_UTC},
      updated_at TEXT NOT NULL DEFAULT ${NOW_UTC},
      processed_at TEXT,
      gateway_reference TEXT,
      gateway TEXT,
      next_poll_at TEXT,
      last_polled_at TEXT
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      type TEXT NOT NULL,
      amount DOUBLE PRECISION NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      balance_after DOUBLE PRECISION NOT NULL DEFAULT 0,
      meta TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT ${NOW_UTC}
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS referrals (
      id TEXT PRIMARY KEY,
      referrer_id TEXT NOT NULL REFERENCES users(id),
      referred_id TEXT NOT NULL REFERENCES users(id),
      generation INTEGER NOT NULL DEFAULT 1,
      bonus_paid DOUBLE PRECISION NOT NULL DEFAULT 0,
      referred_invested DOUBLE PRECISION NOT NULL DEFAULT 0,
      referred_investment_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT ${NOW_UTC}
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS coupons (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      amount DOUBLE PRECISION NOT NULL,
      max_uses INTEGER NOT NULL DEFAULT 100,
      used_count INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      expires_at TEXT,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT ${NOW_UTC}
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS coupon_redemptions (
      id TEXT PRIMARY KEY,
      coupon_id TEXT NOT NULL REFERENCES coupons(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT ${NOW_UTC},
      UNIQUE(coupon_id, user_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS announcements (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      style TEXT NOT NULL DEFAULT 'info',
      cta_type TEXT NOT NULL DEFAULT 'none',
      cta_label TEXT,
      cta_url TEXT,
      starts_at TEXT,
      ends_at TEXT,
      hide_from_newcomers_hours INTEGER NOT NULL DEFAULT 0,
      reshow_interval_minutes INTEGER NOT NULL DEFAULT 0,
      priority INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT ${NOW_UTC},
      updated_at TEXT NOT NULL DEFAULT ${NOW_UTC}
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT ''
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS activity_log (
      id TEXT PRIMARY KEY,
      admin_id TEXT NOT NULL,
      admin_phone TEXT NOT NULL,
      admin_name TEXT NOT NULL,
      action TEXT NOT NULL,
      target_type TEXT,
      target_id TEXT,
      description TEXT NOT NULL DEFAULT '',
      meta TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT ${NOW_UTC}
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS password_resets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      reason TEXT NOT NULL DEFAULT '',
      new_password_hash TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      admin_note TEXT,
      acted_at TEXT,
      acted_by_phone TEXT,
      created_at TEXT NOT NULL DEFAULT ${NOW_UTC},
      resolved_at TEXT
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS manual_adjustments (
      id TEXT PRIMARY KEY,
      admin_id TEXT NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id),
      type TEXT NOT NULL,
      amount DOUBLE PRECISION NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT ${NOW_UTC}
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS daily_claims (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      amount DOUBLE PRECISION NOT NULL,
      claimed_at TEXT NOT NULL DEFAULT ${NOW_UTC}
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_alerts (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL DEFAULT 'gateway_payout_failed',
      message TEXT NOT NULL DEFAULT '',
      withdrawal_id TEXT,
      gateway TEXT,
      severity TEXT NOT NULL DEFAULT 'error',
      created_at TEXT NOT NULL DEFAULT ${NOW_UTC},
      resolved_at TEXT
    )
  `);

  await pool.query("CREATE INDEX IF NOT EXISTS idx_deposits_status ON deposits(status)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON withdrawals(status)");

  // Migrations for columns added after the initial schema.
  await pool.query("ALTER TABLE deposits ADD COLUMN IF NOT EXISTS expires_at TEXT");

  return db;
}

module.exports = { db, pool, init };
