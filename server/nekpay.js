const crypto = require("crypto");
const https = require("https");
const { stringify } = require("querystring");
const { getProxyAgent } = require("./proxy");

const BASE = "https://api.nekpayment.com";

function getConfig(settings) {
  const s = settings || {};
  return {
    mchtId: s.nekpay_mcht_id || process.env.NEKPAY_MCHT_ID || "",
    paymentKey: s.nekpay_payment_key || process.env.NEKPAY_PAYMENT_KEY || "",
    secretKey: s.nekpay_secret_key || process.env.NEKPAY_SECRET_KEY || "",
    channelCode: s.nekpay_channel_code || process.env.NEKPAY_CHANNEL_CODE || "",
    notifyUrl: s.nekpay_notify_url || process.env.NEKPAY_NOTIFY_URL || "",
    proxyUrl: s.fixie_proxy_url || process.env.FIXIE_PROXY_URL || "",
  };
}

// MD5 signature (lowercase hex): sort keys, join "k=v&k=v", append "&key=SECRET".
// `sign` / `signType` / `sign_type` are never part of the signed string.
function sign(params, key) {
  const keys = Object.keys(params)
    .filter((k) => !["sign", "sign_type", "signType"].includes(k))
    .filter((k) => {
      const v = params[k];
      if (v === null || v === undefined) return false;
      return String(v).length > 0;
    })
    .sort((a, b) => {
      const la = a.toLowerCase();
      const lb = b.toLowerCase();
      return la < lb ? -1 : la > lb ? 1 : 0;
    });
  const str = keys.map((k) => `${k}=${params[k]}`).join("&") + `&key=${key}`;
  return crypto.createHash("md5").update(str, "utf8").digest("hex").toLowerCase();
}

// Low-level POST (application/x-www-form-urlencoded). Response is JSON.
function post(path, body, cfg) {
  return new Promise((resolve, reject) => {
    const payload = stringify(body);
    const url = new URL(BASE + path);
    const agent = getProxyAgent(cfg && cfg.proxyUrl, { track: true });
    const req = https.request(
      {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: "POST",
        ...(agent ? { agent } : {}),
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
    req.setTimeout(30000, () => req.destroy(new Error("Nekpay request timed out")));
    req.write(payload);
    req.end();
  });
}

function nowStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// Collection (deposit) — creates an order and returns a redirect payment URL.
async function createDeposit(params, cfg) {
  const body = {
    version: "1.0",
    mch_id: cfg.mchtId,
    mch_order_no: params.mchOrderNo,
    notify_url: params.notifyUrl || cfg.notifyUrl || "",
    page_url: params.returnUrl || "",
    pay_type: cfg.channelCode || params.payType || "",
    order_date: nowStr(),
    goods_name: params.goodsName || "Deposit",
    trade_amount: String(params.amount),
  };
  // Optional fields must be omitted (not sent) when empty.
  for (const k of Object.keys(body)) if (body[k] === "" || body[k] == null) delete body[k];
  body.sign_type = "MD5";
  body.sign = sign(body, cfg.paymentKey);

  try {
    const r = await post("/pay/web", body, cfg);
    if (!r.body) return { error: "Nekpay returned an empty response" };
    if (r.body.respCode && r.body.respCode !== "SUCCESS") {
      return { error: r.body.tradeMsg || r.body.respMsg || r.body.errorMsg || "Nekpay collection failed" };
    }
    return { data: { payUrl: r.body.payInfo || r.body.payUrl || null, orderNo: r.body.orderNo || null, mchOrderNo: body.mch_order_no } };
  } catch (err) {
    return { error: err.message };
  }
}

// Payment on behalf (payout) — creates a transfer order.
async function createPayout(params, cfg) {
  const body = {
    sign_type: "MD5",
    mch_id: cfg.mchtId,
    mch_transferId: params.mchTransferId,
    transfer_amount: Number(params.amount).toFixed(2),
    apply_date: nowStr(),
    bank_code: String(params.bankCode),
    receive_name: params.accountName || "Customer",
    receive_account: String(params.accountNumber),
  };
  if (params.remark) body.remark = params.remark;
  const backUrl = params.notifyUrl || cfg.notifyUrl;
  if (backUrl) body.back_url = backUrl;
  body.sign = sign(body, cfg.secretKey);

  try {
    const r = await post("/pay/transfer", body, cfg);
    if (!r.body) return { error: "Nekpay returned an empty response" };
    if (r.body.respCode && r.body.respCode !== "SUCCESS") {
      return { error: r.body.errorMsg || r.body.respMsg || "Nekpay payout failed" };
    }
    return { data: { tradeNo: r.body.tradeNo || null, tradeResult: r.body.tradeResult, mchTransferId: body.mch_transferId } };
  } catch (err) {
    return { error: err.message };
  }
}

// Nekpay Nigerian bank codes (NGRxxx). Used to translate the stored bank name
// into the code Nekpay expects for a payout.
const BANKS = [
  { code: "NGR044", name: "Access Bank" },
  { code: "NGR050", name: "Ecobank Nigeria" },
  { code: "NGR070", name: "Fidelity Bank" },
  { code: "NGR071", name: "First Bank of Nigeria" },
  { code: "NGR214", name: "First City Monument Bank" },
  { code: "NGR058", name: "Guaranty Trust Bank" },
  { code: "NGR301", name: "Jaiz Bank" },
  { code: "NGR082", name: "Keystone Bank" },
  { code: "NGR076", name: "Polaris Bank" },
  { code: "NGR101", name: "Providus Bank" },
  { code: "NGR221", name: "Stanbic IBTC Bank" },
  { code: "NGR068", name: "Standard Chartered Bank" },
  { code: "NGR232", name: "Sterling Bank" },
  { code: "NGR100", name: "Suntrust Bank" },
  { code: "NGR302", name: "TAJ Bank" },
  { code: "NGR032", name: "Union Bank of Nigeria" },
  { code: "NGR033", name: "United Bank For Africa" },
  { code: "NGR215", name: "Unity Bank" },
  { code: "NGR566", name: "VFD Microfinance Bank" },
  { code: "NGR035", name: "Wema Bank" },
  { code: "NGR057", name: "Zenith Bank" },
  { code: "NGR031", name: "Premium Trust Bank" },
  { code: "NGR999993", name: "Moniepoint MFB" },
  { code: "NGR999991", name: "PalmPay" },
  { code: "NGR526", name: "Parallex Bank" },
  { code: "NGR801", name: "Abbey Mortgage Bank" },
  { code: "NGR5310", name: "Sparkle Microfinance Bank" },
];

module.exports = { BASE, sign, getConfig, createDeposit, createPayout, BANKS };
