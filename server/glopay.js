const crypto = require("crypto");
const https = require("https");
const { stringify } = require("querystring");

// GloPay (glopayment.net) — collection (deposit) and payment (payout) gateway.
//   Collection: POST /pay/order/actions/commit      (application/x-www-form-urlencoded)
//   Payment:    POST /payment/order/actions/commit   (application/x-www-form-urlencoded)
//   Callback:   POST <merchant notify URL>           (application/json)
//
// Signature: sign = md5( base64( hmac_sha512( sortedParams + "&gloKeys=" + key, key ) ) )
// where sortedParams is every non-empty param as "k=v" joined by "&", sorted by key.

const BASE = "https://www.glopayment.net";

function getConfig(settings) {
  const s = settings || {};
  return {
    mchId: s.glopay_mch_id || process.env.GLOPAY_MCH_ID || "",
    key: s.glopay_key || process.env.GLOPAY_KEY || "",
    collectionCode: s.glopay_collection_code || process.env.GLOPAY_COLLECTION_CODE || "",
    paymentCode: s.glopay_payment_code || process.env.GLOPAY_PAYMENT_CODE || "",
    baseUrl: s.glopay_base_url || process.env.GLOPAY_BASE_URL || BASE,
  };
}

// Build the GloPay signature for a parameter map.
function sign(params, key) {
  const keys = Object.keys(params)
    .filter((k) => params[k] !== null && params[k] !== undefined && String(params[k]).length > 0)
    .sort();
  const str = keys.map((k) => `${k}=${params[k]}`).join("&") + "&gloKeys=" + key;
  const hmac = crypto.createHmac("sha512", key).update(str, "utf8").digest("base64");
  return crypto.createHash("md5").update(hmac, "utf8").digest("hex").toLowerCase();
}

function post(path, body, cfg) {
  return new Promise((resolve, reject) => {
    const payload = stringify(body);
    const url = new URL(cfg.baseUrl + path);
    const req = https.request(
      {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          let json = null;
          try { json = JSON.parse(data); } catch { json = null; }
          resolve({ status: res.statusCode, body: json, raw: data });
        });
      }
    );
    req.on("error", reject);
    req.setTimeout(30000, () => req.destroy(new Error("GloPay request timed out")));
    req.write(payload);
    req.end();
  });
}

// Normalize a GloPay response. Success responses are plain { status, msg, url };
// error responses can be a wrapped Spring-style { body: { status, msg } }.
function unwrap(body) {
  if (body && body.body && typeof body.body === "object") return body.body;
  return body || {};
}

// Collection (deposit) — creates an order and returns a checkout URL.
async function createDeposit({ orderId, amount, name, email, mobile }, cfg) {
  const body = {
    merchantId: cfg.mchId,
    orderId,
    channelCode: cfg.collectionCode,
    amount: Number(amount).toFixed(2),
    name: name || "Customer",
    email: email || "customer@lumenhub.com",
    mobile: mobile || "08000000000",
  };
  body.sign = sign(body, cfg.key);

  try {
    const r = await post("/pay/order/actions/commit", body, cfg);
    const data = unwrap(r.body);
    if (String(data.status) !== "200") {
      return { error: data.msg || "GloPay collection failed" };
    }
    return { data: { payUrl: data.url || null } };
  } catch (err) {
    return { error: err.message };
  }
}

// Payment (payout) — creates a transfer to a bank account.
async function createPayout({ orderId, amount, name, account, bankCode, number, email, mobile }, cfg) {
  const body = {
    merchantId: cfg.mchId,
    orderId,
    channelCode: cfg.paymentCode,
    amount: Number(amount).toFixed(2),
    name: name || "Customer",
    account: String(account),
    bankCode: String(bankCode),
    number: String(number || account),
    email: email || "payout@lumenhub.com",
    mobile: mobile || "08000000000",
  };
  body.sign = sign(body, cfg.key);

  try {
    const r = await post("/payment/order/actions/commit", body, cfg);
    const data = unwrap(r.body);
    if (String(data.status) !== "200") {
      return { error: data.msg || "GloPay payment failed" };
    }
    return { data: { status: data.status, msg: data.msg } };
  } catch (err) {
    return { error: err.message };
  }
}

// Verify a callback signature. The callback body contains a `sign` field; all
// other fields are signed with the same algorithm.
function verifyCallback(body, key) {
  if (!body || !body.sign) return false;
  const { sign: sig, ...rest } = body;
  return sign(rest, key) === sig;
}

// GloPay Nigerian bank codes (sys_code), from the GloPay bank-code export.
const BANKS = [
  { code: "80000001", name: "Access Bank" },
  { code: "80000002", name: "Citibank Nigeria" },
  { code: "80000004", name: "Ecobank Nigeria" },
  { code: "80000005", name: "Enterprise Bank" },
  { code: "80000006", name: "Fidelity Bank" },
  { code: "80000007", name: "First Bank of Nigeria" },
  { code: "80000008", name: "First City Monument Bank" },
  { code: "80000009", name: "Guaranty Trust Bank" },
  { code: "80000010", name: "Heritage Bank" },
  { code: "80000011", name: "Jaiz Bank" },
  { code: "80000012", name: "Keystone Bank" },
  { code: "80000013", name: "MainStreet Bank" },
  { code: "80000014", name: "Parallex Bank" },
  { code: "80000015", name: "Providus Bank" },
  { code: "80000016", name: "Polaris Bank" },
  { code: "80000017", name: "Stanbic IBTC Bank" },
  { code: "80000018", name: "Standard Chartered Bank" },
  { code: "80000019", name: "Sterling Bank" },
  { code: "80000020", name: "Suntrust Bank" },
  { code: "80000021", name: "Union Bank of Nigeria" },
  { code: "80000022", name: "United Bank For Africa (UBA)" },
  { code: "80000023", name: "Unity Bank" },
  { code: "80000024", name: "Wema Bank" },
  { code: "80000025", name: "Zenith Bank" },
  { code: "80000026", name: "eTranzact PocketMoni" },
  { code: "80000027", name: "TAJ Bank" },
  { code: "80000028", name: "Kuda Bank" },
  { code: "80000029", name: "Moniepoint MFB" },
  { code: "80000030", name: "OPay" },
  { code: "80000032", name: "FINCA Nigeria" },
  { code: "80000033", name: "PalmPay" },
  { code: "80000034", name: "Rubies MFB" },
  { code: "80000035", name: "Titan Trust Bank" },
  { code: "80000036", name: "Coronation Merchant Bank" },
  { code: "80000037", name: "Rand Merchant Bank" },
  { code: "80000038", name: "PAGA" },
  { code: "80000039", name: "Jubilee Life Mortgage Bank" },
  { code: "80000040", name: "Globus Bank" },
  { code: "80000041", name: "NIRSAL Microfinance Bank" },
  { code: "80000042", name: "Hope PSB" },
  { code: "80000043", name: "Accion Microfinance Bank" },
  { code: "80000044", name: "VFD Microfinance Bank" },
  { code: "80000045", name: "Lotus Bank" },
  { code: "80000046", name: "FFS Microfinance Bank" },
  { code: "80000047", name: "Smartcash" },
  { code: "80000049", name: "Lapo Microfinance Bank" },
  { code: "80000050", name: "PremiumTrust Bank" },
  { code: "80000052", name: "Abbey Mortgage Bank" },
  { code: "80000053", name: "FairMoney" },
  { code: "80000068", name: "FSDH" },
  { code: "80000069", name: "Titan-Paystack Microfinance Bank" },
  { code: "80000076", name: "Momo PSB" },
  { code: "80000077", name: "Carbon" },
  { code: "80000097", name: "9 Payment Service Bank" },
  { code: "80000099", name: "Nomba" },
  { code: "80000100", name: "Branch International Financial Services" },
  { code: "80000101", name: "GoMoney" },
  { code: "80000106", name: "NowNow" },
  { code: "80000183", name: "Sparkle Microfinance Bank" },
];

module.exports = { BASE, sign, verifyCallback, getConfig, createDeposit, createPayout, BANKS };
