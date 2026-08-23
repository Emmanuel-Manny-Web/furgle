const BASE = "/api";

export function getToken() {
  return localStorage.getItem("ni_token") || "";
}

export function setSession(token, user) {
  localStorage.setItem("ni_token", token);
  if (user) localStorage.setItem("ni_user", JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem("ni_token");
  localStorage.removeItem("ni_user");
}

export function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem("ni_user") || "null");
  } catch {
    return null;
  }
}

export async function api(path, { method = "GET", body, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  const token = getToken();
  if (auth && token) headers["Authorization"] = "Bearer " + token;

  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error("Network error — please try again.");
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const detail = data && data.detail;
    const err = new Error(detail || "Something went wrong.");
    err.status = res.status;
    err.data = data;

    // A banned user is immediately signed out and sent back to login.
    if (res.status === 403 && detail === "Account blocked") {
      clearSession();
      if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
        window.location.href = "/login";
      }
    }
    throw err;
  }
  return data;
}

export function money(n, { compact = false, sign = "₦" } = {}) {
  const num = Number(n || 0);
  if (compact && Math.abs(num) >= 1_000_000) {
    return sign + (num / 1_000_000).toFixed(2).replace(/\.?0+$/, "") + "M";
  }
  if (compact && Math.abs(num) >= 1_000) {
    return sign + (num / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  }
  return (
    sign +
    num.toLocaleString("en-NG", { minimumFractionDigits: 0, maximumFractionDigits: 2 })
  );
}

function parseDate(iso) {
  if (!iso) return null;
  let s = String(iso);
  // Backend stores timestamps as UTC "YYYY-MM-DD HH:MM:SS" (no timezone).
  // new Date() would otherwise treat that as local time, shifting every
  // relative time by the timezone offset.
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) {
    s = s.replace(" ", "T") + "Z";
  }
  const t = new Date(s);
  return Number.isNaN(t.getTime()) ? null : t;
}

export function timeAgo(iso) {
  const t = parseDate(iso);
  if (!t) return "";
  const s = Math.floor((Date.now() - t.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  if (s < 86400) return Math.floor(s / 3600) + "h ago";
  return t.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function formatDateTime(iso) {
  const t = parseDate(iso);
  if (!t) return "";
  return t.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function addHours(iso, hours) {
  const t = parseDate(iso);
  if (!t) return null;
  return new Date(t.getTime() + hours * 60 * 60 * 1000);
}
