"use client";

import { useEffect, useState } from "react";
import type { LogEntry } from "@/lib/pos/types";

interface LogPanelProps {
  osId: string | null;
  visible: boolean;
}

export default function LogPanel({ osId, visible }: LogPanelProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);

  useEffect(() => {
    if (!osId) return;
    fetch(`/api/pos/logs?osId=${osId}`)
      .then((r) => r.json())
      .then(setLogs);
  }, [osId]);

  if (!visible) return null;

  return (
    <div className="log-panel" style={{ display: "flex" }}>
      <div style={{ padding: 20, background: "#F5F0E8", borderBottom: "1px solid #E0D6C8", fontWeight: 700 }}>Histórico</div>
      <div style={{ flex: 1, overflowY: "auto", maxHeight: "75vh" }}>
        {logs.length === 0 ? (
          <div style={{ padding: 20, color: "#B8A99A", textAlign: "center" }}>Sem histórico.</div>
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
