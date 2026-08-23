import React from "react";
import { Sun, Moon } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";

export default function ThemeToggle({ className = "" }) {
  const { theme, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      data-testid="theme-toggle"
      aria-label="Toggle theme"
      className={`relative inline-flex items-center justify-center w-9 h-9 rounded-full border border-[color:var(--border-default)] bg-[color:var(--surface)] hover:bg-[color:var(--surface-alt)] transition-colors ${className}`}
    >
      {theme === "dark"
        ? <Sun className="w-4 h-4 text-[color:var(--gold)]" />
        : <Moon className="w-4 h-4 text-[color:var(--brand)]" />}
    </button>
  );
}
