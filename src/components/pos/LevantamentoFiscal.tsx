"use client";
// Levantamento dos impostos usados nas últimas OS faturadas com NFS-e (só leitura
// na Omie): combinações de campos fiscais, quantas OS/clientes usam cada uma, e
// atalhos para criar o modelo e vincular os clientes. Tela: /pos/modelos-fiscais.
import { useEffect, useState } from "react";
import { authHeaders } from "@/lib/auth/client";
import { CAMPOS_FISCAIS, mostrarValor, rotuloCampo, type CamposFiscais } from "@/lib/pos/modelo-fiscal";
import type { ResultadoLevantamento, Combinacao } from "@/lib/pos/levantamento-fiscal";

interface Estado {
  rodando: boolean; por: string | null; iniciadoEm: string | null; terminadoEm: string | null;
  progresso: string; erro: string | null; origem: "listagem" | "consulta" | null; resultado: ResultadoLevantamento | null;
}

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBR = (iso: string) => (iso ? iso.split("-").reverse().join("/") : "—");
const pct = (n: number, t: number) => (t ? `${Math.round((n / t) * 100)}%` : "—");

async function buscar(): Promise<Estado | null> {
  const r = await fetch("/api/pos/modelos-fiscais/levantamento", { headers: await authHeaders() });
  return r.ok ? r.json() : null;
}

export default function LevantamentoFiscal({ modelos, onCriarModelo, onVincular }: {
  modelos: Array<{ id: string; nome: string }>;
  onCriarModelo: (campos: CamposFiscais, sugestaoNome: string) => void;
  onVincular: (clientes: Array<{ documento: string; nome: string }>, modeloId: string) => Promise<void>;
}) {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [verTodas, setVerTodas] = useState(false);
  const [alvo, setAlvo] = useState<Record<string, string>>({});

  // primeira leitura e, enquanto roda, a cada 3 s
  useEffect(() => {
    let cancel = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ler = () => buscar().then((e) => {
      if (cancel) return;
      setEstado(e);
      if (e?.rodando) timer = setTimeout(ler, 3000);
    }).catch(() => {});
    ler();
    return () => { cancel = true; if (timer) clearTimeout(timer); };
  }, [estado?.rodando]);

  const iniciar = async () => {
    const r = await fetch("/api/pos/modelos-fiscais/levantamento", {
      method: "POST", headers: { ...(await authHeaders()), "Content-Type": "application/json" }, body: JSON.stringify({ limite: 1000 }),
    });
    const j = await r.json().catch(() => null);
    if (!r.ok) { alert(j?.error || "Não foi possível iniciar."); return; }
    setEstado(j);
  };

  const res = estado?.resultado;
  const base = res?.combinacoes[0];
  const lista = res ? (verTodas ? res.combinacoes : res.combinacoes.slice(0, 8)) : [];

  const diferencas = (c: Combinacao) => {
    if (!base || c === base) return [];
    return CAMPOS_FISCAIS.filter((f) => String(c.campos[f.chave] ?? "") !== String(base.campos[f.chave] ?? "")).map((f) => f.chave);
  };

  const card: React.CSSProperties = { background: "var(--surface, #fff)", border: "1px solid var(--portal-border, #e2e8f0)", borderRadius: 6, padding: 14 };
  const btn = (cor: string): React.CSSProperties => ({ padding: "6px 11px", borderRadius: 4, border: "none", background: cor, color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer" });
  const chip: React.CSSProperties = { display: "inline-block", padding: "2px 7px", borderRadius: 999, background: "#f1f5f9", color: "#334155", fontSize: 11.5, margin: "2px 4px 2px 0" };

  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ fontWeight: 800 }}>O que a Omie usa hoje</div>
          <div style={{ fontSize: 12.5, color: "#64748b" }}>
            Lê as últimas 1000 OS faturadas com NFS-e (só leitura na Omie) e agrupa os itens pelas combinações de impostos e códigos.
          </div>
        </div>
        <button style={btn(estado?.rodando ? "#94a3b8" : "#0369A1")} disabled={!!estado?.rodando} onClick={iniciar}>
          {estado?.rodando ? "Levantando…" : res ? "Levantar de novo" : "Levantar na Omie"}
        </button>
      </div>

      {estado?.rodando && <div style={{ marginTop: 10, fontSize: 12.5, color: "#0369A1" }}><i className="fas fa-spinner fa-spin" /> {estado.progresso}</div>}
      {estado?.erro && <div style={{ marginTop: 10, fontSize: 12.5, color: "#b91c1c" }}>O levantamento parou: {estado.erro}</div>}

      {res && !estado?.rodando && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12.5, color: "#475569" }}>
            <strong>{res.totalOS}</strong> OS · <strong>{res.totalItens}</strong> itens de serviço
            {res.periodo && <> · faturadas de {dataBR(res.periodo.de)} a {dataBR(res.periodo.ate)}</>}
            {" · "}<strong>{res.combinacoes.length}</strong> combinação(ões) diferentes
            {estado?.terminadoEm && <span style={{ color: "#94a3b8" }}> · levantado em {new Date(estado.terminadoEm).toLocaleString("pt-BR")}{estado.por ? ` por ${estado.por}` : ""}</span>}
          </div>

          {/* distribuição por campo */}
          <details style={{ marginTop: 10 }}>
            <summary style={{ cursor: "pointer", fontSize: 12.5, fontWeight: 700, color: "#334155" }}>Valores por campo</summary>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginTop: 6 }}>
              <tbody>
                {CAMPOS_FISCAIS.filter((c) => res.porCampo[c.chave]).map((c) => (
                  <tr key={c.chave} style={{ borderTop: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "4px 6px", fontWeight: 700, whiteSpace: "nowrap" }}>{c.rotulo}</td>
                    <td style={{ padding: "4px 6px" }}>
                      {res.porCampo[c.chave].slice(0, 6).map((v) => (
                        <span key={String(v.valor)} style={chip}>{mostrarValor(c.chave, v.valor)} · {pct(v.qtdItens, res.totalItens)}</span>
                      ))}
                      {res.totalItens - res.porCampo[c.chave].reduce((s, v) => s + v.qtdItens, 0) > 0 && (
                        <span style={{ ...chip, background: "#fff7ed", color: "#9a3412" }}>vazio · {pct(res.totalItens - res.porCampo[c.chave].reduce((s, v) => s + v.qtdItens, 0), res.totalItens)}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {res.camposSemDado.length > 0 && (
              <div style={{ fontSize: 11.5, color: "#94a3b8", marginTop: 4 }}>Sempre vazios: {res.camposSemDado.map(rotuloCampo).join(", ")}.</div>
            )}
          </details>

          {/* combinações */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
            {lista.map((c, i) => {
              const difs = diferencas(c);
              const vinculaveis = c.clientes.filter((cl) => cl.documento.length === 11 || cl.documento.length === 14);
              return (
                <div key={c.chave} style={{ border: "1px solid var(--portal-border, #e2e8f0)", borderLeft: `4px solid ${i === 0 ? "#0369A1" : "#f59e0b"}`, borderRadius: 4, padding: 10, fontSize: 12.5 }}>
                  <div style={{ fontWeight: 800 }}>
                    {i === 0 ? "A mais comum — candidata a modelo Padrão" : `Combinação ${i + 1}`}
                    <span style={{ fontWeight: 600, color: "#64748b" }}> · {c.qtdOS} OS ({pct(c.qtdOS, res.totalOS)}) · {c.qtdItens} itens · {c.clientes.length} cliente(s) · {brl(c.valor)} · última {dataBR(c.ultimaFat)}</span>
                  </div>
                  <div style={{ marginTop: 4 }}>
                    {i > 0 && <span style={{ fontSize: 11.5, color: "#b45309", marginRight: 6 }}>Difere da mais comum em:</span>}
                    {(i === 0 ? Object.keys(c.campos) : difs).map((k) => (
                      <span key={k} style={{ ...chip, ...(i > 0 ? { background: "#fffbeb", color: "#92400e" } : {}) }}>
                        {rotuloCampo(k)}: {mostrarValor(k, c.campos[k] ?? null)}
                      </span>
                    ))}
                    {i === 0 && !Object.keys(c.campos).length && <span style={{ color: "#64748b" }}>itens sem nenhum campo fiscal preenchido</span>}
                  </div>
                  <div style={{ marginTop: 4, color: "#475569" }}>
                    Clientes: {c.clientes.slice(0, 6).map((cl) => `${cl.nome} (${cl.qtdOS})`).join(" · ")}
                    {c.clientes.length > 6 && ` · e mais ${c.clientes.length - 6}`}
                    <span style={{ color: "#94a3b8" }}> — ex.: OS {c.exemplos.join(", ")}</span>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8, alignItems: "center" }}>
                    <button style={btn("#334155")} onClick={() => onCriarModelo(c.campos, i === 0 ? "Padrão" : "")}>Criar modelo com estes campos</button>
                    {i > 0 && vinculaveis.length > 0 && (
                      <>
                        <select value={alvo[c.chave] || ""} onChange={(e) => setAlvo({ ...alvo, [c.chave]: e.target.value })}
                          style={{ padding: "5px 7px", borderRadius: 4, border: "1px solid #cbd5e1", fontSize: 12, background: "#fff", color: "#1e293b" }}>
                          <option value="">Vincular os {vinculaveis.length} cliente(s) a…</option>
                          {modelos.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
                        </select>
                        <button style={btn(alvo[c.chave] ? "#0369A1" : "#94a3b8")} disabled={!alvo[c.chave]}
                          onClick={async () => {
                            if (!confirm(`Vincular ${vinculaveis.length} cliente(s) a este modelo? Clientes que já têm modelo passam a usar este.`)) return;
                            await onVincular(vinculaveis.map((cl) => ({ documento: cl.documento, nome: cl.nome })), alvo[c.chave]);
                          }}>Vincular</button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {res.combinacoes.length > 8 && (
            <button style={{ ...btn("#f1f5f9"), color: "#334155", marginTop: 8 }} onClick={() => setVerTodas((v) => !v)}>
              {verTodas ? "Mostrar só as 8 principais" : `Ver todas as ${res.combinacoes.length} combinações`}
            </button>
          )}
          {estado?.origem === "consulta" && <div style={{ fontSize: 11.5, color: "#94a3b8", marginTop: 6 }}>A listagem da Omie não traz os impostos; foram consultadas as OS uma a uma.</div>}
        </div>
      )}
    </div>
  );
}
