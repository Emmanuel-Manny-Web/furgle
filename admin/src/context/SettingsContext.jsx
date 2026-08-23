/* Settings context — loads the public app settings ONCE at app start and shares
 * them across every page. This guarantees settings-dependent UI (deposit mode
 * badge, min/max limits, home featured/secondary sections, security questions,
 * etc.) is available before a user page renders, so nothing flashes with stale
 * defaults before the real values arrive. */
import React, { createContext, useContext, useEffect, useState } from "react";
import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL || ""}/api`;

const SettingsContext = createContext({
  settings: {},
  loaded: false,
  refresh: () => {},
});

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState({});
  const [loaded, setLoaded] = useState(false);

  const load = async () => {
    try {
      const { data } = await axios.get(`${API}/settings/public`);
      setSettings(data || {});
    } catch {
      setSettings({});
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, loaded, refresh: load }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}
