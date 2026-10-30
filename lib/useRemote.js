"use client";

import { useCallback, useEffect, useState } from "react";

// Tiny fetch hook with a 5-minute in-memory cache, so switching tabs doesn't refetch calendars/mail every time.
const cache = new Map();

export function useRemote(url, { ttl = 5 * 60e3, enabled = true } = {}) {
  const hit = cache.get(url);
  const [state, setState] = useState(hit ? { data: hit.data, loading: false, error: null } : { data: null, loading: enabled, error: null });

  const load = useCallback(
    async (force = false) => {
      if (!url || !enabled) return;
      const c = cache.get(url);
      if (!force && c && Date.now() - c.t < ttl) {
        setState({ data: c.data, loading: false, error: null });
        return;
      }
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const res = await fetch(url, { cache: "no-store" });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.error || `Request failed (${res.status})`);
        cache.set(url, { t: Date.now(), data: j });
        setState({ data: j, loading: false, error: null });
      } catch (e) {
        setState((s) => ({ ...s, loading: false, error: String(e.message || e) }));
      }
    },
    [url, ttl, enabled]
  );

  useEffect(() => { load(); }, [load]);
  return { ...state, reload: () => load(true) };
}

export const clearRemote = () => cache.clear();

// Local YYYY-MM-DD for an ISO timestamp or date-only string
export const localDay = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? s : new Date(s).toLocaleDateString("en-CA"));
export const localTime = (s) => new Date(s).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
