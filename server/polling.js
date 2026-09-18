const { db } = require("./db");
const { v4: uuidv4 } = require("uuid");
const juntpay = require("./juntpay");
const paystack = require("./paystack");
const duplo = require("./duplo");
const nomba = require("./nomba");
const kora = require("./kora");
const nekpay = require("./nekpay");
const fossapay = require("./fossapay");

const DAY_MS = 24 * 60 * 60 * 1000;

async function getSetting(key, fallback = "") {
  const row = await db.get("SELECT value FROM settings WHERE key = ?", key);
  return row ? row.value : fallback;
}

// Load all admin settings (with the same value coercion as routes.js) so the
// poller verifies payouts using the same gateway credentials that initiated
// them — not just env vars. Cached briefly to avoid hammering the DB.
let _settingsCache = { at: 0, data: {} };
async function getAllSettings() {
  if (Date.now() - _settingsCache.at < 30000) return _settingsCache.data;
  const rows = await db.all("SELECT key, value FROM settings");
  const map = {};
  for (const r of rows) {
    let v = r.value;
    if (v === "true") v = true;
    else if (v === "false") v = false;
    else if (v === "null" || v === "undefined") v = null;
    else if (/^-?\d+(\.\d+)?$/.test(v)) v = Number(v);
    else if (v.startsWith("[") && v.endsWith("]")) { try { v = JSON.parse(v); } catch {} }
    map[r.key] = v;
  }
  _settingsCache = { at: Date.now(), data: map };
  return map;
}

async function addTransaction(userId, type, amount, description, meta = {}) {
  const id = "tx_" + uuidv4().replace(/-/g, "").slice(0, 16);
  await db.run(`
    WITH upd AS (
      UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ? RETURNING wallet_balance
    )
    INSERT INTO transactions (id, user_id, type, amount, description, balance_after, meta)
    SELECT ?, ?, ?, ?, ?, wallet_balance, ? FROM upd
  `, amount, userId, id, userId, type, amount, description, JSON.stringify(meta));
}

async function creditDepositBonus(userId, amount, reference) {
  const pct = Number(await getSetting("deposit_bonus_percent", "0"));
  if (!pct || pct <= 0) return;
  let bonus = amount * pct / 100;
  if (bonus <= 0) return;
  const limit = Number(await getSetting("deposit_bonus_limit_per_user", "0"));
  if (limit > 0) {
    const row = await db.get(
      "SELECT COALESCE(SUM(amount),0) s FROM transactions WHERE user_id = ? AND type = 'deposit_bonus'",
      userId
    );
    const remaining = Math.max(0, limit - (row ? row.s : 0));
    if (remaining <= 0) return;
    bonus = Math.min(bonus, remaining);
  }
  await addTransaction(userId, "deposit_bonus", bonus, "Deposit bonus", { reference });
}

async function markDepositSuccess(dep) {
  const txId = "tx_" + uuidv4().replace(/-/g, "").slice(0, 16);
  // Single round trip: mark the deposit success, credit the wallet, and append
  // the deposit transaction — all atomically.
  await db.run(`
    WITH d AS (
      UPDATE deposits SET status = 'success', updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'), next_poll_at = NULL WHERE id = ? AND status <> 'success' RETURNING user_id, amount, reference, method
    ),
    u AS (
      UPDATE users SET wallet_balance = wallet_balance + d.amount FROM d WHERE users.id = d.user_id RETURNING users.id AS uid, users.wallet_balance AS bal
    )
    INSERT INTO transactions (id, user_id, type, amount, description, balance_after, meta)
    SELECT ?, d.user_id, 'deposit', d.amount, 'Deposit', u.bal, ? FROM d JOIN u ON u.uid = d.user_id
  `, dep.id, txId, JSON.stringify({ reference: dep.reference, gateway: dep.method }));
  await creditDepositBonus(dep.user_id, dep.amount, dep.reference);
}

async function markDepositFailed(dep) {
  await db.run("UPDATE deposits SET status = 'failed', updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'), next_poll_at = NULL WHERE id = ?", dep.id);
}

// Escalating backoff so abandoned records aren't re-polled every cycle forever.
// Returns null once a record is old enough to stop polling (cancelled).
function backoffMs(createdAt) {
  const parsed = createdAt ? new Date(createdAt).getTime() : NaN;
  const age = Number.isNaN(parsed) ? 0 : Math.max(0, Date.now() - parsed);
  if (age < 10 * 60 * 1000) return 30 * 1000;      // < 10 min: poll every 30s
  if (age < 60 * 60 * 1000) return 10 * 60 * 1000; // 10 min – 1 hr: every 10 min
  if (age < DAY_MS) return 30 * 60 * 1000;         // 1 hr – 24 hr: every 30 min
  return null;                                     // > 24 hr: cancel, stop polling
}

async function touchPoll(table, id, createdAt) {
  const backoff = backoffMs(createdAt);
  if (backoff === null) {
    // Old enough to give up: cancel deposits, stop polling withdrawals.
    if (table === "deposits") {
      await db.run("UPDATE deposits SET status = 'cancelled', next_poll_at = NULL WHERE id = ?", id);
    } else {
      await db.run("UPDATE withdrawals SET next_poll_at = NULL WHERE id = ?", id);
    }
    return;
  }
  const now = new Date().toISOString();
  const next = new Date(Date.now() + backoff).toISOString();
  await db.run(`UPDATE ${table} SET last_polled_at = ?, next_poll_at = ? WHERE id = ?`, now, next, id);
}

// Run async fn over items with a bounded concurrency.
async function mapLimit(items, limit, fn) {
  let idx = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (idx < items.length) {
      const i = idx++;
      try {
        await fn(items[i], i);
      } catch (e) {
        console.error("poll error:", e.message);
      }
    }
  });
  await Promise.all(workers);
}

// Return "success" | "failed" | "pending" for a single pending deposit.
async function checkDepositStatus(dep) {
  const settings = await getAllSettings();
  if (dep.method === "juntpay") {
    const cfg = juntpay.getConfig(settings);
    const result = await juntpay.queryPayment(dep.reference, cfg).catch(() => null);
    if (!result || result.error || !result.data) return "pending";
    const state = Number(result.data.state);
    if (state === 2) return "success";
    if (state === 3 || state === 4) return "failed";
    return "pending";
  }
  if (dep.method === "paystack") {
    const cfg = paystack.getConfig(settings);
    const r = await paystack.isVirtualAccountPaid(dep.gateway_id, dep.amount, cfg).catch(() => ({ paid: false }));
    return r.paid ? "success" : "pending";
  }
  if (dep.method === "duplo") {
    const cfg = duplo.getConfig(settings);
    const result = await duplo.listTransactions(dep.account_number, cfg).catch(() => null);
    if (!result || result.error || !result.data) return "pending";
    const expected = Math.round(dep.amount * 100); // kobo
    const paid = result.data.some((t) => {
      const s = String(t.status || "").toLowerCase();
      const amt = t.amount && t.amount.value != null ? Number(t.amount.value) : Number(t.amount);
      return ["successful", "success", "completed"].includes(s) && Number.isFinite(amt) && amt >= expected;
    });
    return paid ? "success" : "pending";
  }
  if (dep.method === "nomba") {
    const cfg = nomba.getConfig(settings);
    const r = await nomba.isVirtualAccountPaid(dep.gateway_id || dep.reference, dep.amount, cfg).catch(() => ({ paid: false }));
    return r.paid ? "success" : "pending";
  }
  if (dep.method === "kora") {
    const cfg = kora.getConfig(settings);
    const r = await kora.isVirtualAccountPaid(dep.gateway_id || dep.reference, dep.amount, cfg).catch(() => ({ paid: false }));
    return r.paid ? "success" : "pending";
  }
  if (dep.method === "nekpay") {
    const cfg = nekpay.getConfig(settings);
    const result = await nekpay.queryPayment(dep.reference, cfg).catch(() => null);
    if (!result || result.error || !result.data) return "pending";
    const tr = String(result.data.tradeResult);
    if (tr === "1") return "success";
    if (tr === "2" || tr === "3") return "failed";
    return "pending";
  }
  if (dep.method === "fossapay") {
    // Checkout deposits (expires_at set) are verifiable by reference; persistent
    // virtual-account deposits are webhook-driven, so they stay "pending" here.
    if (!dep.expires_at) return "pending";
    const cfg = fossapay.getConfig(settings);
    const result = await fossapay.getCheckoutByReference(dep.reference, cfg).catch(() => null);
    if (!result || result.error || !result.data) return "pending";
    const st = String(result.data.status || "").toLowerCase();
    if (st === "completed") return "success";
    if (["failed", "expired", "reversed"].includes(st)) return "failed";
    return "pending";
  }
  return "pending";
}

// Return "success" | "failed" | "pending" for a single processing payout.
async function checkWithdrawalStatus(w) {
  const settings = await getAllSettings();
  if (w.gateway === "juntpay") {
    const cfg = juntpay.getConfig(settings);
    const result = await juntpay.queryPayout(w.reference, cfg).catch(() => null);
    if (!result || result.error || !result.data) return "pending";
    const state = Number(result.data.state);
    if (state === 2) return "success";
    if (state === 3 || state === 4) return "failed";
    return "pending";
  }
  if (w.gateway === "paystack") {
    const cfg = paystack.getConfig(settings);
    const result = await paystack.verifyTransfer(w.gateway_reference || w.reference, cfg).catch(() => null);
    if (!result || result.error || !result.data) return "pending";
    const s = String(result.data.status).toLowerCase();
    if (s === "success") return "success";
    if (s === "failed" || s === "reversed") return "failed";
    return "pending";
  }
  if (w.gateway === "duplo") {
    const cfg = duplo.getConfig(settings);
    const result = await duplo.verifyPayout(w.reference, cfg).catch(() => null);
    if (!result || result.error || !result.data) return "pending";
    const s = String(result.data.status).toLowerCase();
    if (["success", "successful", "completed"].includes(s)) return "success";
    if (["failed", "reversed", "rejected"].includes(s)) return "failed";
    return "pending";
  }
  if (w.gateway === "nomba") {
    const cfg = nomba.getConfig(settings);
    const result = await nomba.verifyTransfer(w.reference, cfg).catch(() => null);
    if (!result || result.error || !result.data) return "pending";
    const s = String(result.data.status || "").toUpperCase();
    if (s === "SUCCESS") return "success";
    if (["REFUND", "CANCELLED", "PAYMENT_FAILED", "REVERSED_BY_VENDOR"].includes(s)) return "failed";
    return "pending";
  }
  if (w.gateway === "kora") {
    const cfg = kora.getConfig(settings);
    const result = await kora.verifyPayout(w.gateway_reference || w.reference, cfg).catch(() => null);
    if (!result || result.error || !result.data) return "pending";
    const s = String(result.data.status || "").toLowerCase();
    if (["success", "paid", "completed"].includes(s)) return "success";
    if (["failed", "reversed", "rejected", "cancelled"].includes(s)) return "failed";
    return "pending";
  }
  if (w.gateway === "fossapay") {
    const cfg = fossapay.getConfig(settings);
    const result = await fossapay.verifyPayout(w.reference, cfg).catch(() => null);
    if (!result || result.error || !result.data) return "pending";
    const s = String(result.data.status || "").toLowerCase();
    if (s === "completed") return "success";
    if (["failed", "reversed"].includes(s)) return "failed";
    return "pending";
  }
  return "pending";
}

async function applyWithdrawalResult(w, status) {
  if (status === "success") {
    await db.run("UPDATE withdrawals SET status = 'success', updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'), processed_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'), next_poll_at = NULL WHERE id = ?", w.id);
    return "paid";
  }
  if (status === "failed" && w.status !== "rejected") {
    await db.run("UPDATE withdrawals SET status = 'rejected', failure_reason = ?, updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'), next_poll_at = NULL WHERE id = ?", `Payout failed at ${w.gateway}`, w.id);
    await addTransaction(w.user_id, "refund", w.amount, "Payout failed", { withdrawal_id: w.id });
    return "rejected";
  }
  return null;
}

// Poll a single deposit against its gateway and apply the result.
async function refreshDepositStatus(depositId) {
  const dep = await db.get("SELECT * FROM deposits WHERE id = ?", depositId);
  if (!dep) return { _refresh: "no_op" };
  const status = await checkDepositStatus(dep);
  if (status === "success") {
    if (dep.status !== "success") await markDepositSuccess(dep);
    return { _refresh: "credited" };
  }
  if (status === "failed") {
    await markDepositFailed(dep);
    return { _refresh: "marked_failed" };
  }
  return { _refresh: "still_pending" };
}

// Poll a single withdrawal against its gateway and apply the result.
async function refreshWithdrawalStatus(withdrawalId) {
  const w = await db.get("SELECT * FROM withdrawals WHERE id = ?", withdrawalId);
  if (!w) return { _refresh: "no_op" };
  if (!["pending", "processing"].includes(w.status)) return { _refresh: "already_final", status: w.status };
  const status = await checkWithdrawalStatus(w);
  if (status === "pending") return { _refresh: "still_pending" };
  const r = await applyWithdrawalResult(w, status);
  if (r === "paid") return { _refresh: "marked_paid" };
  if (r === "rejected") return { _refresh: "marked_rejected_refunded" };
  return { _refresh: "still_pending" };
}

// Poll pending deposits against the configured gateway(s), with backoff + bounded work.
const POLLABLE_DEPOSIT_METHODS = ["juntpay", "paystack", "duplo", "nomba", "kora", "nekpay", "fossapay"];
const POLLABLE_PAYOUT_GATEWAYS = ["juntpay", "paystack", "duplo", "nomba", "kora", "fossapay"];

async function pollDeposits(gateway) {
  const methods = gateway
    ? (POLLABLE_DEPOSIT_METHODS.includes(gateway) ? [gateway] : [])
    : POLLABLE_DEPOSIT_METHODS;

  // No matching gateway (e.g. an un-integrated provider selected) — nothing to scan.
  if (methods.length === 0) {
    return { scanned: 0, credited: 0, still_pending: 0, marked_failed: 0 };
  }

  const nowIso = new Date().toISOString();
  const rows = await db.all(
    `SELECT * FROM deposits
     WHERE status = 'pending' AND method IN (${methods.map(() => "?").join(",")})
       AND (next_poll_at IS NULL OR next_poll_at <= ?)
     ORDER BY created_at ASC LIMIT 200`,
    ...methods, nowIso
  );

  let credited = 0, still_pending = 0, marked_failed = 0;

  await mapLimit(rows, 8, async (dep) => {
    const status = await checkDepositStatus(dep);
    if (status === "success") {
      if (dep.status !== "success") await markDepositSuccess(dep);
      credited++;
    } else if (status === "failed") {
      await markDepositFailed(dep);
      marked_failed++;
    } else {
      still_pending++;
      await touchPoll("deposits", dep.id, dep.created_at);
    }
  });

  return { scanned: rows.length, credited, still_pending, marked_failed };
}

// Poll pending/processing payouts against the gateway, with backoff + bounded work.
async function pollWithdrawals() {
  const nowIso = new Date().toISOString();
  const rows = await db.all(
    `SELECT * FROM withdrawals
      WHERE status IN ('pending','processing') AND gateway IN (${POLLABLE_PAYOUT_GATEWAYS.map(() => "?").join(",")})
        AND (next_poll_at IS NULL OR next_poll_at <= ?)
      ORDER BY created_at ASC LIMIT 100`,
    ...POLLABLE_PAYOUT_GATEWAYS, nowIso
  );

  let refreshed = 0, marked_paid = 0, marked_rejected = 0;

  await mapLimit(rows, 8, async (w) => {
    const status = await checkWithdrawalStatus(w);
    if (status === "pending") {
      await touchPoll("withdrawals", w.id, w.created_at);
      return;
    }
    refreshed++;
    const r = await applyWithdrawalResult(w, status);
    if (r === "paid") marked_paid++;
    else if (r === "rejected") marked_rejected++;
  });

  return { refreshed, marked_paid, marked_rejected };
}

// Poll a single user's pending deposits and withdrawals (immediate, on-demand).
async function pollUser(userId) {
  const deps = await db.all(
    `SELECT * FROM deposits WHERE status = 'pending' AND user_id = ? AND method IN (${POLLABLE_DEPOSIT_METHODS.map(() => "?").join(",")})`,
    userId, ...POLLABLE_DEPOSIT_METHODS
  );
  await mapLimit(deps, 5, async (dep) => {
    const status = await checkDepositStatus(dep);
    if (status === "success") {
      if (dep.status !== "success") await markDepositSuccess(dep);
    } else if (status === "failed") {
      await markDepositFailed(dep);
    } else {
      await touchPoll("deposits", dep.id, dep.created_at);
    }
  });

  const wds = await db.all(
    `SELECT * FROM withdrawals WHERE status IN ('pending','processing') AND user_id = ? AND gateway IN (${POLLABLE_PAYOUT_GATEWAYS.map(() => "?").join(",")})`,
    userId, ...POLLABLE_PAYOUT_GATEWAYS
  );
  await mapLimit(wds, 5, async (w) => {
    const status = await checkWithdrawalStatus(w);
    if (status !== "pending") await applyWithdrawalResult(w, status);
  });

  return { ok: true };
}

async function pollAll() {
  const deposits = await pollDeposits();
  const withdrawals = await pollWithdrawals();
  return { deposits, withdrawals };
}

// ---------- Stuck payout watchdog ----------
function toUtcStamp(date) {
  const p = (n) => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}-${p(date.getUTCMonth() + 1)}-${p(date.getUTCDate())} ${p(date.getUTCHours())}:${p(date.getUTCMinutes())}:${p(date.getUTCSeconds())}`;
}

function elapsedMinutes(stamp) {
  const t = Date.parse(String(stamp || "").replace(" ", "T") + "Z");
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.round((Date.now() - t) / 60000));
}

// Flag withdrawals stuck in "processing" beyond the configured threshold with a
// detailed admin alert (mirrors gateway_payout_failed). Webhook-only gateways
// (e.g. Nekpay) have no status-query API, so a payout can sit in "processing"
// indefinitely if the async notification never arrives — this surfaces those
// for manual review.
async function checkStuckPayouts() {
  const threshold = Math.max(5, Number(await getSetting("payout_stuck_minutes", "60")) || 60);
  const cutoff = toUtcStamp(new Date(Date.now() - threshold * 60 * 1000));
  const rows = await db.all(
    `SELECT * FROM withdrawals
     WHERE status = 'processing' AND updated_at <= ?
     ORDER BY updated_at ASC LIMIT 100`,
    cutoff
  );

  let flagged = 0;
  for (const w of rows) {
    const existing = await db.get(
      "SELECT id FROM admin_alerts WHERE withdrawal_id = ? AND type = 'payout_stuck' AND resolved_at IS NULL",
      w.id
    );
    if (existing) continue;

    const gw = w.gateway || w.method || "gateway";
    const mins = elapsedMinutes(w.updated_at);
    const message =
      `Withdrawal ${w.reference} has been stuck in "processing" for ${mins == null ? "a while" : mins + " min"} ` +
      `(gateway: ${gw}${w.gateway_reference ? ", gateway ref " + w.gateway_reference : ""}). ` +
      `Destination: ${w.bank_name || "unknown bank"} · ${w.account_number || "n/a"} · ${w.account_name || "n/a"} · ₦${Number(w.net_amount || w.amount || 0).toFixed(2)}. ` +
      (gw === "nekpay"
        ? "Nekpay has no status-query API, so the result only arrives via its async webhook — verify on the Nekpay dashboard and resolve manually."
        : "Verify on the gateway dashboard and resolve manually.");

    const id = "alert_" + uuidv4().replace(/-/g, "").slice(0, 16);
    await db.run(
      "INSERT INTO admin_alerts (id, type, message, withdrawal_id, gateway, severity) VALUES (?, 'payout_stuck', ?, ?, ?, 'warning')",
      id, message, w.id, w.gateway || w.method || null
    );
    flagged++;
  }
  return { flagged };
}

module.exports = { pollDeposits, pollWithdrawals, pollUser, pollAll, checkStuckPayouts, refreshDepositStatus, refreshWithdrawalStatus };
