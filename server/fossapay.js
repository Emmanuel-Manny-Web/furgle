const https = require("https");
const crypto = require("crypto");
const { getProxyAgent } = require("./proxy");

// FossaPay (api-production.fossapay.com) — NGN collections (deposits) and
// master-wallet payouts (withdrawals). All outbound requests route through the
// lumenhub forward proxy so the gateway sees lumenhub's egress IP.
//
//   Customers    POST /api/v1/customers
//   Wallet       POST /api/v1/wallets/fiat/create   (persistent virtual account)
//   Checkout     POST /api/v1/checkouts             (one-time 30-min account)
//   Banks        GET  /api/v1/transfers/fiat/banks
//   Name enquiry POST /api/v1/transfers/fiat/bank-name-enquiry
//   Payout       POST /api/v1/payouts               (X-Idempotency-Key)
//   Auth         x-api-key header

const BASE = "https://api-production.fossapay.com/api/v1";

function getConfig(settings) {
  const s = settings || {};
  return {
    apiKey: s.fossapay_api_key || process.env.FOSSAPAY_API_KEY || "",
    webhookSecret:
      s.fossapay_webhook_secret ||
      process.env.FOSSAPAY_WEBHOOK_SECRET ||
      process.env.FOSSAPAY_WEHBOOK_SECRET ||
      "",
    proxyUrl: s.lumenhub_proxy_url || process.env.LUMENHUB_PROXY_URL || "",
  };
}

function request(method, path, body, cfg, idempotencyKey) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE + path);
    const payload = body ? JSON.stringify(body) : null;
    const agent = getProxyAgent(cfg && cfg.proxyUrl);
    const headers = {
      "x-api-key": cfg.apiKey,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "X-Idempotency-Key": idempotencyKey } : {}),
      ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
    };
    const req = https.request(
      {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method,
        ...(agent ? { agent } : {}),
        headers,
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
    req.setTimeout(30000, () => req.destroy(new Error("FossaPay request timed out")));
    if (payload) req.write(payload);
    req.end();
  });
}

// FossaPay requires single-token names per field (no spaces).
function nameParts(fullName) {
  const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  const clean = (s) => String(s || "").replace(/[^a-zA-Z]/g, "") || "Customer";
  const firstName = clean(parts[0]);
  const lastName = parts.length > 1 ? clean(parts[parts.length - 1]) : firstName;
  let middleName = "";
  if (parts.length > 2) middleName = clean(parts[1]);
  return { firstName, middleName, lastName };
}

function intlPhone(phone) {
  const p = String(phone || "").replace(/[\s-]/g, "");
  if (p.startsWith("+234")) return p;
  if (p.startsWith("234")) return "+" + p;
  if (p.startsWith("0")) return "+234" + p.slice(1);
  return p ? "+234" + p : "";
}

// Create the customer + persistent NGN wallet. Returns account details.
async function createVirtualAccount({ name, email, phone, reference }, cfg) {
  try {
    const { firstName, middleName, lastName } = nameParts(name);
    const customer = await request("POST", "/customers", {
      firstName,
      middleName: middleName || undefined,
      lastName,
      emailAddress: email || "customer@lumenhub.com",
      mobileNumber: intlPhone(phone) || "+2348000000000",
      dateOfBirth: "1990-01-01",
      address: "Lagos, Nigeria",
      city: "Lagos",
      country: "Nigeria",
      type: "individual",
    }, cfg);
    if (!customer.body || customer.body.status === "error" || !customer.body.data) {
      return { error: (customer.body && customer.body.message) || "FossaPay customer creation failed" };
    }
    const customerId = customer.body.data.id;

    const wallet = await request("POST", "/wallets/fiat/create", {
      customerId,
      walletName: name || "Customer",
      walletReference: reference,
    }, cfg);
    if (!wallet.body || wallet.body.status === "error" || !wallet.body.data) {
      return { error: (wallet.body && wallet.body.message) || "FossaPay wallet creation failed" };
    }
    const d = wallet.body.data;
    return {
      data: {
        customer_id: customerId,
        account_number: d.accountNumber || null,
        account_name: d.accountName || name || null,
        bank_name: d.bankName || "FossaPay",
        bank_code: d.bankCode || null,
      },
    };
  } catch (err) {
    return { error: err.message };
  }
}

// Create a one-time 30-minute checkout account.
async function createCheckout({ amount, reference, name, email, phone }, cfg) {
  try {
    const r = await request("POST", "/checkouts", {
      amount: Math.round(Number(amount)),
      currency: "NGN",
      reference,
      feeBearer: "merchant",
      customer: {
        name: name || "Customer",
        email: email || "customer@lumenhub.com",
        phoneNumber: intlPhone(phone) || undefined,
      },
    }, cfg, crypto.randomUUID());
    if (!r.body || r.body.status === "error" || !r.body.data) {
      return { error: (r.body && r.body.message) || "FossaPay checkout creation failed" };
    }
    const d = r.body.data;
    const acct = d.account || {};
    return {
      data: {
        account_number: acct.accountNumber || null,
        account_name: acct.accountName || "FossaPay Checkout",
        bank_name: acct.bankName || "FossaPay",
        expires_at: d.expiresAt || acct.expiresAt || null,
        amount_payable: Number(d.amountPayable || d.settlementAmount || amount),
        settlement_amount: Number(d.settlementAmount || d.amount || amount),
      },
    };
  } catch (err) {
    return { error: err.message };
  }
}

// Retrieve a checkout by reference (for deposit polling / reconciliation).
async function getCheckoutByReference(reference, cfg) {
  try {
    const r = await request("GET", "/checkouts/reference/" + encodeURIComponent(reference), null, cfg);
    if (!r.body || r.body.status === "error" || !r.body.data) {
      return { error: (r.body && r.body.message) || "FossaPay checkout not found" };
    }
    const d = r.body.data;
    return {
      data: {
        status: d.status,
        settlement_amount: Number(d.settlementAmount || d.amount || 0),
      },
    };
  } catch (err) {
    return { error: err.message };
  }
}

async function listBanks(cfg) {
  try {
    const r = await request("GET", "/transfers/fiat/banks", null, cfg);
    if (!r.body || !Array.isArray(r.body.data)) {
      return { error: (r.body && r.body.message) || "FossaPay bank list failed" };
    }
    return { data: (r.body.data || []).map((b) => ({ code: String(b.bankcode), name: b.bankname })) };
  } catch (err) {
    return { error: err.message };
  }
}

async function resolveAccount(account_number, bank_code, cfg) {
  try {
    const r = await request("POST", "/transfers/fiat/bank-name-enquiry", {
      accountNumber: String(account_number),
      bankCode: String(bank_code),
    }, cfg);
    if (!r.body || r.body.status === "error" || !r.body.data) {
      return { error: (r.body && r.body.message) || "FossaPay name enquiry failed" };
    }
    return { data: { account_name: r.body.data.accountName || null } };
  } catch (err) {
    return { error: err.message };
  }
}

async function createPayout({ amount, reference, bank_code, bank_name, account_name, account_number }, cfg) {
  try {
    const r = await request("POST", "/payouts", {
      amount: Math.round(Number(amount)),
      currency: "NGN",
      reference,
      destinationBankCode: String(bank_code),
      destinationBankName: bank_name || String(bank_code),
      destinationAccountName: account_name || "Customer",
      destinationAccountNumber: String(account_number),
      remarks: "Lumenhub payout",
    }, cfg, crypto.randomUUID());
    if (!r.body || r.body.status === "error" || !r.body.data) {
      return { error: (r.body && r.body.message) || "FossaPay payout failed" };
    }
    const d = r.body.data;
    return {
      data: {
        reference: d.reference || reference,
        payout_id: d.payoutId || null,
        status: d.status || "processing",
      },
    };
  } catch (err) {
    return { error: err.message };
  }
}

async function verifyPayout(reference, cfg) {
  try {
    const r = await request("GET", "/payouts/reference/" + encodeURIComponent(reference), null, cfg);
    if (!r.body || r.body.status === "error" || !r.body.data) {
      return { error: (r.body && r.body.message) || "FossaPay payout not found" };
    }
    return { data: { status: r.body.data.status } };
  } catch (err) {
    return { error: err.message };
  }
}

module.exports = {
  BASE,
  getConfig,
  request,
  createVirtualAccount,
  createCheckout,
  getCheckoutByReference,
  listBanks,
  resolveAccount,
  createPayout,
  verifyPayout,
};
