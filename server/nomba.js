const https = require("https");
const { getProxyAgent } = require("./proxy");

function getConfig(settings) {
  const s = settings || {};
  const env = s.nomba_environment || process.env.NOMBA_ENVIRONMENT || "production";
  return {
    clientId: s.nomba_client_id || process.env.NOMBA_CLIENT_ID || "",
    clientSecret: s.nomba_client_secret || process.env.NOMBA_CLIENT_SECRET || "",
    accountId: s.nomba_account_id || process.env.NOMBA_ACCOUNT_ID || "",
    baseUrl: env === "sandbox" ? "https://sandbox.nomba.com" : "https://api.nomba.com",
    proxyUrl: s.lumenhub_proxy_url || process.env.LUMENHUB_PROXY_URL || "",
  };
}

function rawRequest(method, baseUrl, path, body, accountId, token, proxyUrl) {
  return new Promise((resolve, reject) => {
    const url = new URL(baseUrl + path);
    const payload = body ? JSON.stringify(body) : null;
    const headers = { "Content-Type": "application/json", Accept: "application/json" };
    if (accountId) headers["accountId"] = accountId;
    if (token) headers["Authorization"] = "Bearer " + token;
    if (payload) headers["Content-Length"] = Buffer.byteLength(payload);

    const agent = getProxyAgent(proxyUrl);
    const req = https.request(
      { hostname: url.hostname, path: url.pathname + url.search, method, headers, ...(agent ? { agent } : {}) },
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
    req.setTimeout(25000, () => req.destroy(new Error("Nomba request timed out")));
    if (payload) req.write(payload);
    req.end();
  });
}

// Access-token cache (refreshed on expiry).
let tokenCache = { token: null, expiresAt: 0, accountId: null };

async function getToken(cfg) {
  if (tokenCache.token && tokenCache.accountId === cfg.accountId && Date.now() < tokenCache.expiresAt) {
    return { token: tokenCache.token };
  }
  const r = await rawRequest("POST", cfg.baseUrl, "/v1/auth/token/issue",
    { grant_type: "client_credentials", client_id: cfg.clientId, client_secret: cfg.clientSecret },
    cfg.accountId, null, cfg.proxyUrl);
  if (!r.body || r.body.code !== "00" || !r.body.data || !r.body.data.access_token) {
    return { error: (r.body && (r.body.description || r.body.message)) || "Nomba authentication failed" };
  }
  const exp = r.body.data.expiresAt ? new Date(r.body.data.expiresAt).getTime() : Date.now() + 5 * 60 * 1000;
  tokenCache = { token: r.body.data.access_token, expiresAt: exp - 60 * 1000, accountId: cfg.accountId };
  return { token: tokenCache.token };
}

async function request(method, path, body, cfg) {
  const t = await getToken(cfg);
  if (!t.token) return { error: t.error || "Nomba authentication failed" };
  const r = await rawRequest(method, cfg.baseUrl, path, body, cfg.accountId, t.token, cfg.proxyUrl);
  if (!r.body) return { error: "Nomba returned an empty response" };
  if (r.body.code && r.body.code !== "00" && r.body.code !== "200" && r.body.code !== "201") {
    return { error: r.body.description || r.body.message || "Nomba request failed" };
  }
  return { data: r.body.data };
}

// Create a single-use virtual account for a deposit.
async function createVirtualAccount({ accountRef, accountName, expectedAmount }, cfg) {
  try {
    const r = await request("POST", "/v1/accounts/virtual", {
      accountRef,
      accountName,
      expectedAmount: expectedAmount ? Number(expectedAmount) : undefined,
    }, cfg);
    if (r.error || !r.data) return { error: r.error || "Nomba virtual account creation failed" };
    return {
      data: {
        account_reference: r.data.accountRef,
        account_number: r.data.bankAccountNumber,
        account_name: r.data.bankAccountName,
        bank_name: r.data.bankName,
      },
    };
  } catch (err) {
    return { error: err.message };
  }
}

async function listBanks(cfg) {
  try {
    const r = await request("GET", "/v1/transfers/banks", null, cfg);
    if (r.error || !r.data) return { error: r.error || "Failed to list banks" };
    return { data: (r.data || []).map((b) => ({ code: b.code, name: b.name })) };
  } catch (err) {
    return { error: err.message };
  }
}

// Account name enquiry.
async function resolveAccount(accountNumber, bankCode, cfg) {
  try {
    const r = await request("POST", "/v1/transfers/bank/lookup", { accountNumber: String(accountNumber), bankCode: String(bankCode) }, cfg);
    if (r.error || !r.data) return { error: r.error || "Name enquiry failed" };
    return { data: { account_name: r.data.accountName, account_number: r.data.accountNumber } };
  } catch (err) {
    return { error: err.message };
  }
}

// Initiate a bank transfer (payout).
async function createTransfer({ amount, accountNumber, accountName, bankCode, merchantTxRef, narration }, cfg) {
  try {
    const r = await request("POST", "/v2/transfers/bank", {
      amount: Number(amount),
      accountNumber: String(accountNumber),
      accountName: accountName || "Customer",
      bankCode: String(bankCode),
      merchantTxRef: merchantTxRef,
      narration: narration || "Lumenhub payout",
    }, cfg);
    if (r.error || !r.data) return { error: r.error || "Nomba transfer failed" };
    return { data: { id: r.data.id, status: r.data.status } };
  } catch (err) {
    return { error: err.message };
  }
}

// Verify a payout by merchant transaction reference.
async function verifyTransfer(merchantTxRef, cfg) {
  try {
    const r = await request("GET", "/v1/transactions/accounts/single?merchantTxRef=" + encodeURIComponent(merchantTxRef), null, cfg);
    if (r.error || !r.data) return { error: r.error || "Nomba transaction not found" };
    return { data: { status: r.data.status } };
  } catch (err) {
    return { error: err.message };
  }
}

// Check whether a virtual account has received the expected amount.
async function isVirtualAccountPaid(accountRef, expectedAmount, cfg) {
  try {
    const r = await request("GET", "/v1/transactions/accounts/single?merchantTxRef=" + encodeURIComponent(accountRef), null, cfg);
    if (r.error || !r.data) return { paid: false };
    const s = String(r.data.status || "").toUpperCase();
    const amt = Number(r.data.amount);
    return { paid: s === "SUCCESS" && Number.isFinite(amt) && amt >= Number(expectedAmount) };
  } catch (err) {
    return { paid: false };
  }
}

async function queryBalance(cfg) {
  try {
    const r = await request("GET", "/v1/accounts/balance", null, cfg);
    if (r.error || !r.data) return { error: r.error || "Failed to get balance" };
    return { data: { balance: Number(r.data.amount || 0), currency: r.data.currency || "NGN" } };
  } catch (err) {
    return { error: err.message };
  }
}

module.exports = {
  getConfig, createVirtualAccount, listBanks, resolveAccount, createTransfer, verifyTransfer,
  isVirtualAccountPaid, queryBalance,
};
