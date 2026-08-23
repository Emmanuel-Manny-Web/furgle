/* Branding context — exposes the dynamic logo URL (uploaded by the admin) plus a
 * resolver. Falls back to the static `/furgle-logo.png` packaged in /public.
 * Also updates the document favicon whenever the logo URL changes. */
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import axios from "axios";

const DEFAULT_LOGO = `${process.env.PUBLIC_URL || ""}/furgle-logo.png`;
const API = `${process.env.REACT_APP_BACKEND_URL || ""}/api`;

const BrandingContext = createContext({
  logoUrl: DEFAULT_LOGO,
  rawLogoUrl: "",
  ready: false,
  refresh: () => {},
});

function resolveBackendUrl(u) {
  if (!u) return "";
  if (u.startsWith("http") || u.startsWith("//")) return u;
  return `${process.env.REACT_APP_BACKEND_URL || ""}${u}`;
}

export function BrandingProvider({ children }) {
  const [raw, setRaw] = useState("");
  const [ready, setReady] = useState(false);

  const load = async () => {
    try {
      const { data } = await axios.get(`${API}/settings/public`);
      setRaw(data?.brand_logo_url || "");
    } catch {
      setRaw("");
    } finally {
      setReady(true);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const logoUrl = useMemo(() => (raw ? resolveBackendUrl(raw) : DEFAULT_LOGO), [raw]);

  // Sync favicon dynamically
  useEffect(() => {
    if (!ready) return;
    let link = document.querySelector("link[rel='icon']");
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = logoUrl;
    let apple = document.querySelector("link[rel='apple-touch-icon']");
    if (!apple) {
      apple = document.createElement("link");
      apple.rel = "apple-touch-icon";
      document.head.appendChild(apple);
    }
    apple.href = logoUrl;
  }, [logoUrl, ready]);

  return (
    <BrandingContext.Provider value={{ logoUrl, rawLogoUrl: raw, ready, refresh: load }}>
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding() {
  return useContext(BrandingContext);
}
