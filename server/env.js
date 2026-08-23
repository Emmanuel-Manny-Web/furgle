const fs = require("fs");
const path = require("path");

function loadEnv(file = path.join(__dirname, ".env")) {
  try {
    if (!fs.existsSync(file)) return;
    const content = fs.readFileSync(file, "utf8");
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (key && !(key in process.env)) {
        process.env[key] = value;
      }
    }
  } catch (err) {
    // Ignore malformed .env files; fall back to real environment.
  }
}

loadEnv();

module.exports = { loadEnv };
