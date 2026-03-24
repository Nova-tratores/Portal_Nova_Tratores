"use client";

import { useEffect, useRef } from "react";

/**
 * Executa um callback quando a aba volta ao foco (visibilitychange).
 * Tem um intervalo mínimo entre refreshes para evitar chamadas excessivas.
 */
export function useRefreshOnFocus(callback: () => void, minInterval = 30_000) {
  const lastRefresh = useRef(Date.now());

  useEffect(() => {
    const handler = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastRefresh.current < minInterval) return;
      lastRefresh.current = Date.now();
      callback();
    };

    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [callback, minInterval]);
}
