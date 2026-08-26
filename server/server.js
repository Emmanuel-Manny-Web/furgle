require("./env");

const express = require("express");
const fs = require("fs");
const path = require("path");
const { init, db } = require("./db");
const { seed } = require("./seed");
const routes = require("./routes");
const { processDuePayouts } = require("./payouts");
const { pollAll, checkStuckPayouts } = require("./polling");
const { consumeProxyRequests } = require("./proxy");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Prevent caching of all responses so clients always get fresh data
app.use((req, res, next) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  next();
});

// Local API (fully self-contained, no external calls)
app.use("/api", routes);

// ---- Admin panel (built from admin/) ----
const ADMIN_DIST = path.join(__dirname, "..", "admin", "build");

// Admin static assets (JS/CSS). Prefer the freshly built bundle; fall back to
// the legacy pre-built bundle until `npm run build` has produced admin/build.
app.use("/static", express.static(path.join(ADMIN_DIST, "static")));
app.use("/static", express.static(path.join(__dirname, "..", "static")));
app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));
const LEGACY_ROOT_ASSETS = [
  "favicon.png",
  "evoque-nova-logo.png",
  "evoque-nova.jpg",
  "furgle-logo.png",
];
for (const f of LEGACY_ROOT_ASSETS) {
  app.get("/" + f, (req, res) => res.sendFile(path.join(__dirname, "..", f)));
}

// Admin SPA — served under /pentest. Prefers the built bundle when present.
app.use("/pentest", (req, res, next) => {
  if (req.path.startsWith("/static") || req.path.startsWith("/uploads")) {
    return next();
  }
  const builtHtml = path.join(ADMIN_DIST, "index.html");
  const html = fs.existsSync(builtHtml) ? builtHtml : path.join(__dirname, "..", "index.html");
  res.sendFile(html);
});

// ---- New user-facing SPA (built from client/) ----
const CLIENT_DIST = path.join(__dirname, "..", "client", "dist");
app.use(express.static(CLIENT_DIST));

// SPA fallback for the new app.
app.get("*", (req, res) => {
  res.sendFile(path.join(CLIENT_DIST, "index.html"));
});

async function main() {
  await init();
  await seed();

  app.listen(PORT, () => {
    console.log(`Furgle clone running at http://localhost:${PORT}`);
    console.log(`Main site:    http://localhost:${PORT}`);
    console.log(`Admin panel:  http://localhost:${PORT}/pentest/fuser/login`);
    console.log(`Database:     PostgreSQL (${process.env.DATABASE_URL || "postgres://localhost:5432/furgle"})`);
  });

  // Credit due daily profits on startup and every 5 minutes thereafter.
  try {
    await processDuePayouts();
  } catch (err) {
    console.error("Payout processing error:", err.message);
  }
  setInterval(() => {
    processDuePayouts().catch((err) => console.error("Payout processing error:", err.message));
  }, 5 * 60 * 1000);

  // Auto-poll gateway order statuses (fallback to webhooks) every 30 seconds.
  const POLL_INTERVAL = Number(process.env.POLL_INTERVAL_MS || 30000);
  setInterval(() => {
    pollAll().catch((err) => console.error("Auto-poll error:", err.message));
  }, POLL_INTERVAL);

  // Flag payouts stuck in "processing" (e.g. webhook-only gateways) every 5 min.
  setInterval(() => {
    checkStuckPayouts().catch((err) => console.error("Stuck-payout check error:", err.message));
  }, 5 * 60 * 1000);

  // Flush the in-memory Fixie proxy request counter to settings every minute so
  // the admin dashboard's usage meter tracks every outbound gateway request
  // (all gateways share the same proxy), not just Nomba payouts.
  setInterval(() => {
    flushProxyUsage().catch((err) => console.error("Proxy usage flush error:", err.message));
  }, 60 * 1000);
}

async function flushProxyUsage() {
  const n = consumeProxyRequests();
  if (n <= 0) return;
  const row = await db.get("SELECT value FROM settings WHERE key = 'fixie_usage_count'");
  const next = Number(row ? row.value : 0) + n;
  await db.run(
    "INSERT INTO settings (key, value) VALUES ('fixie_usage_count', ?), ('fixie_usage_synced_at', ?) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
    String(next), new Date().toISOString()
  );
}

main().catch((err) => {
  console.error("Failed to start:", err && err.message ? err.message : String(err));
  if (err && Array.isArray(err.errors) && err.errors.length) {
    for (const e of err.errors) console.error("  -", e && e.message ? e.message : e);
  }
  process.exit(1);
});
