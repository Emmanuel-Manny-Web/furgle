import React, { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { relativeTime } from "@/lib/format";

/**
 * Tiny "polled Xs ago" badge that auto-ticks every second so the relative time stays fresh
 * without forcing a network refetch.
 *
 * Renders nothing if `iso` is falsy.
 */
export default function LastPolledBadge({ iso, testid }) {
  const [, setNow] = useState(0);
  useEffect(() => {
    if (!iso) return undefined;
    const id = setInterval(() => setNow((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [iso]);

  if (!iso) return null;
  const rel = relativeTime(iso);
  if (!rel) return null;

  return (
    <span
      data-testid={testid}
      title={`Last auto-polled: ${new Date(iso).toLocaleString()}`}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider bg-[color:var(--surface-alt)] text-[color:var(--text-tertiary)] border border-[color:var(--border-default)] whitespace-nowrap"
    >
      <RefreshCw className="w-2.5 h-2.5" />
      polled {rel}
    </span>
  );
}
