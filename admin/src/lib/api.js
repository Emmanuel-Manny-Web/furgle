import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "";
export const API_BASE = `${BACKEND_URL}/api`;

/**
 * Three independent token slots:
 *   localStorage.ni_admin_token   → admin session (persistent, separate from user)
 *   sessionStorage.ni_token       → impersonation tab (per-tab)
 *   localStorage.ni_token         → regular user session (persistent)
 *
 * Token selection by URL:
 *   /admin/*   → ni_admin_token (falls back to user token if admin not logged in)
 *   anything else → sessionStorage.ni_token (impersonation) > localStorage.ni_token > ni_admin_token
 */
export const getAdminToken = () => localStorage.getItem("ni_admin_token");
export const getUserToken = () =>
  sessionStorage.getItem("ni_token") || localStorage.getItem("ni_token");

export const getStoredToken = () => getUserToken() || getAdminToken();

export function pickTokenForUrl(url = "") {
  const isAdminEndpoint = url.startsWith("/admin") || url.includes("/api/admin");
  // On admin pages, prefer the admin token for EVERY call (including /auth/me, /banks/*, etc.)
  // so refresh() returns the admin user not the regular user.
  const onAdminRoute = typeof window !== "undefined" && window.location.pathname.startsWith("/pentest/fuser");
  if (isAdminEndpoint || onAdminRoute) {
    return getAdminToken() || getUserToken();
  }
  return getUserToken() || getAdminToken();
}

export const api = axios.create({
  baseURL: API_BASE,
});

api.interceptors.request.use((config) => {
  const token = pickTokenForUrl(config.url || "");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err?.response?.status === 401) {
      // Clear ONLY the token that was rejected. A logged-in regular user hitting an
      // /admin/* endpoint legitimately gets 401 — don't kick out their user session.
      const url = err?.config?.url || "";
      const isAdminEndpoint = url.startsWith("/admin") || url.includes("/api/admin");
      if (isAdminEndpoint) {
        localStorage.removeItem("ni_admin_token");
        localStorage.removeItem("ni_admin_user");
      } else {
        sessionStorage.removeItem("ni_token");
        sessionStorage.removeItem("ni_user");
        localStorage.removeItem("ni_token");
        localStorage.removeItem("ni_user");
      }
    }
    return Promise.reject(err);
  },
);
