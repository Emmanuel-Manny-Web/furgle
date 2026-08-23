import { useCallback, useEffect, useRef, useState } from "react";
import { getAdminToken, getUserToken } from "@/lib/api";

// Stale-while-revalidate cache for the admin panel. Cached data is shown
// immediately on mount while fresh data is fetched in the background.
//
// Uses sessionStorage (not localStorage) so sensitive admin data is cleared
// when the tab closes, and is namespaced per session identity so one admin's
// data is never shown to another.
const PREFIX = "ni_admin_cache:";

function cacheKey(key) {
  const identity = getAdminToken() || getUserToken() || "anon";
  return PREFIX + identity + ":" + key;
}

export function readCache(key) {
  try {
    const raw = sessionStorage.getItem(cacheKey(key));
    return raw ? JSON.parse(raw).v : undefined;
  } catch {
    return undefined;
  }
}

export function writeCache(key, value) {
  try {
    sessionStorage.setItem(cacheKey(key), JSON.stringify({ t: Date.now(), v: value }));
  } catch {
    /* ignore quota / private-mode errors */
  }
}

export function useCachedData(key, fetcher) {
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const [state, setState] = useState(() => {
    const cached = readCache(key);
    return { data: cached, loading: cached === undefined };
  });

  const reload = useCallback(async () => {
    try {
      const fresh = await fetcherRef.current();
      setState({ data: fresh, loading: false });
      writeCache(key, fresh);
      return fresh;
    } catch {
      return null;
    }
  }, [key]);

  useEffect(() => {
    let alive = true;
    fetcherRef
      .current()
      .then((fresh) => {
        if (!alive) return;
        setState({ data: fresh, loading: false });
        writeCache(key, fresh);
      })
      .catch(() => {
        if (alive) setState((s) => ({ ...s, loading: false }));
      });
    return () => {
      alive = false;
    };
  }, [key]);

  return { data: state.data, loading: state.loading, reload };
}
