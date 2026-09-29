const https = require("https");
const http = require("http");
const { getProxyAgent } = require("./proxy");

const BASE = "https://api.korapay.com/merchant/api/v1";

// Tell the lumenhub relay where to bounce a checkout callback for a given
// reference, so the return origin never appears in the visible redirect URL.
// This is a direct server-to-server call (no proxy). Best-effort — failures
// fall back to lumenhub's configured FURGLE_WEBHOOK_BASE_URL.
function registerCallbackReturn(lumenhubBase, reference, to) {
  return new Promise((resolve) => {
    try {
      const base = String(lumenhubBase || "").replace(/\/+$/, "");
      if (!base) return resolve(false);
      const url = new URL(base + "/api/relay/register-callback");
      const mod = url.protocol === "https:" ? https : http;
      const payload = JSON.stringify({ reference, to });
      const req = mod.request(
        {
          hostname: url.hostname,
          port: url.port || (url.protocol === "https:" ? 443 : 80),
          path: url.pathname + url.search,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(payload),
          },
        },
        (res) => {
          res.resume();
          res.on("end", () => resolve(true));
        }
      );
      req.on("error", () => resolve(false));
      req.setTimeout(5000, () => { req.destroy(); resolve(false); });
      req.write(payload);
      req.end();
    } catch {
      resolve(false);
    }
  });
}

function getConfig(settings) {
  const s = settings || {};
  return {
    secretKey: s.kora_secret_key || process.env.KORA_SECRET_KEY || "",
    publicKey: s.kora_public_key || process.env.KORA_PUBLIC_KEY || "",
    encryptionKey: s.kora_encryption_key || process.env.KORA_ENCRYPTION_KEY || "",
    proxyUrl: s.lumenhub_proxy_url || process.env.LUMENHUB_PROXY_URL || "",
  };
}

function request(method, path, body, cfg, authKey) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE + path);
    const payload = body ? JSON.stringify(body) : null;
    const agent = getProxyAgent(cfg && cfg.proxyUrl);
    const req = https.request(
      {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method,
        ...(agent ? { agent } : {}),
        headers: {
          Authorization: "Bearer " + (authKey || cfg.secretKey),
          Accept: "application/json",
          "Content-Type": "application/json",
          ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          let json = null;
          try { json = JSON.parse(data); } catch { json = null; }
          resolve({ status: res.statusCode, body: json });
        });
      }
    );
    req.on("error", reject);
    req.setTimeout(25000, () => req.destroy(new Error("Kora request timed out")));
    if (payload) req.write(payload);
    req.end();
  });
}

// Create a single-use virtual account for a bank-transfer deposit.
// Endpoint: POST /charges/bank-transfer (requires account_name, amount,
// currency, reference and customer.name/email).
async function createVirtualAccount({ reference, amount, name, email, phone }, cfg) {
  try {
    const fullName = (name || "Customer").trim() || "Customer";
    const r = await request("POST", "/charges/bank-transfer", {
      account_name: fullName,
      reference,
      amount: Number(amount),
      currency: "NGN",
      customer: {
        name: fullName,
        email: email || (phone ? phone + "@lumenhub.com" : "customer@lumenhub.com"),
      },
    }, cfg);
    if (!r.body || !r.body.data) return { error: (r.body && (r.body.message || r.body.error)) || "Kora virtual account creation failed" };
    const d = r.body.data;
    const ba = d.bank_account || {};
    return {
      data: {
        account_reference: d.reference || d.payment_reference || reference,
        account_number: ba.account_number || d.account_number || null,
        account_name: ba.account_name || d.account_name || null,
        bank_name: prettyBankName(ba.bank_name || "Kora"),
        bank_code: ba.bank_code || null,
        expires_at: ba.expiry_date_in_utc || null,
      },
    };
  } catch (err) {
    return { error: err.message };
  }
}

// Capitalize a bank name so "wema" -> "Wema", "gtb" -> "Gtb", etc.
function prettyBankName(name) {
  return String(name || "")
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

// Create a permanent/fixed virtual bank account for a customer.
// Endpoint: POST /virtual-bank-account (requires account_name, account_reference,
// permanent, bank_code, customer and kyc.bvn).
async function createPermanentVirtualAccount({ account_name, account_reference, bank_code, name, email, bvn }, cfg) {
  try {
    const fullName = (account_name || name || "Customer").trim() || "Customer";
    const r = await request("POST", "/virtual-bank-account", {
      account_name: fullName,
      account_reference,
      permanent: true,
      bank_code: bank_code || "035",
      customer: {
        name: (name || fullName).trim() || fullName,
        email: email || "customer@lumenhub.com",
      },
      kyc: {
        bvn: bvn || "",
      },
    }, cfg);
    if (!r.body || !r.body.data) return { error: (r.body && (r.body.message || r.body.error)) || "Kora virtual account creation failed" };
    const d = r.body.data;
    return {
      data: {
        account_reference: d.account_reference || account_reference,
        unique_id: d.unique_id || null,
        account_number: d.account_number || null,
        account_name: d.account_name || fullName,
        bank_name: d.bank_name || "Kora",
        bank_code: d.bank_code || bank_code || null,
      },
    };
  } catch (err) {
    return { error: err.message };
  }
}

// Initialize a hosted checkout charge. Endpoint: POST /charges/initialize.
// Returns a checkout_url that the customer is redirected to.
async function initializeCheckout({ reference, amount, name, email, redirect_url, narration }, cfg) {
  try {
    const fullName = (name || "Customer").trim() || "Customer";
    const r = await request("POST", "/charges/initialize", {
      reference,
      amount: Number(amount),
      currency: "NGN",
      customer: {
        name: fullName,
        email: email || "customer@lumenhub.com",
      },
      ...(redirect_url ? { redirect_url } : {}),
      ...(narration ? { narration: narration.slice(0, 200) } : {}),
    }, cfg);
    if (!r.body || !r.body.data) return { error: (r.body && (r.body.message || r.body.error)) || "Kora checkout initialization failed" };
    const d = r.body.data;
    return {
      data: {
        reference: d.reference || reference,
        checkout_url: d.checkout_url || null,
      },
    };
  } catch (err) {
    return { error: err.message };
  }
}

// Verify a bank-transfer charge by its reference.
async function verifyCharge(reference, cfg) {
  try {
    const r = await request("GET", "/charges/" + encodeURIComponent(reference), null, cfg);
    if (!r.body || !r.body.data) return { error: (r.body && (r.body.message || r.body.error)) || "Kora charge not found" };
    const d = r.body.data;
    return { data: { status: d.status, amount: d.amount, reference: d.reference } };
  } catch (err) {
    return { error: err.message };
  }
}

// Check whether a virtual account has received the expected amount.
async function isVirtualAccountPaid(reference, expectedAmount, cfg) {
  const v = await verifyCharge(reference, cfg);
  if (v.error || !v.data) return { paid: false };
  const s = String(v.data.status || "").toLowerCase();
  const amt = Number(v.data.amount);
  return { paid: ["success", "paid"].includes(s) && Number.isFinite(amt) && amt >= Number(expectedAmount) };
}

let _banksCache = { at: 0, data: null };
async function listBanks(cfg) {
  try {
    if (_banksCache.data && Date.now() - _banksCache.at < 60 * 60 * 1000) {
      return { data: _banksCache.data };
    }
    const r = await request("GET", "/misc/banks?countryCode=NG", null, cfg, cfg.publicKey);
    if (!r.body || !r.body.data) return { error: (r.body && (r.body.message || r.body.error)) || "Failed to list banks" };
    const data = (r.body.data || []).map((b) => ({ code: String(b.code), name: b.name }));
    _banksCache = { at: Date.now(), data };
    return { data };
  } catch (err) {
    return { error: err.message };
  }
}

// Resolve a bank account name (account name enquiry).
async function resolveAccount(account_number, bank_code, cfg) {
  try {
    const r = await request("POST", "/misc/banks/resolve", {
      bank: String(bank_code),
      account: String(account_number),
    }, cfg);
    if (!r.body || !r.body.data) return { error: (r.body && (r.body.message || r.body.error)) || "Name enquiry failed" };
    return { data: { account_name: r.body.data.account_name || r.body.data.accountName || null } };
  } catch (err) {
    return { error: err.message };
  }
}

// Initiate a single bank payout (disbursement).
async function createPayout({ amount, account_number, bank_code, account_name, reference, narration }, cfg) {
  try {
    const r = await request("POST", "/transactions/disburse", {
      reference,
      destination: {
        type: "bank_account",
        amount: Number(amount),
        currency: "NGN",
        narration: narration || "Lumenhub payout",
        bank_account: {
          bank: String(bank_code),
          account: String(account_number),
        },
        customer: { name: account_name || "Customer", email: "payout@lumenhub.com" },
      },
    }, cfg);
    if (!r.body || !r.body.data) return { error: (r.body && (r.body.message || r.body.error)) || "Kora payout failed" };
    const d = r.body.data;
    return { data: { reference: d.reference || reference, status: d.status || "processing", message: d.message || null } };
  } catch (err) {
    return { error: err.message };
  }
}

// Verify a payout (disbursement) by reference.
async function verifyPayout(reference, cfg) {
  try {
    const r = await request("GET", "/transactions/" + encodeURIComponent(reference), null, cfg);
    if (!r.body || !r.body.data) return { error: (r.body && (r.body.message || r.body.error)) || "Kora payout not found" };
    const d = r.body.data;
    return { data: { status: d.status, reference: d.reference } };
  } catch (err) {
    return { error: err.message };
  }
}

async function queryBalance(cfg) {
  try {
    const r = await request("GET", "/balances", null, cfg);
    if (!r.body || !r.body.data) return { error: (r.body && (r.body.message || r.body.error)) || "Balance not available" };
    const d = r.body.data || {};
    const ngn = d.NGN || {};
    return { data: { balance: Number(ngn.available_balance || 0), currency: "NGN" } };
  } catch (err) {
    return { error: err.message };
  }
}

module.exports = {
  getConfig, createVirtualAccount, createPermanentVirtualAccount, initializeCheckout,
  registerCallbackReturn,
  verifyCharge, isVirtualAccountPaid, listBanks, resolveAccount,
  createPayout, verifyPayout, queryBalance,
};
