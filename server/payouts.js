const { db } = require("./db");
const { v4: uuidv4 } = require("uuid");

const DAY_MS = 24 * 60 * 60 * 1000;

// Credit due daily profits for a single user's active investments.
async function processUserPayouts(userId) {
  const now = Date.now();
  const user = await db.get("SELECT * FROM users WHERE id = ?", userId);
  if (!user || user.is_blocked) return { credited: 0, completed: 0 };

  const rows = await db.all("SELECT * FROM investments WHERE status = 'active' AND user_id = ?", userId);
  let credited = 0;
  let completed = 0;

  for (const inv of rows) {
    let ref = null;
    if (inv.last_payout_at) ref = new Date(inv.last_payout_at).getTime();
    if (Number.isNaN(ref) && inv.started_at) ref = new Date(inv.started_at).getTime();

    // Unparseable timestamp -> treat as due so it never gets stuck.
    const due = Number.isNaN(ref) || now - ref >= DAY_MS;
    if (!due) continue;

    const newDays = (inv.days_paid || 0) + 1;
    const newTotal = (inv.total_profit_paid || 0) + inv.daily_profit_amount;
    const isoNow = new Date().toISOString();
    const isComplete = newDays >= inv.duration_days;
    const txId = "tx_" + uuidv4().replace(/-/g, "").slice(0, 16);

    // Single round trip: credit the wallet, append the profit transaction, and
    // advance the investment — all atomically.
    await db.run(`
      WITH upd AS (
        UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ? RETURNING wallet_balance
      ),
      inv AS (
        UPDATE investments SET days_paid = ?, total_profit_paid = ?, status = ?, last_payout_at = ?, completed_at = ? WHERE id = ? RETURNING id
      )
      INSERT INTO transactions (id, user_id, type, amount, description, balance_after, meta)
      SELECT ?, ?, 'profit', ?, ?, wallet_balance, ? FROM upd WHERE EXISTS (SELECT 1 FROM inv)
    `,
      inv.daily_profit_amount, userId,
      newDays, newTotal, isComplete ? "completed" : "active", isoNow, isComplete ? isoNow : null, inv.id,
      txId, userId, inv.daily_profit_amount, `Daily profit — ${inv.product_name}`, JSON.stringify({ investment_id: inv.id })
    );

    if (isComplete) completed++; else credited++;
  }

  return { credited, completed };
}

// Flip paused investments back to active once their auto-resume time has passed.
async function autoResumeDue() {
  const now = new Date().toISOString();
  const r = await db.run(
    "UPDATE investments SET status = 'active', paused_at = NULL, pause_reason = NULL, auto_resume_at = NULL WHERE status = 'paused' AND auto_resume_at IS NOT NULL AND auto_resume_at <= ?",
    now
  );
  return r.changes;
}

// Process all users' due payouts.
async function processDuePayouts() {
  await autoResumeDue();
  const rows = await db.all("SELECT DISTINCT user_id FROM investments WHERE status = 'active'");
  const userIds = rows.map((r) => r.user_id);
  let credited = 0;
  let completed = 0;
  for (const uid of userIds) {
    const r = await processUserPayouts(uid);
    credited += r.credited;
    completed += r.completed;
  }
  return { credited, completed };
}

module.exports = { processDuePayouts, processUserPayouts };
