import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

export function Protected({ children, admin = false }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-[color:var(--text-secondary)] text-sm">Loading…</div>
      </div>
    );
  }
  if (!user) return <Navigate to={admin ? "/pentest/fuser/login" : "/login"} replace />;
  if (admin && !user.is_admin) return <Navigate to="/dashboard" replace />;
  // Admins can preview user routes — they're authorised for both surfaces.
  return children;
}
