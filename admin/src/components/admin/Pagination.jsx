import React, { useState, useEffect, useRef } from "react";

/**
 * Reusable admin table pagination footer.
 *
 * Layout: "Showing X – Y of N    [Previous] [Page X of Y] [Go to: __ Go] [Next]"
 *
 * - Self-clamps `page` to the valid range whenever totalPages shrinks.
 * - Jump-to-page input commits on Enter, on blur, or on the "Go" button.
 * - Hidden when there are zero items.
 *
 * Keyboard shortcuts (active page-wide when no input/textarea focused):
 *   ←  /  →   — previous / next page
 *   g g       — focus the jump-to-page input
 */
export default function Pagination({
  page,
  setPage,
  totalItems,
  pageSize,
  testidPrefix = "page",
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const [jump, setJump] = useState("");
  const jumpInputRef = useRef(null);
  const lastGRef = useRef(0);

  // Keep page within bounds if list shrinks/grows.
  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage, setPage]);

  // Keyboard shortcuts.
  useEffect(() => {
    if (!totalItems) return undefined;
    const handler = (e) => {
      // Ignore when typing in any editable element.
      const t = e.target;
      const tag = (t?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || t?.isContentEditable) {
        return;
      }
      // Ignore when a modifier key is pressed — we don't want to fight browser shortcuts.
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === "ArrowLeft") {
        if (safePage > 1) {
          e.preventDefault();
          setPage((p) => Math.max(1, p - 1));
        }
      } else if (e.key === "ArrowRight") {
        if (safePage < totalPages) {
          e.preventDefault();
          setPage((p) => Math.min(totalPages, p + 1));
        }
      } else if (e.key === "g" || e.key === "G") {
        const now = Date.now();
        if (now - lastGRef.current < 500 && totalPages > 1) {
          lastGRef.current = 0;
          e.preventDefault();
          jumpInputRef.current?.focus();
          jumpInputRef.current?.select();
        } else {
          lastGRef.current = now;
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [totalItems, totalPages, safePage, setPage]);

  if (!totalItems) return null;

  const commitJump = () => {
    const n = parseInt(jump, 10);
    if (!Number.isFinite(n)) { setJump(""); return; }
    const clamped = Math.min(totalPages, Math.max(1, n));
    setPage(clamped);
    setJump("");
  };

  return (
    <div
      className="flex items-center justify-between gap-3 p-4 border-t border-[color:var(--border-default)] flex-wrap"
      data-testid={`${testidPrefix}-pagination`}
    >
      <div className="text-[11px] text-[color:var(--text-tertiary)] tabular-nums">
        Showing <span className="font-bold text-[color:var(--text-primary)]">{(safePage - 1) * pageSize + 1}</span>
        {" – "}
        <span className="font-bold text-[color:var(--text-primary)]">{Math.min(safePage * pageSize, totalItems)}</span>
        {" of "}
        <span className="font-bold text-[color:var(--text-primary)]">{totalItems}</span>
        {totalPages > 1 && (
          <span className="hidden md:inline ml-3 text-[10px] tracking-wider uppercase text-[color:var(--text-tertiary)]/70">
            <kbd className="px-1.5 py-0.5 rounded border border-[color:var(--border-default)] font-mono text-[10px]">←</kbd>
            <kbd className="px-1.5 py-0.5 rounded border border-[color:var(--border-default)] font-mono text-[10px] ml-1">→</kbd>
            <span className="mx-1.5">flip</span>
            <kbd className="px-1.5 py-0.5 rounded border border-[color:var(--border-default)] font-mono text-[10px]">g g</kbd>
            <span className="ml-1.5">jump</span>
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={safePage <= 1}
          data-testid={`${testidPrefix}-prev`}
          className="px-3 py-1.5 rounded-md text-xs font-semibold border border-[color:var(--border-default)] text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-alt)] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Previous
        </button>

        <span
          className="text-xs font-bold text-[color:var(--text-primary)] tabular-nums px-2"
          data-testid={`${testidPrefix}-indicator`}
        >
          Page {safePage} of {totalPages}
        </span>

        {totalPages > 1 && (
          <div className="flex items-center gap-1.5">
            <label
              htmlFor={`${testidPrefix}-jump-input`}
              className="text-[10px] uppercase tracking-wider font-bold text-[color:var(--text-tertiary)]"
            >
              Go to
            </label>
            <input
              id={`${testidPrefix}-jump-input`}
              ref={jumpInputRef}
              type="number"
              min={1}
              max={totalPages}
              value={jump}
              onChange={(e) => setJump(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitJump(); } }}
              onBlur={() => { if (jump !== "") commitJump(); }}
              placeholder={String(safePage)}
              data-testid={`${testidPrefix}-jump`}
              className="w-14 px-2 py-1 rounded-md text-xs text-center font-semibold tabular-nums bg-[color:var(--surface-alt)] border border-[color:var(--border-default)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent-main)]/40 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            <button
              type="button"
              onClick={commitJump}
              disabled={!jump}
              data-testid={`${testidPrefix}-jump-go`}
              className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-[color:var(--accent-main)] hover:bg-[color:var(--accent-hover)] text-white disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Go
            </button>
          </div>
        )}

        <button
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={safePage >= totalPages}
          data-testid={`${testidPrefix}-next`}
          className="px-3 py-1.5 rounded-md text-xs font-semibold border border-[color:var(--border-default)] text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-alt)] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>
    </div>
  );
}
