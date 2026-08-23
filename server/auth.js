const jwt = require("jsonwebtoken");
const { db } = require("./db");
const { processUserPayouts } = require("./payouts");

const JWT_SECRET = process.env.JWT_SECRET || "naaturalis-local-dev-secret-key-2026";

async function getSessionEpoch() {
  try {
    const row = await db.get("SELECT value FROM settings WHERE key = 'session_epoch'");
    const n = row ? Number(row.value) : 0;
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

async function generateToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      is_admin: !!user.is_admin,
      role: user.is_admin ? "admin" : "user",
      epoch: await getSessionEpoch(),
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

async function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ detail: "Not authenticated" });
  }
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET);
    // Non-admin sessions are invalidated when the session epoch is bumped.
    if (payload.role !== "admin" && (payload.epoch ?? 0) !== (await getSessionEpoch())) {
      return res.status(401).json({ detail: "Session expired — please sign in again" });
    }
    try {
      await processUserPayouts(payload.sub);
    } catch (err) {
      console.error("Payout processing error:", err.message);
    }
    const user = await db.get("SELECT * FROM users WHERE id = ?", payload.sub);
    if (!user) return res.status(401).json({ detail: "User not found" });
    if (user.is_blocked) return res.status(403).json({ detail: "Account blocked" });
    req.user = user;
    req.auth = payload;
    next();
  } catch {
    return res.status(401).json({ detail: "Invalid token" });
  }
}

function adminMiddleware(req, res, next) {
  if (!req.user || !req.user.is_admin) {
    return res.status(403).json({ detail: "Admin access required" });
  }
  // Admin and user sessions use distinct tokens. Reject a user-issued token
  // even if the resolved account somehow carries admin privileges.
  if (req.auth && req.auth.role && req.auth.role !== "admin") {
    return res.status(403).json({ detail: "Admin access required" });
  }
  next();
}

module.exports = { JWT_SECRET, generateToken, authMiddleware, adminMiddleware };
