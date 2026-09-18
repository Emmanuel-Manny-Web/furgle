const express = require("express");
const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const { db } = require("./db");
const { generateToken, authMiddleware, adminMiddleware, JWT_SECRET } = require("./auth");
const juntpay = require("./juntpay");
const paystack = require("./paystack");
const duplo = require("./duplo");
const nomba = require("./nomba");
const kora = require("./kora");
const nekpay = require("./nekpay");
const glopay = require("./glopay");
const fossapay = require("./fossapay");
const polling = require("./polling");

const router = express.Router();

// ---------- helpers ----------
function generateCode(length = 7) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let r = "";
  for (let i = 0; i < length; i++) r += chars[Math.floor(Math.random() * chars.length)];
  return r;
}

async function uniqueCode() {
  let code;
  do { code = generateCode(); } while (await db.get("SELECT 1 FROM users WHERE referral_code = ?", code));
  return code;
}

async function getSetting(key, fallback = "") {
  const row = await db.get("SELECT value FROM settings WHERE key = ?", key);
  return row ? row.value : fallback;
}

// Build a gateway-safe customer email from the user's name (not their phone).
function emailFromName(name) {
  const local = String(name || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 64);
  return (local || "user") + "@lumenhub.com";
}

const DEFAULT_SETTINGS = {
  allow_bank_change: true,
  welcome_bonus: 1000, min_deposit: 3000, min_withdrawal: 1000,
  gen1_percent: 20, gen2_percent: 3, gen3_percent: 2,
  paystack_public_key: "pk_live_0be34c3f2d36cc941a013150421fe0c14f67f870",
  paystack_secret_key: "", payment_mode: "live",
  auto_payout_enabled: false, auto_payout_max_amount: 50000, brand_logo_url: "",
  budpay_public_key: "", budpay_secret_key: "", budpay_webhook_secret: "",
  daily_claim_amount: 100, daily_claim_enabled: true,
  deposit_bonus_limit_per_user: 0, deposit_bonus_percent: 0, deposit_gateway: "paystack",
  featured_product_id: null,
  gateway_budpay_enabled: false, gateway_marasoft_enabled: false, gateway_nomba_enabled: false,
  gateway_paystack_enabled: true, gateway_qorepay_enabled: false,
  home_announcement: "", home_announcement_active: false, home_announcement_image_url: "",
  home_below_featured_image_url: "", home_below_featured_mode: "image",
  home_featured_plan_enabled: false, home_plans_count: 0, home_secondary_section_enabled: true,
  marasoft_encryption_key: "", marasoft_public_key: "", marasoft_secret_hash: "", marasoft_secret_key: "",
  max_withdrawal: 500000, multi_gateway_enabled: false,
  nomba_account_id: "", nomba_client_id: "", nomba_client_secret: "", nomba_environment: "production",
  payout_gateway: "nomba",
  qorepay_brand_id: "", qorepay_public_key: "", qorepay_secret_key: "",
  quick_deposit_amounts: [3000, 5000, 10000, 25000, 50000, 100000],
  referral_commission_cap_n: 3, referral_commission_mode: "first_only",
  require_security_questions: false, require_withdrawal_pin: false,
  telegram_channel_url: "", telegram_group_url: "", telegram_url: "",
  transfer_description_template: "",
  welcome_message: "", welcome_modal_active: true, welcome_modal_title: "",
  whatsapp_channel_url: "", whatsapp_group_url: "",
  withdrawal_end_time: "18:00", withdrawal_fee_percent: 15, withdrawal_start_time: "10:30", withdrawals_open: true,
  gateway_juntpay_enabled: false,
  juntpay_app_id: "", juntpay_merchant_id: "", juntpay_secret_key: "",
  juntpay_deposit_way_code: "", juntpay_payout_way_code: "BANK_TRANSFER", juntpay_notify_url: "",
  gateway_duplo_enabled: false,
  duplo_api_key: "",
  gateway_kora_enabled: false,
  kora_secret_key: "", kora_public_key: "", kora_encryption_key: "",
  kora_deposit_method: "bank_transfer", kora_virtual_account_bank_code: "035",
  gateway_nekpay_enabled: false,
  nekpay_mcht_id: "", nekpay_payment_key: "", nekpay_secret_key: "",
  nekpay_channel_code: "", nekpay_notify_url: "",
  gateway_glopay_enabled: false,
  glopay_mch_id: "", glopay_key: "", glopay_collection_key: "", glopay_payment_key: "", glopay_collection_code: "", glopay_payment_code: "", glopay_base_url: "",
  gateway_fossapay_enabled: false,
  fossapay_api_key: "", fossapay_webhook_secret: "", fossapay_deposit_method: "virtual_account",
  fixie_proxy_url: "",
  lumenhub_proxy_url: "",
  lumenhub_base_url: "",
  payout_stuck_minutes: 60,
};

async function getAllSettings() {
  const stored = await db.all("SELECT key, value FROM settings");
  const map = { ...DEFAULT_SETTINGS };
  for (const s of stored) {
    let v = s.value;
    if (v === "true") v = true;
    else if (v === "false") v = false;
    else if (v === "null" || v === "undefined") v = null;
    else if (/^-?\d+(\.\d+)?$/.test(v)) v = Number(v);
    else if (v.startsWith("[") && v.endsWith("]")) { try { v = JSON.parse(v); } catch {} }
    map[s.key] = v;
  }
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

// Credit a deposit bonus (deposit_bonus_percent, capped by deposit_bonus_limit_per_user).
async function creditDepositBonus(userId, amount, reference) {
  const settings = await getAllSettings();
  const pct = Number(settings.deposit_bonus_percent ?? 0);
  if (!pct || pct <= 0) return;
  let bonus = amount * pct / 100;
  if (bonus <= 0) return;
  const limit = Number(settings.deposit_bonus_limit_per_user ?? 0);
  if (limit > 0) {
    const already = (await db.get("SELECT COALESCE(SUM(amount),0) s FROM transactions WHERE user_id = ? AND type = 'deposit_bonus'", userId)).s;
    const remaining = Math.max(0, limit - already);
    if (remaining <= 0) return;
    bonus = Math.min(bonus, remaining);
  }
  await addTransaction(userId, "deposit_bonus", bonus, "Deposit bonus", { reference });
}

// Check whether withdrawals are currently open (open flag + daily time window).
function isWithdrawalWindowOpen(settings) {
  if (!settings.withdrawals_open) return false;
  const start = settings.withdrawal_start_time || "00:00";
  const end = settings.withdrawal_end_time || "23:59";
  const now = new Date();
  const cur = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = String(start).split(":").map(Number);
  const [eh, em] = String(end).split(":").map(Number);
  const startMin = (sh || 0) * 60 + (sm || 0);
  const endMin = (eh || 0) * 60 + (em || 0);
  if (startMin <= endMin) return cur >= startMin && cur <= endMin;
  return cur >= startMin || cur <= endMin; // overnight window
}

// Whether a given deposit gateway has its required credentials configured.
function isGatewayConfigured(gw, settings) {
  // Credentials may live in the DB (admin-saved) or in .env; treat either as
  // "configured" so gateways configured only via .env still show on the user end.
  if (gw === "paystack") return !!(settings.paystack_secret_key || process.env.PAYSTACK_SECRET_KEY);
  if (gw === "nomba") return !!((settings.nomba_client_secret || process.env.NOMBA_CLIENT_SECRET) && (settings.nomba_account_id || process.env.NOMBA_ACCOUNT_ID));
  if (gw === "marasoft") return !!settings.marasoft_secret_key && !!settings.marasoft_public_key;
  if (gw === "budpay") return !!settings.budpay_secret_key && !!settings.budpay_public_key;
  if (gw === "qorepay") return !!settings.qorepay_secret_key && !!settings.qorepay_brand_id;
  if (gw === "juntpay") return !!(settings.juntpay_secret_key || process.env.JUNTPAY_SECRET_KEY);
  if (gw === "duplo") return !!(settings.duplo_api_key || process.env.DUPLO_API_KEY);
  if (gw === "kora") return !!(settings.kora_secret_key || process.env.KORA_SECRET_KEY);
  if (gw === "nekpay") return !!((settings.nekpay_payment_key || process.env.NEKPAY_PAYMENT_KEY) && (settings.nekpay_mcht_id || process.env.NEKPAY_MCHT_ID));
  if (gw === "glopay") return !!((settings.glopay_mch_id || process.env.GLOPAY_MCH_ID) && (settings.glopay_collection_key || process.env.GLOPAY_COLLECTION_KEY || settings.glopay_key || process.env.GLOPAY_KEY));
  if (gw === "fossapay") return !!(settings.fossapay_api_key || process.env.FOSSAPAY_API_KEY);
  return false;
}

// Canonical order of deposit gateways (used for stable "Gateway 1/2/3…" labels).
const DEPOSIT_GATEWAYS = ["paystack", "nomba", "marasoft", "budpay", "qorepay", "juntpay", "duplo", "kora", "nekpay", "glopay", "fossapay"];

function isGatewayEnabled(gw, settings) {
  const map = {
    paystack: settings.gateway_paystack_enabled !== false,
    nomba: settings.gateway_nomba_enabled !== false,
    marasoft: settings.gateway_marasoft_enabled !== false,
    budpay: !!settings.gateway_budpay_enabled,
    qorepay: !!settings.gateway_qorepay_enabled,
    juntpay: !!settings.gateway_juntpay_enabled,
    duplo: !!settings.gateway_duplo_enabled,
    kora: !!settings.gateway_kora_enabled,
    nekpay: !!settings.gateway_nekpay_enabled,
    glopay: !!settings.gateway_glopay_enabled,
    fossapay: !!settings.gateway_fossapay_enabled,
  };
  return !!map[gw];
}

// Gateways the user can actually deposit through (enabled AND configured), with
// the active deposit_gateway first so it is always "Gateway 1".
function listAvailableDepositGateways(settings) {
  const available = DEPOSIT_GATEWAYS.filter((gw) => isGatewayEnabled(gw, settings) && isGatewayConfigured(gw, settings));
  const active = settings.deposit_gateway || "paystack";
  return [
    ...available.filter((g) => g === active),
    ...available.filter((g) => g !== active),
  ];
}

async function logActivity(admin, action, targetType, targetId, description, meta = {}) {
  await db.run("INSERT INTO activity_log (id, admin_id, admin_phone, admin_name, action, target_type, target_id, description, meta) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", "act_" + uuidv4().replace(/-/g, "").slice(0, 16),
    admin.id, admin.phone, admin.name, action, targetType, targetId, description, JSON.stringify(meta));
}

function publicUser(u) {
  return {
    id: u.id, phone: u.phone, name: u.name, wallet_balance: u.wallet_balance,
    total_earnings: u.total_earnings, referral_earnings: u.referral_earnings,
    referral_code: u.referral_code, referred_by: u.referred_by,
    bank_name: u.bank_name, account_number: u.account_number, account_name: u.account_name,
    is_admin: !!u.is_admin, is_blocked: !!u.is_blocked,
    security_question_1: u.security_question_1, security_question_2: u.security_question_2,
    created_at: u.created_at, bank_code: u.bank_code, has_withdrawal_pin: !!u.has_withdrawal_pin,
  };
}

// ---------- AUTH ----------
function parseMultipartFile(buffer, contentType) {
  if (!Buffer.isBuffer(buffer) || !contentType) return null;
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  if (!m) return null;
  const boundary = Buffer.from("--" + (m[1] || m[2]).trim());

  const parts = [];
  let start = 0;
  let idx;
  while ((idx = buffer.indexOf(boundary, start)) !== -1) {
    parts.push(buffer.slice(start, idx));
    start = idx + boundary.length;
  }
  parts.push(buffer.slice(start));

  for (const part of parts) {
    const sep = part.indexOf(Buffer.from("\r\n\r\n"));
    if (sep === -1) continue;
    const header = part.slice(0, sep).toString("utf8");
    const fd = /filename="([^"]*)"/i.exec(header);
    if (!fd) continue;
    const nm = /name="([^"]*)"/i.exec(header);
    let data = part.slice(sep + 4);
    if (data.length >= 2 && data[data.length - 1] === 0x0a && data[data.length - 2] === 0x0d) {
      data = data.slice(0, -2);
    }
    return { fieldname: nm ? nm[1] : "file", filename: fd[1], data };
  }
  return null;
}

router.post("/auth/login", async (req, res) => {
  const { phone, password } = req.body || {};
  if (!phone || !password) return res.status(400).json({ detail: "Phone and password required" });
  const user = await db.get("SELECT * FROM users WHERE phone = ?", phone);
  if (!user) return res.status(401).json({ detail: "Invalid credentials" });
  if (!(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ detail: "Invalid credentials" });
  if (user.is_blocked) return res.status(403).json({ detail: "Account blocked" });
  res.json({ token: await generateToken(user), user: publicUser(user) });
});

router.post("/auth/register", async (req, res) => {
  const { phone, password, name, referral_code, question_1, answer_1, question_2, answer_2 } = req.body || {};
  if (!phone || !password) return res.status(400).json({ detail: "Phone and password required" });
  if (!/^\d{11}$/.test(phone)) return res.status(400).json({ detail: "Phone must be 11 digits" });
  if (await db.get("SELECT 1 FROM users WHERE phone = ?", phone)) {
    return res.status(409).json({ detail: "Phone already registered" });
  }
  const requireSecQ = await getAllSettings().require_security_questions;
  if (requireSecQ && (!question_1 || !answer_1 || !question_2 || !answer_2)) {
    return res.status(400).json({ detail: "Security questions and answers are required" });
  }
  let referredBy = null;
  if (referral_code) {
    const ref = await db.get("SELECT id FROM users WHERE referral_code = ?", referral_code);
    if (!ref) return res.status(400).json({ detail: "Invalid referral code" });
    referredBy = ref.id;
  }
  const id = "u_" + uuidv4().replace(/-/g, "").slice(0, 16);
  const code = await uniqueCode();
  const [hash, ans1, ans2] = await Promise.all([
    bcrypt.hash(password, 10),
    answer_1 ? bcrypt.hash(answer_1, 10) : Promise.resolve(null),
    answer_2 ? bcrypt.hash(answer_2, 10) : Promise.resolve(null),
  ]);
  await db.run("INSERT INTO users (id, phone, name, password_hash, referral_code, referred_by, wallet_balance, security_question_1, security_answer_1_hash, security_question_2, security_answer_2_hash) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)", id, phone, name || "", hash, code, referredBy,
    question_1 || null, ans1,
    question_2 || null, ans2);

  // Welcome bonus
  const welcomeBonus = Number(await getAllSettings().welcome_bonus ?? 1000);
  await addTransaction(id, "bonus", welcomeBonus, `Welcome bonus of ₦${welcomeBonus.toFixed(2)}`, {});

  // Referral records
  if (referredBy) {
    const gen1 = await db.get("SELECT id FROM users WHERE id = ?", referredBy);
    await db.run("INSERT INTO referrals (id, referrer_id, referred_id, generation) VALUES (?, ?, ?, 1)", "ref_" + uuidv4().replace(/-/g, "").slice(0, 16), referredBy, id);
    // gen2
    const gen2 = await db.get("SELECT referred_by FROM users WHERE id = ?", referredBy);
    if (gen2 && gen2.referred_by) {
      await db.run("INSERT INTO referrals (id, referrer_id, referred_id, generation) VALUES (?, ?, ?, 2)", "ref_" + uuidv4().replace(/-/g, "").slice(0, 16), gen2.referred_by, id);
    }
  }

  const user = await db.get("SELECT * FROM users WHERE id = ?", id);
  res.status(201).json({ token: await generateToken(user), user: publicUser(user) });
});

router.get("/auth/me", authMiddleware, async (req, res) => {
  res.json(publicUser(req.user));
});

router.post("/auth/change-password", authMiddleware, async (req, res) => {
  const { current_password, new_password } = req.body || {};
  if (!(await bcrypt.compare(current_password || "", req.user.password_hash))) {
    return res.status(400).json({ detail: "Current password incorrect" });
  }
  await db.run("UPDATE users SET password_hash = ? WHERE id = ?", await bcrypt.hash(new_password, 10), req.user.id);
  res.json({ message: "Password changed" });
});

router.get("/auth/security-questions/:phone", async (req, res) => {
  const user = await db.get("SELECT security_question_1, security_question_2 FROM users WHERE phone = ?", req.params.phone);
  if (!user) return res.status(404).json({ detail: "User not found" });
  res.json({ question_1: user.security_question_1, question_2: user.security_question_2 });
});

router.post("/auth/forgot-password", async (req, res) => {
  const { phone, reason, new_password } = req.body || {};
  const user = await db.get("SELECT * FROM users WHERE phone = ?", phone);
  if (!user) return res.status(404).json({ detail: "User not found" });
  if (!new_password || String(new_password).length < 6) {
    return res.status(400).json({ detail: "New password must be at least 6 characters" });
  }
  await db.run(`INSERT INTO password_resets (id, user_id, reason, new_password_hash, status)
     VALUES (?, ?, ?, ?, 'pending')`, "pr_" + uuidv4().replace(/-/g, "").slice(0, 16), user.id, String(reason || ""), await bcrypt.hash(String(new_password), 10));
  res.json({ message: "Password reset request submitted for admin review" });
});

router.post("/auth/reset-with-questions", async (req, res) => {
  const { phone, answer_1, answer_2, new_password } = req.body || {};
  const user = await db.get("SELECT * FROM users WHERE phone = ?", phone);
  if (!user) return res.status(404).json({ detail: "User not found" });
  if (!user.security_answer_1_hash || !user.security_answer_2_hash) {
    return res.status(400).json({ detail: "No security questions set for this account" });
  }
  if (!new_password || String(new_password).length < 6) {
    return res.status(400).json({ detail: "New password must be at least 6 characters" });
  }
  if (
    !(await bcrypt.compare(answer_1 || "", user.security_answer_1_hash)) ||
    !(await bcrypt.compare(answer_2 || "", user.security_answer_2_hash))
  ) {
    return res.status(400).json({ detail: "Incorrect answers" });
  }
  await db.run("UPDATE users SET password_hash = ? WHERE id = ?", await bcrypt.hash(String(new_password), 10), user.id);
  res.json({ message: "Password reset" });
});

// ---------- PRODUCTS ----------
router.get("/products", async (req, res) => {
  const rows = await db.all("SELECT * FROM products WHERE is_active = 1 ORDER BY price");
  res.json(rows.map(p => ({
    id: p.id, name: p.name, description: p.description, image_url: p.image_url,
    price: p.price, daily_profit_percent: p.daily_profit_percent, duration_days: p.duration_days,
    min_amount: p.min_amount, max_amount: p.max_amount, is_active: !!p.is_active, created_at: p.created_at,
  })));
});

// ---------- INVESTMENTS ----------
router.get("/investments", authMiddleware, async (req, res) => {
  const rows = await db.all("SELECT * FROM investments WHERE user_id = ? ORDER BY started_at DESC", req.user.id);
  res.json(rows);
});

router.post("/invest", authMiddleware, async (req, res) => {
  const { product_id } = req.body || {};
  const product = await db.get("SELECT * FROM products WHERE id = ? AND is_active = 1", product_id);
  if (!product) return res.status(404).json({ detail: "Product not found" });
  // The package price is fixed — ignore any client-supplied amount.
  const amt = Number(product.price || product.min_amount || 0);
  if (!amt || amt <= 0) return res.status(400).json({ detail: "Invalid product price" });
  if (req.user.wallet_balance < amt) return res.status(400).json({ detail: "Insufficient balance" });

  const id = "inv_" + uuidv4().replace(/-/g, "").slice(0, 16);
  const dailyProfit = amt * product.daily_profit_percent / 100;
  const nowIso = new Date().toISOString();
  await db.run("INSERT INTO investments (id, user_id, product_id, product_name, amount, daily_profit_percent, daily_profit_amount, duration_days, days_paid, total_profit_paid, status, last_payout_at, started_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 'active', ?, ?)", id, req.user.id, product.id, product.name, amt, product.daily_profit_percent, dailyProfit, product.duration_days, nowIso, nowIso);

  await addTransaction(req.user.id, "invest", -amt, `Invested in ${product.name}`, { investment_id: id, product_id: product.id });

  // Update referral investment stats + pay referral commissions.
  const settings = await getAllSettings();
  const gen1Pct = Number(settings.gen1_percent ?? 20);
  const gen2Pct = Number(settings.gen2_percent ?? 3);
  const mode = settings.referral_commission_mode || "first_only";
  const capN = Number(settings.referral_commission_cap_n ?? 3);
  const refs = await db.all("SELECT * FROM referrals WHERE referred_id = ?", req.user.id);
  for (const r of refs) {
    const newCount = (r.referred_investment_count || 0) + 1;
    await db.run("UPDATE referrals SET referred_invested = referred_invested + ?, referred_investment_count = ? WHERE id = ?", amt, newCount, r.id);

    let shouldPay = false;
    if (mode === "unlimited") shouldPay = true;
    else if (mode === "first_only") shouldPay = newCount === 1;
    else if (mode === "capped") shouldPay = newCount <= capN;
    if (!shouldPay) continue;

    const pct = r.generation === 1 ? gen1Pct : gen2Pct;
    const bonus = amt * pct / 100;
    if (bonus <= 0) continue;
    await addTransaction(r.referrer_id, "referral", bonus, `Referral bonus — ${r.generation === 1 ? "Level 1" : "Level 2"}`, { investment_id: id, referred_id: req.user.id });
    await db.run("UPDATE referrals SET bonus_paid = bonus_paid + ? WHERE id = ?", bonus, r.id);
    await db.run("UPDATE users SET referral_earnings = referral_earnings + ? WHERE id = ?", bonus, r.referrer_id);
  }

  const inv = await db.get("SELECT * FROM investments WHERE id = ?", id);
  res.status(201).json(inv);
});

// ---------- DEPOSITS ----------
router.get("/deposits", authMiddleware, async (req, res) => {
  const rows = await db.all("SELECT * FROM deposits WHERE user_id = ? ORDER BY created_at DESC", req.user.id);
  res.json(rows);
});

router.get("/deposits/:reference", authMiddleware, async (req, res) => {
  const row = await db.get("SELECT * FROM deposits WHERE reference = ? AND user_id = ?", req.params.reference, req.user.id);
  if (!row) return res.status(404).json({ detail: "Deposit not found" });
  res.json(row);
});

router.post("/deposit/initialize", authMiddleware, async (req, res) => {
  const { amount, gateway, callback_url } = req.body || {};
  const amt = Number(amount);
  if (!amt || amt <= 0) return res.status(400).json({ detail: "Invalid amount" });

  const settings = await getAllSettings();
  const minDeposit = Number(settings.min_deposit ?? 0);
  if (minDeposit > 0 && amt < minDeposit) return res.status(400).json({ detail: `Minimum deposit is ₦${minDeposit}` });
  let gw = settings.deposit_gateway || "paystack";
  if (gateway && settings.multi_gateway_enabled && isGatewayEnabled(gateway, settings) && isGatewayConfigured(gateway, settings)) {
    gw = gateway;
  }

  const id = "d_" + uuidv4().replace(/-/g, "").slice(0, 16);
  const reference = "dep_" + uuidv4().replace(/-/g, "").slice(0, 16);

  if (gw === "juntpay") {
    const cfg = juntpay.getConfig(settings);
    const baseUrl = req.protocol + "://" + req.get("host");
    const returnUrl = (callback_url || baseUrl + "/payment/callback") +
      ((callback_url || "").includes("?") ? "&" : "?") + "reference=" + reference;
    const notifyUrl = cfg.notifyUrl || baseUrl + "/api/deposit/webhook/juntpay";

    const result = await juntpay.createDeposit({
      amount: amt,
      mchOrderNo: reference,
      subject: "Lumenhub deposit",
      customerName: req.user.name || "Customer",
      customerMobile: req.user.phone || "",
      customerEmail: emailFromName(req.user.name),
      notifyUrl,
      returnUrl,
    }, cfg);

    if (result.error) return res.status(502).json({ detail: result.error });
    const data = result.data || {};

    await db.run("INSERT INTO deposits (id, user_id, amount, reference, method, status, gateway_id, pay_order_id) VALUES (?, ?, ?, ?, 'juntpay', 'pending', ?, ?)", id, req.user.id, amt, reference, data.payOrderId || null, data.payOrderId || null);

    const payData = data.payData;
    const payDataType = data.payDataType;
    if (payDataType === "codeUrl" && payData) {
      return res.status(201).json({
        id, reference, amount: amt, status: "pending",
        mode: "live", type: "qr", qr_code: payData,
      });
    }
    if (payData) {
      return res.status(201).json({
        id, reference, amount: amt, status: "pending",
        mode: "live", type: "redirect", authorization_url: payData,
      });
    }
    return res.status(201).json({
      id, reference, amount: amt, status: "pending",
      mode: "live", type: "redirect", authorization_url: payData,
    });
  }

  const baseUrl = req.protocol + "://" + req.get("host");
  const returnUrl = (callback_url || baseUrl + "/payment/callback") +
    ((callback_url || "").includes("?") ? "&" : "?") + "reference=" + reference;

  if (gw === "nekpay") {
    const cfg = nekpay.getConfig(settings);
    const notifyUrl = cfg.notifyUrl || baseUrl + "/api/deposit/webhook/nekpay";
    const result = await nekpay.createDeposit({
      amount: amt,
      mchOrderNo: reference,
      notifyUrl,
      returnUrl,
      goodsName: "Lumenhub deposit",
    }, cfg);

    if (result.error) return res.status(502).json({ detail: result.error });
    const data = result.data || {};

    await db.run("INSERT INTO deposits (id, user_id, amount, reference, method, status, gateway_id, pay_order_id) VALUES (?, ?, ?, ?, 'nekpay', 'pending', ?, ?)", id, req.user.id, amt, reference, data.orderNo || null, data.orderNo || null);

    return res.status(201).json({
      id, reference, amount: amt, status: "pending",
      mode: "live", type: "redirect", authorization_url: data.payUrl,
    });
  }

  if (gw === "glopay") {
    const cfg = glopay.getConfig(settings);
    if (!cfg.collectionKey || !cfg.mchId) return res.status(400).json({ detail: "GloPay is not configured (missing merchant ID or collection key)" });
    const notifyUrl = baseUrl + "/api/deposit/webhook/glopay";
    const email = emailFromName(req.user.name);
    const result = await glopay.createDeposit({
      orderId: reference,
      amount: amt,
      name: req.user.name || "Customer",
      email,
      mobile: req.user.phone || "08000000000",
      notifyUrl,
    }, cfg);

    if (result.error) return res.status(502).json({ detail: result.error });
    const data = result.data || {};

    await db.run("INSERT INTO deposits (id, user_id, amount, reference, method, status, gateway_id, pay_order_id) VALUES (?, ?, ?, ?, 'glopay', 'pending', ?, ?)", id, req.user.id, amt, reference, reference, reference);

    return res.status(201).json({
      id, reference, amount: amt, status: "pending",
      mode: "live", type: "redirect", authorization_url: data.payUrl,
    });
  }

  if (gw === "fossapay") {
    const cfg = fossapay.getConfig(settings);
    if (!cfg.apiKey) return res.status(400).json({ detail: "FossaPay is not configured (missing API key)" });
    const name = req.user.name || "Customer";
    // Unique email per user so FossaPay's per-merchant unique-email rule never collides.
    const email = `fp-${req.user.id}@lumenhub.com`;
    const method = settings.fossapay_deposit_method || "virtual_account";

    if (method === "checkout") {
      const result = await fossapay.createCheckout({ amount: amt, reference, name, email, phone: req.user.phone || "" }, cfg);
      if (result.error) return res.status(502).json({ detail: result.error });
      const d = result.data;
      await db.run("INSERT INTO deposits (id, user_id, amount, reference, method, status, bank_name, account_number, account_name, gateway_id, virtual_account_number, expires_at, pay_amount) VALUES (?, ?, ?, ?, 'fossapay', 'pending', ?, ?, ?, ?, ?, ?, ?)", id, req.user.id, amt, reference, d.bank_name || null, d.account_number || null, d.account_name || null, reference, d.account_number || null, d.expires_at || null, d.amount_payable != null ? d.amount_payable : null);
      return res.status(201).json({ id, reference, amount: amt, status: "pending", type: "bank_transfer", bank_name: d.bank_name, account_number: d.account_number, account_name: d.account_name, expires_at: d.expires_at, amount_payable: d.amount_payable });
    }

    // Persistent virtual account — reuse the user's existing FossaPay account.
    const prev = await db.get(
      "SELECT gateway_id, account_number, account_name, bank_name FROM deposits WHERE user_id = ? AND method = 'fossapay' AND account_number IS NOT NULL AND expires_at IS NULL ORDER BY created_at DESC LIMIT 1",
      req.user.id
    );
    let d;
    if (prev && prev.account_number) {
      d = { customer_id: prev.gateway_id, account_number: prev.account_number, account_name: prev.account_name, bank_name: prev.bank_name };
    } else {
      const result = await fossapay.createVirtualAccount({ name, email, phone: req.user.phone || "", reference }, cfg);
      if (result.error) return res.status(502).json({ detail: result.error });
      d = result.data;
    }

    await db.run("INSERT INTO deposits (id, user_id, amount, reference, method, status, bank_name, account_number, account_name, gateway_id, virtual_account_number) VALUES (?, ?, ?, ?, 'fossapay', 'pending', ?, ?, ?, ?, ?)", id, req.user.id, amt, reference, d.bank_name || null, d.account_number || null, d.account_name || null, d.customer_id || null, d.account_number || null);
    return res.status(201).json({ id, reference, amount: amt, status: "pending", type: "bank_transfer", bank_name: d.bank_name, account_number: d.account_number, account_name: d.account_name });
  }

  if (gw === "paystack") {
    const cfg = paystack.getConfig(settings);
    if (!cfg.secretKey) return res.status(400).json({ detail: "Paystack is not configured (missing secret key)" });
    const email = emailFromName(req.user.name);
    const nameParts = (req.user.name || "Customer").trim().split(" ");
    const result = await paystack.createVirtualAccount({
      email,
      first_name: nameParts[0] || "Customer",
      last_name: nameParts.slice(1).join(" ") || "Deposit",
      phone: req.user.phone || "",
    }, cfg);
    if (result.error) return res.status(502).json({ detail: result.error });
    const d = result.data;
    await db.run("INSERT INTO deposits (id, user_id, amount, reference, method, status, bank_name, account_number, account_name, gateway_id, virtual_account_number) VALUES (?, ?, ?, ?, 'paystack', 'pending', ?, ?, ?, ?, ?)", id, req.user.id, amt, reference, d.bank_name || null, d.account_number || null, d.account_name || null, String(d.customer_id || d.customer_code || ""), d.account_number || null);
    return res.status(201).json({ id, reference, amount: amt, status: "pending", type: "bank_transfer", bank_name: d.bank_name, account_number: d.account_number, account_name: d.account_name });
  }

  if (gw === "duplo") {
    const cfg = duplo.getConfig(settings);
    if (!cfg.apiKey) return res.status(400).json({ detail: "Duplo is not configured (missing API key)" });

    // A Duplo customer can only have one dedicated virtual account. Reuse the
    // account from the user's most recent Duplo deposit instead of trying to
    // create a new customer (which errors for existing customers).
    const prev = await db.get(
      "SELECT gateway_id, account_number, account_name, bank_name FROM deposits WHERE user_id = ? AND method = 'duplo' AND account_number IS NOT NULL ORDER BY created_at DESC LIMIT 1",
      req.user.id
    );

    let d;
    if (prev && prev.account_number) {
      d = {
        bank_name: prev.bank_name,
        account_number: prev.account_number,
        account_name: prev.account_name,
        account_reference: prev.gateway_id || null,
      };
    } else {
      const email = emailFromName(req.user.name);
      const nameParts = (req.user.name || "Customer").trim().split(" ");
      const result = await duplo.createVirtualAccount({
        first_name: nameParts[0] || "Customer",
        last_name: nameParts.slice(1).join(" ") || "Deposit",
        email,
        phone: req.user.phone || "",
      }, cfg);
      if (result.error) return res.status(502).json({ detail: result.error });
      d = result.data;
    }

    await db.run("INSERT INTO deposits (id, user_id, amount, reference, method, status, bank_name, account_number, account_name, gateway_id, virtual_account_number) VALUES (?, ?, ?, ?, 'duplo', 'pending', ?, ?, ?, ?, ?)", id, req.user.id, amt, reference, d.bank_name || null, d.account_number || null, d.account_name || null, d.account_reference || d.customer_reference || null, d.account_number || null);
    return res.status(201).json({ id, reference, amount: amt, status: "pending", type: "bank_transfer", bank_name: d.bank_name, account_number: d.account_number, account_name: d.account_name });
  }

  if (gw === "nomba") {
    const cfg = nomba.getConfig(settings);
    if (!cfg.clientId || !cfg.clientSecret || !cfg.accountId) return res.status(400).json({ detail: "Nomba is not configured (missing credentials)" });
    let accountName = (req.user.name || "Customer").trim();
    if (accountName.length < 8) accountName = accountName + " Lumenhub";
    const result = await nomba.createVirtualAccount({
      accountRef: reference,
      accountName,
      expectedAmount: amt,
    }, cfg);
    if (result.error) return res.status(502).json({ detail: result.error });
    const d = result.data;
    await db.run("INSERT INTO deposits (id, user_id, amount, reference, method, status, bank_name, account_number, account_name, gateway_id, virtual_account_number) VALUES (?, ?, ?, ?, 'nomba', 'pending', ?, ?, ?, ?, ?)", id, req.user.id, amt, reference, d.bank_name || null, d.account_number || null, d.account_name || null, d.account_reference || null, d.account_number || null);
    return res.status(201).json({ id, reference, amount: amt, status: "pending", type: "bank_transfer", bank_name: d.bank_name, account_number: d.account_number, account_name: d.account_name });
  }

  if (gw === "kora") {
    const cfg = kora.getConfig(settings);
    if (!cfg.secretKey) return res.status(400).json({ detail: "Kora is not configured (missing secret key)" });
    const name = req.user.name || "Customer";
    const email = emailFromName(req.user.name);
    const method = settings.kora_deposit_method || "bank_transfer";

    if (method === "checkout") {
      // Kora is proxied through lumenhub, so its redirect URL must point at
      // lumenhub (never furgle directly). lumenhub bounces the browser back to
      // furgle's /payment/callback page. There is intentionally no fallback to
      // furgle here — if lumenhub is not configured, fail loudly.
      const lumenhubBase = (settings.lumenhub_base_url || process.env.LUMENHUB_BASE_URL || "").replace(/\/+$/, "");
      if (!lumenhubBase) {
        return res.status(400).json({ detail: "Kora checkout requires the LumenHub base URL (set LUMENHUB_BASE_URL or lumenhub_base_url in settings)" });
      }
      // Register the customer's exact return origin with lumenhub (server-to-
      // server) so it stays out of the visible redirect URL, but lumenhub still
      // bounces them back to the same origin (no www/non-www session loss).
      const returnBase = callback_url || baseUrl + "/payment/callback";
      await kora.registerCallbackReturn(lumenhubBase, reference, returnBase);
      // No query params here — Kora appends ?reference=<reference> itself, so
      // the visible redirect URL stays clean (just the lumenhub relay).
      const redirectUrl = `${lumenhubBase}/api/relay/callback/kora`;
      const result = await kora.initializeCheckout({
        reference,
        amount: amt,
        name,
        email,
        redirect_url: redirectUrl,
      }, cfg);
      if (result.error) return res.status(502).json({ detail: result.error });
      const d = result.data || {};
      await db.run("INSERT INTO deposits (id, user_id, amount, reference, method, status, gateway_id) VALUES (?, ?, ?, ?, 'kora', 'pending', ?)", id, req.user.id, amt, reference, d.reference || reference);
      return res.status(201).json({ id, reference, amount: amt, status: "pending", mode: "live", type: "redirect", authorization_url: d.checkout_url });
    }

    if (method === "virtual_account") {
      const result = await kora.createPermanentVirtualAccount({
        account_name: name,
        account_reference: reference,
        bank_code: settings.kora_virtual_account_bank_code || "035",
        name,
        email,
        bvn: req.body.bvn || "",
      }, cfg);
      if (result.error) return res.status(502).json({ detail: result.error });
      const d = result.data;
      await db.run("INSERT INTO deposits (id, user_id, amount, reference, method, status, bank_name, account_number, account_name, gateway_id, virtual_account_number) VALUES (?, ?, ?, ?, 'kora', 'pending', ?, ?, ?, ?, ?)", id, req.user.id, amt, reference, d.bank_name || null, d.account_number || null, d.account_name || null, d.account_reference || reference, d.account_number || null);
      return res.status(201).json({ id, reference, amount: amt, status: "pending", type: "bank_transfer", bank_name: d.bank_name, account_number: d.account_number, account_name: d.account_name });
    }

    // Default: single-use bank-transfer virtual account.
    const result = await kora.createVirtualAccount({
      reference,
      amount: amt,
      name,
      email,
      phone: req.user.phone || "",
    }, cfg);
    if (result.error) return res.status(502).json({ detail: result.error });
    const d = result.data;
    await db.run("INSERT INTO deposits (id, user_id, amount, reference, method, status, bank_name, account_number, account_name, gateway_id, virtual_account_number, expires_at) VALUES (?, ?, ?, ?, 'kora', 'pending', ?, ?, ?, ?, ?, ?)", id, req.user.id, amt, reference, d.bank_name || null, d.account_number || null, d.account_name || null, d.account_reference || reference, d.account_number || null, d.expires_at || null);
    return res.status(201).json({ id, reference, amount: amt, status: "pending", type: "bank_transfer", bank_name: d.bank_name, account_number: d.account_number, account_name: d.account_name, expires_at: d.expires_at || null });
  }

  const isMock = settings.payment_mode !== "live";
  if (!isMock && !isGatewayConfigured(gw, settings)) {
    const label = (gw || "paystack").replace(/^\w/, (c) => c.toUpperCase());
    return res.status(400).json({ detail: `${label} is not configured for live payments. Add gateway credentials in admin settings, or switch Payment Mode to Mock.` });
  }

  await db.run("INSERT INTO deposits (id, user_id, amount, reference, method, status) VALUES (?, ?, ?, ?, ?, 'pending')", id, req.user.id, amt, reference, gw || "paystack");
  res.status(201).json({
    id, reference, amount: amt, status: "pending",
    mode: isMock ? "mock" : "live",
    authorization_url: `http://localhost:3000/deposit/verify/${reference}`,
  });
});

router.get("/deposit/verify/:reference", async (req, res) => {
  const dep = await db.get("SELECT * FROM deposits WHERE reference = ?", req.params.reference);
  if (!dep) return res.status(404).json({ detail: "Deposit not found" });

  if (dep.method === "juntpay") {
    const cfg = juntpay.getConfig(await getAllSettings());
    const result = await juntpay.queryPayment(dep.reference, cfg);
    if (result.error) {
      return res.json({ status: "pending", reference: dep.reference, amount: dep.amount });
    }
    const state = result.data && result.data.state;
    if (state === 2) {
      if (dep.status !== "success") {
        await db.run("UPDATE deposits SET status = 'success', updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?", dep.id);
        await addTransaction(dep.user_id, "deposit", dep.amount, "Deposit", { reference: dep.reference, gateway: "juntpay" });
        await creditDepositBonus(dep.user_id, dep.amount, dep.reference);
      }
      return res.json({ status: "success", reference: dep.reference, amount: dep.amount });
    }
    if (state === 3 || state === 4) {
      await db.run("UPDATE deposits SET status = 'failed', updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?", dep.id);
      return res.json({ status: "failed", reference: dep.reference, amount: dep.amount });
    }
    return res.json({ status: "pending", reference: dep.reference, amount: dep.amount });
  }

  if (dep.method === "nekpay") {
    // Nekpay has no status-query endpoint; status is driven by the async webhook.
    return res.json({ status: dep.status, reference: dep.reference, amount: dep.amount });
  }

  if (dep.method === "paystack") {
    const cfg = paystack.getConfig(await getAllSettings());
    const result = await paystack.isVirtualAccountPaid(dep.gateway_id, dep.amount, cfg);
    if (result.paid) {
      if (dep.status !== "success") {
        await db.run("UPDATE deposits SET status = 'success', updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?", dep.id);
        await addTransaction(dep.user_id, "deposit", dep.amount, "Deposit", { reference: dep.reference, gateway: "paystack" });
        await creditDepositBonus(dep.user_id, dep.amount, dep.reference);
      }
      return res.json({ status: "success", reference: dep.reference, amount: dep.amount });
    }
    return res.json({ status: "pending", reference: dep.reference, amount: dep.amount });
  }

  if (dep.method === "duplo") {
    const cfg = duplo.getConfig(await getAllSettings());
    const result = await duplo.listTransactions(dep.account_number, cfg);
    if (result.error || !result.data) return res.json({ status: "pending", reference: dep.reference, amount: dep.amount });
    const expected = Math.round(dep.amount * 100); // kobo
    const paid = result.data.some((t) => {
      const status = String(t.status || "").toLowerCase();
      const amt = t.amount && t.amount.value != null ? Number(t.amount.value) : Number(t.amount);
      return ["successful", "success", "completed"].includes(status) && Number.isFinite(amt) && amt >= expected;
    });
    if (paid) {
      if (dep.status !== "success") {
        await db.run("UPDATE deposits SET status = 'success', updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?", dep.id);
        await addTransaction(dep.user_id, "deposit", dep.amount, "Deposit", { reference: dep.reference, gateway: "duplo" });
        await creditDepositBonus(dep.user_id, dep.amount, dep.reference);
      }
      return res.json({ status: "success", reference: dep.reference, amount: dep.amount });
    }
    return res.json({ status: "pending", reference: dep.reference, amount: dep.amount });
  }

  if (dep.method === "nomba") {
    const cfg = nomba.getConfig(await getAllSettings());
    const result = await nomba.isVirtualAccountPaid(dep.gateway_id || dep.reference, dep.amount, cfg);
    if (result.paid) {
      if (dep.status !== "success") {
        await db.run("UPDATE deposits SET status = 'success', updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?", dep.id);
        await addTransaction(dep.user_id, "deposit", dep.amount, "Deposit", { reference: dep.reference, gateway: "nomba" });
        await creditDepositBonus(dep.user_id, dep.amount, dep.reference);
      }
      return res.json({ status: "success", reference: dep.reference, amount: dep.amount });
    }
    return res.json({ status: "pending", reference: dep.reference, amount: dep.amount });
  }

  if (dep.method === "kora") {
    // Bank-transfer and checkout charges can be verified by reference. Permanent
    // virtual-account pay-ins are confirmed via the webhook (this call returns
    // false for them, so status stays webhook-driven).
    const cfg = kora.getConfig(await getAllSettings());
    const result = await kora.isVirtualAccountPaid(dep.gateway_id || dep.reference, dep.amount, cfg);
    if (result.paid) {
      if (dep.status !== "success") {
        await db.run("UPDATE deposits SET status = 'success', updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?", dep.id);
        await addTransaction(dep.user_id, "deposit", dep.amount, "Deposit", { reference: dep.reference, gateway: "kora" });
        await creditDepositBonus(dep.user_id, dep.amount, dep.reference);
      }
      return res.json({ status: "success", reference: dep.reference, amount: dep.amount });
    }
    return res.json({ status: dep.status === "success" ? "success" : "pending", reference: dep.reference, amount: dep.amount });
  }

  if (dep.method === "fossapay") {
    // Checkout deposits are verifiable by reference; persistent virtual-account
    // deposits are credited via the async webhook (this call returns pending).
    if (dep.expires_at) {
      const cfg = fossapay.getConfig(await getAllSettings());
      const result = await fossapay.getCheckoutByReference(dep.reference, cfg);
      const st = result.data ? String(result.data.status || "").toLowerCase() : "";
      if (st === "completed") {
        if (dep.status !== "success") {
          await db.run("UPDATE deposits SET status = 'success', updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?", dep.id);
          await addTransaction(dep.user_id, "deposit", dep.amount, "Deposit", { reference: dep.reference, gateway: "fossapay" });
          await creditDepositBonus(dep.user_id, dep.amount, dep.reference);
        }
        return res.json({ status: "success", reference: dep.reference, amount: dep.amount });
      }
      if (["failed", "expired", "reversed"].includes(st)) {
        await db.run("UPDATE deposits SET status = 'failed', updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?", dep.id);
        return res.json({ status: "failed", reference: dep.reference, amount: dep.amount });
      }
      return res.json({ status: "pending", reference: dep.reference, amount: dep.amount });
    }
    return res.json({ status: dep.status, reference: dep.reference, amount: dep.amount });
  }

  const isMock = await getAllSettings().payment_mode !== "live";
  if (isMock) {
    if (dep.status === "pending") {
      await db.run("UPDATE deposits SET status = 'success', updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?", dep.id);
      await addTransaction(dep.user_id, "deposit", dep.amount, "Deposit", { reference: dep.reference });
      await creditDepositBonus(dep.user_id, dep.amount, dep.reference);
    }
    return res.json({ status: "success", reference: dep.reference, amount: dep.amount });
  }
  // Live mode: never auto-credit — confirmation comes from the gateway webhook or admin approval.
  return res.json({ status: dep.status === "success" ? "success" : "pending", reference: dep.reference, amount: dep.amount });
});

// JuntPay webhook — handles both deposit (PAYMENT) and payout (TRANSFER) events.
router.post("/deposit/webhook/juntpay", async (req, res) => {
  const body = req.body || {};
  const settings = await getAllSettings();
  const cfg = juntpay.getConfig(settings);
  const data = body.data || {};

  // Verify the signature of the data payload when a secret key is configured.
  if (cfg.secretKey && body.sign) {
    const expected = juntpay.sign(data, cfg.secretKey);
    if (expected !== body.sign) {
      return res.status(401).send("INVALID_SIGN");
    }
  }

  const mchOrderNo = data.mchOrderNo;
  if (!mchOrderNo) return res.status(400).send("MISSING_ORDER");

  if (body.event === "PAYMENT") {
    const dep = await db.get("SELECT * FROM deposits WHERE reference = ?", mchOrderNo);
    if (!dep) return res.status(404).send("NOT_FOUND");
    const state = Number(data.state);
    if (state === 2 && dep.status !== "success") {
      await db.run("UPDATE deposits SET status = 'success', updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?", dep.id);
      await addTransaction(dep.user_id, "deposit", dep.amount, "Deposit", { reference: dep.reference, gateway: "juntpay" });
      await creditDepositBonus(dep.user_id, dep.amount, dep.reference);
    } else if (state === 3 || state === 4 || state === 5) {
      await db.run("UPDATE deposits SET status = 'failed', updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?", dep.id);
    }
  } else if (body.event === "TRANSFER") {
    const wd = await db.get("SELECT * FROM withdrawals WHERE reference = ?", mchOrderNo);
    if (!wd) return res.status(404).send("NOT_FOUND");
    const state = Number(data.state);
    if (state === 2) {
      await db.run("UPDATE withdrawals SET status = 'success', updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'), processed_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?", wd.id);
    } else if (state === 3 || state === 4) {
      if (wd.status !== "rejected") {
        await db.run("UPDATE withdrawals SET status = 'rejected', failure_reason = ?, updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?", data.errorMessage || "Payout failed at JuntPay", wd.id);
        await addTransaction(wd.user_id, "refund", wd.amount, `Payout failed: ${data.errorMessage || ""}`, { withdrawal_id: wd.id });
      }
    }
  }

  res.type("text/plain").send("SUCCESS");
});

// Nekpay webhook — handles collection (deposit) and payout (transfer) notifications.
// Both arrive as application/x-www-form-urlencoded POST forms.
router.post("/deposit/webhook/nekpay", async (req, res) => {
  const body = req.body || {};

  // Payout notification (identified by the merchant transfer id).
  if (body.merTransferId) {
    const wd = await db.get("SELECT * FROM withdrawals WHERE reference = ?", body.merTransferId);
    if (!wd) return res.type("text/plain").send("success");
    const r = String(body.tradeResult);
    if (r === "1") {
      await db.run("UPDATE withdrawals SET status = 'success', updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'), processed_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?", wd.id);
    } else if (r === "2" || r === "3") {
      if (wd.status !== "rejected") {
        await db.run("UPDATE withdrawals SET status = 'rejected', failure_reason = ?, updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?", "Nekpay transfer failed", wd.id);
        await addTransaction(wd.user_id, "refund", wd.amount, "Payout failed", { withdrawal_id: wd.id });
      }
    }
    return res.type("text/plain").send("success");
  }

  // Deposit (collection) notification (identified by the merchant order no).
  const mchOrderNo = body.mchOrderNo || body.mchtOrderNo;
  if (mchOrderNo) {
    const dep = await db.get("SELECT * FROM deposits WHERE reference = ?", mchOrderNo);
    if (!dep) return res.type("text/plain").send("success");
    const s = String(body.tradeResult ?? body.orderStatus ?? "").toLowerCase();
    if (s === "1" || s === "success") {
      if (dep.status !== "success") {
        await db.run("UPDATE deposits SET status = 'success', updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?", dep.id);
        await addTransaction(dep.user_id, "deposit", dep.amount, "Deposit", { reference: dep.reference, gateway: "nekpay" });
        await creditDepositBonus(dep.user_id, dep.amount, dep.reference);
      }
    } else if (s === "2" || s === "3" || s === "failed") {
      await db.run("UPDATE deposits SET status = 'failed', updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?", dep.id);
    }
    return res.type("text/plain").send("success");
  }

  return res.type("text/plain").send("success");
});

// GloPay payment hook callback (JSON). One notify URL handles both deposit
// (collection) and payout (payment) notifications, matched by merchantOrderId.
router.post("/deposit/webhook/glopay", async (req, res) => {
  const body = req.body || {};
  const merchantOrderId = String(body.merchantOrderId || body.merchantOrderNo || "");
  const returnCode = String(body.returnCode ?? body.return_code ?? "");
  if (!merchantOrderId) return res.send("ok");

  // Best-effort signature verification.
  const settings = await getAllSettings();
  const cfg = glopay.getConfig(settings);
  if (body.sign && !glopay.verifyCallback(body, cfg)) {
    return res.status(400).send("bad sign");
  }

  // Deposit (collection) — the reference doubles as the merchant order id.
  const dep = await db.get("SELECT * FROM deposits WHERE reference = ?", merchantOrderId);
  if (dep) {
    if (returnCode === "00") {
      if (dep.status !== "success") {
        await db.run("UPDATE deposits SET status = 'success', updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?", dep.id);
        await addTransaction(dep.user_id, "deposit", dep.amount, "Deposit", { reference: dep.reference, gateway: "glopay" });
        await creditDepositBonus(dep.user_id, dep.amount, dep.reference);
      }
    } else if (dep.status !== "failed") {
      await db.run("UPDATE deposits SET status = 'failed', updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?", dep.id);
    }
    return res.send("ok");
  }

  // Payout (payment) — the withdrawal reference doubles as the merchant order id.
  const wd = await db.get("SELECT * FROM withdrawals WHERE reference = ?", merchantOrderId);
  if (wd) {
    if (returnCode === "00") {
      await db.run("UPDATE withdrawals SET status = 'success', updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'), processed_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?", wd.id);
    } else if (wd.status !== "rejected") {
      await db.run("UPDATE withdrawals SET status = 'rejected', failure_reason = ?, updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?", "GloPay payout failed", wd.id);
      await addTransaction(wd.user_id, "refund", wd.amount, "Payout failed", { withdrawal_id: wd.id });
    }
    return res.send("ok");
  }

  return res.send("ok");
});

// FossaPay webhook — one URL handles deposit.completed (persistent VA),
// checkout.completed (one-time checkout) and payout.* (withdrawals).
// Signature: HMAC-SHA256(webhookSecret, JSON.stringify(body.data)) in
// x-fossapay-Signature.
router.post("/deposit/webhook/fossapay", async (req, res) => {
  const body = req.body || {};
  const cfg = fossapay.getConfig(await getAllSettings());

  if (cfg.webhookSecret) {
    const sig = String(req.headers["x-fossapay-signature"] || "");
    const expected = crypto.createHmac("sha256", cfg.webhookSecret).update(JSON.stringify(body.data || {})).digest("hex");
    if (!sig || sig !== expected) return res.status(401).send("INVALID_SIGNATURE");
  }

  const eventType = String(body.eventType || "");
  const data = body.data || {};

  if (eventType === "deposit.completed") {
    const accountNumber = String((data.recipient && data.recipient.accountNumber) || "");
    const customerId = String(data.customerId || "");
    let dep = null;
    if (accountNumber) dep = await db.get("SELECT * FROM deposits WHERE account_number = ? AND method = 'fossapay'", accountNumber);
    if (!dep && customerId) dep = await db.get("SELECT * FROM deposits WHERE gateway_id = ? AND method = 'fossapay'", customerId);
    if (dep && dep.status !== "success") {
      await db.run("UPDATE deposits SET status = 'success', updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?", dep.id);
      await addTransaction(dep.user_id, "deposit", dep.amount, "Deposit", { reference: dep.reference, gateway: "fossapay" });
      await creditDepositBonus(dep.user_id, dep.amount, dep.reference);
    }
  } else if (eventType === "checkout.completed" || eventType === "checkout.failed" || eventType === "checkout.expired" || eventType === "checkout.reversed") {
    const reference = String(data.reference || "");
    const dep = reference ? await db.get("SELECT * FROM deposits WHERE reference = ? AND method = 'fossapay'", reference) : null;
    if (dep) {
      if (eventType === "checkout.completed" && dep.status !== "success") {
        await db.run("UPDATE deposits SET status = 'success', updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?", dep.id);
        await addTransaction(dep.user_id, "deposit", dep.amount, "Deposit", { reference: dep.reference, gateway: "fossapay" });
        await creditDepositBonus(dep.user_id, dep.amount, dep.reference);
      } else if (eventType !== "checkout.completed" && dep.status !== "failed") {
        await db.run("UPDATE deposits SET status = 'failed', updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?", dep.id);
      }
    }
  } else if (eventType === "payout.completed" || eventType === "payout.failed" || eventType === "payout.reversed") {
    const reference = String(data.reference || "");
    const wd = reference ? await db.get("SELECT * FROM withdrawals WHERE reference = ?", reference) : null;
    if (wd) {
      if (eventType === "payout.completed") {
        await db.run("UPDATE withdrawals SET status = 'success', updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'), processed_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?", wd.id);
      } else if (wd.status !== "rejected") {
        await db.run("UPDATE withdrawals SET status = 'rejected', failure_reason = ?, updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?", "FossaPay payout " + eventType, wd.id);
        await addTransaction(wd.user_id, "refund", wd.amount, "Payout failed", { withdrawal_id: wd.id });
      }
    }
  }

  res.status(200).send("OK");
});

// Paystack webhook — handles charge.success (deposits) and transfer.* (payouts).
router.post("/deposit/webhook/paystack", async (req, res) => {
  const event = (req.body && req.body.event) || "";
  const data = (req.body && req.body.data) || {};

  if (event === "charge.success") {
    const customerId = (data.customer && (data.customer.id != null ? data.customer.id : data.customer.customer_code)) || "";
    const accountNumber = (data.authorization && (data.authorization.account_number || data.authorization.receiver_bank_account_number)) ||
      (data.metadata && data.metadata.receiver_account_number) || "";
    let dep = null;
    if (customerId) dep = await db.get("SELECT * FROM deposits WHERE gateway_id = ?", String(customerId));
    if (!dep && accountNumber) dep = await db.get("SELECT * FROM deposits WHERE account_number = ?", accountNumber);
    if (!dep && data.reference) dep = await db.get("SELECT * FROM deposits WHERE reference = ?", data.reference);
    if (dep && dep.status !== "success") {
      await db.run("UPDATE deposits SET status = 'success', updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?", dep.id);
      await addTransaction(dep.user_id, "deposit", dep.amount, "Deposit", { reference: dep.reference, gateway: "paystack" });
      await creditDepositBonus(dep.user_id, dep.amount, dep.reference);
    }
  } else if (event === "transfer.success" || event === "transfer.failed" || event === "transfer.reversed") {
    const wd = await db.get("SELECT * FROM withdrawals WHERE gateway_reference = ? OR reference = ?", data.transfer_code || "", data.transfer_code || "");
    if (wd) {
      if (event === "transfer.success") {
        await db.run("UPDATE withdrawals SET status = 'success', updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'), processed_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?", wd.id);
      } else if (wd.status !== "rejected") {
        await db.run("UPDATE withdrawals SET status = 'rejected', failure_reason = ?, updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?", "Paystack transfer " + event, wd.id);
        await addTransaction(wd.user_id, "refund", wd.amount, "Payout failed", { withdrawal_id: wd.id });
      }
    }
  }
  res.status(200).send("OK");
});

// Duplo (Atlas) webhook — handles checkout and payout events.
router.post("/deposit/webhook/duplo", async (req, res) => {
  const body = req.body || {};
  const data = body.data || body;
  const eventType = String(body.event_type || body.event || data.event_type || data.event || "").toLowerCase();

  if (eventType === "in_flow_success_event") {
    // Virtual account inflow — match by the account that received the money.
    // Duplo's payload has both `customerAccountNumber` (the payer) and
    // `recipient.accountNumber` (the receiving virtual account); we match on
    // the recipient, which is our virtual account.
    const accountNumber = (data.recipient && data.recipient.accountNumber) || "";
    const dep = accountNumber
      ? await db.get("SELECT * FROM deposits WHERE account_number = ? AND method = 'duplo'", accountNumber)
      : null;
    if (dep && dep.status !== "success") {
      await db.run("UPDATE deposits SET status = 'success', updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?", dep.id);
      await addTransaction(dep.user_id, "deposit", dep.amount, "Deposit", { reference: dep.reference, gateway: "duplo" });
      await creditDepositBonus(dep.user_id, dep.amount, dep.reference);
    }
    return res.status(200).send("OK");
  }

  if (eventType === "out_flow_success_event" || eventType === "out_flow_failed_event") {
    const reference = data.reference || data.sourceReference || data.source_reference || "";
    const wd = reference ? await db.get("SELECT * FROM withdrawals WHERE reference = ? OR gateway_reference = ?", reference, reference) : null;
    if (wd) {
      if (eventType === "out_flow_success_event") {
        await db.run("UPDATE withdrawals SET status = 'success', updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'), processed_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?", wd.id);
      } else if (wd.status !== "rejected") {
        await db.run("UPDATE withdrawals SET status = 'rejected', failure_reason = ?, updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?", "Duplo payout failed", wd.id);
        await addTransaction(wd.user_id, "refund", wd.amount, "Payout failed", { withdrawal_id: wd.id });
      }
    }
    return res.status(200).send("OK");
  }

  // Checkout / payment-link events (legacy fallback).
  const reference = data.sourceReference || data.source_reference || data.reference || "";
  const status = String(data.status || data.checkoutStatus || "").toLowerCase();
  if (reference) {
    const dep = await db.get("SELECT * FROM deposits WHERE reference = ?", reference);
    if (dep) {
      if (["completed", "successful", "success"].includes(status)) {
        if (dep.status !== "success") {
          await db.run("UPDATE deposits SET status = 'success', updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?", dep.id);
          await addTransaction(dep.user_id, "deposit", dep.amount, "Deposit", { reference: dep.reference, gateway: "duplo" });
          await creditDepositBonus(dep.user_id, dep.amount, dep.reference);
        }
      } else if (["failed", "cancelled", "canceled"].includes(status)) {
        await db.run("UPDATE deposits SET status = 'failed', updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?", dep.id);
      }
    }
  }
  res.status(200).send("OK");
});

// Nomba webhook — handles virtual-account inflows and payout status updates.
router.post("/deposit/webhook/nomba", async (req, res) => {
  const body = req.body || {};
  const data = body.data || body;
  const ref = data.merchantTxRef || data.merchant_tx_ref || data.reference || "";
  const status = String(data.status || data.transactionStatus || data.gatewayMessage || "").toUpperCase();

  if (ref) {
    const dep = await db.get("SELECT * FROM deposits WHERE reference = ? AND method = 'nomba'", ref);
    if (dep) {
      if (status === "SUCCESS" && dep.status !== "success") {
        await db.run("UPDATE deposits SET status = 'success', updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?", dep.id);
        await addTransaction(dep.user_id, "deposit", dep.amount, "Deposit", { reference: dep.reference, gateway: "nomba" });
        await creditDepositBonus(dep.user_id, dep.amount, dep.reference);
      } else if (["REFUND", "FAILED", "CANCELLED", "REVERSED_BY_VENDOR", "PAYMENT_FAILED"].includes(status)) {
        await db.run("UPDATE deposits SET status = 'failed', updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?", dep.id);
      }
    } else {
      const wd = await db.get("SELECT * FROM withdrawals WHERE reference = ? AND gateway = 'nomba'", ref);
      if (wd) {
        if (status === "SUCCESS") {
          await db.run("UPDATE withdrawals SET status = 'success', updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'), processed_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?", wd.id);
        } else if (["REFUND", "FAILED", "CANCELLED", "REVERSED_BY_VENDOR", "PAYMENT_FAILED"].includes(status) && wd.status !== "rejected") {
          await db.run("UPDATE withdrawals SET status = 'rejected', failure_reason = ?, updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?", "Nomba payout " + status, wd.id);
          await addTransaction(wd.user_id, "refund", wd.amount, "Payout failed", { withdrawal_id: wd.id });
        }
      }
    }
  }
  res.status(200).send("OK");
});

// Kora webhook — handles charge.success/charge.failed (deposits) and
// transfer.success/transfer.failed (payouts). The request is signed with an
// HMAC SHA256 of the `data` object using the secret key (x-korapay-signature).
router.post("/deposit/webhook/kora", async (req, res) => {
  const body = req.body || {};
  const event = String(body.event || "");
  const data = body.data || {};

  const cfg = kora.getConfig(await getAllSettings());
  if (cfg.secretKey) {
    const sig = String(req.headers["x-korapay-signature"] || "");
    const expected = crypto.createHmac("sha256", cfg.secretKey).update(JSON.stringify(data)).digest("hex");
    if (!sig || sig !== expected) {
      return res.status(401).send("INVALID_SIGNATURE");
    }
  }

  if (event === "charge.success" || event === "charge.failed") {
    // Single-use bank-transfer + checkout charges carry the merchant reference
    // directly; permanent virtual-account pay-ins carry it under the nested
    // virtual_bank_account_details object (account_reference / account_number).
    const reference = data.reference || data.payment_reference || "";
    const vba = (data.virtual_bank_account_details && data.virtual_bank_account_details.virtual_bank_account) || {};
    const accountRef = vba.account_reference || "";
    const accountNumber = vba.account_number || "";

    let dep = null;
    if (reference) dep = await db.get("SELECT * FROM deposits WHERE reference = ? OR gateway_id = ?", reference, reference);
    if (!dep && accountRef) dep = await db.get("SELECT * FROM deposits WHERE reference = ? OR gateway_id = ?", accountRef, accountRef);
    if (!dep && accountNumber) dep = await db.get("SELECT * FROM deposits WHERE account_number = ? AND method = 'kora'", accountNumber);

    if (dep) {
      if (event === "charge.success" && dep.status !== "success") {
        await db.run("UPDATE deposits SET status = 'success', updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?", dep.id);
        await addTransaction(dep.user_id, "deposit", dep.amount, "Deposit", { reference: dep.reference, gateway: "kora" });
        await creditDepositBonus(dep.user_id, dep.amount, dep.reference);
      } else if (event === "charge.failed") {
        await db.run("UPDATE deposits SET status = 'failed', updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?", dep.id);
      }
    }
  } else if (event === "transfer.success" || event === "transfer.failed") {
    const reference = data.reference || "";
    const wd = reference ? await db.get("SELECT * FROM withdrawals WHERE reference = ? OR gateway_reference = ?", reference, reference) : null;
    if (wd) {
      if (event === "transfer.success") {
        await db.run("UPDATE withdrawals SET status = 'success', updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'), processed_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?", wd.id);
      } else if (wd.status !== "rejected") {
        await db.run("UPDATE withdrawals SET status = 'rejected', failure_reason = ?, updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?", "Kora transfer failed", wd.id);
        await addTransaction(wd.user_id, "refund", wd.amount, "Payout failed", { withdrawal_id: wd.id });
      }
    }
  }

  res.status(200).send("OK");
});

// ---------- WITHDRAWALS ----------
// True when a gateway error indicates the merchant float has no funds.
function isInsufficientBalanceError(error) {
  return /insufficient|not enough|low balance|insufficient_balance|available balance|balance (too low|is low)/i.test(String(error || ""));
}

// Flag a withdrawal that could not be processed (e.g. gateway insufficient
// balance) and record an alert for the admin dashboard.
async function recordGatewayPayoutFailure(wd, error, gateway) {
  const reason = String(error || "Gateway payout failed");
  await db.run("UPDATE withdrawals SET status = 'on_hold', failure_reason = ?, updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?", reason, wd.id);
  const message = `${isInsufficientBalanceError(reason) ? "Insufficient gateway balance" : "Gateway payout failed"} — withdrawal ${wd.reference} (${gateway || wd.gateway || wd.method}): ${reason}`;
  const id = "alert_" + uuidv4().replace(/-/g, "").slice(0, 16);
  await db.run("INSERT INTO admin_alerts (id, type, message, withdrawal_id, gateway, severity) VALUES (?, 'gateway_payout_failed', ?, ?, ?, 'error')", id, message, wd.id, gateway || wd.gateway || wd.method || null);
}

// Execute a payout via the currently-configured payout gateway. Returns
// { ok, status, reference, error } describing the result.
async function executePayout(wd, settings) {
  const payoutGateway = settings.payout_gateway || "nomba";

  if (payoutGateway === "juntpay") {
    const cfg = juntpay.getConfig(settings);
    // Re-resolve the bank code for JuntPay using the stored bank name, so
    // payouts still work after switching gateways (different bank codes).
    let bankCode = wd.bank_code;
    const resolved = await resolveBankCodeForGateway("juntpay", wd.bank_name, settings);
    if (resolved) bankCode = resolved;

    if (!wd.account_number || !bankCode) {
      return { ok: false, error: "Missing bank account number or bank code" };
    }

    const baseUrl = cfg.notifyUrl ? "" : "";
    const result = await juntpay.createPayout({
      amount: wd.net_amount || wd.amount,
      mchOrderNo: wd.reference,
      transferDesc: (settings.transfer_description_template || "Lumenhub payout").slice(0, 64),
      accountNumber: String(wd.account_number),
      bankCode: String(bankCode),
      customerName: wd.account_name || "Customer",
      customerMobile: (await db.get("SELECT phone FROM users WHERE id = ?", wd.user_id))?.phone || "",
      customerEmail: "payout@lumenhub.com",
      notifyUrl: cfg.notifyUrl || "",
    }, cfg);

    if (result.error) return { ok: false, error: result.error };
    const data = result.data || {};
    await db.run("UPDATE withdrawals SET bank_code = ?, gateway = 'juntpay', gateway_reference = ? WHERE id = ?", bankCode, data.transferId || null, wd.id);

    // JuntPay payout states: 0 generated, 1 paying, 2 success, 3 failed, 4 reversed.
    const state = Number(data.state);
    if (state === 2) return { ok: true, status: "success", reference: data.transferId };
    if (state === 3) return { ok: false, status: "rejected", reference: data.transferId, error: "JuntPay rejected the payout" };
    return { ok: true, status: "processing", reference: data.transferId };
  }

  if (payoutGateway === "paystack") {
    const cfg = paystack.getConfig(settings);
    if (!cfg.secretKey) return { ok: false, error: "Paystack is not configured (missing secret key)" };
    let bankCode = wd.bank_code;
    const resolved = await resolveBankCodeForGateway("paystack", wd.bank_name, settings);
    if (resolved) bankCode = resolved;
    if (!wd.account_number || !bankCode) return { ok: false, error: "Missing bank account number or bank code" };

    const result = await paystack.createTransfer({
      amount: wd.net_amount || wd.amount,
      account_number: String(wd.account_number),
      bank_code: String(bankCode),
      account_name: wd.account_name || "Customer",
      reason: (settings.transfer_description_template || "Lumenhub payout").slice(0, 200),
    }, cfg);

    if (result.error) return { ok: false, error: result.error };
    const data = result.data || {};
    await db.run("UPDATE withdrawals SET bank_code = ?, gateway = 'paystack', gateway_reference = ? WHERE id = ?", bankCode, data.transfer_code || null, wd.id);
    const status = String(data.status || "").toLowerCase();
    if (status === "success") return { ok: true, status: "success", reference: data.transfer_code };
    if (status === "failed") return { ok: false, status: "rejected", reference: data.transfer_code, error: "Paystack rejected the transfer" };
    return { ok: true, status: "processing", reference: data.transfer_code };
  }

  if (payoutGateway === "duplo") {
    const cfg = duplo.getConfig(settings);
    if (!cfg.apiKey) return { ok: false, error: "Duplo is not configured (missing API key)" };
    let bankCode = wd.bank_code;
    const resolved = await resolveBankCodeForGateway("duplo", wd.bank_name, settings);
    if (resolved) bankCode = resolved;
    if (!wd.account_number || !bankCode) return { ok: false, error: "Missing bank account number or bank code" };

    const result = await duplo.createPayout({
      amount: wd.net_amount || wd.amount,
      account_number: String(wd.account_number),
      bank_code: String(bankCode),
      bank_name: wd.bank_name || "Bank",
      account_name: wd.account_name || "Customer",
      narration: (settings.transfer_description_template || "Lumenhub payout").slice(0, 100),
      sourceReference: wd.reference,
    }, cfg);

    if (result.error) return { ok: false, error: result.error };
    const data = result.data || {};
    await db.run("UPDATE withdrawals SET bank_code = ?, gateway = 'duplo', gateway_reference = ? WHERE id = ?", bankCode, data.reference || null, wd.id);
    const status = String(data.status || "").toLowerCase();
    if (status === "success") return { ok: true, status: "success", reference: data.reference };
    if (status === "failed") return { ok: false, status: "rejected", reference: data.reference, error: "Duplo rejected the payout" };
    return { ok: true, status: "processing", reference: data.reference };
  }

  if (payoutGateway === "nomba") {
    const cfg = nomba.getConfig(settings);
    if (!cfg.clientId || !cfg.clientSecret || !cfg.accountId) return { ok: false, error: "Nomba is not configured (missing credentials)" };
    let bankCode = wd.bank_code;
    const resolved = await resolveBankCodeForGateway("nomba", wd.bank_name, settings);
    if (resolved) bankCode = resolved;
    if (!wd.account_number || !bankCode) return { ok: false, error: "Missing bank account number or bank code" };

    const result = await nomba.createTransfer({
      amount: wd.net_amount || wd.amount,
      accountNumber: String(wd.account_number),
      accountName: wd.account_name || "Customer",
      bankCode: String(bankCode),
      merchantTxRef: wd.reference,
      narration: (settings.transfer_description_template || "Lumenhub payout").slice(0, 100),
    }, cfg);

    if (result.error) return { ok: false, error: result.error };
    const data = result.data || {};
    await db.run("UPDATE withdrawals SET bank_code = ?, gateway = 'nomba', gateway_reference = ? WHERE id = ?", bankCode, data.id || null, wd.id);
    const status = String(data.status || "").toUpperCase();
    if (status === "SUCCESS") return { ok: true, status: "success", reference: data.id };
    return { ok: true, status: "processing", reference: data.id };
  }

  if (payoutGateway === "kora") {
    const cfg = kora.getConfig(settings);
    if (!cfg.secretKey) return { ok: false, error: "Kora is not configured (missing secret key)" };
    let bankCode = wd.bank_code;
    const resolved = await resolveBankCodeForGateway("kora", wd.bank_name, settings);
    if (resolved) bankCode = resolved;
    if (!wd.account_number || !bankCode) return { ok: false, error: "Missing bank account number or bank code" };

    const result = await kora.createPayout({
      amount: wd.net_amount || wd.amount,
      account_number: String(wd.account_number),
      bank_code: String(bankCode),
      account_name: wd.account_name || "Customer",
      reference: wd.reference,
      narration: (settings.transfer_description_template || "Lumenhub payout").slice(0, 100),
    }, cfg);

    if (result.error) return { ok: false, error: result.error };
    const data = result.data || {};
    await db.run("UPDATE withdrawals SET bank_code = ?, gateway = 'kora', gateway_reference = ? WHERE id = ?", bankCode, data.reference || null, wd.id);
    const status = String(data.status || "").toLowerCase();
    if (["success", "paid", "completed"].includes(status)) return { ok: true, status: "success", reference: data.reference };
    return { ok: true, status: "processing", reference: data.reference };
  }

  if (payoutGateway === "nekpay") {
    const cfg = nekpay.getConfig(settings);
    if (!cfg.paymentKey || !cfg.mchtId) return { ok: false, error: "Nekpay is not configured (missing merchant ID or payment key)" };
    let bankCode = wd.bank_code;
    const resolved = await resolveBankCodeForGateway("nekpay", wd.bank_name, settings);
    if (resolved) bankCode = resolved;
    if (!wd.account_number || !bankCode) return { ok: false, error: "Missing bank account number or bank code" };

    const result = await nekpay.createPayout({
      amount: wd.net_amount || wd.amount,
      mchTransferId: wd.reference,
      bankCode: String(bankCode),
      accountName: wd.account_name || "Customer",
      accountNumber: String(wd.account_number),
      notifyUrl: cfg.notifyUrl || "",
    }, cfg);

    if (result.error) return { ok: false, error: result.error };
    const data = result.data || {};
    await db.run("UPDATE withdrawals SET bank_code = ?, gateway = 'nekpay', gateway_reference = ? WHERE id = ?", bankCode, data.tradeNo || null, wd.id);

    // tradeResult: 0 applied, 1 success, 2 failed, 3 refused, 4 in progress.
    const tr = String(data.tradeResult);
    if (tr === "1") return { ok: true, status: "success", reference: data.tradeNo };
    if (tr === "2" || tr === "3") return { ok: false, status: "rejected", reference: data.tradeNo, error: "Nekpay rejected the transfer" };
    return { ok: true, status: "processing", reference: data.tradeNo };
  }

  if (payoutGateway === "glopay") {
    const cfg = glopay.getConfig(settings);
    if (!cfg.paymentKey || !cfg.mchId) return { ok: false, error: "GloPay is not configured (missing merchant ID or payment key)" };
    let bankCode = wd.bank_code;
    const resolved = await resolveBankCodeForGateway("glopay", wd.bank_name, settings);
    if (resolved) bankCode = resolved;
    if (!wd.account_number || !bankCode) return { ok: false, error: "Missing bank account number or bank code" };

    const result = await glopay.createPayout({
      orderId: wd.reference,
      amount: wd.net_amount || wd.amount,
      name: wd.account_name || "Customer",
      account: String(wd.account_number),
      bankCode: String(bankCode),
      email: "payout@lumenhub.com",
      mobile: (await db.get("SELECT phone FROM users WHERE id = ?", wd.user_id))?.phone || "08000000000",
    }, cfg);

    if (result.error) return { ok: false, error: result.error };
    await db.run("UPDATE withdrawals SET bank_code = ?, gateway = 'glopay', gateway_reference = ? WHERE id = ?", bankCode, wd.reference, wd.id);
    // GloPay payout is async; the callback notifies the final status.
    return { ok: true, status: "processing", reference: wd.reference };
  }

  if (payoutGateway === "fossapay") {
    const cfg = fossapay.getConfig(settings);
    if (!cfg.apiKey) return { ok: false, error: "FossaPay is not configured (missing API key)" };
    let bankCode = wd.bank_code;
    const resolved = await resolveBankCodeForGateway("fossapay", wd.bank_name, settings);
    if (resolved) bankCode = resolved;
    if (!wd.account_number || !bankCode) return { ok: false, error: "Missing bank account number or bank code" };

    const result = await fossapay.createPayout({
      amount: wd.net_amount || wd.amount,
      reference: wd.reference,
      bank_code: String(bankCode),
      bank_name: wd.bank_name || String(bankCode),
      account_name: wd.account_name || "Customer",
      account_number: String(wd.account_number),
    }, cfg);

    if (result.error) return { ok: false, error: result.error };
    const data = result.data || {};
    await db.run("UPDATE withdrawals SET bank_code = ?, gateway = 'fossapay', gateway_reference = ? WHERE id = ?", bankCode, data.payout_id || data.reference || null, wd.id);
    const status = String(data.status || "").toLowerCase();
    if (status === "completed") return { ok: true, status: "success", reference: data.reference };
    if (status === "failed" || status === "reversed") return { ok: false, status: "rejected", reference: data.reference, error: "FossaPay rejected the payout" };
    return { ok: true, status: "processing", reference: data.reference };
  }

  // Other gateways are simulated in this local clone.
  return { ok: true, status: "success", reference: null };
}

router.get("/withdrawals", authMiddleware, async (req, res) => {
  const rows = await db.all("SELECT * FROM withdrawals WHERE user_id = ? ORDER BY created_at DESC", req.user.id);
  res.json(rows);
});

router.post("/withdrawal/request", authMiddleware, async (req, res) => {
  const { amount, pin } = req.body || {};
  const amt = Number(amount);
  if (!amt || amt <= 0) return res.status(400).json({ detail: "Invalid amount" });

  const settings = await getAllSettings();
  const feePct = Number(settings.withdrawal_fee_percent ?? 15);
  const minWd = Number(settings.min_withdrawal ?? 0);
  const maxWd = Number(settings.max_withdrawal ?? 500000);
  if (minWd > 0 && amt < minWd) return res.status(400).json({ detail: `Minimum withdrawal is ₦${minWd}` });
  if (maxWd > 0 && amt > maxWd) return res.status(400).json({ detail: `Max withdrawal is ₦${maxWd}` });
  if (!isWithdrawalWindowOpen(settings)) {
    return res.status(400).json({ detail: `Withdrawals are open ${settings.withdrawal_start_time || "00:00"} – ${settings.withdrawal_end_time || "23:59"}` });
  }
  if (settings.require_withdrawal_pin) {
    if (!req.user.has_withdrawal_pin || !req.user.withdrawal_pin_hash) {
      return res.status(400).json({ detail: "Set a withdrawal PIN in your profile first" });
    }
    if (!pin || !(await bcrypt.compare(String(pin), req.user.withdrawal_pin_hash))) {
      return res.status(400).json({ detail: "Incorrect withdrawal PIN" });
    }
  }
  if (req.user.wallet_balance < amt) return res.status(400).json({ detail: "Insufficient balance" });

  const fee = amt * feePct / 100;
  const net = amt - fee;
  const id = "w_" + uuidv4().replace(/-/g, "").slice(0, 16);
  const reference = "wd_" + uuidv4().replace(/-/g, "").slice(0, 16);
  const payoutGateway = settings.payout_gateway || "nomba";
  const gatewayCol = ["juntpay", "paystack", "duplo", "nomba", "kora", "nekpay", "glopay"].includes(payoutGateway) ? payoutGateway : null;
  await db.run("INSERT INTO withdrawals (id, user_id, amount, fee, net_amount, reference, method, status, bank_name, account_number, account_name, bank_code, gateway) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)", id, req.user.id, amt, fee, net, reference, payoutGateway, req.user.bank_name, req.user.account_number, req.user.account_name, req.user.bank_code, gatewayCol);

  await addTransaction(req.user.id, "withdrawal", -amt, "Withdrawal request", { withdrawal_id: id });

  const wd = await db.get("SELECT * FROM withdrawals WHERE id = ?", id);

  // Auto-payout runs in the background so the request returns immediately
  // instead of blocking on the gateway (bank list + transfer round-trips).
  const autoMax = Number(settings.auto_payout_max_amount ?? 0);
  if (settings.auto_payout_enabled && (autoMax <= 0 || amt <= autoMax)) {
    executePayout(wd, settings)
      .then(async (outcome) => {
        if (outcome.ok) {
          await db.run("UPDATE withdrawals SET status = ?, updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'), processed_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?", outcome.status === "success" ? "success" : "processing", id);
        } else {
          await recordGatewayPayoutFailure(wd, outcome.error, payoutGateway);
        }
      })
      .catch((err) => console.error("Auto-payout error:", err.message));
  }

  res.status(201).json(wd);
});

// ---------- REFERRALS ----------
router.get("/referrals", authMiddleware, async (req, res) => {
  const gen1Percent = Number(await getSetting("gen1_percent", "20"));
  const gen2Percent = Number(await getSetting("gen2_percent", "3"));

  const gen1Rows = await db.all(`SELECT u.id, u.name, u.phone, u.created_at as joined_at,
            COALESCE((SELECT SUM(amount) FROM investments WHERE user_id = u.id), 0) as total_invested
     FROM referrals r JOIN users u ON u.id = r.referred_id
     WHERE r.referrer_id = ? AND r.generation = 1
     ORDER BY r.created_at DESC`, req.user.id);

  const gen2Rows = await db.all(`SELECT u.id, u.name, u.phone, u.created_at as joined_at,
            COALESCE((SELECT SUM(amount) FROM investments WHERE user_id = u.id), 0) as total_invested
     FROM referrals r JOIN users u ON u.id = r.referred_id
     WHERE r.referrer_id = ? AND r.generation = 2
     ORDER BY r.created_at DESC`, req.user.id);

  const gen1Earnings = (await db.get("SELECT COALESCE(SUM(bonus_paid),0) s FROM referrals WHERE referrer_id = ? AND generation = 1", req.user.id)).s;
  const gen2Earnings = (await db.get("SELECT COALESCE(SUM(bonus_paid),0) s FROM referrals WHERE referrer_id = ? AND generation = 2", req.user.id)).s;

  res.json({
    referral_code: req.user.referral_code,
    gen1: { users: gen1Rows, count: gen1Rows.length, earnings: gen1Earnings, percent: gen1Percent },
    gen2: { users: gen2Rows, count: gen2Rows.length, earnings: gen2Earnings, percent: gen2Percent },
    total_referral_earnings: req.user.referral_earnings || (gen1Earnings + gen2Earnings),
  });
});

// ---------- COUPONS ----------
router.post("/coupons/redeem", authMiddleware, async (req, res) => {
  const { code } = req.body || {};
  const coupon = await db.get("SELECT * FROM coupons WHERE code = ? AND is_active = 1", code);
  if (!coupon) return res.status(404).json({ detail: "Invalid coupon" });
  if (coupon.used_count >= coupon.max_uses) return res.status(400).json({ detail: "Coupon exhausted" });
  const existing = await db.get("SELECT 1 FROM coupon_redemptions WHERE coupon_id = ? AND user_id = ?", coupon.id, req.user.id);
  if (existing) return res.status(400).json({ detail: "Already redeemed" });

  await db.run("INSERT INTO coupon_redemptions (id, coupon_id, user_id) VALUES (?, ?, ?)", "cr_" + uuidv4().replace(/-/g, "").slice(0, 16), coupon.id, req.user.id);
  await db.run("UPDATE coupons SET used_count = used_count + 1 WHERE id = ?", coupon.id);
  await addTransaction(req.user.id, "coupon", coupon.amount, `Coupon ${code} redeemed`, { coupon_id: coupon.id });
  res.json({ message: "Coupon redeemed", amount: coupon.amount });
});

// ---------- TRANSACTIONS ----------
router.get("/transactions", authMiddleware, async (req, res) => {
  const rows = await db.all("SELECT * FROM transactions WHERE user_id = ? AND type NOT IN ('adjustment_credit','adjustment_debit') ORDER BY created_at DESC", req.user.id);
  res.json(rows.map(t => ({ ...t, meta: JSON.parse(t.meta || "{}") })));
});

// Poll the current user's pending deposits/withdrawals against the gateway.
router.post("/transactions/poll", authMiddleware, async (req, res) => {
  try {
    await polling.pollUser(req.user.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ detail: "Polling failed" });
  }
});

// ---------- BANKS ----------
const HARDCODED_BANKS = [
  { code: "999991", name: "PalmPay" },
  { code: "999992", name: "Opay" },
  { code: "058", name: "GTBank" },
  { code: "044", name: "Access Bank" },
  { code: "033", name: "United Bank for Africa" },
  { code: "232", name: "Sterling Bank" },
  { code: "057", name: "Zenith Bank" },
  { code: "011", name: "First Bank" },
  { code: "214", name: "First City Monument Bank" },
  { code: "090267", name: "Kuda Microfinance Bank" },
  { code: "090310", name: "Moniepoint Microfinance Bank" },
  { code: "090405", name: "Moniepoint" },
];

// Normalize a bank name so the same bank can be matched across gateways
// even when they use different labels (e.g. "GTBank" vs "Guaranty Trust Bank").
function normalizeBankName(name) {
  if (!name) return "";
  return String(name)
    .toLowerCase()
    .replace(/\bof\b/g, "")
    .replace(/[^a-z0-9]/g, "")
    .replace(/bank(s)?/g, "")
    .replace(/plc/g, "")
    .replace(/limited|ltd/g, "")
    .replace(/microfinance|mfb/g, "")
    .replace(/nigeria/g, "");
}

function findBankByCode(list, code) {
  return (list || []).find((b) => String(b.code) === String(code)) || null;
}

function findBankByName(list, name) {
  if (!name) return null;
  const target = normalizeBankName(name);
  let best = null;
  for (const b of list || []) {
    const norm = normalizeBankName(b.name);
    if (!norm) continue;
    if (norm === target) return b;
    if (!best && (norm.includes(target) || target.includes(norm))) best = b;
  }
  return best;
}

// Map common Nigerian bank name aliases to a canonical key for cross-gateway
// matching. Keys are the normalised short/alternate name; values are the
// canonical normalised full name.
const BANK_ALIASES = {
  // Guaranty Trust Bank (GTB / GTCO / "Guarantee" spelling)
  gtb: "guarantytrust",
  gt: "guarantytrust",
  gtco: "guarantytrust",
  guaranteetrust: "guarantytrust",
  // United Bank for Africa (UBA)
  uba: "unitedforafrica",
  // First City Monument Bank (FCMB)
  fcmb: "firstcitymonument",
  // First Bank of Nigeria (FBN)
  fbn: "first",
  // Stanbic IBTC Bank
  stanbic: "stanbicibtc",
  ibtc: "stanbicibtc",
  // Polaris Bank (formerly Skye Bank)
  skye: "polaris",
};

function bankCanonicalKey(name) {
  const norm = normalizeBankName(name);
  if (BANK_ALIASES[norm]) return BANK_ALIASES[norm];
  // OPay is listed under different names across gateways (e.g. Duplo calls it
  // "Paycom(Opay)"), so normalise any OPay/Paycom variant to a single key.
  if (norm.includes("opay") || norm.includes("paycom")) return "opay";
  return norm;
}

// Resolve the correct bank code for a given gateway using the stored bank name.
// This is what lets payouts keep working when the payout gateway is switched to
// a provider (e.g. JuntPay) that uses a different bank-code scheme.
async function resolveBankCodeForGateway(gateway, bankName, settings) {
  const name = bankName || "";
  if (gateway === "juntpay") {
    const cfg = juntpay.getConfig(settings);
    const result = await juntpay.queryBankList(cfg);
    if (result.error || !result.data) return null;
    const list = result.data
      .filter((b) => String(b.active === undefined ? b.avtive : b.active) !== "0")
      .map((b) => ({ code: b.bankCode, name: b.bankName }));
    const exact = findBankByName(list, name);
    if (exact) return exact.code;
    // Fall back to alias-key matching across both lists.
    const key = bankCanonicalKey(name);
    const match = list.find((b) => bankCanonicalKey(b.name) === key);
    return match ? match.code : null;
  }
  if (gateway === "paystack") {
    const cfg = paystack.getConfig(settings);
    const result = await paystack.listBanks(cfg);
    const list = result.error || !result.data ? HARDCODED_BANKS : result.data;
    const exact = findBankByName(list, name);
    if (exact) return exact.code;
    const key = bankCanonicalKey(name);
    const match = list.find((b) => bankCanonicalKey(b.name) === key);
    return match ? match.code : null;
  }
  if (gateway === "duplo") {
    const cfg = duplo.getConfig(settings);
    const result = await duplo.listBanks(cfg);
    const list = result.error || !result.data ? HARDCODED_BANKS : result.data;
    const exact = findBankByName(list, name);
    if (exact) return exact.code;
    const key = bankCanonicalKey(name);
    const match = list.find((b) => bankCanonicalKey(b.name) === key);
    return match ? match.code : null;
  }
  if (gateway === "nomba") {
    const cfg = nomba.getConfig(settings);
    const result = await nomba.listBanks(cfg);
    const list = result.error || !result.data ? HARDCODED_BANKS : result.data;
    const exact = findBankByName(list, name);
    if (exact) return exact.code;
    const key = bankCanonicalKey(name);
    const match = list.find((b) => bankCanonicalKey(b.name) === key);
    return match ? match.code : null;
  }
  if (gateway === "kora") {
    const cfg = kora.getConfig(settings);
    const result = await kora.listBanks(cfg);
    const list = result.error || !result.data ? HARDCODED_BANKS : result.data;
    const exact = findBankByName(list, name);
    if (exact) return exact.code;
    const key = bankCanonicalKey(name);
    const match = list.find((b) => bankCanonicalKey(b.name) === key);
    return match ? match.code : null;
  }
  if (gateway === "nekpay") {
    // Nekpay uses its own fixed NGRxxx bank-code list.
    const exact = findBankByName(nekpay.BANKS, name);
    if (exact) return exact.code;
    const key = bankCanonicalKey(name);
    const match = nekpay.BANKS.find((b) => bankCanonicalKey(b.name) === key);
    return match ? match.code : null;
  }
  if (gateway === "glopay") {
    // GloPay uses its own fixed sys_code bank-code list.
    const exact = findBankByName(glopay.BANKS, name);
    if (exact) return exact.code;
    const key = bankCanonicalKey(name);
    const match = glopay.BANKS.find((b) => bankCanonicalKey(b.name) === key);
    return match ? match.code : null;
  }
  if (gateway === "fossapay") {
    const cfg = fossapay.getConfig(settings);
    const result = await fossapay.listBanks(cfg);
    const list = result.error || !result.data ? HARDCODED_BANKS : result.data;
    const exact = findBankByName(list, name);
    if (exact) return exact.code;
    const key = bankCanonicalKey(name);
    const match = list.find((b) => bankCanonicalKey(b.name) === key);
    return match ? match.code : null;
  }
  // Paystack / default scheme
  const exact = findBankByName(HARDCODED_BANKS, name);
  if (exact) return exact.code;
  const key = bankCanonicalKey(name);
  const match = HARDCODED_BANKS.find((b) => bankCanonicalKey(b.name) === key);
  return match ? match.code : null;
}

router.get("/banks", async (req, res) => {
  const settings = await getAllSettings();
  const payoutGateway = settings.payout_gateway || "nomba";
  if (payoutGateway === "juntpay") {
    const cfg = juntpay.getConfig(settings);
    const result = await juntpay.queryBankList(cfg);
    if (!result.error && result.data) {
      const list = (result.data || [])
        .filter((b) => String(b.active === undefined ? b.avtive : b.active) !== "0")
        .map((b) => ({ code: b.bankCode, name: b.bankName }));
      if (list.length > 0) return res.json(list);
    }
    return res.json(HARDCODED_BANKS);
  }
  if (payoutGateway === "paystack") {
    const cfg = paystack.getConfig(settings);
    const result = await paystack.listBanks(cfg);
    if (!result.error && result.data && result.data.length > 0) return res.json(result.data);
    return res.json(HARDCODED_BANKS);
  }
  if (payoutGateway === "duplo") {
    const cfg = duplo.getConfig(settings);
    const result = await duplo.listBanks(cfg);
    if (!result.error && result.data && result.data.length > 0) return res.json(result.data);
    return res.json(HARDCODED_BANKS);
  }
  if (payoutGateway === "nomba") {
    const cfg = nomba.getConfig(settings);
    const result = await nomba.listBanks(cfg);
    if (!result.error && result.data && result.data.length > 0) return res.json(result.data);
    return res.json(HARDCODED_BANKS);
  }
  if (payoutGateway === "kora") {
    const cfg = kora.getConfig(settings);
    const result = await kora.listBanks(cfg);
    if (!result.error && result.data && result.data.length > 0) return res.json(result.data);
    return res.json(HARDCODED_BANKS);
  }
  if (payoutGateway === "nekpay") {
    return res.json(nekpay.BANKS);
  }
  if (payoutGateway === "glopay") {
    return res.json(glopay.BANKS);
  }
  if (payoutGateway === "fossapay") {
    const cfg = fossapay.getConfig(settings);
    const result = await fossapay.listBanks(cfg);
    if (!result.error && result.data && result.data.length > 0) return res.json(result.data);
    return res.json(HARDCODED_BANKS);
  }
  res.json(HARDCODED_BANKS);
});

// Resolve a bank account name via a specific gateway's name-enquiry API.
// Returns the account name string, or null when it can't be resolved.
async function resolveAccountViaGateway(gw, account_number, bank_code, settings) {
  let cfg;
  let result;
  if (gw === "paystack") {
    cfg = paystack.getConfig(settings);
    result = await paystack.resolveAccount(account_number, bank_code, cfg);
  } else if (gw === "duplo") {
    cfg = duplo.getConfig(settings);
    result = await duplo.resolveAccount(account_number, bank_code, cfg);
  } else if (gw === "nomba") {
    cfg = nomba.getConfig(settings);
    result = await nomba.resolveAccount(account_number, bank_code, cfg);
  } else if (gw === "kora") {
    cfg = kora.getConfig(settings);
    result = await kora.resolveAccount(account_number, bank_code, cfg);
  } else if (gw === "fossapay") {
    cfg = fossapay.getConfig(settings);
    result = await fossapay.resolveAccount(account_number, bank_code, cfg);
  } else {
    return null;
  }
  return result && !result.error && result.data && result.data.account_name ? result.data.account_name : null;
}

router.post("/banks/resolve", authMiddleware, async (req, res) => {
  const { account_number, bank_code, bank_name } = req.body || {};
  if (!account_number || !bank_code) return res.status(400).json({ detail: "Account number and bank code required" });
  const settings = await getAllSettings();
  const payoutGateway = settings.payout_gateway || "nomba";

  // Gateways with a native name-enquiry API resolve directly. Re-resolve the
  // bank code from the bank name first, so a stale/mismatched code from the
  // client (e.g. a Paystack code) doesn't break the enquiry for the current
  // gateway (e.g. Duplo).
  if (["paystack", "duplo", "nomba", "kora", "fossapay"].includes(payoutGateway)) {
    let targetCode = bank_code;
    if (bank_name) {
      const mapped = await resolveBankCodeForGateway(payoutGateway, bank_name, settings);
      if (mapped) targetCode = mapped;
    }
    const name = await resolveAccountViaGateway(payoutGateway, account_number, targetCode, settings);
    if (name) return res.json({ account_name: name, account_number, bank_code: targetCode });
    return res.status(502).json({ detail: "Account name could not be resolved. Please check the account number and bank, or enter the name manually.", manual: true });
  }

  // JuntPay (and any un-integrated gateway) has no name-enquiry API.
  // Fall back to resolving via another configured gateway, translating the
  // bank code to that gateway's scheme using the bank name.
  for (const gw of ["paystack", "kora", "nomba", "duplo"]) {
    let targetCode = bank_code;
    if (bank_name) {
      const mapped = await resolveBankCodeForGateway(gw, bank_name, settings);
      if (mapped) targetCode = mapped;
    }
    const name = await resolveAccountViaGateway(gw, account_number, targetCode, settings);
    if (name) return res.json({ account_name: name, account_number, bank_code, resolved_via: gw });
  }

  // No resolver available — let the client collect the name manually.
  res.status(400).json({ detail: "Account name could not be resolved automatically — enter it manually.", manual: true });
});

// ---------- PROFILE ----------
router.get("/profile/withdrawal-pin/status", authMiddleware, async (req, res) => {
  res.json({ has_pin: !!req.user.has_withdrawal_pin, locked: !!req.user.withdrawal_pin_locked });
});

router.get("/profile/withdrawal-pin/recovery-questions", authMiddleware, async (req, res) => {
  res.json({ question_1: req.user.security_question_1, question_2: req.user.security_question_2 });
});

// Set or update a user's security questions (used for password recovery).
router.post("/profile/security-questions/set", authMiddleware, async (req, res) => {
  const { question_1, answer_1, question_2, answer_2 } = req.body || {};
  if (!question_1 || !answer_1 || !question_2 || !answer_2) {
    return res.status(400).json({ detail: "All questions and answers are required" });
  }
  await db.run("UPDATE users SET security_question_1 = ?, security_answer_1_hash = ?, security_question_2 = ?, security_answer_2_hash = ? WHERE id = ?", question_1, await bcrypt.hash(answer_1, 10), question_2, await bcrypt.hash(answer_2, 10), req.user.id);
  res.json({ message: "Security questions updated" });
});

router.put("/profile/bank", authMiddleware, async (req, res) => {
  const { bank_name, account_number, account_name, bank_code } = req.body || {};
  const allowChange = await getAllSettings().allow_bank_change !== false;
  if (!allowChange && (req.user.bank_name || req.user.account_number)) {
    return res.status(403).json({ detail: "Bank changes are disabled. Please contact support to update your bank details." });
  }
  await db.run("UPDATE users SET bank_name = ?, account_number = ?, account_name = ?, bank_code = ? WHERE id = ?", bank_name, account_number, account_name, bank_code, req.user.id);
  res.json(publicUser(await db.get("SELECT * FROM users WHERE id = ?", req.user.id)));
});

router.post("/profile/withdrawal-pin/set", authMiddleware, async (req, res) => {
  const { pin, question_1, answer_1, question_2, answer_2 } = req.body || {};
  if (!pin || pin.length !== 4) return res.status(400).json({ detail: "PIN must be 4 digits" });
  const [pinHash, ans1, ans2] = await Promise.all([
    bcrypt.hash(pin, 10),
    answer_1 ? bcrypt.hash(answer_1, 10) : Promise.resolve(null),
    answer_2 ? bcrypt.hash(answer_2, 10) : Promise.resolve(null),
  ]);
  await db.run("UPDATE users SET has_withdrawal_pin = 1, withdrawal_pin_hash = ?, security_question_1 = ?, security_answer_1_hash = ?, security_question_2 = ?, security_answer_2_hash = ? WHERE id = ?", pinHash, question_1 || null, ans1,
    question_2 || null, ans2, req.user.id);
  res.json({ message: "PIN set" });
});

router.post("/profile/withdrawal-pin/change", authMiddleware, async (req, res) => {
  const { old_pin, new_pin } = req.body || {};
  if (!req.user.withdrawal_pin_hash || !(await bcrypt.compare(old_pin || "", req.user.withdrawal_pin_hash))) {
    return res.status(400).json({ detail: "Incorrect current PIN" });
  }
  await db.run("UPDATE users SET withdrawal_pin_hash = ? WHERE id = ?", await bcrypt.hash(new_pin, 10), req.user.id);
  res.json({ message: "PIN changed" });
});

router.post("/profile/withdrawal-pin/reset", authMiddleware, async (req, res) => {
  const { answer_1, answer_2, new_pin } = req.body || {};
  if (req.user.security_answer_1_hash && !(await bcrypt.compare(answer_1 || "", req.user.security_answer_1_hash))) {
    return res.status(400).json({ detail: "Incorrect answer" });
  }
  await db.run("UPDATE users SET withdrawal_pin_hash = ? WHERE id = ?", await bcrypt.hash(new_pin, 10), req.user.id);
  res.json({ message: "PIN reset" });
});

// ---------- ANNOUNCEMENTS ----------
router.get("/announcements/next", async (req, res) => {
  const now = new Date().toISOString();

  // Optionally resolve the requesting user so we can honor hide_from_newcomers_hours.
  let userCreatedAt = null;
  const header = req.headers.authorization;
  if (header && header.startsWith("Bearer ")) {
    try {
      const payload = jwt.verify(header.slice(7), JWT_SECRET);
      const u = await db.get("SELECT created_at FROM users WHERE id = ?", payload.sub);
      if (u) userCreatedAt = u.created_at;
    } catch {}
  }

  const rows = await db.all(`SELECT * FROM announcements
     WHERE is_active = 1 AND (starts_at IS NULL OR starts_at <= ?) AND (ends_at IS NULL OR ends_at >= ?)
     ORDER BY priority DESC, created_at DESC`, now, now);

  let picked = null;
  for (const a of rows) {
    const hideHours = Number(a.hide_from_newcomers_hours || 0);
    if (hideHours > 0 && userCreatedAt) {
      const ageMs = Date.now() - new Date(userCreatedAt).getTime();
      if (Number.isFinite(ageMs) && ageMs < hideHours * 60 * 60 * 1000) continue;
    }
    picked = a;
    break;
  }
  res.json(picked || null);
});

// ---------- DAILY CLAIM ----------
router.get("/daily-claim/status", authMiddleware, async (req, res) => {
  const enabled = await getSetting("daily_claim_enabled", "true") === "true";
  const amount = Number(await getSetting("daily_claim_amount", "100"));
  const hasInvested = !!(await db.get("SELECT 1 FROM investments WHERE user_id = ? AND status = 'active' LIMIT 1", req.user.id));
  const last = req.user.last_daily_claim_at;
  let canClaim = enabled && hasInvested, cooldown = 0;
  if (last) {
    const elapsed = (Date.now() - new Date(last).getTime()) / 1000;
    cooldown = Math.max(0, 86400 - elapsed);
    canClaim = canClaim && cooldown <= 0;
  }
  res.json({ enabled, amount, has_invested: hasInvested, can_claim: canClaim, cooldown_remaining_sec: Math.floor(cooldown), last_claim_at: last });
});

router.post("/daily-claim/claim", authMiddleware, async (req, res) => {
  const enabled = await getSetting("daily_claim_enabled", "true") === "true";
  if (!enabled) return res.status(400).json({ detail: "Daily claim disabled" });
  const hasInvested = !!(await db.get("SELECT 1 FROM investments WHERE user_id = ? AND status = 'active' LIMIT 1", req.user.id));
  if (!hasInvested) return res.status(400).json({ detail: "You need an active investment to claim the daily bonus" });
  const last = req.user.last_daily_claim_at;
  if (last && (Date.now() - new Date(last).getTime()) / 1000 < 86400) {
    return res.status(400).json({ detail: "Already claimed today" });
  }
  const amount = Number(await getSetting("daily_claim_amount", "100"));
  await db.run("UPDATE users SET last_daily_claim_at = ? WHERE id = ?", new Date().toISOString(), req.user.id);
  await db.run("INSERT INTO daily_claims (id, user_id, amount) VALUES (?, ?, ?)", "dc_" + uuidv4().replace(/-/g, "").slice(0, 16), req.user.id, amount);
  await addTransaction(req.user.id, "daily_claim", amount, "Daily claim", {});
  res.json({ message: "Claimed", amount });
});

// ---------- SETTINGS (public) ----------
const SECRET_SETTING_KEYS = new Set([
  "paystack_secret_key", "budpay_secret_key", "budpay_webhook_secret",
  "marasoft_secret_key", "marasoft_encryption_key", "marasoft_secret_hash",
  "nomba_client_secret", "qorepay_secret_key", "juntpay_secret_key",
  "duplo_api_key", "kora_secret_key", "kora_encryption_key",
  "nekpay_payment_key", "nekpay_secret_key",
  "glopay_key", "glopay_collection_key", "glopay_payment_key",
]);

router.get("/settings/public", async (req, res) => {
  const s = await getAllSettings();
  for (const k of SECRET_SETTING_KEYS) s[k] = "";
  // Which gateways users may deposit through (enabled + configured), in order.
  s.deposit_gateways = listAvailableDepositGateways(await getAllSettings());
  res.json(s);
});

// ================= ADMIN =================
router.use("/admin", authMiddleware, adminMiddleware);

router.get("/admin/stats/extended", async (req, res) => {
  const users = (await db.get("SELECT COUNT(*) c FROM users WHERE is_admin = 0")).c;
  const totalDeposits = (await db.get("SELECT COALESCE(SUM(amount),0) s FROM deposits WHERE status='success'")).s;
  const activeInv = (await db.get("SELECT COUNT(*) c FROM investments WHERE status='active'")).c;
  const totalInvCount = (await db.get("SELECT COUNT(*) c FROM investments")).c;
  const pendingWd = (await db.get("SELECT COUNT(*) c FROM withdrawals WHERE status='pending'")).c;
  const totalPaid = (await db.get("SELECT COALESCE(SUM(net_amount),0) s FROM withdrawals WHERE status IN ('success','paid')")).s;
  const paidCount = (await db.get("SELECT COUNT(*) c FROM withdrawals WHERE status IN ('success','paid')")).c;
  const totalInvested = (await db.get("SELECT COALESCE(SUM(amount),0) s FROM investments")).s;
  const totalBonuses = (await db.get("SELECT COALESCE(SUM(amount),0) s FROM transactions WHERE type='bonus'")).s;
  const totalRefPaid = (await db.get("SELECT COALESCE(SUM(amount),0) s FROM transactions WHERE type='referral'")).s;
  const totalProfitPaid = (await db.get("SELECT COALESCE(SUM(total_profit_paid),0) s FROM investments")).s;
  const totalFees = (await db.get("SELECT COALESCE(SUM(fee),0) s FROM withdrawals WHERE status IN ('success','paid')")).s;
  const next24h = (await db.get("SELECT COALESCE(SUM(daily_profit_amount),0) s FROM investments WHERE status='active'")).s;
  const depositBonuses = (await db.get("SELECT COALESCE(SUM(amount),0) s FROM transactions WHERE type='deposit_bonus'")).s;
  const dailyClaims = (await db.get("SELECT COALESCE(SUM(amount),0) s FROM transactions WHERE type='daily_claim'")).s;
  const coupons = (await db.get("SELECT COALESCE(SUM(amount),0) s FROM transactions WHERE type='coupon'")).s;
  const platformProfit = totalDeposits - totalPaid - totalProfitPaid - totalBonuses - totalRefPaid - depositBonuses - dailyClaims - coupons;

  const todayDeposits = (await db.get("SELECT COALESCE(SUM(amount),0) s FROM deposits WHERE status='success' AND created_at::date = CURRENT_DATE")).s;
  const todayDepositsCount = (await db.get("SELECT COUNT(*) c FROM deposits WHERE status='success' AND created_at::date = CURRENT_DATE")).c;
  const todayPaid = (await db.get("SELECT COALESCE(SUM(net_amount),0) s FROM withdrawals WHERE status IN ('success','paid') AND created_at::date = CURRENT_DATE")).s;
  const todayPaidCount = (await db.get("SELECT COUNT(*) c FROM withdrawals WHERE status IN ('success','paid') AND created_at::date = CURRENT_DATE")).c;
  const awaitingVerification = (await db.get("SELECT COUNT(*) c FROM deposits WHERE status='pending'")).c;

  res.json({
    platform_profit: platformProfit,
    next_24h_payout: next24h,
    users, online: 1,
    total_deposits: totalDeposits,
    active_investments: activeInv,
    pending_withdrawals: pendingWd,
    today: {
      deposits: todayDeposits, deposits_count: todayDepositsCount,
      paid_out: todayPaid, paid_out_count: todayPaidCount,
      net_inflow: todayDeposits - todayPaid, pending_now: pendingWd,
    },
    all_time: {
      total_paid_out: totalPaid, paid_withdrawals_count: paidCount, total_fees: totalFees,
      awaiting_verification: awaitingVerification, total_investments: totalInvCount, total_invested_amount: totalInvested,
      total_bonuses: totalBonuses, total_referral_paid: totalRefPaid, total_profit_paid: totalProfitPaid,
    },
    system_health: {
      fraud_attempts: 0,
      amount_mismatches: 0,
      gateway_payout_failures: Number((await db.get("SELECT COUNT(*) c FROM admin_alerts WHERE resolved_at IS NULL")).c),
    },
  });
});

router.get("/admin/alerts", async (req, res) => {
  const rows = await db.all(`SELECT a.*, w.amount as withdrawal_amount, w.status as withdrawal_status, w.reference as withdrawal_reference,
       u.name as user_name, u.phone as user_phone
     FROM admin_alerts a
     LEFT JOIN withdrawals w ON w.id = a.withdrawal_id
     LEFT JOIN users u ON u.id = w.user_id
     WHERE a.resolved_at IS NULL
     ORDER BY a.created_at DESC LIMIT 50`);
  res.json(rows);
});

router.post("/admin/alerts/:id/resolve", async (req, res) => {
  const a = await db.get("SELECT * FROM admin_alerts WHERE id = ?", req.params.id);
  if (!a) return res.status(404).json({ detail: "Not found" });
  await db.run("UPDATE admin_alerts SET resolved_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?", a.id);
  res.json({ message: "Resolved" });
});

router.get("/admin/stats/inflow", async (req, res) => {
  const frm = req.query.frm || new Date().toISOString().slice(0, 10);
  const to = req.query.to || frm;

  const seriesRows = await db.all(
    `SELECT to_char(created_at::date, 'YYYY-MM-DD') AS d, COALESCE(SUM(amount),0) AS total, COUNT(*) AS count
     FROM deposits WHERE status='success' AND created_at::date BETWEEN ?::date AND ?::date
     GROUP BY created_at::date ORDER BY created_at::date`,
    frm, to
  );
  const series = seriesRows.map((r) => ({ date: r.d, total: Number(r.total) }));

  const total = series.reduce((a, r) => a + r.total, 0);
  const count = seriesRows.reduce((a, r) => a + Number(r.count), 0);

  const peak = series.reduce((best, r) => (r.total > (best ? best.total : -1) ? r : best), null);

  const gwRows = await db.all(
    `SELECT COALESCE(NULLIF(method,''),'paystack') AS m, COALESCE(SUM(amount),0) AS total, COUNT(*) AS count
     FROM deposits WHERE status='success' AND created_at::date BETWEEN ?::date AND ?::date
     GROUP BY m`,
    frm, to
  );
  const gateways = gwRows.map((r) => ({ name: r.m, total: Number(r.total), count: Number(r.count) }));

  res.json({
    from: frm, to,
    total, count, avg: count ? total / count : 0,
    peak: peak || { date: frm, total: 0 },
    series,
    gateways,
  });
});

router.get("/admin/stats/payout-projection", async (req, res) => {
  const rows = await db.all("SELECT product_name, SUM(daily_profit_amount) total, COUNT(*) count, SUM(amount) invested FROM investments WHERE status='active' GROUP BY product_name");
  const total = rows.reduce((a, r) => a + r.total, 0);
  const activeCount = rows.reduce((a, r) => a + r.count, 0);
  const topContributors = await db.all("SELECT * FROM investments WHERE status='active' ORDER BY amount DESC LIMIT 10");
  res.json({ total, active_count: activeCount, by_product: rows, top_contributors: topContributors });
});

router.get("/admin/stats/profit-breakdown", async (req, res) => {
  const toDb = (iso) => {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 19).replace("T", " ");
  };
  const from = toDb(req.query.from);
  const to = toDb(req.query.to);
  const filt = (col) => {
    const parts = [];
    const params = [];
    if (from) { parts.push(`${col} >= ?`); params.push(from); }
    if (to) { parts.push(`${col} <= ?`); params.push(to); }
    return { sql: parts.length ? " AND " + parts.join(" AND ") : "", params };
  };

  const fDep = filt("created_at");
  const fWd = filt("created_at");
  const fTx = filt("created_at");
  const fTxJ = filt("t.created_at");

  const dep = await db.get(`SELECT COALESCE(SUM(amount),0) s, COUNT(*) c FROM deposits WHERE status='success'${fDep.sql}`, ...fDep.params);
  const wd = await db.get(`SELECT COALESCE(SUM(net_amount),0) s, COUNT(*) c FROM withdrawals WHERE status IN ('success','paid')${fWd.sql}`, ...fWd.params);

  const txAgg = (type) => db.get(
    `SELECT COALESCE(SUM(amount),0) s, COUNT(*) c FROM transactions WHERE type = ?${fTx.sql}`,
    type, ...fTx.params
  );
  const recent = (type) => db.all(
    `SELECT t.id, t.amount, t.description, t.created_at, u.name as user_name, u.phone as user_phone
     FROM transactions t JOIN users u ON u.id = t.user_id WHERE t.type = ?${fTxJ.sql}
     ORDER BY t.created_at DESC LIMIT 5`,
    type, ...fTxJ.params
  );

  const welcome = await txAgg("bonus");
  const coupon = await txAgg("coupon");
  const referral = await txAgg("referral");
  const profit = await txAgg("profit");

  const totalDeposits = Number(dep.s);
  const paidWd = Number(wd.s);
  const welcomeBonuses = Number(welcome.s);
  const coupons = Number(coupon.s);
  const referrals = Number(referral.s);
  const dailyProfit = Number(profit.s);
  const netProfit = totalDeposits - paidWd - welcomeBonuses - coupons - referrals - dailyProfit;

  res.json({
    range: { from: req.query.from || null, to: req.query.to || null },
    inflow: { total_deposits: totalDeposits, count: Number(dep.c) },
    outflow: {
      paid_withdrawals: { total: paidWd, count: Number(wd.c) },
      welcome_bonuses: { total: welcomeBonuses, count: Number(welcome.c) },
      coupon_redemptions: { total: coupons, count: Number(coupon.c) },
      referral_commissions: { total: referrals, count: Number(referral.c) },
      daily_profit_credits: { total: dailyProfit, count: Number(profit.c) },
    },
    net_profit: netProfit,
    formula: "deposits − paid_withdrawals − welcome_bonuses − coupons − referral_commissions − daily_profits",
    recent: {
      welcome_bonuses: await recent("bonus"),
      coupons: await recent("coupon"),
      referrals: await recent("referral"),
      profits: await recent("profit"),
    },
  });
});

router.get("/admin/users", async (req, res) => {
  const page = Math.max(1, Number(req.query.page || 1));
  const pageSize = Number(req.query.page_size || req.query.limit || 20);
  const q = String(req.query.q || "").trim().toLowerCase();
  const status = String(req.query.status || "all");

  const where = [];
  const params = [];
  if (q) {
    where.push("(LOWER(name) LIKE ? OR LOWER(phone) LIKE ? OR LOWER(COALESCE(account_name,'')) LIKE ? OR LOWER(COALESCE(account_number,'')) LIKE ?)");
    const like = "%" + q + "%";
    params.push(like, like, like, like);
  }
  if (status === "blocked") where.push("is_blocked = 1");
  else if (status === "active") where.push("is_blocked = 0 AND is_admin = 0");
  else if (status === "verified") where.push("bank_name IS NOT NULL");
  else if (status === "new_today") where.push("created_at::date = CURRENT_DATE");
  else if (status === "online") where.push("0");

  const whereSql = where.length ? " WHERE " + where.join(" AND ") : "";
  const total = (await db.get("SELECT COUNT(*) c FROM users" + whereSql, ...params)).c;
  const offset = (page - 1) * pageSize;
  const rows = await db.all("SELECT * FROM users" + whereSql + " ORDER BY created_at DESC LIMIT ? OFFSET ?", ...params, pageSize, offset);

  const totalUsers = (await db.get("SELECT COUNT(*) c FROM users WHERE is_admin = 0")).c;
  const verified = (await db.get("SELECT COUNT(*) c FROM users WHERE bank_name IS NOT NULL")).c;
  const blocked = (await db.get("SELECT COUNT(*) c FROM users WHERE is_blocked = 1")).c;
  res.json({
    items: rows.map(publicUser), total, page, page_size: pageSize,
    stats: { total_users: totalUsers, online_now: 0, verified, new_today: 0, blocked },
  });
});

router.get("/admin/users/export", async (req, res) => {
  const rows = await db.all("SELECT * FROM users ORDER BY created_at DESC");
  res.json(rows.map(publicUser));
});

router.get("/admin/users/:id", async (req, res) => {
  const u = await db.get("SELECT * FROM users WHERE id = ?", req.params.id);
  if (!u) return res.status(404).json({ detail: "Not found" });
  res.json(publicUser(u));
});

router.post("/admin/users/:id/block", async (req, res) => {
  const u = await db.get("SELECT * FROM users WHERE id = ?", req.params.id);
  if (!u) return res.status(404).json({ detail: "Not found" });
  await db.run("UPDATE users SET is_blocked = 1 WHERE id = ?", u.id);
  await logActivity(req.user, "user.blocked", "user", u.id, `Blocked user ${u.phone}`);
  res.json({ message: "Blocked" });
});

router.post("/admin/users/:id/unblock", async (req, res) => {
  const u = await db.get("SELECT * FROM users WHERE id = ?", req.params.id);
  if (!u) return res.status(404).json({ detail: "Not found" });
  await db.run("UPDATE users SET is_blocked = 0 WHERE id = ?", u.id);
  await logActivity(req.user, "user.unblocked", "user", u.id, `Unblocked user ${u.phone}`);
  res.json({ message: "Unblocked" });
});

// Credit / debit a user's wallet (amount is signed: positive = credit).
router.post("/admin/users/:id/adjust", async (req, res) => {
  const u = await db.get("SELECT * FROM users WHERE id = ?", req.params.id);
  if (!u) return res.status(404).json({ detail: "Not found" });
  const amount = Number(req.body?.amount || 0);
  const note = req.body?.note || (amount >= 0 ? "Admin credit" : "Admin debit");
  if (!amount) return res.status(400).json({ detail: "Amount required" });
  await addTransaction(u.id, amount >= 0 ? "adjustment_credit" : "adjustment_debit", amount, note, { admin_id: req.user.id });
  await db.run("INSERT INTO manual_adjustments (id, admin_id, user_id, type, amount, reason) VALUES (?, ?, ?, ?, ?, ?)", "ma_" + uuidv4().replace(/-/g, "").slice(0, 16), req.user.id, u.id, amount >= 0 ? "credit" : "debit", amount, note);
  await logActivity(req.user, "user.balance_adjusted", "user", u.id, `Adjusted ${u.phone} by ₦${amount}`);
  res.json({ message: "Adjusted", wallet_balance: (await db.get("SELECT wallet_balance FROM users WHERE id = ?", u.id)).wallet_balance });
});

router.post("/admin/users/:id/reset-password", async (req, res) => {
  const u = await db.get("SELECT * FROM users WHERE id = ?", req.params.id);
  if (!u) return res.status(404).json({ detail: "Not found" });
  const { new_password } = req.body || {};
  if (!new_password || String(new_password).length < 6) return res.status(400).json({ detail: "Password must be at least 6 characters" });
  await db.run("UPDATE users SET password_hash = ? WHERE id = ?", await bcrypt.hash(String(new_password), 10), u.id);
  await logActivity(req.user, "user.password_reset", "user", u.id, `Reset password for ${u.phone}`);
  res.json({ message: "Password reset" });
});

router.post("/admin/users/:id/clear-pin", async (req, res) => {
  const u = await db.get("SELECT * FROM users WHERE id = ?", req.params.id);
  if (!u) return res.status(404).json({ detail: "Not found" });
  await db.run("UPDATE users SET has_withdrawal_pin = 0, withdrawal_pin_hash = NULL WHERE id = ?", u.id);
  await logActivity(req.user, "user.pin_cleared", "user", u.id, `Cleared withdrawal PIN for ${u.phone}`);
  res.json({ message: "PIN cleared" });
});

router.post("/admin/users/:id/change-phone", async (req, res) => {
  const u = await db.get("SELECT * FROM users WHERE id = ?", req.params.id);
  if (!u) return res.status(404).json({ detail: "Not found" });
  const { new_phone } = req.body || {};
  if (!new_phone || !/^\d{11}$/.test(String(new_phone))) return res.status(400).json({ detail: "Phone must be 11 digits" });
  if (await db.get("SELECT 1 FROM users WHERE phone = ? AND id != ?", String(new_phone), u.id)) {
    return res.status(409).json({ detail: "Phone already in use" });
  }
  await db.run("UPDATE users SET phone = ? WHERE id = ?", String(new_phone), u.id);
  await logActivity(req.user, "user.phone_changed", "user", u.id, `Changed phone ${u.phone} → ${new_phone}`);
  res.json({ message: "Phone updated" });
});

router.post("/admin/users/:id/change-bank", async (req, res) => {
  const u = await db.get("SELECT * FROM users WHERE id = ?", req.params.id);
  if (!u) return res.status(404).json({ detail: "Not found" });
  const { bank_name, account_number, account_name, bank_code } = req.body || {};
  if (!account_number || !bank_code) {
    return res.status(400).json({ detail: "Account number and bank code are required" });
  }
  await db.run("UPDATE users SET bank_name = ?, account_number = ?, account_name = ?, bank_code = ? WHERE id = ?", bank_name || null, String(account_number), account_name || u.account_name || u.name, bank_code ? String(bank_code) : null, u.id);
  await logActivity(req.user, "user.bank_changed", "user", u.id, `Changed bank for ${u.phone}`);
  res.json({ message: "Bank updated", user: publicUser(await db.get("SELECT * FROM users WHERE id = ?", u.id)) });
});

// Issue a token so the admin can sign in as this user.
router.post("/admin/users/:id/login-as", async (req, res) => {
  const u = await db.get("SELECT * FROM users WHERE id = ?", req.params.id);
  if (!u) return res.status(404).json({ detail: "Not found" });
  await logActivity(req.user, "user.login_as", "user", u.id, `Issued login-as token for ${u.phone}`);
  res.json({ token: await generateToken(u) });
});

// Full user profile (user + aggregate stats) for the admin user detail page.
router.get("/admin/users/:id/details", async (req, res) => {
  const u = await db.get("SELECT * FROM users WHERE id = ?", req.params.id);
  if (!u) return res.status(404).json({ detail: "Not found" });
  const id = u.id;
  const sum = async (sql) => (await db.get(sql, id)).s;
  const count = async (sql) => (await db.get(sql, id)).c;
  const stats = {
    balance: u.wallet_balance,
    total_deposited: await sum("SELECT COALESCE(SUM(amount),0) s FROM deposits WHERE user_id=? AND status='success'"),
    deposits_count: await count("SELECT COUNT(*) c FROM deposits WHERE user_id=?"),
    total_invested: await sum("SELECT COALESCE(SUM(amount),0) s FROM investments WHERE user_id=?"),
    total_invested_count: await count("SELECT COUNT(*) c FROM investments WHERE user_id=?"),
    active_plans: await count("SELECT COUNT(*) c FROM investments WHERE user_id=? AND status='active'"),
    profit_earned: await sum("SELECT COALESCE(SUM(total_profit_paid),0) s FROM investments WHERE user_id=?"),
    total_withdrawn: await sum("SELECT COALESCE(SUM(net_amount),0) s FROM withdrawals WHERE user_id=? AND status IN ('success','paid')"),
    withdrawals_count: await count("SELECT COUNT(*) c FROM withdrawals WHERE user_id=?"),
    referrals: await count("SELECT COUNT(*) c FROM referrals WHERE referrer_id=?"),
    referrals_invested: await sum("SELECT COALESCE(SUM(referred_invested),0) s FROM referrals WHERE referrer_id=?"),
    referral_bonus: await sum("SELECT COALESCE(SUM(bonus_paid),0) s FROM referrals WHERE referrer_id=?"),
    transactions_count: await count("SELECT COUNT(*) c FROM transactions WHERE user_id=?"),
    bank_set: !!u.bank_name,
  };
  res.json({ user: publicUser(u), stats });
});

// Admin activity for a specific user.
router.get("/admin/users/:id/activity", async (req, res) => {
  const u = await db.get("SELECT id FROM users WHERE id = ?", req.params.id);
  if (!u) return res.status(404).json({ detail: "Not found" });
  const limit = Number(req.query.limit || 500);
  const rows = await db.all("SELECT * FROM activity_log WHERE target_id = ? ORDER BY created_at DESC LIMIT ?", req.params.id, limit);
  const count = (await db.get("SELECT COUNT(*) c FROM activity_log WHERE target_id = ?", req.params.id)).c;
  res.json({ items: rows.map((r) => ({ ...r, meta: JSON.parse(r.meta || "{}") })), count });
});

// Per-tab timeline data for a user's admin detail page.
router.get("/admin/users/:id/timeline", async (req, res) => {
  const u = await db.get("SELECT * FROM users WHERE id = ?", req.params.id);
  if (!u) return res.status(404).json({ detail: "Not found" });
  const tab = String(req.query.tab || "investments");
  const limit = Number(req.query.limit || 100);
  let items = [];
  if (tab === "investments") {
    items = await db.all("SELECT * FROM investments WHERE user_id = ? ORDER BY started_at DESC LIMIT ?", req.params.id, limit);
  } else if (tab === "deposits") {
    items = await db.all("SELECT * FROM deposits WHERE user_id = ? ORDER BY created_at DESC LIMIT ?", req.params.id, limit);
  } else if (tab === "withdrawals") {
    items = await db.all("SELECT * FROM withdrawals WHERE user_id = ? ORDER BY created_at DESC LIMIT ?", req.params.id, limit);
  } else if (tab === "referrals") {
    items = await db.all(`SELECT r.*, ue.name AS referred_name, ue.phone AS referred_phone, ur.name AS referrer_name
       FROM referrals r
       LEFT JOIN users ue ON ue.id = r.referred_id
       LEFT JOIN users ur ON ur.id = r.referrer_id
       WHERE r.referrer_id = ? ORDER BY r.created_at DESC LIMIT ?`, req.params.id, limit);
  } else if (tab === "transactions") {
    items = await db.all("SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT ?", req.params.id, limit)
      .map((t) => ({ ...t, meta: JSON.parse(t.meta || "{}") }));
  } else if (tab === "bank") {
    items = u.bank_name
      ? [{ bank_name: u.bank_name, account_number: u.account_number, account_name: u.account_name, bank_code: u.bank_code }]
      : [];
  }
  res.json({ items });
});

router.get("/admin/deposits", async (req, res) => {
  const limit = Number(req.query.limit || 50);
  const rows = await db.all(`SELECT d.*, u.name as user_name, u.phone as user_phone FROM deposits d JOIN users u ON u.id = d.user_id ORDER BY d.created_at DESC LIMIT ?`, limit);
  res.json(rows);
});

router.get("/admin/deposits/by-day", async (req, res) => {
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  const rows = await db.all(
    `SELECT d.*, u.name as user_name, u.phone as user_phone
     FROM deposits d JOIN users u ON u.id = d.user_id
     WHERE d.created_at::date = ?::date ORDER BY d.created_at DESC`,
    date
  );
  const total = rows.reduce((a, r) => a + Number(r.amount || 0), 0);
  res.json({ date, total, count: rows.length, deposits: rows });
});

router.post("/admin/deposits/poll-pending", async (req, res) => {
  const gateway = req.query.gateway || null;
  const result = await polling.pollDeposits(gateway);
  res.json(result);
});

router.post("/admin/deposits/bulk-backfill-gateway-ids", async (req, res) => {
  const cfgPaystack = paystack.getConfig(await getAllSettings());
  const rows = await db.all("SELECT * FROM deposits WHERE gateway_id IS NULL OR gateway_id = ''");
  let updated = 0, not_found = 0, errors = 0;
  for (const d of rows) {
    try {
      let gw = null;
      if (d.method === "paystack" && d.account_number) {
        const r = await paystack.findDedicatedAccount(d.account_number, cfgPaystack);
        if (!r.error && r.data) gw = r.data.customer_code || (r.data.id ? String(r.data.id) : null);
      }
      if (gw) {
        await db.run("UPDATE deposits SET gateway_id = ?, updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?", gw, d.id);
        updated++;
      } else {
        not_found++;
      }
    } catch (e) {
      errors++;
    }
  }
  await logActivity(req.user, "deposit.backfilled_gateway_ids", "deposit", null, `Backfilled ${updated} of ${rows.length} deposits`);
  res.json({ scanned: rows.length, updated, not_found, errors });
});

router.get("/admin/deposits/:id", async (req, res) => {
  const d = await db.get("SELECT * FROM deposits WHERE id = ?", req.params.id);
  if (!d) return res.status(404).json({ detail: "Not found" });
  res.json(d);
});

router.post("/admin/deposits/:id", async (req, res) => {
  const d = await db.get("SELECT * FROM deposits WHERE id = ?", req.params.id);
  if (!d) return res.status(404).json({ detail: "Not found" });
  const { status } = req.body || {};
  await db.run("UPDATE deposits SET status = ?, updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?", status || d.status, d.id);
  if (status === "success" && d.status !== "success") {
    await addTransaction(d.user_id, "deposit", d.amount, "Deposit", { reference: d.reference });
  }
  await logActivity(req.user, "deposit.approved", "deposit", d.id, `Deposit ${d.reference} → ${status}`);
  res.json({ message: "Updated" });
});

router.post("/admin/deposits/:id/approve", async (req, res) => {
  const d = await db.get("SELECT * FROM deposits WHERE id = ?", req.params.id);
  if (!d) return res.status(404).json({ detail: "Not found" });
  if (d.status !== "success") {
    await db.run("UPDATE deposits SET status = 'success', updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?", d.id);
    await addTransaction(d.user_id, "deposit", d.amount, "Deposit", { reference: d.reference });
  }
  await logActivity(req.user, "deposit.approved", "deposit", d.id, `Deposit ${d.reference} → approved`);
  res.json({ message: "Approved" });
});

router.post("/admin/deposits/:id/refresh-status", async (req, res) => {
  const d = await db.get("SELECT * FROM deposits WHERE id = ?", req.params.id);
  if (!d) return res.status(404).json({ detail: "Not found" });
  const supported = ["juntpay", "paystack", "duplo", "nomba"];
  if (!supported.includes(d.method)) return res.json({ _refresh: "no_provider" });
  if (d.status !== "pending") return res.json({ _refresh: "no_op" });
  const result = await polling.refreshDepositStatus(d.id);
  res.json(result);
});

router.get("/admin/withdrawals", async (req, res) => {
  const limit = Number(req.query.limit || 50);
  const rows = await db.all(`SELECT w.*, u.name as user_name, u.phone as user_phone FROM withdrawals w JOIN users u ON u.id = w.user_id ORDER BY w.created_at DESC LIMIT ?`, limit);
  const feePercent = Number(await getSetting("withdrawal_fee_percent", "15"));
  res.json(rows.map(w => {
    const gw = w.gateway || w.method;
    const isNomba = gw === "nomba";
    const isPaystack = gw === "paystack";
    return {
      ...w,
      fee_amount: w.fee, fee_percent: feePercent,
      bank_code: w.bank_code || null, admin_note: null,
      insufficient_float: !!w.failure_reason && isInsufficientBalanceError(w.failure_reason),
      nomba_transaction_id: isNomba ? (w.gateway_reference || null) : null,
      paystack_transfer_code: isPaystack ? (w.gateway_reference || null) : null,
      nomba_transfer_ref: isNomba ? w.reference : null,
      paystack_transfer_ref: isPaystack ? w.reference : null,
    };
  }));
});

router.post("/admin/withdrawals/poll-pending", async (req, res) => {
  const result = await polling.pollWithdrawals();
  res.json(result);
});

router.post("/admin/withdrawals/backfill-all-stuck", async (req, res) => {
  const rows = await db.all("SELECT * FROM withdrawals WHERE status IN ('pending','processing') AND (gateway_reference IS NULL OR gateway_reference = '') AND (gateway = 'nomba' OR method = 'nomba')");
  const cfg = nomba.getConfig(await getAllSettings());
  let matched = 0, marked_paid = 0, no_match = 0;
  for (const w of rows) {
    const v = await nomba.verifyTransfer(w.reference, cfg);
    if (v.error || !v.data) { no_match++; continue; }
    matched++;
    if (String(v.data.status || "").toUpperCase() === "SUCCESS") {
      await db.run("UPDATE withdrawals SET status = 'success', processed_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'), updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?", w.id);
      marked_paid++;
    }
  }
  res.json({ scanned: rows.length, matched, marked_paid, no_match });
});

router.post("/admin/withdrawals/retry-pending-nomba", async (req, res) => {
  const rows = await db.all("SELECT * FROM withdrawals WHERE status IN ('pending','processing') AND (gateway_reference IS NULL OR gateway_reference = '') AND (gateway = 'nomba' OR method = 'nomba')");
  const settings = await getAllSettings();
  let paid = 0, processing = 0, failed = 0, skipped = 0;
  for (const w of rows) {
    if (!w.account_number || !w.bank_code) { skipped++; continue; }
    const outcome = await executePayout(w, { ...settings, payout_gateway: "nomba" });
    if (!outcome.ok) { await recordGatewayPayoutFailure(w, outcome.error, "nomba"); failed++; continue; }
    if (outcome.status === "success") {
      await db.run("UPDATE withdrawals SET status = 'success', processed_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'), updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?", w.id);
      paid++;
    } else {
      await db.run("UPDATE withdrawals SET status = 'processing', updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?", w.id);
      processing++;
    }
  }
  res.json({ scanned: rows.length, paid, processing, failed, skipped });
});

router.get("/admin/withdrawals/:id", async (req, res) => {
  const w = await db.get("SELECT * FROM withdrawals WHERE id = ?", req.params.id);
  if (!w) return res.status(404).json({ detail: "Not found" });
  res.json(w);
});

router.post("/admin/withdrawals/:id", async (req, res) => {
  const w = await db.get("SELECT * FROM withdrawals WHERE id = ?", req.params.id);
  if (!w) return res.status(404).json({ detail: "Not found" });
  const { status, failure_reason } = req.body || {};
  const settings = await getAllSettings();
  let newStatus = status || w.status;

  if (newStatus === "success" || newStatus === "paid") {
    const outcome = await executePayout(w, settings);
    if (!outcome.ok) {
      await recordGatewayPayoutFailure(w, outcome.error, settings.payout_gateway || "nomba");
      return res.status(502).json({ detail: outcome.error || "Payout failed" });
    }
    newStatus = outcome.status === "success" ? "success" : "processing";
  }

  await db.run("UPDATE withdrawals SET status = ?, failure_reason = ?, updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'), processed_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?", newStatus, failure_reason || null, w.id);
  if (newStatus === "rejected" && w.status !== "rejected") {
    await addTransaction(w.user_id, "refund", w.amount, `Withdrawal rejected: ${failure_reason || ""}`, { withdrawal_id: w.id });
  }
  await logActivity(req.user, newStatus === "rejected" ? "withdrawal.rejected" : "withdrawal.approved", "withdrawal", w.id, `Withdrawal ${w.reference} → ${newStatus}`);
  res.json({ message: "Updated", status: newStatus });
});

// Approve a withdrawal and push the payout out via the configured gateway.
router.post("/admin/withdrawals/:id/approve", async (req, res) => {
  const w = await db.get("SELECT * FROM withdrawals WHERE id = ?", req.params.id);
  if (!w) return res.status(404).json({ detail: "Not found" });
  if (w.status === "success" || w.status === "paid") return res.json({ message: "Already paid", status: w.status });

  const settings = await getAllSettings();
  const outcome = await executePayout(w, settings);
  if (!outcome.ok) {
    await recordGatewayPayoutFailure(w, outcome.error, settings.payout_gateway || "nomba");
    return res.status(502).json({ detail: outcome.error || "Payout failed" });
  }
  const newStatus = outcome.status === "success" ? "success" : "processing";
  await db.run("UPDATE withdrawals SET status = ?, updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'), processed_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?", newStatus, w.id);
  await logActivity(req.user, "withdrawal.approved", "withdrawal", w.id, `Withdrawal ${w.reference} → ${newStatus}`);
  res.json({ message: "Approved", status: newStatus, reference: outcome.reference });
});

router.post("/admin/withdrawals/:id/reject", async (req, res) => {
  const w = await db.get("SELECT * FROM withdrawals WHERE id = ?", req.params.id);
  if (!w) return res.status(404).json({ detail: "Not found" });
  const { note, failure_reason } = req.body || {};
  await db.run("UPDATE withdrawals SET status = 'rejected', failure_reason = ?, updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'), processed_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?", failure_reason || note || null, w.id);
  if (w.status !== "rejected") {
    await addTransaction(w.user_id, "refund", w.amount, `Withdrawal rejected: ${failure_reason || note || ""}`, { withdrawal_id: w.id });
  }
  await logActivity(req.user, "withdrawal.rejected", "withdrawal", w.id, `Withdrawal ${w.reference} → rejected`);
  res.json({ message: "Rejected" });
});

router.post("/admin/withdrawals/:id/refresh-status", async (req, res) => {
  const w = await db.get("SELECT * FROM withdrawals WHERE id = ?", req.params.id);
  if (!w) return res.status(404).json({ detail: "Not found" });
  const supported = ["juntpay", "paystack", "duplo", "nomba"];
  if (!supported.includes(w.gateway || w.method)) return res.json({ _refresh: "no_provider" });
  const result = await polling.refreshWithdrawalStatus(w.id);
  res.json(result);
});

router.post("/admin/withdrawals/:id/resolve-from-nomba", async (req, res) => {
  const w = await db.get("SELECT * FROM withdrawals WHERE id = ?", req.params.id);
  if (!w) return res.status(404).json({ detail: "Not found" });
  const { nomba_transaction_id } = req.body || {};
  if (!nomba_transaction_id || !String(nomba_transaction_id).trim()) {
    return res.status(400).json({ detail: "Nomba transaction ID is required" });
  }
  const tid = String(nomba_transaction_id).trim();
  await db.run("UPDATE withdrawals SET gateway = 'nomba', gateway_reference = ?, updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?", tid, w.id);

  const cfg = nomba.getConfig(await getAllSettings());
  const v = await nomba.verifyTransfer(w.reference, cfg);
  if (!v.error && v.data && String(v.data.status || "").toUpperCase() === "SUCCESS") {
    await db.run("UPDATE withdrawals SET status = 'success', processed_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'), updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?", w.id);
    await logActivity(req.user, "withdrawal.resolved_nomba", "withdrawal", w.id, `Resolved Nomba ID ${tid} → paid`);
    return res.json({ _refresh: "marked_paid", status: "success" });
  }
  await logActivity(req.user, "withdrawal.resolved_nomba", "withdrawal", w.id, `Recorded Nomba ID ${tid}`);
  res.json({ _refresh: "polled", status: w.status });
});

router.post("/admin/withdrawals/:id/backfill-nomba-id", async (req, res) => {
  const w = await db.get("SELECT * FROM withdrawals WHERE id = ?", req.params.id);
  if (!w) return res.status(404).json({ detail: "Not found" });
  if (w.gateway_reference) return res.json({ status: "skip", value: w.gateway_reference });

  const cfg = nomba.getConfig(await getAllSettings());
  const v = await nomba.verifyTransfer(w.reference, cfg);
  if (v.error || !v.data) return res.json({ status: "no_match" });
  const s = String(v.data.status || "").toUpperCase();
  if (s === "SUCCESS") {
    await db.run("UPDATE withdrawals SET status = 'success', processed_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'), updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?", w.id);
    return res.json({ status: "ok", refresh_result: "marked_paid", withdrawal_status: "success" });
  }
  return res.json({ status: "ok", refresh_result: "still_pending", withdrawal_status: w.status });
});

router.post("/admin/withdrawals/:id/pay-nomba", async (req, res) => {
  const w = await db.get("SELECT * FROM withdrawals WHERE id = ?", req.params.id);
  if (!w) return res.status(404).json({ detail: "Not found" });
  const { bank_code } = req.body || {};
  if (bank_code) await db.run("UPDATE withdrawals SET bank_code = ? WHERE id = ?", String(bank_code), w.id);
  const outcome = await executePayout(w, { ...await getAllSettings(), payout_gateway: "nomba" });
  if (!outcome.ok) { await recordGatewayPayoutFailure(w, outcome.error, "nomba"); return res.status(502).json({ detail: outcome.error || "Payout failed" }); }
  const newStatus = outcome.status === "success" ? "success" : "processing";
  await db.run("UPDATE withdrawals SET status = ?, processed_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'), updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?", newStatus, w.id);
  await logActivity(req.user, "withdrawal.paid_nomba", "withdrawal", w.id, `Paid via Nomba (${newStatus})`);
  res.json({ mode: newStatus });
});

router.post("/admin/withdrawals/:id/pay-paystack", async (req, res) => {
  const w = await db.get("SELECT * FROM withdrawals WHERE id = ?", req.params.id);
  if (!w) return res.status(404).json({ detail: "Not found" });
  const { bank_code } = req.body || {};
  if (bank_code) await db.run("UPDATE withdrawals SET bank_code = ? WHERE id = ?", String(bank_code), w.id);
  const outcome = await executePayout(w, { ...await getAllSettings(), payout_gateway: "paystack" });
  if (!outcome.ok) { await recordGatewayPayoutFailure(w, outcome.error, "paystack"); return res.status(502).json({ detail: outcome.error || "Payout failed" }); }
  const newStatus = outcome.status === "success" ? "success" : "processing";
  await db.run("UPDATE withdrawals SET status = ?, processed_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'), updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?", newStatus, w.id);
  await logActivity(req.user, "withdrawal.paid_paystack", "withdrawal", w.id, `Paid via Paystack (${newStatus})`);
  res.json({ mode: newStatus });
});

router.post("/admin/withdrawals/:id/pay-juntpay", async (req, res) => {
  const w = await db.get("SELECT * FROM withdrawals WHERE id = ?", req.params.id);
  if (!w) return res.status(404).json({ detail: "Not found" });
  const { bank_code } = req.body || {};
  if (bank_code) await db.run("UPDATE withdrawals SET bank_code = ? WHERE id = ?", String(bank_code), w.id);
  const outcome = await executePayout(w, { ...await getAllSettings(), payout_gateway: "juntpay" });
  if (!outcome.ok) { await recordGatewayPayoutFailure(w, outcome.error, "juntpay"); return res.status(502).json({ detail: outcome.error || "Payout failed" }); }
  const newStatus = outcome.status === "success" ? "success" : "processing";
  await db.run("UPDATE withdrawals SET status = ?, processed_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'), updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?", newStatus, w.id);
  await logActivity(req.user, "withdrawal.paid_juntpay", "withdrawal", w.id, `Paid via JuntPay (${newStatus})`);
  res.json({ mode: newStatus });
});

router.post("/admin/withdrawals/:id/pay-duplo", async (req, res) => {
  const w = await db.get("SELECT * FROM withdrawals WHERE id = ?", req.params.id);
  if (!w) return res.status(404).json({ detail: "Not found" });
  const { bank_code } = req.body || {};
  if (bank_code) await db.run("UPDATE withdrawals SET bank_code = ? WHERE id = ?", String(bank_code), w.id);
  const outcome = await executePayout(w, { ...await getAllSettings(), payout_gateway: "duplo" });
  if (!outcome.ok) { await recordGatewayPayoutFailure(w, outcome.error, "duplo"); return res.status(502).json({ detail: outcome.error || "Payout failed" }); }
  const newStatus = outcome.status === "success" ? "success" : "processing";
  await db.run("UPDATE withdrawals SET status = ?, processed_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'), updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?", newStatus, w.id);
  await logActivity(req.user, "withdrawal.paid_duplo", "withdrawal", w.id, `Paid via Duplo (${newStatus})`);
  res.json({ mode: newStatus });
});

router.post("/admin/withdrawals/:id/pay-kora", async (req, res) => {
  const w = await db.get("SELECT * FROM withdrawals WHERE id = ?", req.params.id);
  if (!w) return res.status(404).json({ detail: "Not found" });
  const { bank_code } = req.body || {};
  if (bank_code) await db.run("UPDATE withdrawals SET bank_code = ? WHERE id = ?", String(bank_code), w.id);
  const outcome = await executePayout(w, { ...await getAllSettings(), payout_gateway: "kora" });
  if (!outcome.ok) { await recordGatewayPayoutFailure(w, outcome.error, "kora"); return res.status(502).json({ detail: outcome.error || "Payout failed" }); }
  const newStatus = outcome.status === "success" ? "success" : "processing";
  await db.run("UPDATE withdrawals SET status = ?, processed_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'), updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?", newStatus, w.id);
  await logActivity(req.user, "withdrawal.paid_kora", "withdrawal", w.id, `Paid via Kora (${newStatus})`);
  res.json({ mode: newStatus });
});

router.post("/admin/withdrawals/:id/pay-nekpay", async (req, res) => {
  const w = await db.get("SELECT * FROM withdrawals WHERE id = ?", req.params.id);
  if (!w) return res.status(404).json({ detail: "Not found" });
  const { bank_code } = req.body || {};
  if (bank_code) await db.run("UPDATE withdrawals SET bank_code = ? WHERE id = ?", String(bank_code), w.id);
  const outcome = await executePayout(w, { ...await getAllSettings(), payout_gateway: "nekpay" });
  if (!outcome.ok) { await recordGatewayPayoutFailure(w, outcome.error, "nekpay"); return res.status(502).json({ detail: outcome.error || "Payout failed" }); }
  const newStatus = outcome.status === "success" ? "success" : "processing";
  await db.run("UPDATE withdrawals SET status = ?, processed_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'), updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?", newStatus, w.id);
  await logActivity(req.user, "withdrawal.paid_nekpay", "withdrawal", w.id, `Paid via Nekpay (${newStatus})`);
  res.json({ mode: newStatus });
});

router.post("/admin/withdrawals/:id/pay-fossapay", async (req, res) => {
  const w = await db.get("SELECT * FROM withdrawals WHERE id = ?", req.params.id);
  if (!w) return res.status(404).json({ detail: "Not found" });
  const { bank_code } = req.body || {};
  if (bank_code) await db.run("UPDATE withdrawals SET bank_code = ? WHERE id = ?", String(bank_code), w.id);
  const outcome = await executePayout(w, { ...await getAllSettings(), payout_gateway: "fossapay" });
  if (!outcome.ok) { await recordGatewayPayoutFailure(w, outcome.error, "fossapay"); return res.status(502).json({ detail: outcome.error || "Payout failed" }); }
  const newStatus = outcome.status === "success" ? "success" : "processing";
  await db.run("UPDATE withdrawals SET status = ?, processed_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'), updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?", newStatus, w.id);
  await logActivity(req.user, "withdrawal.paid_fossapay", "withdrawal", w.id, `Paid via FossaPay (${newStatus})`);
  res.json({ mode: newStatus });
});

router.get("/admin/investments", async (req, res) => {
  const limit = Number(req.query.limit || 50);
  const rows = await db.all(`SELECT i.*, u.name as user_name, u.phone as user_phone FROM investments i JOIN users u ON u.id = i.user_id ORDER BY i.started_at DESC LIMIT ?`, limit);
  res.json(rows);
});

router.get("/admin/investments/:id", async (req, res) => {
  const i = await db.get("SELECT * FROM investments WHERE id = ?", req.params.id);
  if (!i) return res.status(404).json({ detail: "Not found" });
  res.json(i);
});

router.post("/admin/investments/:id/pause", async (req, res) => {
  const i = await db.get("SELECT * FROM investments WHERE id = ?", req.params.id);
  if (!i) return res.status(404).json({ detail: "Not found" });
  if (i.status !== "active") return res.status(400).json({ detail: "Only active investments can be paused" });
  const { reason, auto_resume_at } = req.body || {};
  await db.run("UPDATE investments SET status = 'paused', paused_at = ?, pause_reason = ?, auto_resume_at = ? WHERE id = ?", new Date().toISOString(), String(reason || "Paused from admin panel"), auto_resume_at || null, i.id);
  await logActivity(req.user, "investment.paused", "investment", i.id, `Paused investment ${i.id}`);
  res.json(await db.get("SELECT * FROM investments WHERE id = ?", i.id));
});

router.post("/admin/investments/:id/resume", async (req, res) => {
  const i = await db.get("SELECT * FROM investments WHERE id = ?", req.params.id);
  if (!i) return res.status(404).json({ detail: "Not found" });
  if (i.status !== "paused") return res.status(400).json({ detail: "Only paused investments can be resumed" });
  await db.run("UPDATE investments SET status = 'active', paused_at = NULL, pause_reason = NULL, auto_resume_at = NULL WHERE id = ?", i.id);
  await logActivity(req.user, "investment.resumed", "investment", i.id, `Resumed investment ${i.id}`);
  res.json(await db.get("SELECT * FROM investments WHERE id = ?", i.id));
});

router.post("/admin/investments/:id/cancel", async (req, res) => {
  const i = await db.get("SELECT * FROM investments WHERE id = ?", req.params.id);
  if (!i) return res.status(404).json({ detail: "Not found" });
  if (!["active", "paused"].includes(i.status)) return res.status(400).json({ detail: "Only active or paused investments can be cancelled" });
  const { reason, refund_capital } = req.body || {};
  await db.run("UPDATE investments SET status = 'cancelled', cancelled_at = ?, cancel_reason = ? WHERE id = ?", new Date().toISOString(), String(reason || ""), i.id);
  let refundAmount = 0;
  if (refund_capital) {
    refundAmount = i.amount;
    await addTransaction(i.user_id, "investment_cancel_refund", refundAmount, `Refund — cancelled investment ${i.product_name}`, { investment_id: i.id, admin_id: req.user.id });
  }
  await logActivity(req.user, "investment.cancelled", "investment", i.id, `Cancelled investment ${i.id}${refund_capital ? " (capital refunded)" : ""}`);
  res.json({ message: "Investment cancelled", refund_amount: refundAmount });
});

router.patch("/admin/investments/:id/auto-resume", async (req, res) => {
  const i = await db.get("SELECT * FROM investments WHERE id = ?", req.params.id);
  if (!i) return res.status(404).json({ detail: "Not found" });
  const { auto_resume_at } = req.body || {};
  await db.run("UPDATE investments SET auto_resume_at = ? WHERE id = ?", auto_resume_at || null, i.id);
  res.json(await db.get("SELECT * FROM investments WHERE id = ?", i.id));
});

router.post("/admin/investments/bulk-pause", async (req, res) => {
  const { investment_ids, reason, auto_resume_at } = req.body || {};
  const ids = Array.isArray(investment_ids) ? investment_ids : [];
  const counts = { paused: 0, not_active: 0, not_paused: 0, not_found: 0 };
  for (const id of ids) {
    const i = await db.get("SELECT * FROM investments WHERE id = ?", id);
    if (!i) { counts.not_found++; continue; }
    if (i.status === "paused") { counts.not_paused++; continue; }
    if (i.status !== "active") { counts.not_active++; continue; }
    await db.run("UPDATE investments SET status = 'paused', paused_at = ?, pause_reason = ?, auto_resume_at = ? WHERE id = ?", new Date().toISOString(), String(reason || "Bulk pause from admin panel"), auto_resume_at || null, id);
    counts.paused++;
  }
  await logActivity(req.user, "investment.bulk_paused", "investment", null, `Bulk paused ${counts.paused} investments`);
  res.json({ counts, auto_resume_at: auto_resume_at || null });
});

router.post("/admin/investments/bulk-resume", async (req, res) => {
  const { investment_ids, reason } = req.body || {};
  const ids = Array.isArray(investment_ids) ? investment_ids : [];
  const counts = { resumed: 0, not_active: 0, not_paused: 0, not_found: 0 };
  for (const id of ids) {
    const i = await db.get("SELECT * FROM investments WHERE id = ?", id);
    if (!i) { counts.not_found++; continue; }
    if (i.status !== "paused") { counts.not_active++; continue; }
    await db.run("UPDATE investments SET status = 'active', paused_at = NULL, pause_reason = NULL, auto_resume_at = NULL WHERE id = ?", id);
    counts.resumed++;
  }
  await logActivity(req.user, "investment.bulk_resumed", "investment", null, `Bulk resumed ${counts.resumed} investments`);
  res.json({ counts });
});

router.get("/admin/products", async (req, res) => {
  res.json(await db.all("SELECT * FROM products ORDER BY price"));
});

router.post("/admin/products", async (req, res) => {
  const { name, description, image_url, price, daily_profit_percent, duration_days, min_amount, max_amount, is_active } = req.body || {};
  const id = "prod_" + uuidv4().replace(/-/g, "").slice(0, 10);
  await db.run("INSERT INTO products (id, name, description, image_url, price, daily_profit_percent, daily_profit_amount, duration_days, min_amount, max_amount, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", id, name, description || "", image_url || "", Number(price), Number(daily_profit_percent), Number(price) * Number(daily_profit_percent) / 100, Number(duration_days), Number(min_amount || 0), Number(max_amount || 0), is_active === undefined || is_active === null ? 1 : (is_active ? 1 : 0));
  await logActivity(req.user, "product.created", "product", id, `Created product ${name}`);
  res.status(201).json(await db.get("SELECT * FROM products WHERE id = ?", id));
});

// Update a product (edit or toggle active). Supports POST and PUT.
async function updateProduct(req, res) {
  const p = await db.get("SELECT * FROM products WHERE id = ?", req.params.id);
  if (!p) return res.status(404).json({ detail: "Not found" });
  const { name, description, image_url, price, daily_profit_percent, duration_days, min_amount, max_amount, is_active } = req.body || {};
  await db.run("UPDATE products SET name = ?, description = ?, image_url = ?, price = ?, daily_profit_percent = ?, daily_profit_amount = ?, duration_days = ?, min_amount = ?, max_amount = ?, is_active = ? WHERE id = ?", name ?? p.name, description ?? p.description, image_url ?? p.image_url,
    Number(price ?? p.price), Number(daily_profit_percent ?? p.daily_profit_percent),
    Number(price ?? p.price) * Number(daily_profit_percent ?? p.daily_profit_percent) / 100,
    Number(duration_days ?? p.duration_days), Number(min_amount ?? p.min_amount), Number(max_amount ?? p.max_amount),
    is_active === undefined ? p.is_active : (is_active ? 1 : 0), p.id);
  res.json(await db.get("SELECT * FROM products WHERE id = ?", p.id));
}

router.post("/admin/products/:id", updateProduct);
router.put("/admin/products/:id", updateProduct);

router.delete("/admin/products/:id", async (req, res) => {
  const p = await db.get("SELECT * FROM products WHERE id = ?", req.params.id);
  if (!p) return res.status(404).json({ detail: "Not found" });
  const invCount = (await db.get("SELECT COUNT(*) c FROM investments WHERE product_id = ?", req.params.id)).c;
  if (invCount > 0) {
    return res.status(400).json({ detail: `Cannot delete — ${invCount} investment(s) reference this product` });
  }
  await db.run("DELETE FROM products WHERE id = ?", req.params.id);
  await logActivity(req.user, "product.deleted", "product", req.params.id, `Deleted product ${p.name}`);
  res.json({ message: "Deleted" });
});

router.get("/admin/referrals", async (req, res) => {
  const rows = await db.all(`SELECT r.*, ur.name as referrer_name, ur.phone as referrer_phone, ue.name as referred_name, ue.phone as referred_phone
     FROM referrals r JOIN users ur ON ur.id = r.referrer_id JOIN users ue ON ue.id = r.referred_id ORDER BY r.created_at DESC`);
  res.json(rows);
});

router.post("/admin/referrals/pay-missing-bonuses", async (req, res) => {
  res.json({ paid: 0 });
});

router.get("/admin/coupons", async (req, res) => {
  const rows = await db.all("SELECT * FROM coupons ORDER BY created_at DESC");
  res.json(rows.map(c => ({ ...c, is_active: !!c.is_active, redemption_count: c.used_count, total_credited: c.used_count * c.amount })));
});

function couponFields(b) {
  const src = b || {};
  return {
    code: String(src.code || "").trim().toUpperCase(),
    amount: Number(src.amount) || 0,
    max_uses: Number(src.max_uses) || 0,
    is_active: src.is_active === undefined || src.is_active === null ? 1 : (src.is_active ? 1 : 0),
    expires_at: src.expires_at || null,
    note: src.note || null,
  };
}

router.post("/admin/coupons", async (req, res) => {
  const c = couponFields(req.body);
  if (!c.code || c.code.length < 3) return res.status(400).json({ detail: "Code must be at least 3 characters" });
  if (c.amount <= 0) return res.status(400).json({ detail: "Amount must be greater than zero" });
  if (await db.get("SELECT 1 FROM coupons WHERE code = ?", c.code)) return res.status(409).json({ detail: "Code already exists" });
  const id = "coup_" + uuidv4().replace(/-/g, "").slice(0, 8);
  await db.run("INSERT INTO coupons (id, code, amount, max_uses, is_active, expires_at, note) VALUES (?, ?, ?, ?, ?, ?, ?)", id, c.code, c.amount, c.max_uses, c.is_active, c.expires_at, c.note);
  await logActivity(req.user, "coupon.created", "coupon", id, `Created coupon ${c.code}`);
  res.status(201).json(await db.get("SELECT * FROM coupons WHERE id = ?", id));
});

router.put("/admin/coupons/:id", async (req, res) => {
  const existing = await db.get("SELECT * FROM coupons WHERE id = ?", req.params.id);
  if (!existing) return res.status(404).json({ detail: "Not found" });
  const c = couponFields({ ...existing, ...(req.body || {}) });
  if (!c.code || c.code.length < 3) return res.status(400).json({ detail: "Code must be at least 3 characters" });
  if (c.amount <= 0) return res.status(400).json({ detail: "Amount must be greater than zero" });
  if (await db.get("SELECT 1 FROM coupons WHERE code = ? AND id != ?", c.code, existing.id)) return res.status(409).json({ detail: "Code already exists" });
  await db.run("UPDATE coupons SET code = ?, amount = ?, max_uses = ?, is_active = ?, expires_at = ?, note = ? WHERE id = ?", c.code, c.amount, c.max_uses, c.is_active, c.expires_at, c.note, existing.id);
  await logActivity(req.user, "coupon.updated", "coupon", existing.id, `Updated coupon ${c.code}`);
  res.json(await db.get("SELECT * FROM coupons WHERE id = ?", existing.id));
});

router.delete("/admin/coupons/:id", async (req, res) => {
  const existing = await db.get("SELECT * FROM coupons WHERE id = ?", req.params.id);
  if (!existing) return res.status(404).json({ detail: "Not found" });
  await db.run("DELETE FROM coupons WHERE id = ?", existing.id);
  await logActivity(req.user, "coupon.deleted", "coupon", existing.id, `Deleted coupon ${existing.code}`);
  res.json({ message: "Deleted" });
});

function announcementFields(b) {
  const src = b || {};
  return {
    title: src.title ?? "",
    message: src.message ?? "",
    style: src.style || "info",
    cta_type: src.cta_type || "none",
    cta_label: src.cta_label || null,
    cta_url: src.cta_url || null,
    starts_at: src.starts_at || null,
    ends_at: src.ends_at || null,
    hide_from_newcomers_hours: Number(src.hide_from_newcomers_hours) || 0,
    reshow_interval_minutes: Number(src.reshow_interval_minutes) || 0,
    priority: Number(src.priority) || 0,
    is_active: src.is_active === undefined || src.is_active === null ? 1 : (src.is_active ? 1 : 0),
  };
}

router.get("/admin/announcements", async (req, res) => {
  res.json(await db.all("SELECT * FROM announcements ORDER BY created_at DESC"));
});

router.post("/admin/announcements", async (req, res) => {
  const { title, message } = req.body || {};
  if (!title || !message) return res.status(400).json({ detail: "Title and message are required" });
  const a = announcementFields(req.body);
  const id = "ann_" + uuidv4().replace(/-/g, "").slice(0, 16);
  await db.run(`INSERT INTO announcements (id, title, message, style, cta_type, cta_label, cta_url, starts_at, ends_at,
      hide_from_newcomers_hours, reshow_interval_minutes, priority, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, id, a.title, a.message, a.style, a.cta_type, a.cta_label, a.cta_url, a.starts_at, a.ends_at,
    a.hide_from_newcomers_hours, a.reshow_interval_minutes, a.priority, a.is_active);
  await logActivity(req.user, "announcement.created", "announcement", id, `Created announcement ${a.title}`);
  res.status(201).json(await db.get("SELECT * FROM announcements WHERE id = ?", id));
});

router.put("/admin/announcements/:id", async (req, res) => {
  const existing = await db.get("SELECT * FROM announcements WHERE id = ?", req.params.id);
  if (!existing) return res.status(404).json({ detail: "Not found" });
  const a = announcementFields({ ...existing, ...(req.body || {}) });
  await db.run(`UPDATE announcements SET title = ?, message = ?, style = ?, cta_type = ?, cta_label = ?, cta_url = ?,
      starts_at = ?, ends_at = ?, hide_from_newcomers_hours = ?, reshow_interval_minutes = ?, priority = ?,
      is_active = ?, updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?`, a.title, a.message, a.style, a.cta_type, a.cta_label, a.cta_url, a.starts_at, a.ends_at,
    a.hide_from_newcomers_hours, a.reshow_interval_minutes, a.priority, a.is_active, existing.id);
  await logActivity(req.user, "announcement.updated", "announcement", existing.id, `Updated announcement ${a.title}`);
  res.json(await db.get("SELECT * FROM announcements WHERE id = ?", existing.id));
});

router.delete("/admin/announcements/:id", async (req, res) => {
  const existing = await db.get("SELECT * FROM announcements WHERE id = ?", req.params.id);
  if (!existing) return res.status(404).json({ detail: "Not found" });
  await db.run("DELETE FROM announcements WHERE id = ?", existing.id);
  await logActivity(req.user, "announcement.deleted", "announcement", existing.id, `Deleted announcement ${existing.title}`);
  res.json({ message: "Deleted" });
});

router.get("/admin/settings", async (req, res) => {
  const s = await getAllSettings();
  // Surface JuntPay credentials configured in .env so the admin can see them.
  s.juntpay_app_id = s.juntpay_app_id || process.env.JUNTPAY_APP_ID || "";
  s.juntpay_merchant_id = s.juntpay_merchant_id || process.env.JUNTPAY_MERCHANT_ID || "";
  s.juntpay_secret_key = s.juntpay_secret_key || process.env.JUNTPAY_SECRET_KEY || "";
  s.juntpay_deposit_way_code = s.juntpay_deposit_way_code || process.env.JUNTPAY_DEPOSIT_WAY_CODE || "";
  s.juntpay_payout_way_code = s.juntpay_payout_way_code || process.env.JUNTPAY_PAYOUT_WAY_CODE || "BANK_ACCOUNT";
  s.juntpay_notify_url = s.juntpay_notify_url || process.env.JUNTPAY_NOTIFY_URL || "";
  // Surface Paystack + Duplo credentials configured in .env.
  s.paystack_secret_key = s.paystack_secret_key || process.env.PAYSTACK_SECRET_KEY || "";
  s.paystack_public_key = s.paystack_public_key || process.env.PAYSTACK_PUBLIC_KEY || "";
  s.duplo_api_key = s.duplo_api_key || process.env.DUPLO_API_KEY || "";
  s.nomba_client_id = s.nomba_client_id || process.env.NOMBA_CLIENT_ID || "";
  s.nomba_client_secret = s.nomba_client_secret || process.env.NOMBA_CLIENT_SECRET || "";
  s.nomba_account_id = s.nomba_account_id || process.env.NOMBA_ACCOUNT_ID || "";
  s.kora_secret_key = s.kora_secret_key || process.env.KORA_SECRET_KEY || "";
  s.kora_public_key = s.kora_public_key || process.env.KORA_PUBLIC_KEY || "";
  s.kora_encryption_key = s.kora_encryption_key || process.env.KORA_ENCRYPTION_KEY || "";
  s.nekpay_mcht_id = s.nekpay_mcht_id || process.env.NEKPAY_MCHT_ID || "";
  s.nekpay_payment_key = s.nekpay_payment_key || process.env.NEKPAY_PAYMENT_KEY || "";
  s.nekpay_secret_key = s.nekpay_secret_key || process.env.NEKPAY_SECRET_KEY || "";
  s.nekpay_channel_code = s.nekpay_channel_code || process.env.NEKPAY_CHANNEL_CODE || "";
  s.nekpay_notify_url = s.nekpay_notify_url || process.env.NEKPAY_NOTIFY_URL || "";
  s.glopay_mch_id = s.glopay_mch_id || process.env.GLOPAY_MCH_ID || "";
  s.glopay_key = s.glopay_key || process.env.GLOPAY_KEY || "";
  s.glopay_collection_key = s.glopay_collection_key || process.env.GLOPAY_COLLECTION_KEY || "";
  s.glopay_payment_key = s.glopay_payment_key || process.env.GLOPAY_PAYMENT_KEY || "";
  s.glopay_collection_code = s.glopay_collection_code || process.env.GLOPAY_COLLECTION_CODE || "";
  s.glopay_payment_code = s.glopay_payment_code || process.env.GLOPAY_PAYMENT_CODE || "";
  s.glopay_base_url = s.glopay_base_url || process.env.GLOPAY_BASE_URL || "";
  s.fossapay_api_key = s.fossapay_api_key || process.env.FOSSAPAY_API_KEY || "";
  s.fossapay_webhook_secret = s.fossapay_webhook_secret || process.env.FOSSAPAY_WEBHOOK_SECRET || process.env.FOSSAPAY_WEHBOOK_SECRET || "";
  s.lumenhub_proxy_url = s.lumenhub_proxy_url || process.env.LUMENHUB_PROXY_URL || "";
  s.lumenhub_base_url = s.lumenhub_base_url || process.env.LUMENHUB_BASE_URL || "";
  res.json({ id: "global", ...s });
});

// Persist many settings keys in a single round-trip (multi-row upsert) so
// saving settings doesn't fire one query per key.
async function saveSettings(updates) {
  const entries = Object.entries(updates || {}).filter(([k]) => k !== "id");
  if (entries.length === 0) return;
  const rows = [];
  const params = [];
  for (const [k, v] of entries) {
    params.push(k, v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));
    rows.push("(?, ?)");
  }
  await db.run(
    `INSERT INTO settings (key, value) VALUES ${rows.join(", ")} ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
    ...params
  );
}

router.put("/admin/settings", async (req, res) => {
  await saveSettings(req.body);
  await logActivity(req.user, "settings.updated", "settings", null, "Updated settings");
  res.json({ id: "global", ...await getAllSettings() });
});

router.post("/admin/settings", async (req, res) => {
  await saveSettings(req.body);
  await logActivity(req.user, "settings.updated", "settings", null, "Updated settings");
  res.json({ id: "global", ...await getAllSettings() });
});

router.get("/admin/activity", async (req, res) => {
  const limit = Number(req.query.limit || 50);
  const rows = await db.all("SELECT * FROM activity_log ORDER BY created_at DESC LIMIT ?", limit);
  const actions = (await db.all("SELECT DISTINCT action FROM activity_log")).map(a => a.action);
  res.json({ items: rows.map(r => ({ ...r, meta: JSON.parse(r.meta || "{}") })), count: rows.length, actions });
});

router.get("/admin/password-resets", async (req, res) => {
  const rows = await db.all(`SELECT p.id, p.user_id, u.phone, u.name as user_name, p.created_at, p.reason, p.status,
            p.admin_note, p.acted_at, p.acted_by_phone, p.resolved_at
     FROM password_resets p JOIN users u ON u.id = p.user_id ORDER BY p.created_at DESC`);
  res.json(rows.map(r => ({ ...r, status: r.status || (r.resolved_at ? "approved" : "pending") })));
});

router.post("/admin/password-resets/:id/approve", async (req, res) => {
  const r = await db.get("SELECT * FROM password_resets WHERE id = ?", req.params.id);
  if (!r) return res.status(404).json({ detail: "Not found" });
  if (r.status !== "pending") return res.status(400).json({ detail: "Request already handled" });
  if (!r.new_password_hash) return res.status(400).json({ detail: "No new password was provided with this request" });
  await db.run("UPDATE users SET password_hash = ? WHERE id = ?", r.new_password_hash, r.user_id);
  await db.run(`UPDATE password_resets SET status = 'approved', resolved_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'),
     acted_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'), acted_by_phone = ?, admin_note = ? WHERE id = ?`, req.user.phone, String(req.body?.note || ""), r.id);
  await logActivity(req.user, "user.password_reset_approved", "user", r.user_id, `Approved password reset request ${r.id}`);
  res.json({ message: "Password reset approved" });
});

router.post("/admin/password-resets/:id/reject", async (req, res) => {
  const r = await db.get("SELECT * FROM password_resets WHERE id = ?", req.params.id);
  if (!r) return res.status(404).json({ detail: "Not found" });
  if (r.status !== "pending") return res.status(400).json({ detail: "Request already handled" });
  await db.run(`UPDATE password_resets SET status = 'rejected', resolved_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'),
     acted_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'), acted_by_phone = ?, admin_note = ? WHERE id = ?`, req.user.phone, String(req.body?.note || ""), r.id);
  await logActivity(req.user, "user.password_reset_rejected", "user", r.user_id, `Rejected password reset request ${r.id}`);
  res.json({ message: "Request rejected" });
});

router.get("/admin/manual-adjustments", async (req, res) => {
  const rows = await db.all(`SELECT t.*, u.name as user_name, u.phone as user_phone FROM transactions t JOIN users u ON u.id = t.user_id
     WHERE t.type IN ('adjustment_credit','adjustment_debit','deposit','withdrawal','refund','bonus')
     ORDER BY t.created_at DESC LIMIT 100`);
  res.json(rows.map(t => ({ ...t, meta: JSON.parse(t.meta || "{}") })));
});

router.post("/admin/manual-adjustments", async (req, res) => {
  const { user_id, type, amount, reason } = req.body || {};
  const u = await db.get("SELECT * FROM users WHERE id = ?", user_id);
  if (!u) return res.status(404).json({ detail: "User not found" });
  const amt = Number(amount);
  const id = "ma_" + uuidv4().replace(/-/g, "").slice(0, 16);
  await db.run("INSERT INTO manual_adjustments (id, admin_id, user_id, type, amount, reason) VALUES (?, ?, ?, ?, ?, ?)", id, req.user.id, user_id, type || "credit", amt, reason || "");
  await addTransaction(user_id, type === "debit" ? "adjustment_debit" : "adjustment_credit", type === "debit" ? -amt : amt, reason || "Manual adjustment", { admin_id: req.user.id });
  await logActivity(req.user, "user.balance_adjusted", "user", user_id, `Adjusted ${u.phone} by ₦${amt} (${type})`);
  res.status(201).json({ message: "Adjusted" });
});

// Reverse a previous transaction: write an inverse transaction that undoes the
// original wallet movement, and flag the original as reversed.
router.post("/admin/transactions/:id/reverse", async (req, res) => {
  const t = await db.get("SELECT * FROM transactions WHERE id = ?", req.params.id);
  if (!t) return res.status(404).json({ detail: "Transaction not found" });
  const reason = String(req.body?.reason || "").trim();
  if (reason.length < 3) return res.status(400).json({ detail: "Please give a brief reason" });
  const meta = { ...(JSON.parse(t.meta || "{}") || {}) };
  if (meta.reversed) return res.status(400).json({ detail: "This transaction has already been reversed" });
  if (meta.reverses) return res.status(400).json({ detail: "A reversal cannot be reversed" });
  const u = await db.get("SELECT * FROM users WHERE id = ?", t.user_id);
  if (!u) return res.status(404).json({ detail: "User not found" });

  const amount = Number(t.amount || 0);
  const revId = "tx_" + uuidv4().replace(/-/g, "").slice(0, 16);
  const revType = amount >= 0 ? "adjustment_debit" : "adjustment_credit";
  const revMeta = { reverses: t.id, reason };
  await db.run(`
    WITH upd AS (
      UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ? RETURNING wallet_balance
    )
    INSERT INTO transactions (id, user_id, type, amount, description, balance_after, meta)
    SELECT ?, ?, ?, ?, ?, wallet_balance, ? FROM upd
  `, -amount, t.user_id, revId, t.user_id, revType, -amount, `Reversal: ${t.description}`, JSON.stringify(revMeta));
  await db.run("UPDATE transactions SET meta = ? WHERE id = ?", JSON.stringify({ ...meta, reversed: true, reversed_by: revId }), t.id);
  await logActivity(req.user, "transaction.reversed", "user", t.user_id, `Reversed ${t.id} (${reason})`);
  const newBalance = (await db.get("SELECT wallet_balance FROM users WHERE id = ?", t.user_id)).wallet_balance;
  res.json({ message: "Reversed", new_balance: newBalance });
});

router.get("/admin/banks", async (req, res) => {
  res.json(await db.all("SELECT DISTINCT bank_name, bank_code FROM users WHERE bank_name IS NOT NULL"));
});

router.post("/admin/change-password", async (req, res) => {
  const { current_password, new_password } = req.body || {};
  if (!(await bcrypt.compare(current_password || "", req.user.password_hash))) {
    return res.status(400).json({ detail: "Current password incorrect" });
  }
  await db.run("UPDATE users SET password_hash = ? WHERE id = ?", await bcrypt.hash(new_password, 10), req.user.id);
  res.json({ message: "Password changed" });
});

router.get("/admin/transactions/:userId", async (req, res) => {
  const rows = await db.all("SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC", req.params.userId);
  res.json(rows.map(t => ({ ...t, meta: JSON.parse(t.meta || "{}") })));
});

router.post("/admin/upload-image", express.raw({ type: "multipart/form-data", limit: "15mb" }), async (req, res) => {
  try {
    const file = parseMultipartFile(req.body, req.headers["content-type"] || "");
    if (!file) return res.status(400).json({ detail: "No file uploaded" });

    const allowed = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico", ".bmp"];
    let ext = path.extname(file.filename || "").toLowerCase();
    if (!allowed.includes(ext)) ext = ".png";

    const name = "img_" + crypto.randomBytes(8).toString("hex") + ext;
    const dir = path.join(__dirname, "..", "uploads");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, name), file.data);

    res.json({ url: "/uploads/" + name });
  } catch (err) {
    res.status(500).json({ detail: "Upload failed" });
  }
});

router.post("/admin/system/clear-database", async (req, res) => {
  const { confirm_token } = req.body || {};
  if (confirm_token !== "CLEAR_ALL_DATA") return res.status(400).json({ detail: "Invalid confirmation token" });
  const deleted = {};
  for (const t of ["deposits", "withdrawals", "investments", "transactions", "referrals", "coupon_redemptions", "daily_claims", "manual_adjustments", "password_resets"]) {
    deleted[t] = (await db.run(`DELETE FROM ${t}`)).changes;
  }
  deleted.users = (await db.run("DELETE FROM users WHERE is_admin = 0")).changes;
  await logActivity(req.user, "system.cleared", "system", null, "Cleared database (NUKE)");
  res.json({ deleted });
});

router.post("/admin/system/clear-user-data", async (req, res) => {
  const { confirm_token } = req.body || {};
  if (confirm_token !== "CLEAR_USER_DATA") return res.status(400).json({ detail: "Invalid confirmation token" });
  const deleted = {};
  for (const t of ["deposits", "withdrawals", "investments", "transactions", "referrals", "coupon_redemptions", "daily_claims", "manual_adjustments", "password_resets"]) {
    deleted[t] = (await db.run(`DELETE FROM ${t}`)).changes;
  }
  const users_zeroed = (await db.run("UPDATE users SET wallet_balance = 0, total_earnings = 0, referral_earnings = 0 WHERE is_admin = 0")).changes;
  await logActivity(req.user, "system.clear_user_data", "system", null, "Cleared all user data");
  res.json({ deleted, users_zeroed });
});

router.post("/admin/system/logout-all-users", async (req, res) => {
  const currentEpoch = Number(await getSetting("session_epoch", "0") || 0);
  const newEpoch = currentEpoch + 1;
  await db.run("INSERT INTO settings (key, value) VALUES ('session_epoch', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value", String(newEpoch));
  const affected = (await db.get("SELECT COUNT(*) c FROM users WHERE is_admin = 0")).c;
  await logActivity(req.user, "system.logout_all", "system", null, `Logged out ${affected} users (epoch ${newEpoch})`);
  res.json({ affected });
});

// Gateway connection health check — a lightweight, non-destructive call per gateway.
async function testGateway(key) {
  const settings = await getAllSettings();
  const tested_at = new Date().toISOString();
  const notConfigured = (message) => ({ ok: false, message, tested_at });
  try {
    if (key === "paystack") {
      const cfg = paystack.getConfig(settings);
      if (!cfg.secretKey) return notConfigured("No secret key configured");
      const r = await paystack.queryBalance(cfg);
      if (r.error) return { ok: false, message: r.error, tested_at };
      return { ok: true, message: "Connected", tested_at, balance: Number(r.data.balance || 0), currency: r.data.currency || "NGN" };
    }
    if (key === "nomba") {
      const cfg = nomba.getConfig(settings);
      if (!cfg.clientId || !cfg.clientSecret || !cfg.accountId) return notConfigured("Nomba credentials incomplete");
      const r = await nomba.queryBalance(cfg);
      if (r.error) return { ok: false, message: r.error, tested_at };
      return { ok: true, message: "Connected", tested_at, balance: Number(r.data.balance || 0), currency: r.data.currency || "NGN" };
    }
    if (key === "duplo") {
      const cfg = duplo.getConfig(settings);
      if (!cfg.apiKey) return notConfigured("No API key configured");
      const r = await duplo.queryBalance(cfg);
      if (r.error) return { ok: false, message: r.error, tested_at };
      return { ok: true, message: "Connected", tested_at, balance: Number(r.data.balance || 0), currency: r.data.currency || "NGN" };
    }
    if (key === "juntpay") {
      const cfg = juntpay.getConfig(settings);
      if (!cfg.appId || !cfg.merchantId || !cfg.secretKey) return notConfigured("JuntPay credentials incomplete");
      const r = await juntpay.queryBalance(cfg);
      if (r.error) return { ok: false, message: r.error, tested_at };
      return { ok: true, message: "Connected", tested_at };
    }
    if (key === "kora") {
      const cfg = kora.getConfig(settings);
      if (!cfg.secretKey) return notConfigured("No secret key configured");
      const r = await kora.listBanks(cfg);
      if (r.error) return { ok: false, message: r.error, tested_at };
      return { ok: true, message: "Connected", tested_at };
    }
    return notConfigured("Not configured");
  } catch (err) {
    return { ok: false, message: err.message, tested_at };
  }
}

// Initial state only; no network calls. Individual/test-all actions do the real ping.
router.get("/admin/gateways/test", async (req, res) => {
  res.json({});
});

router.post("/admin/gateways/test/:gateway", async (req, res) => {
  const result = await testGateway(req.params.gateway);
  res.json(result);
});
router.get("/admin/paystack/balance", async (req, res) => {
  const cfg = paystack.getConfig(await getAllSettings());
  const result = await paystack.queryBalance(cfg);
  if (result.error) return res.status(502).json({ detail: result.error });
  res.json({ balance: Number(result.data.balance || 0), currency: result.data.currency || "NGN" });
});
router.get("/admin/duplo/balance", async (req, res) => {
  const cfg = duplo.getConfig(await getAllSettings());
  const result = await duplo.queryBalance(cfg);
  if (result.error) return res.status(502).json({ detail: result.error });
  res.json({ balance: Number(result.data.balance || 0), currency: result.data.currency || "NGN" });
});
router.get("/admin/duplo/banks", async (req, res) => {
  const cfg = duplo.getConfig(await getAllSettings());
  const result = await duplo.listBanks(cfg);
  if (result.error) return res.status(502).json({ detail: result.error });
  res.json(result.data || []);
});
router.get("/admin/nomba/balance", async (req, res) => {
  const cfg = nomba.getConfig(await getAllSettings());
  const result = await nomba.queryBalance(cfg);
  if (result.error) return res.status(502).json({ detail: result.error });
  res.json({ balance: Number(result.data.balance || 0), currency: result.data.currency || "NGN" });
});
router.get("/admin/juntpay/balance", async (req, res) => {
  const settings = await getAllSettings();
  const cfg = juntpay.getConfig(settings);
  const result = await juntpay.queryBalance(cfg);
  if (result.error) return res.status(502).json({ detail: result.error });
  const data = result.data || {};
  res.json({
    balance: Number(data.availableAmount ?? data.availableBalance ?? 0),
    currency: data.currency || "NGN",
    frozen: Number(data.frozenAmount ?? 0),
    merchant_id: data.mchNo || cfg.merchantId,
  });
});
router.get("/admin/juntpay/banks", async (req, res) => {
  const settings = await getAllSettings();
  const cfg = juntpay.getConfig(settings);
  const result = await juntpay.queryBankList(cfg, true);
  if (result.error) return res.status(502).json({ detail: result.error });
  res.json(result.data || []);
});
router.get("/admin/kora/balance", async (req, res) => {
  const cfg = kora.getConfig(await getAllSettings());
  const result = await kora.queryBalance(cfg);
  if (result.error) return res.status(502).json({ detail: result.error });
  res.json({ balance: Number(result.data.balance || 0), currency: result.data.currency || "NGN" });
});
router.get("/admin/kora/banks", async (req, res) => {
  const cfg = kora.getConfig(await getAllSettings());
  const result = await kora.listBanks(cfg);
  if (result.error) return res.status(502).json({ detail: result.error });
  res.json(result.data || []);
});
router.get("/admin/fixie/usage", async (req, res) => {
  const count = Number(await getSetting("fixie_usage_count", "0"));
  const limit = Number(await getSetting("fixie_usage_limit", "25000"));
  const synced_at = await getSetting("fixie_usage_synced_at", "");
  res.json({ count, limit, synced_at });
});
router.post("/admin/fixie/sync", async (req, res) => {
  const count = Math.max(0, Math.floor(Number(req.body?.count || 0)));
  await saveSettings({ fixie_usage_count: count, fixie_usage_synced_at: new Date().toISOString() });
  res.json({ count });
});
router.post("/admin/fixie/reset", async (req, res) => {
  await saveSettings({ fixie_usage_count: 0, fixie_usage_synced_at: new Date().toISOString() });
  res.json({ message: "Reset" });
});
router.post("/admin/fixie/limit", async (req, res) => {
  const limit = Math.max(1, Math.floor(Number(req.body?.limit || 25000)));
  await saveSettings({ fixie_usage_limit: limit });
  res.json({ limit });
});

module.exports = router;

