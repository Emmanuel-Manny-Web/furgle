const crypto = require("crypto");
const https = require("https");
const { getProxyAgent } = require("./proxy");

const GATEWAY = process.env.JUNTPAY_GATEWAY_URL || "https://payment.juntpay.top";

// ---- config resolution (admin settings override .env) ----
function getConfig(settings) {
  const s = settings || {};
  return {
    appId: s.juntpay_app_id || process.env.JUNTPAY_APP_ID || "",
    merchantId: s.juntpay_merchant_id || process.env.JUNTPAY_MERCHANT_ID || "",
    secretKey: s.juntpay_secret_key || process.env.JUNTPAY_SECRET_KEY || "",
    depositWayCode: s.juntpay_deposit_way_code || process.env.JUNTPAY_DEPOSIT_WAY_CODE || "",
    payoutWayCode: s.juntpay_payout_way_code || process.env.JUNTPAY_PAYOUT_WAY_CODE || "BANK_ACCOUNT",
    notifyUrl: s.juntpay_notify_url || process.env.JUNTPAY_NOTIFY_URL || "",
    amountScale: Number(process.env.JUNTPAY_AMOUNT_SCALE || 1),
    proxyUrl: s.fixie_proxy_url || process.env.FIXIE_PROXY_URL || "",
  };
}

// ---- signature (MD5, uppercase) ----
// 1. sort keys ASCII (case-insensitive), skip empty/null values
// 2. join "k=v&k=v", then append "&key=SECRET"
// 3. MD5 -> uppercase
function sign(params, secretKey) {
  const keys = Object.keys(params)
    .filter((k) => {
      const v = params[k];
      if (v === null || v === undefined) return false;
      if (typeof v === "number") return true;
      if (typeof v === "boolean") return true;
      return String(v).length > 0;
    })
    .sort((a, b) => {
      const la = a.toLowerCase();
      const lb = b.toLowerCase();
      return la < lb ? -1 : la > lb ? 1 : 0;
    });

  const pairs = keys.map((k) => {
    let v = params[k];
    if (typeof v === "object") v = JSON.stringify(v);
    return `${k}=${v}`;
  });

  const str = pairs.join("&") + `&key=${secretKey}`;
  return crypto.createHash("md5").update(str, "utf8").digest("hex").toUpperCase();
}

// ---- low-level HTTPS POST ----
function post(path, body, cfg) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const url = new URL(GATEWAY + path);
    const agent = getProxyAgent(cfg && cfg.proxyUrl, { track: true });
    const req = https.request(
      {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: "POST",
        ...(agent ? { agent } : {}),
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          let json = null;
          try {
            json = JSON.parse(data);
          } catch (e) {
            json = null;
          }
          resolve({ status: res.statusCode, body: json, raw: data });
        });
      }
    );
    req.on("error", (err) => reject(err));
    req.setTimeout(20000, () => req.destroy(new Error("JuntPay request timed out")));
    req.write(payload);
    req.end();
  });
}

// ---- generic signed call ----
async function call(endpoint, params, cfg) {
  const body = {
    ...params,
    appId: params.appId || cfg.appId,
    mchNo: params.mchNo || cfg.merchantId,
    reqTime: Math.floor(Date.now() / 1000),
    version: params.version || "1.0",
  };
  delete body.sign;
  body.sign = sign(body, cfg.secretKey);

  try {
    const result = await post(endpoint, body, cfg);
    if (result.status >= 500) {
      return { error: "JuntPay gateway error (HTTP " + result.status + ")" };
    }
    if (!result.body) {
      return { error: "JuntPay returned an empty response" };
    }
    if (result.body.code !== 0) {
      return { error: result.body.msg || "JuntPay request failed" };
    }
    return { data: result.body.data, raw: result.body };
  } catch (err) {
    return { error: (err && err.message) || "JuntPay request failed" };
  }
}

function scaleAmount(amount, cfg) {
  const n = Number(amount);
  return n * (cfg.amountScale || 1);
}

// ---- Deposit (代收 / collection) ----
async function createDeposit(params, cfg) {
  return call(
    "/api/v1/payment/createOrder",
    {
      mchOrderNo: params.mchOrderNo,
      amount: scaleAmount(params.amount, cfg),
      wayCode: params.wayCode || cfg.depositWayCode,
      currency: "NGN",
      subject: params.subject || "Deposit",
      customerName: params.customerName || "Customer",
      customerEmail: params.customerEmail || "customer@example.com",
      customerMobile: params.customerMobile || "",
      notifyUrl: params.notifyUrl || cfg.notifyUrl || "",
      returnUrl: params.returnUrl || "",
      extParam: params.extParam ? JSON.stringify(params.extParam) : "",
    },
    cfg
  );
}

async function queryPayment(mchOrderNo, cfg) {
  return call("/api/v1/payment/queryOrder", { mchOrderNo }, cfg);
}

// ---- Payout (代付 / transfer) ----
async function createPayout(params, cfg) {
  return call(
    "/api/v1/payout/createOrder",
    {
      mchOrderNo: params.mchOrderNo,
      amount: String(scaleAmount(params.amount, cfg)),
      wayCode: params.wayCode || cfg.payoutWayCode,
      currency: "NGN",
      transferDesc: params.transferDesc || "Payout",
      accountNumber: params.accountNumber,
      bankCode: params.bankCode,
      customerName: params.customerName || "Customer",
      customerMobile: params.customerMobile || "",
      customerEmail: params.customerEmail || "customer@example.com",
      notifyUrl: params.notifyUrl || cfg.notifyUrl || "",
      extParam: params.extParam ? JSON.stringify(params.extParam) : "",
    },
    cfg
  );
}

async function queryPayout(mchOrderNo, cfg) {
  return call("/api/v1/payout/queryOrder", { mchOrderNo }, cfg);
}

// ---- Balance ----
async function queryBalance(cfg) {
  return call("/api/v1/merchant/queryBalance", { currency: "NGN" }, cfg);
}

// ---- Bank list (cached) ----
let bankCache = { at: 0, list: null };
async function queryBankList(cfg, force) {
  if (!force && bankCache.list && Date.now() - bankCache.at < 10 * 60 * 1000) {
    return { data: bankCache.list };
  }
  const result = await call("/api/v1/merchant/queryBankCode", {}, cfg);
  if (result.error) return result;
  bankCache = { at: Date.now(), list: result.data };
  return { data: result.data };
}

module.exports = {
  GATEWAY,
  sign,
  getConfig,
  createDeposit,
  queryPayment,
  createPayout,
  queryPayout,
  queryBalance,
  queryBankList,
};
