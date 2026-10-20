"use client";

// Bloco "Comissão deste serviço" na OS (José, 20/10/2026): o pós-vendas muda a % de comissão daquele serviço e,
// se ficar maior ou menor que a % dos técnicos, diz por quê. A comissão do mês (ficha do técnico) passa a usar
// essa %. Via /api/pos/ordens/[id]/comissao-pct.
import { useCallback, useEffect, useState } from "react";
import { authHeaders } from "@/lib/auth/client";

interface Estado {
  atual: { pct: number; motivo: string; alterado_por: string | null; alterado_em: string } | null;
  tecnicos: { nome: string; pct: number | null }[];
  log: { pct_de: number | null; pct_para: number | null; motivo: string | null; autor: string | null; em: string }[];
  semTabela?: boolean; erro?: string;
}
const pctBR = (v: number | null | undefined) => (v == null ? "—" : `${String(Number(v)).replace(".", ",")}%`);
const quando = (s: string) => new Date(s).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });

export default function ComissaoOSBloco({ osId, podeEditar }: { osId: string; podeEditar: boolean }) {
  const [d, setD] = useState<Estado | null>(null);
  const [editando, setEditando] = useState(false);
  const [pct, setPct] = useState("");
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [verLog, setVerLog] = useState(false);
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await fetch(`/api/pos/ordens/${encodeURIComponent(osId)}/comissao-pct`, { headers: await authHeaders(), cache: "no-store" });
        const j = await r.json();
        if (vivo) setD(j);
      } catch { if (vivo) setD({ atual: null, tecnicos: [], log: [] }); }
    })();
    return () => { vivo = false; };
  }, [osId, versao]);

  const abrir = useCallback(() => {
    setPct(d?.atual ? String(d.atual.pct).replace(".", ",") : d?.tecnicos[0]?.pct != null ? String(d.tecnicos[0].pct).replace(".", ",") : "");
    setMotivo(""); setErro(""); setEditando(true);
  }, [d]);

  const salvar = async (voltar = false) => {
    setSalvando(true); setErro("");
    try {
      const r = await fetch(`/api/pos/ordens/${encodeURIComponent(osId)}/comissao-pct`, {
        method: "PUT", headers: { ...(await authHeaders()), "Content-Type": "application/json" },
        body: JSON.stringify({ pct: voltar ? null : pct, motivo }),
      });
      const j = await r.json();
      if (!r.ok) setErro(j.erro || "Não foi possível gravar");
      else { setEditando(false); setVersao((v) => v + 1); }
    } catch { setErro("Sem conexão — tente de novo"); }
    setSalvando(false);
  };

  if (!d) return null;
  const novo = Number(pct.replace(",", "."));
  const pctValido = pct.trim() !== "" && Number.isFinite(novo) && novo >= 0 && novo <= 100;
  const diferente = pctValido && d.tecnicos.some((t) => t.pct == null || Math.abs(t.pct - novo) > 0.001);
  const precisaMotivo = diferente;
  const subiu = pctValido && d.tecnicos.length > 0 && d.tecnicos.every((t) => t.pct != null && novo > t.pct);
  const desceu = pctValido && d.tecnicos.length > 0 && d.tecnicos.every((t) => t.pct != null && novo < t.pct);

  return (
    <div style={{ marginTop: 12, border: "1px solid #e2e8f0", borderRadius: 12, background: "#fff", padding: "12px 14px", display: "grid", gap: 10 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 15, color: "#0f172a" }}>Comissão deste serviço</span>
        {d.atual
          ? <span style={{ fontSize: 13, borderRadius: 99, padding: "3px 10px", background: "#fffbeb", color: "#92400e", border: "1px solid #fde68a" }}>{pctBR(d.atual.pct)} definida na OS</span>
          : <span style={{ fontSize: 13, borderRadius: 99, padding: "3px 10px", background: "#f1f5f9", color: "#475569" }}>% de cada técnico</span>}
        {podeEditar && !editando && !d.semTabela && (
          <button type="button" onClick={abrir} style={{ marginLeft: "auto", border: "1px solid #cbd5e1", background: "#fff", color: "#0f172a", borderRadius: 99, padding: "6px 14px", fontSize: 13.5, cursor: "pointer" }}>Alterar %</button>
        )}
      </div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 14, color: "#0f172a" }}>
        {d.tecnicos.length === 0 && <span style={{ color: "#64748b" }}>Sem técnico na OS ainda.</span>}
        {d.tecnicos.map((t) => (
          <span key={t.nome}>{t.nome} <span style={{ color: "#64748b" }}>· padrão {pctBR(t.pct)}</span>{d.atual && <span style={{ color: "#92400e" }}> → {pctBR(d.atual.pct)} nesta OS</span>}</span>
        ))}
      </div>
      {d.atual && <div style={{ fontSize: 13.5, color: "#334155" }}>Motivo: “{d.atual.motivo}” · {d.atual.alterado_por || "—"} em {quando(d.atual.alterado_em)}</div>}
      {d.semTabela && <div style={{ fontSize: 13, color: "#5b21b6", background: "#f5f3ff", borderRadius: 8, padding: "6px 10px" }}>Para mudar a % por OS falta rodar o SQL <b>sql/posvendas-comissao-os.sql</b>.</div>}

      {editando && (
        <div style={{ display: "grid", gap: 8, background: "#f8fafc", borderRadius: 10, padding: 10 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ display: "inline-flex", gap: 8, alignItems: "center", fontSize: 15, color: "#0f172a" }}>
              % da comissão nesta OS
              <input inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} style={{ width: 80, border: "1px solid #cbd5e1", borderRadius: 8, padding: "7px 10px", fontSize: 15, color: "#0f172a" }} />
            </label>
            {subiu && <span style={{ fontSize: 13, color: "#047857" }}>maior que a dos técnicos</span>}
            {desceu && <span style={{ fontSize: 13, color: "#b91c1c" }}>menor que a dos técnicos</span>}
          </div>
          <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder={precisaMotivo ? "por que a % é diferente? (obrigatório)" : "motivo (opcional)"}
            style={{ border: `1px solid ${precisaMotivo && !motivo.trim() ? "#fca5a5" : "#cbd5e1"}`, borderRadius: 8, padding: "8px 12px", fontSize: 15, color: "#0f172a" }} />
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button type="button" disabled={salvando || !pctValido || (precisaMotivo && !motivo.trim())} onClick={() => void salvar()}
              style={{ border: "none", background: salvando || !pctValido || (precisaMotivo && !motivo.trim()) ? "#e2e8f0" : "#0f172a", color: salvando || !pctValido || (precisaMotivo && !motivo.trim()) ? "#94a3b8" : "#fff", borderRadius: 99, padding: "8px 18px", fontSize: 14, cursor: "pointer" }}>{salvando ? "Gravando…" : "Gravar"}</button>
            {d.atual && <button type="button" disabled={salvando || !motivo.trim()} onClick={() => void salvar(true)} title="Escreva o motivo para voltar"
              style={{ border: "1px solid #cbd5e1", background: "#fff", color: "#0f172a", borderRadius: 99, padding: "7px 14px", fontSize: 13.5, cursor: "pointer", opacity: motivo.trim() ? 1 : .5 }}>Voltar para a % de cada técnico</button>}
            <button type="button" onClick={() => setEditando(false)} style={{ border: "none", background: "none", color: "#64748b", fontSize: 13.5, cursor: "pointer" }}>cancelar</button>
          </div>
          {erro && <div style={{ fontSize: 13, color: "#991b1b", background: "#fef2f2", borderRadius: 8, padding: "6px 10px" }}>{erro}</div>}
        </div>
      )}

      {d.log.length > 0 && (
        <div>
          <button type="button" onClick={() => setVerLog((v) => !v)} style={{ border: "none", background: "none", padding: 0, color: "#1d4ed8", fontSize: 13, cursor: "pointer", textDecoration: "underline" }}>{verLog ? "esconder histórico" : `histórico (${d.log.length})`}</button>
          {verLog && (
            <div style={{ display: "grid", gap: 4, marginTop: 6 }}>
              {d.log.map((l, i) => (
                <div key={i} style={{ fontSize: 13, color: "#334155" }}>
                  {quando(l.em)} · {l.autor || "—"}: {l.pct_de == null ? "padrão" : pctBR(l.pct_de)} → {l.pct_para == null ? "padrão" : pctBR(l.pct_para)}{l.motivo ? ` — ${l.motivo}` : ""}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
