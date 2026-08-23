export function formatNaira(amount, opts = {}) {
  const { compact = false, exact = false } = opts;
  const n = Number(amount || 0);
  if (compact && Math.abs(n) >= 1000) {
    return "₦" + new Intl.NumberFormat("en-NG", { notation: "compact", maximumFractionDigits: 1 }).format(n);
  }
  // exact: show the precise value, dropping trailing .00 for whole numbers.
  if (exact) {
    return "₦" + new Intl.NumberFormat("en-NG", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);
  }
  return "₦" + new Intl.NumberFormat("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

export function formatDate(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" });
  } catch { return iso; }
}

export function relativeTime(iso) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  const diffSec = (Date.now() - t) / 1000;
  const future = diffSec < 0;
  const abs = Math.abs(diffSec);
  let body;
  if (abs < 60) body = `${Math.max(0, Math.floor(abs))}s`;
  else if (abs < 3600) body = `${Math.floor(abs / 60)}m`;
  else if (abs < 86400) body = `${Math.floor(abs / 3600)}h`;
  else body = `${Math.floor(abs / 86400)}d`;
  return future ? `in ${body}` : `${body} ago`;
}


export function timeUntilNextPayout(lastPayoutIso) {
  if (!lastPayoutIso) return "—";
  try {
    const last = new Date(lastPayoutIso).getTime();
    const next = last + 24 * 3600 * 1000;
    const diff = next - Date.now();
    if (diff <= 0) return "Due now";
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    return `${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
  } catch { return "—"; }
}
