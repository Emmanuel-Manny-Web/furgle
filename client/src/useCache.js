import { useCallback, useEffect, useRef, useState } from "react";
import { getStoredUser } from "./api";

// Stale-while-revalidate cache backed by localStorage. On mount, cached data is
// returned immediately (no spinner) while fresh data is fetched in the
// background and swapped in when ready.
const PREFIX = "ni_cache:";

function cacheKey(key) {
  // Namespace per user so one account's data is never shown to another.
  const uid = getStoredUser()?.id || "anon";
  return PREFIX + uid + ":" + key;
}

function read(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw).v : undefined;
  } catch {
    return undefined;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify({ t: Date.now(), v: value }));
  } catch {
    /* ignore quota / private-mode errors */
  }
}

export function useCachedData(key, fetcher) {
  const k = cacheKey(key);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const [state, setState] = useState(() => {
    const cached = read(k);
    return { data: cached, loading: cached === undefined };
  });

  // Force a refresh (e.g. after a mutation) and update the cache.
  const reload = useCallback(async () => {
    try {
      const fresh = await fetcherRef.current();
      setState({ data: fresh, loading: false });
      write(k, fresh);
      return fresh;
    } catch {
      return null;
    }
  }, [k]);

  useEffect(() => {
    let alive = true;
    fetcherRef
      .current()
      .then((fresh) => {
        if (!alive) return;
        setState({ data: fresh, loading: false });
        write(k, fresh);
      })
      .catch(() => {
        if (alive) setState((s) => ({ ...s, loading: false }));
      });
    return () => {
      alive = false;
    };
  }, [k]);

  return { data: state.data, loading: state.loading, reload };
}
