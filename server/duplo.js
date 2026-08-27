const https = require("https");
const { getProxyAgent } = require("./proxy");

const BASE = "https://atlas.tryduplo.com/api/v1";

function getConfig(settings) {
  const s = settings || {};
  return {
    apiKey: s.duplo_api_key || process.env.DUPLO_API_KEY || "",
    proxyUrl: s.lumenhub_proxy_url || process.env.LUMENHUB_PROXY_URL || "",
  };
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
          Authorization: "Bearer " + cfg.apiKey,
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
    req.setTimeout(20000, () => req.destroy(new Error("Duplo request timed out")));
    if (payload) req.write(payload);
    req.end();
  });
}

// Create a checkout session (redirect to Duplo checkout).
async function createCheckout({ amount, email, name, sourceReference, redirect_url }, cfg) {
  try {
    const first_name = (name || "Customer").split(" ")[0] || "Customer";
    const last_name = (name || "").split(" ").slice(1).join(" ") || "Customer";
    const r = await request("POST", "/checkout/initiate", {
      currency: "NGN",
      first_name,
      last_name,
      email: email || "customer@example.com",
      amount: Number(amount),
      source_reference: sourceReference,
      redirect_url: redirect_url || "",
      description: "Deposit",
    }, cfg);
    if (!r.body || r.body.statusCode >= 400 || !r.body.data) {
      return { error: (r.body && r.body.message) || "Duplo checkout failed" };
    }
    const data = r.body.data;
    return { data: { checkout_url: data.checkoutUrl, checkout_reference: data.checkoutReference, source_reference: data.sourceReference } };
  } catch (err) {
    return { error: err.message };
  }
}

// Verify a checkout by merchant source reference.
// checkoutStatus values include: "completed", "pending", "failed", "cancelled".
async function verifyCheckout(sourceReference, cfg) {
  try {
    const r = await request("GET", `/checkout/source-reference/${encodeURIComponent(sourceReference)}/verify`, null, cfg);
    if (r.status === 404 || !r.body || r.body.statusCode >= 400 || !r.body.data) {
      return { error: (r.body && r.body.message) || "Duplo checkout not found" };
    }
    const data = r.body.data;
    return { data: { status: data.checkoutStatus, is_final: data.isFinal, amount: data.transactionAmount ? data.transactionAmount.value : null } };
  } catch (err) {
    return { error: err.message };
  }
}

// Initiate a single bank payout.
async function createPayout({ amount, account_number, bank_code, bank_name, account_name, narration, sourceReference }, cfg) {
  try {
    const r = await request("POST", "/payout/bank-transfer", {
      account_number: String(account_number),
      bank_code: String(bank_code),
      bank_name: bank_name || "Bank",
      account_name: account_name || "Customer",
      amount: Number(amount),
      narration: narration || "Withdrawal",
      type: "bank_transfer",
      currency: "NGN",
      source_reference: sourceReference,
    }, cfg);
    if (!r.body || r.body.statusCode >= 400 || !r.body.data) {
      return { error: (r.body && r.body.message) || "Duplo payout failed" };
    }
    const data = r.body.data;
    return { data: { reference: data.reference, source_reference: data.sourceReference, status: data.status } };
  } catch (err) {
    return { error: err.message };
  }
}

// Duplo payout statuses: "Pending", "Success", "Failed", "Reversed" (approx).
async function verifyPayout(sourceReference, cfg) {
  try {
    const r = await request("GET", `/payout/transaction-by-source-reference/${encodeURIComponent(sourceReference)}`, null, cfg);
    if (r.status === 404 || !r.body || r.body.statusCode >= 400 || !r.body.data) {
      return { error: (r.body && r.body.message) || "Duplo payout not found" };
    }
    const data = r.body.data;
    return { data: { status: data.status, reference: data.reference } };
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
    const r = await request("GET", "/banking/banks/NGN", null, cfg);
    if (!r.body || r.body.statusCode >= 400) return { error: (r.body && r.body.message) || "Failed to list banks" };
    const data = (r.body.data || []).map((b) => ({ code: b.bankCode, name: b.bankName }));
    _banksCache = { at: Date.now(), data };
    return { data };
  } catch (err) {
    return { error: err.message };
  }
}

// Resolve a bank account name (account name enquiry).
async function resolveAccount(account_number, bank_code, cfg) {
  try {
    const r = await request("POST", "/banking/name-enquiry", {
      account_number: String(account_number),
      bank_code: String(bank_code),
      currency: "NGN",
    }, cfg);
    if (!r.body || r.body.statusCode >= 400 || !r.body.data) return { error: (r.body && r.body.message) || "Name enquiry failed" };
    return { data: { account_name: r.body.data.accountName, bank_code: r.body.data.bankCode || bank_code } };
  } catch (err) {
    return { error: err.message };
  }
}

async function queryBalance(cfg) {
  try {
    const r = await request("GET", "/wallet/balance", null, cfg);
    if (!r.body || r.body.statusCode >= 400 || !r.body.data) return { error: (r.body && r.body.message) || "Failed to get balance" };
    const data = r.body.data;
    const bal = data.availableBalance || data.balance || {};
    return { data: { balance: bal.value != null ? bal.value : 0, currency: bal.currency || "NGN" } };
  } catch (err) {
    return { error: err.message };
  }
}

// Create a single-use virtual account: a fresh customer with a wallet.
async function createVirtualAccount({ first_name, last_name, email, phone }, cfg) {
  try {
    // Normalize a Nigerian phone (080... -> +23480...) to E.164.
    let p = String(phone || "").trim();
    if (/^0\d{10}$/.test(p)) p = "+234" + p.slice(1);
    else if (/^234\d{10}$/.test(p)) p = "+" + p;
    if (!p) p = "+2348000000000";

    const r = await request("POST", "/customer", {
      first_name: first_name || "Customer",
      last_name: last_name || "Deposit",
      email,
      phone: p,
      has_wallet: true,
      type: "individual",
    }, cfg);
    if (!r.body || r.body.statusCode >= 400 || !r.body.data) {
      return { error: (r.body && r.body.message) || "Duplo customer creation failed" };
    }
    const data = r.body.data;
    const wallet = data.wallet || {};
    return {
      data: {
        customer_reference: data.reference,
        account_number: wallet.accountNumber,
        account_name: wallet.accountName,
        account_reference: wallet.accountReference,
        // The wallet's `provider` field holds the bank that provisioned the DVA
        // (e.g. "Globus Bank"); there is no `bankName` field.
        bank_name: wallet.provider || "Globus Bank",
      },
    };
  } catch (err) {
    return { error: err.message };
  }
}

// List recent business transactions, optionally filtered by search (account number).
async function listTransactions(search, cfg) {
  try {
    const qs = search ? "?limit=50&search=" + encodeURIComponent(search) : "?limit=50";
    const r = await request("GET", "/transaction" + qs, null, cfg);
    if (!r.body || r.body.statusCode >= 400) return { error: (r.body && r.body.message) || "Failed to list transactions" };
    return { data: r.body.data || [] };
  } catch (err) {
    return { error: err.message };
  }
}

module.exports = {
  getConfig, createCheckout, verifyCheckout, createPayout, verifyPayout, listBanks, resolveAccount, queryBalance,
  createVirtualAccount, listTransactions,
};
