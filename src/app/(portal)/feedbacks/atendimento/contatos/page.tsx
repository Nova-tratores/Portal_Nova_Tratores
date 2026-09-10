"use client";
// Contatos do WhatsApp por cargo (NovaZap): quem é proprietário, tratorista,
// gerente… de cada cliente, com o caminho para a ficha do cliente.
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { authHeaders } from "@/lib/auth/client";
import styles from "@/components/feedbacks/feedbacks.module.css";
import { COR_ATENDIMENTO } from "@/components/feedbacks/atendimento/Cockpit";
import { linkWhatsapp } from "@/lib/feedbacks/telefone";
import type { ContatoPorCargo } from "@/lib/chatwoot/parsers";

interface Resposta { estado: "nao_configurado" | "ok"; contatos: ContatoPorCargo[]; cargos: string[]; truncados: string[] }

export default function ContatosPorCargoPage() {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [cargo, setCargo] = useState<string>("");
  const [busca, setBusca] = useState("");

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const res = await fetch("/api/feedbacks/atendimento/contatos", { headers: await authHeaders(), cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.erro || `HTTP ${res.status}`);
      setDados(data as Resposta);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "erro ao carregar os contatos");
    } finally {
      setCarregando(false);
    }
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (dados?.contatos ?? []).filter((c) => (!cargo || c.cargo === cargo) && (!q || c.nome.toLowerCase().includes(q) || (c.cliente || "").toLowerCase().includes(q)));
  }, [dados, cargo, busca]);

  const contagem = (cg: string) => (dados?.contatos ?? []).filter((c) => c.cargo === cg).length;

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "12px 0" }}>
      <header style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
        <div>
          <Link href="/feedbacks/atendimento" style={{ color: COR_ATENDIMENTO, fontWeight: 700, textDecoration: "none", fontSize: 12 }}>← Fila de atendimento</Link>
          <h1 style={{ margin: "2px 0 0", fontSize: 20, fontWeight: 800 }}>👥 Contatos por cargo</h1>
          <div style={{ fontSize: 12, opacity: 0.65 }}>{carregando ? "lendo o NovaZap…" : `${lista.length} contato${lista.length === 1 ? "" : "s"}`}</div>
        </div>
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar contato ou cliente…" style={{ marginLeft: "auto", padding: "8px 12px", borderRadius: 999, border: "1px solid var(--portal-border)", fontSize: 13, minWidth: 240, background: "var(--portal-bg-card)" }} />
        <button type="button" onClick={carregar} disabled={carregando} style={chip(COR_ATENDIMENTO, false)}>↻</button>
      </header>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        <button type="button" onClick={() => setCargo("")} style={chip(!cargo ? COR_ATENDIMENTO : "#64748b", !cargo)}>Todos ({dados?.contatos.length ?? 0})</button>
        {(dados?.cargos ?? []).map((cg) => (
          <button key={cg} type="button" onClick={() => setCargo(cargo === cg ? "" : cg)} style={chip(cargo === cg ? COR_ATENDIMENTO : "#64748b", cargo === cg)}>
            {cg === "Proprietário" ? "👑 " : ""}{cg} ({contagem(cg)})
          </button>
        ))}
      </div>

      {erro && <div style={{ background: "#fee2e2", color: "#991b1b", borderRadius: 10, padding: "8px 12px", fontSize: 12, marginBottom: 12 }}>{erro}</div>}
      {dados?.estado === "nao_configurado" && <div style={{ background: "#fef3c7", color: "#92400e", borderRadius: 10, padding: "8px 12px", fontSize: 12, marginBottom: 12 }}>Integração com o NovaZap não configurada neste ambiente.</div>}
      {(dados?.truncados.length ?? 0) > 0 && <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 8 }}>Lista cortada em 90 contatos para: {dados!.truncados.join(", ")} — use a busca do NovaZap para o restante.</div>}

      {carregando && !dados ? (
        <div style={{ opacity: 0.6, fontSize: 13 }}>Carregando…</div>
      ) : lista.length === 0 ? (
        <div className={styles.card} style={{ ["--fb-accent" as string]: COR_ATENDIMENTO, textAlign: "center", padding: 32 }}>Nenhum contato com esse filtro.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", fontSize: 11, opacity: 0.65 }}>
                <th style={th}>Contato</th><th style={th}>Cargo</th><th style={th}>Cliente</th><th style={th}>Telefone</th><th style={th}>Fazendas</th><th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {lista.map((c) => (
                <tr key={c.id} style={{ borderTop: "1px solid var(--portal-border)" }}>
                  <td style={td}><strong>{c.nome}</strong></td>
                  <td style={td}><span className={styles.pill} style={{ background: c.cargo === "Proprietário" ? "#fef3c7" : "#f1f5f9", color: c.cargo === "Proprietário" ? "#92400e" : "#334155" }}>{c.cargo}</span></td>
                  <td style={td}>{c.cliente ?? <span style={{ opacity: 0.5 }}>sem vínculo</span>}</td>
                  <td style={{ ...td, fontVariantNumeric: "tabular-nums" }}>
                    {c.telefone ?? "—"}
                    {c.telefone_wa && <> <a href={linkWhatsapp(c.telefone_wa) ?? "#"} target="_blank" rel="noopener noreferrer" style={{ color: "#25d366", fontWeight: 700, textDecoration: "none" }}>WhatsApp</a></>}
                  </td>
                  <td style={td}>{c.localizacoes.map((l) => l.nome).join(", ") || "—"}</td>
                  <td style={td}>
                    {c.cliente_key ? (
                      <Link href={`/feedbacks/atendimento/${encodeURIComponent(c.cliente_key)}`} style={{ color: COR_ATENDIMENTO, fontWeight: 700, textDecoration: "none" }}>Abrir ficha →</Link>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const th: React.CSSProperties = { padding: "6px 8px", fontWeight: 700 };
const td: React.CSSProperties = { padding: "8px 8px", verticalAlign: "top" };
function chip(cor: string, ativo: boolean): React.CSSProperties {
  return { fontSize: 12, fontWeight: 700, padding: "6px 12px", borderRadius: 999, border: `1px solid ${cor}`, background: ativo ? cor : "transparent", color: ativo ? "#fff" : cor, cursor: "pointer" };
}
