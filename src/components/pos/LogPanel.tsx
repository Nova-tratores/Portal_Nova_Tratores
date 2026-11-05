"use client";

import { useEffect, useState, useCallback } from "react";
import type { LogEntry } from "@/lib/pos/types";
import { fetchAuth } from "@/lib/auth/client";

interface LogPanelProps {
  osId: string | null;
  visible: boolean;
  refreshKey?: number;
}

export default function LogPanel({ osId, visible, refreshKey }: LogPanelProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchLogs = useCallback(async () => {
    if (!osId) return;
    setLoading(true);
    try {
      const res = await fetchAuth(`/api/pos/logs?osId=${osId}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) setLogs(data);
      }
    } catch {
      // silently ignore
    }
    setLoading(false);
  }, [osId]);

  useEffect(() => {
    if (!osId || !visible) return;
    fetchLogs();
  }, [osId, visible, refreshKey, fetchLogs]);

  if (!visible) return null;

  return (
    <div className="log-panel" style={{ display: "flex" }}>
      <div style={{ padding: "14px 20px", background: "#F5F0E8", borderBottom: "1px solid #E0D6C8", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span>Histórico</span>
        <button
          onClick={fetchLogs}
          disabled={loading}
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: "#7A6E5D", fontSize: 13, padding: "4px 8px", borderRadius: 6,
            display: "flex", alignItems: "center", gap: 4,
          }}
          title="Atualizar"
        >
          <i className={`fas fa-sync-alt${loading ? " fa-spin" : ""}`} style={{ fontSize: 11 }} />
        </button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", maxHeight: "75vh" }}>
        {logs.length === 0 ? (
          <div style={{ padding: 20, color: "#B8A99A", textAlign: "center" }}>
            {loading ? "Carregando..." : "Sem histórico."}
          </div>
        ) : (
          logs.map((l, i) => (
            <div key={i} style={{ padding: 15, borderBottom: "1px solid #F5F0E8", fontSize: 12 }}>
              <div style={{ color: "var(--primary)", fontWeight: 600 }}>{l.data}</div>
              <div style={{ fontWeight: 600 }}>{l.acao}</div>
              <div style={{ fontSize: 10, color: "#999" }}>{l.usuario}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
