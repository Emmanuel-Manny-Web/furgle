const https = require("https");
const { getProxyAgent } = require("./proxy");

const BASE = "https://api.paystack.co";

function getConfig(settings) {
  const s = settings || {};
  return {
    secretKey: s.paystack_secret_key || process.env.PAYSTACK_SECRET_KEY || "",
    publicKey: s.paystack_public_key || process.env.PAYSTACK_PUBLIC_KEY || "",
    proxyUrl: s.lumenhub_proxy_url || process.env.LUMENHUB_PROXY_URL || "",
  };
}

function toKobo(amount) {
  return Math.round(Number(amount) * 100);
}

function request(method, path, body, cfg) {
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
          Authorization: "Bearer " + cfg.secretKey,
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
    req.setTimeout(20000, () => req.destroy(new Error("Paystack request timed out")));
    if (payload) req.write(payload);
    req.end();
  });
}

// Initialize a payment (redirect to Paystack checkout).
async function createDeposit({ amount, email, reference, callback_url }, cfg) {
  try {
    const r = await request("POST", "/transaction/initialize", {
      email, amount: toKobo(amount), reference, callback_url, currency: "NGN",
    }, cfg);
    if (!r.body || !r.body.status) return { error: (r.body && r.body.message) || "Paystack request failed" };
    const data = r.body.data || {};
    return { data: { authorization_url: data.authorization_url, access_code: data.access_code, reference: data.reference } };
  } catch (err) {
    return { error: err.message };
  }
}

async function verifyDeposit(reference, cfg) {
  try {
    const r = await request("GET", "/transaction/verify/" + encodeURIComponent(reference), null, cfg);
    if (!r.body || !r.body.status) return { error: (r.body && r.body.message) || "Paystack request failed" };
    const data = r.body.data || {};
    return { data: { status: data.status, amount: data.amount, reference: data.reference } };
  } catch (err) {
    return { error: err.message };
  }
}

// Create a transfer recipient, then initiate a transfer.
async function createTransfer({ amount, account_number, bank_code, account_name, reason }, cfg) {
  try {
    const rr = await request("POST", "/transferrecipient", {
      type: "nuban", name: account_name, account_number, bank_code, currency: "NGN",
    }, cfg);
    if (!rr.body || !rr.body.status) return { error: (rr.body && rr.body.message) || "Failed to create recipient" };
    const recipientCode = rr.body.data.recipient_code;

    const tr = await request("POST", "/transfer", {
      source: "balance", amount: toKobo(amount), recipient: recipientCode, reason: reason || "Withdrawal",
    }, cfg);
    if (!tr.body || !tr.body.status) return { error: (tr.body && tr.body.message) || "Transfer failed" };
    const data = tr.body.data || {};
    return { data: { transfer_code: data.transfer_code, status: data.status, reference: data.reference } };
  } catch (err) {
    return { error: err.message };
  }
}

// Paystack transfer statuses: pending | otp | success | failed | reversed
async function verifyTransfer(code, cfg) {
  try {
    const r = await request("GET", "/transfer/" + encodeURIComponent(code), null, cfg);
    if (!r.body || !r.body.status) return { error: (r.body && r.body.message) || "Paystack request failed" };
    const data = r.body.data || {};
    return { data: { status: data.status, transfer_code: data.transfer_code } };
  } catch (err) {
    return { error: err.message };
  }
}

let _banksCache = { at: 0, data: null };
async function listBanks(cfg) {
  try {
    if (_banksCache.data && Date.now() - _banksCache.at < 60 * 60 * 1000) {
      return { data: _banksCache.data };
    }
    const r = await request("GET", "/bank?currency=NGN&perPage=100", null, cfg);
    if (!r.body || !r.body.status) return { error: (r.body && r.body.message) || "Failed to list banks" };
    const data = (r.body.data || []).map((b) => ({ code: b.code, name: b.name }));
    _banksCache = { at: Date.now(), data };
    return { data };
  } catch (err) {
    return { error: err.message };
  }
}

async function resolveAccount(account_number, bank_code, cfg) {
  try {
    const r = await request("GET", `/bank/resolve?account_number=${encodeURIComponent(account_number)}&bank_code=${encodeURIComponent(bank_code)}`, null, cfg);
    if (!r.body || !r.body.status) return { error: (r.body && r.body.message) || "Failed to resolve account" };
    const data = r.body.data || {};
    return { data: { account_name: data.account_name, account_number: data.account_number } };
  } catch (err) {
    return { error: err.message };
  }
}

async function queryBalance(cfg) {
  try {
    const r = await request("GET", "/balance", null, cfg);
    if (!r.body || !r.body.status) return { error: (r.body && r.body.message) || "Failed to get balance" };
    const data = r.body.data || [];
    const ngn = data.find((b) => b.currency === "NGN") || data[0];
    // Paystack reports balance in kobo (minor unit) — convert to naira.
    const raw = ngn ? Number(ngn.balance) : 0;
    return { data: { balance: raw / 100, currency: ngn ? ngn.currency : "NGN" } };
  } catch (err) {
    return { error: err.message };
  }
}

// Create a single-use virtual account: a fresh customer + dedicated account.
async function createVirtualAccount({ email, first_name, last_name, phone }, cfg) {
  try {
    const cr = await request("POST", "/customer", {
      email, first_name, last_name, phone,
    }, cfg);
    if (!cr.body || !cr.body.status) return { error: (cr.body && cr.body.message) || "Failed to create customer" };
    const customerCode = cr.body.data.customer_code;
    const customerId = cr.body.data.id;

    const dr = await request("POST", "/dedicated_account", {
      customer: customerCode,
      preferred_bank: (cfg.preferred_bank || "wema-bank"),
      currency: "NGN",
    }, cfg);
    if (!dr.body || !dr.body.status) return { error: (dr.body && dr.body.message) || "Failed to create dedicated account" };
    const da = dr.body.data || {};
    return {
      data: {
        customer_code: customerCode,
        customer_id: customerId,
        account_number: da.account_number,
        account_name: da.account_name,
        bank_name: (da.bank && da.bank.name) || cfg.preferred_bank || "Wema Bank",
      },
    };
  } catch (err) {
    return { error: err.message };
  }
}

// List recent transactions for a customer's dedicated account.
async function listCustomerTransactions(customerRef, cfg) {
  try {
    // Paystack's /transaction?customer= filter only accepts the numeric ID,
    // so resolve a customer code (CUS_...) to its numeric ID first.
    let customerId = customerRef;
    if (customerRef && String(customerRef).startsWith("CUS_")) {
      const cr = await request("GET", "/customer/" + encodeURIComponent(customerRef), null, cfg);
      if (cr.body && cr.body.status && cr.body.data) customerId = cr.body.data.id;
    }
    const r = await request("GET", "/transaction?customer=" + encodeURIComponent(customerId) + "&perPage=50", null, cfg);
    if (!r.body || !r.body.status) return { error: (r.body && r.body.message) || "Failed to list transactions" };
    return { data: r.body.data || [] };
  } catch (err) {
    return { error: err.message };
  }
}

// Verify a single transaction by its Paystack reference.
async function verifyTransaction(reference, cfg) {
  try {
    const r = await request("GET", "/transaction/verify/" + encodeURIComponent(reference), null, cfg);
    if (!r.body || !r.body.status) return { error: (r.body && r.body.message) || "Paystack request failed" };
    const data = r.body.data || {};
    return { data: { status: data.status, amount: data.amount, reference: data.reference } };
  } catch (err) {
    return { error: err.message };
  }
}

// Check whether a customer's virtual (dedicated) account has received the
// expected amount, by listing its transactions and verifying each reference.
async function isVirtualAccountPaid(customerCode, expectedAmount, cfg) {
  const list = await listCustomerTransactions(customerCode, cfg);
  if (list.error || !list.data) return { paid: false };
  const expected = Math.round(Number(expectedAmount) * 100); // kobo
  for (const t of list.data) {
    const ref = t.reference;
    if (!ref) continue;
    const v = await verifyTransaction(ref, cfg);
    if (v.error || !v.data) continue;
    const s = String(v.data.status || "").toLowerCase();
    const amt = Number(v.data.amount);
    if (s === "success" && Number.isFinite(amt) && amt >= expected) return { paid: true };
  }
  return { paid: false };
}

// Find a dedicated (virtual) account's customer code by its account number.
// Used to backfill missing gateway_id on historical deposits.
async function findDedicatedAccount(accountNumber, cfg) {
  try {
    const r = await request("GET", "/dedicated_account?account_number=" + encodeURIComponent(accountNumber), null, cfg);
    if (!r.body || !r.body.status) return { error: (r.body && r.body.message) || "Failed to find dedicated account" };
    const list = r.body.data || [];
    const acct = list.find((a) => String(a.account_number) === String(accountNumber)) || list[0];
    if (!acct) return { error: "Dedicated account not found" };
    const customer = acct.customer || {};
    return { data: { customer_code: customer.customer_code || null, id: acct.id } };
  } catch (err) {
    return { error: err.message };
  }
}

module.exports = {
  getConfig, createDeposit, verifyDeposit, createTransfer, verifyTransfer, listBanks, resolveAccount, queryBalance,
  createVirtualAccount, listCustomerTransactions, verifyTransaction, isVirtualAccountPaid, findDedicatedAccount,
};
