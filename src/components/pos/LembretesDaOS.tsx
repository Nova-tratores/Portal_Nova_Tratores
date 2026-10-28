"use client";
// Sino de lembretes no topo da OS (José, 26/10/2026): junta os lembretes do CLIENTE (que o OSDrawer
// já carrega) com os ligados a ESTA OS (?id_ordem=), destaca os de cobrança de requisição e usa o
// mesmo cartão do drawer de Lembretes (concluir com nota, adiar, editar, responsável, cobrança).

import { useCallback, useEffect, useMemo, useState } from "react";
import { authHeaders } from "@/lib/auth/client";
import { CartaoLembrete, ehCobranca, situacaoData, useUsuariosPortal, type Lembrete } from "./lembretes-comum";

export default function LembretesDaOS({ osId, userName, lembretesCliente, onLembretesCliente }: {
  osId: string | null;
  userName: string;
  /** lembretes do cliente carregados pelo OSDrawer */
  lembretesCliente: Array<{ id: number; lembrete: string }>;
  onLembretesCliente: (lista: Array<{ id: number; lembrete: string }>) => void;
}) {
  const [daOS, setDaOS] = useState<Lembrete[]>([]);
  const [aberto, setAberto] = useState(false);
  const usuarios = useUsuariosPortal();

  const carregarDaOS = useCallback(async () => {
    if (!osId) { setDaOS([]); return; }
    try {
      const res = await fetch(`/api/pos/lembretes?id_ordem=${encodeURIComponent(osId)}`, { headers: await authHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data)) setDaOS(data as Lembrete[]);
    } catch { /* sem rede: fica só com os do cliente */ }
  }, [osId]);
  useEffect(() => { carregarDaOS(); }, [carregarDaOS]);

  // Os dois juntos, sem repetir; só os abertos. Cobrança e atrasados primeiro.
  const lista = useMemo(() => {
    const mapa = new Map<number, Lembrete>();
    for (const l of [...(lembretesCliente as unknown as Lembrete[]), ...daOS]) mapa.set(l.id, { ...mapa.get(l.id), ...l });
    const peso = (l: Lembrete) => (ehCobranca(l) ? 0 : 2) + (situacaoData(l) === "atrasado" || situacaoData(l) === "hoje" ? 0 : 1);
    return [...mapa.values()].filter((l) => !l.concluido && l.ativo !== false).sort((a, b) => peso(a) - peso(b));
  }, [lembretesCliente, daOS]);

  if (lista.length === 0) return null;
  const temCobranca = lista.some(ehCobranca);
  const cor = temCobranca ? "#EA580C" : "#B45309";

  const alterado = (id: number, novo: Lembrete | null) => {
    const sai = !novo || novo.concluido;
    const troca = <T extends { id: number }>(arr: T[]) => sai ? arr.filter((x) => x.id !== id) : arr.map((x) => x.id === id ? { ...x, ...novo } : x);
    setDaOS((p) => troca(p));
    onLembretesCliente(troca(lembretesCliente as unknown as Lembrete[]) as unknown as Array<{ id: number; lembrete: string }>);
  };

  return (
    <div style={{ position: "relative" }}>
      <button type="button" onClick={() => setAberto((o) => !o)} title={temCobranca ? "Lembretes do cliente e da OS (tem cobrança de requisição)" : "Lembretes do cliente e da OS"}
        style={{ position: "relative", width: 38, height: 38, borderRadius: 10, border: `1px solid color-mix(in srgb, ${cor} 45%, transparent)`,
          background: `color-mix(in srgb, ${cor} 9%, var(--surface, #fefefe))`, color: cor, cursor: "pointer", fontSize: 15, marginRight: 8 }}>
        <i className={`fa-solid ${temCobranca ? "fa-hand-holding-dollar" : "fa-bell"}`} />
        <span style={{ position: "absolute", top: -6, right: -6, minWidth: 17, height: 17, borderRadius: 9, background: cor, color: "#fefefe", fontSize: 10, fontWeight: 500,
          display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px" }}>{lista.length}</span>
      </button>
      {aberto && (
        <div style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 300, width: "min(480px, 88vw)", maxHeight: 480, overflowY: "auto",
          background: "var(--portal-bg-secondary, #f6f8f9)", border: "1px solid var(--border)", borderRadius: 16, boxShadow: "0 16px 40px rgba(0,0,0,.22)", padding: 10,
          display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "2px 4px 4px", fontSize: 13, color: "#475569" }}>
            <span style={{ flex: 1 }}>Lembretes do cliente e desta OS</span>
            <button type="button" onClick={() => setAberto(false)} title="Fechar" style={{ border: "none", background: "transparent", cursor: "pointer", color: "#64748b", fontSize: 14 }}>
              <i className="fa-solid fa-xmark" />
            </button>
          </div>
          {lista.map((l) => (
            <CartaoLembrete key={l.id} l={l} userName={userName} usuarios={usuarios} osAtual={osId}
              onAlterado={(novo) => alterado(l.id, novo)} />
          ))}
        </div>
      )}
    </div>
  );
}
