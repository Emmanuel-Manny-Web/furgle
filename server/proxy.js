const { HttpsProxyAgent } = require("https-proxy-agent");

// One cached agent per proxy URL (we now use two proxies: Fixie for
// JuntPay/Nekpay, lumenhubtech.com for everything else).
const _agents = new Map();
let _requests = 0;

// Returns a cached HttpsProxyAgent for the given outbound proxy URL.
// Falls back to FIXIE_PROXY_URL when no URL is provided.
// Pass { track: true } for requests that should count toward the Fixie
// usage meter (only JuntPay/Nekpay route through Fixie now).
function getProxyAgent(url, { track } = {}) {
  const target = url || process.env.FIXIE_PROXY_URL || "";
  if (!target) return undefined;
  if (track) _requests += 1;
  if (_agents.has(target)) return _agents.get(target);
  const agent = new HttpsProxyAgent(target);
  _agents.set(target, agent);
  return agent;
}

// Number of Fixie-routed requests since the last flush.
function consumeProxyRequests() {
  const n = _requests;
  _requests = 0;
  return n;
}

module.exports = { getProxyAgent, consumeProxyRequests };
