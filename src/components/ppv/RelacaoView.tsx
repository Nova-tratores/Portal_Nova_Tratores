"use client";

// =============================================
// MODO "RELAÇÃO" DO PPV — tabela no padrão da lista de /propostas:
// atalhos por fase, cards de resumo (sempre sobre o filtrado), cabeçalho
// ordenável + 2ª linha com filtro por coluna (AND), Imprimir (PDF exatamente
// como está na tela), CSV e "Enviar por e-mail" (PDF + CSV gerados no servidor,
// mesmo motor do relatório do Calendário DRE).
// =============================================
import { useState, useMemo, useEffect, useCallback } from "react";
import type { KanbanItem } from "@/lib/ppv/types";
import { STATUS_OPTIONS, STATUS_COLORS, rotuloStatus } from "@/lib/ppv/constants";
import {
  COLS_RELACAO, FASES_PDF, faseDoPedido, colTextoRelacao, filtrarRelacao, ordenarRelacao, resumoFiltrosRelacao,
  totaisRelacao, fmtBRL, statusNorm, isRemessa, estaAberto, gerarCSVRelacao, type ColRelacaoKey, type OrdemRelacao,
} from "@/lib/ppv/relacao";
import { gerarPdfLista, hojeISO } from "@/lib/propostas/pdf-lista";
import { authHeaders } from "@/lib/auth/client";
import { usePPV } from "@/lib/ppv/PPVContext";
import { useAuditLog } from "@/hooks/useAuditLog";

interface RelacaoViewProps {
  orders: KanbanItem[];          // já filtrados por tipo (PPV/REM) pela página
  searchTerm: string;            // busca do cabeçalho do PPV
  tipoFilter?: string;           // "TODOS" | "PEDIDO" | "REMESSA" (só pro resumo dos filtros)
  onCardClick: (id: string) => void;
  onStatusChange?: (id: string, newStatus: string) => void;
  loading?: boolean;
}

const LARANJA = "#e8730c";
const COR_PDF: [number, number, number] = [232, 115, 12];

const thBase: React.CSSProperties = { textAlign: "left", padding: "12px 12px", fontSize: 12.5, fontWeight: 800, color: "var(--ppv-text-light)", letterSpacing: 0.3, whiteSpace: "nowrap", userSelect: "none", cursor: "pointer" };
const tdBase: React.CSSProperties = { padding: "11px 12px", fontSize: 14, color: "var(--ppv-text)", verticalAlign: "middle", borderTop: "1px solid var(--ppv-border-light)" };
const btnBase: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, height: 34, padding: "0 13px", borderRadius: 3, border: "1px solid #e2ddd3", background: "#fefefe", color: "#5f574c", fontSize: 12.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", fontFamily: "'Poppins', sans-serif" };
const inputBase: React.CSSProperties = { width: "100%", minWidth: 60, padding: "6px 8px", fontSize: 12, borderRadius: 3, border: "1px solid var(--ppv-border-light)", background: "#fefefe", color: "var(--ppv-text)", outline: "none", fontFamily: "'Poppins', sans-serif" };

export default function RelacaoView({ orders, searchTerm, tipoFilter = "TODOS", onCardClick, onStatusChange, loading }: RelacaoViewProps) {
  const { showToast } = usePPV();
  const { log } = useAuditLog();
  const [filtroStatus, setFiltroStatus] = useState("");
  const [soAbertos, setSoAbertos] = useState(false);
  const [filtrosCol, setFiltrosCol] = useState<Partial<Record<ColRelacaoKey, string>>>({});
  const [ordem, setOrdem] = useState<OrdemRelacao>({ key: "data", dir: "desc" });
  const [gerando, setGerando] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const temFiltroCol = Object.values(filtrosCol).some((v) => v && v.trim());
  const temFiltroLocal = !!filtroStatus || soAbertos || temFiltroCol;

  const filtradas = useMemo(
    () => filtrarRelacao(orders, { busca: searchTerm, status: filtroStatus, soAbertos, filtrosCol }),
    [orders, searchTerm, filtroStatus, soAbertos, filtrosCol],
  );
  const ordenadas = useMemo(() => ordenarRelacao(filtradas, ordem), [filtradas, ordem]);
  const totais = useMemo(() => totaisRelacao(filtradas), [filtradas]);

  // Contagem por fase (sobre a busca do cabeçalho, sem os atalhos) — vai nos chips.
  const porFase = useMemo(() => {
    const base = filtrarRelacao(orders, { busca: searchTerm, filtrosCol });
    const m: Record<string, number> = {};
    for (const o of base) { const s = statusNorm(o); m[s] = (m[s] || 0) + 1; }
    return { m, abertos: base.filter(estaAberto).length, total: base.length };
  }, [orders, searchTerm, filtrosCol]);

  const filtrosResumo = useCallback(
    () => resumoFiltrosRelacao({ busca: searchTerm, tipoFilter, status: filtroStatus, soAbertos, filtrosCol }, ordem),
    [searchTerm, tipoFilter, filtroStatus, soAbertos, filtrosCol, ordem],
  );

  const toggleSort = (k: ColRelacaoKey) => setOrdem((s) => (s.key === k ? { key: k, dir: s.dir === "asc" ? "desc" : "asc" } : { key: k, dir: "asc" }));
  const limpar = () => { setFiltroStatus(""); setSoAbertos(false); setFiltrosCol({}); };

  // ====== IMPRIMIR (PDF no navegador — mesma lib da relação de /propostas) ======
  const imprimir = async () => {
    if (gerando) return;
    if (ordenadas.length === 0) { showToast("error", "Nenhum pedido na tela para imprimir."); return; }
    setGerando(true);
    try {
      const resumo = filtrosResumo();
      await gerarPdfLista({
        titulo: "PRE-PEDIDOS DE VENDA - RELACAO DA TELA",
        colunas: COLS_RELACAO.map((c) => c.label),
        linhas: ordenadas.map((o) => COLS_RELACAO.map((c) => colTextoRelacao(o, c.k) || "---")),
        filtrosResumo: resumo,
        rodape: [
          { texto: `VALOR TOTAL (${totais.n} pedido${totais.n !== 1 ? "s" : ""}): ${fmtBRL(totais.valor)}`, destaque: true },
          { texto: `Em aberto: ${totais.abertosN} · ${fmtBRL(totais.abertosV)}   |   Faturados: ${totais.faturadosN} · ${fmtBRL(totais.faturadosV)}   |   Remessas: ${totais.remN} · ${fmtBRL(totais.remV)}` },
        ],
        arquivo: `ppv_relacao_${hojeISO()}.pdf`,
        legenda: FASES_PDF.map((f) => ({ label: f.label, fill: f.fill, text: f.text })),
        estiloLinha: (i: number) => { const f = faseDoPedido(ordenadas[i]); return f ? { fill: f.fill, text: f.text, linha: f.linha } : null; },
        colStatus: COLS_RELACAO.findIndex((c) => c.k === "status"),
        columnStyles: { 0: { cellWidth: 14 }, 1: { cellWidth: 12 }, 3: { cellWidth: 34 }, 4: { cellWidth: 20 }, 5: { cellWidth: 26, halign: "right", fontStyle: "bold", textColor: [194, 87, 10] }, 6: { cellWidth: 34 }, 7: { cellWidth: 20 }, 8: { cellWidth: 14 }, 9: { cellWidth: 16 }, 11: { cellWidth: 30 } },
        cor: COR_PDF,
      });
      log({ sistema: "ppv", acao: "relatorio", entidade: "ppv_relacao", detalhes: { total: ordenadas.length, filtros: resumo } });
    } catch (e) {
      showToast("error", "Erro ao gerar PDF: " + (e instanceof Error ? e.message : String(e)));
    } finally { setGerando(false); }
  };

  // ====== CSV (no navegador) ======
  const baixarCSV = () => {
    if (ordenadas.length === 0) { showToast("error", "Nenhum pedido na tela para exportar."); return; }
    const blob = new Blob([gerarCSVRelacao(ordenadas)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `ppv_relacao_${hojeISO()}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const Th = ({ k, label, right }: { k: ColRelacaoKey; label: string; right?: boolean }) => {
    const active = ordem.key === k;
    return (
      <th style={{ ...thBase, textAlign: right ? "right" : "left", color: active ? LARANJA : thBase.color }} onClick={() => toggleSort(k)} title="Clique para ordenar">
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>{label}{active && <span style={{ fontSize: 9 }}>{ordem.dir === "asc" ? "▲" : "▼"}</span>}</span>
      </th>
    );
  };

  const chip = (active: boolean, extra?: React.CSSProperties): React.CSSProperties => ({
    padding: "5px 11px", borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
    border: `1px solid ${active ? LARANJA : "#e2ddd3"}`, background: active ? LARANJA : "#fefefe", color: active ? "#fefefe" : "#5f574c", ...extra,
  });

  const ResumoCard = ({ titulo, n, valor, cor, ativo, onClick, sub }: { titulo: string; n: number; valor: number; cor: string; ativo?: boolean; onClick?: () => void; sub?: string }) => (
    <button type="button" onClick={onClick} disabled={!onClick}
      style={{ textAlign: "left", border: `1px solid ${ativo ? LARANJA : "var(--ppv-border-light)"}`, borderLeft: `4px solid ${cor}`, borderRadius: 3, padding: "10px 14px", background: ativo ? "var(--ppv-primary-light)" : "var(--ppv-surface)", cursor: onClick ? "pointer" : "default", fontFamily: "'Poppins', sans-serif" }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--ppv-text-light)" }}>{titulo}</div>
      <div style={{ fontSize: 19, fontWeight: 800, color: cor, marginTop: 2 }}>{fmtBRL(valor)}</div>
      <div style={{ fontSize: 12, color: "var(--ppv-text-light)" }}>{n} pedido{n !== 1 ? "s" : ""}{sub ? ` · ${sub}` : ""}</div>
    </button>
  );

  return (
    <div style={{ padding: "8px 16px 24px", display: "flex", flexDirection: "column", gap: 12, fontFamily: "'Poppins', sans-serif" }}>
      {/* ATALHOS por fase — configuram o filtro da tabela */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--ppv-text-light)", marginRight: 4 }}>Atalhos:</span>
        <button type="button" style={chip(!filtroStatus && !soAbertos)} onClick={() => { setFiltroStatus(""); setSoAbertos(false); }}>Todas ({porFase.total})</button>
        <button type="button" style={chip(soAbertos, { borderColor: soAbertos ? "#047857" : "#e2ddd3", background: soAbertos ? "#047857" : "#fefefe" })} onClick={() => setSoAbertos((v) => !v)}>Em aberto ({porFase.abertos})</button>
        {STATUS_OPTIONS.map((s) => {
          const n = porFase.m[s.value] || 0;
          if (n === 0 && filtroStatus !== s.value) return null;
          const c = STATUS_COLORS[s.value];
          const ativo = filtroStatus === s.value;
          return (
            <button key={s.value} type="button" onClick={() => setFiltroStatus(ativo ? "" : s.value)}
              style={chip(ativo, ativo ? { background: c.text, borderColor: c.text } : { background: c.bg, color: c.text, borderColor: c.bg })}>
              {s.label} ({n})
            </button>
          );
        })}
        <div style={{ flex: 1 }} />
        {(temFiltroLocal) && (
          <button type="button" style={{ ...btnBase, color: "#b91c1c", borderColor: "#fecaca", background: "#fef2f2" }} onClick={limpar}><i className="fas fa-times" /> Limpar filtros</button>
        )}
        <button type="button" style={btnBase} onClick={baixarCSV} title="Baixa um CSV (Excel) com a relação como está na tela"><i className="fas fa-file-csv" /> CSV</button>
        <button type="button" style={{ ...btnBase, background: "#27272a", color: "#fefefe", borderColor: "#27272a" }} onClick={imprimir} disabled={gerando}
          title="Gera um PDF com a relação exatamente como está na tela (busca, atalhos, filtros do cabeçalho e ordenação)">
          <i className={`fas fa-print ${gerando ? "fa-beat" : ""}`} /> {gerando ? "Gerando..." : "Imprimir"}
        </button>
        <button type="button" style={{ ...btnBase, background: LARANJA, color: "#fefefe", borderColor: LARANJA }} onClick={() => setEmailOpen(true)}
          title="Envia por e-mail (PDF + CSV) a relação exatamente como está na tela">
          <i className="fas fa-envelope" /> Enviar por e-mail
        </button>
      </div>

      {/* CARDS DE RESUMO — sempre sobre o que está filtrado; clicar aplica o atalho */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 10 }}>
        <ResumoCard titulo="No filtro" n={totais.n} valor={totais.valor} cor={LARANJA} ativo={!filtroStatus && !soAbertos} onClick={() => { setFiltroStatus(""); setSoAbertos(false); }} />
        <ResumoCard titulo="Em aberto" n={totais.abertosN} valor={totais.abertosV} cor="#047857" ativo={soAbertos} onClick={() => setSoAbertos((v) => !v)} sub="menos Faturado/Cancelada" />
        <ResumoCard titulo="Faturados" n={totais.faturadosN} valor={totais.faturadosV} cor="#1d4ed8" ativo={filtroStatus === "Concluída"} onClick={() => setFiltroStatus(filtroStatus === "Concluída" ? "" : "Concluída")} />
        <ResumoCard titulo="Remessas (REM)" n={totais.remN} valor={totais.remV} cor="#7c3aed" />
      </div>

      {/* TABELA */}
      <div style={{ background: "var(--ppv-surface)", border: "1px solid var(--ppv-border-light)", borderRadius: 3, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1180 }}>
          <thead>
            <tr style={{ borderBottom: "2px solid var(--ppv-border-light)" }}>
              {COLS_RELACAO.map((c) => <Th key={c.k} k={c.k} label={c.label} right={c.k === "valor"} />)}
              {onStatusChange && <th style={{ ...thBase, cursor: "default", width: 190 }}>Alterar fase</th>}
            </tr>
            {/* 2ª linha: filtro por coluna (AND) — mesmo padrão de /propostas e /ajustes/alertas */}
            <tr style={{ background: "var(--ppv-bg)" }}>
              {COLS_RELACAO.map((c) => (
                <th key={c.k} style={{ padding: "4px 8px 8px" }}>
                  <input type="text" value={filtrosCol[c.k] || ""} placeholder="filtrar…" aria-label={`Filtrar ${c.label}`} style={inputBase}
                    onChange={(e) => setFiltrosCol((f) => ({ ...f, [c.k]: e.target.value }))} onClick={(e) => e.stopPropagation()} />
                </th>
              ))}
              {onStatusChange && <th />}
            </tr>
          </thead>
          <tbody>
            {loading && orders.length === 0 ? (
              <tr><td colSpan={COLS_RELACAO.length + 1} style={{ ...tdBase, textAlign: "center", padding: 40, color: "var(--ppv-text-light)" }}>Carregando…</td></tr>
            ) : ordenadas.length === 0 ? (
              <tr><td colSpan={COLS_RELACAO.length + 1} style={{ ...tdBase, textAlign: "center", padding: 40, color: "var(--ppv-text-light)", fontWeight: 600 }}>Nenhum pedido encontrado</td></tr>
            ) : ordenadas.map((o) => {
              const rem = isRemessa(o);
              const sn = statusNorm(o);
              const c = STATUS_COLORS[sn] || { text: "#334155", bg: "#F1F5F9" };
              return (
                <tr key={o.id} onClick={() => onCardClick(o.id)} className="ppv-relacao-row" style={{ cursor: "pointer" }}>
                  <td style={{ ...tdBase, fontWeight: 800, fontSize: 15, color: rem ? LARANJA : "var(--ppv-text)", whiteSpace: "nowrap" }}>{colTextoRelacao(o, "id")}</td>
                  <td style={tdBase}><span style={{ fontSize: 10.5, fontWeight: 800, padding: "2px 7px", borderRadius: 3, background: rem ? "#fff3e6" : "#f1f5f9", color: rem ? "#c2570a" : "#334155" }}>{rem ? "REM" : "PPV"}</span></td>
                  <td style={{ ...tdBase, fontWeight: 700, fontSize: 15, maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={o.cliente}>{colTextoRelacao(o, "cliente")}</td>
                  <td style={{ ...tdBase, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={o.tecnico}>{o.tecnico || <span style={{ color: "#94a3b8" }}>—</span>}</td>
                  <td style={{ ...tdBase, whiteSpace: "nowrap" }}>{colTextoRelacao(o, "data") || <span style={{ color: "#94a3b8" }}>—</span>}</td>
                  <td style={{ ...tdBase, textAlign: "right", fontWeight: 800, fontSize: 15, color: "#c2570a", whiteSpace: "nowrap" }}>{colTextoRelacao(o, "valor")}</td>
                  <td style={tdBase}><span style={{ fontSize: 12, fontWeight: 700, padding: "3px 9px", borderRadius: 3, background: c.bg, color: c.text, whiteSpace: "nowrap" }}>{rotuloStatus(sn)}</span></td>
                  <td style={{ ...tdBase, whiteSpace: "nowrap" }}>{o.pedidoOmie || <span style={{ color: "#94a3b8" }}>—</span>}</td>
                  <td style={{ ...tdBase, whiteSpace: "nowrap" }}>{o.osId || <span style={{ color: "#94a3b8" }}>—</span>}</td>
                  <td style={{ ...tdBase, whiteSpace: "nowrap" }}>{o.nfNumero || <span style={{ color: "#94a3b8" }}>—</span>}</td>
                  <td style={{ ...tdBase, fontSize: 12.5, fontStyle: "italic", color: "var(--ppv-text-light)", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={o.observacao}>{o.observacao || ""}</td>
                  <td style={{ ...tdBase, fontSize: 12.5, color: "var(--ppv-text-light)", maxWidth: 170, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={colTextoRelacao(o, "criadoPor")}>{colTextoRelacao(o, "criadoPor") || ""}</td>
                  {onStatusChange && (
                    <td style={tdBase} onClick={(e) => e.stopPropagation()}>
                      <select value={sn} onChange={(e) => onStatusChange(o.id, e.target.value)}
                        style={{ width: "100%", padding: "7px 8px", fontSize: 12.5, fontWeight: 600, borderRadius: 3, border: "1px solid var(--ppv-border-light)", background: "#fefefe", color: "var(--ppv-text)", cursor: "pointer", fontFamily: "'Poppins', sans-serif" }}>
                        {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </select>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ textAlign: "right", fontSize: 13, color: "var(--ppv-text-light)", fontWeight: 600 }}>
        {ordenadas.length} pedido{ordenadas.length !== 1 ? "s" : ""}{orders.length !== ordenadas.length ? ` (de ${orders.length})` : ""}
      </div>
      <style jsx global>{`
        .ppv-relacao-row:hover td { background: var(--ppv-primary-light); }
      `}</style>

      {emailOpen && (
        <EnviarEmailModal
          ids={ordenadas.map((o) => o.id)}
          total={totais}
          filtrosResumo={filtrosResumo()}
          onClose={() => setEmailOpen(false)}
          onEnviado={(n, dest) => { setEmailOpen(false); showToast("success", `Relação (${n}) enviada para ${dest}`); log({ sistema: "ppv", acao: "relatorio_email", entidade: "ppv_relacao", detalhes: { total: n, destinatarios: dest, filtros: filtrosResumo() } }); }}
          onErro={(msg) => showToast("error", msg)}
        />
      )}
    </div>
  );
}

// =============================================
// MODAL "ENVIAR POR E-MAIL" — destinatários pré-preenchidos com o padrão do
// servidor (PPV_RELATORIO_EMAIL_TO/_CC); o PDF + CSV são gerados no servidor
// a partir do BANCO (a tela só manda os ids na ordem e o resumo dos filtros).
// =============================================
function EnviarEmailModal({ ids, total, filtrosResumo, onClose, onEnviado, onErro }: {
  ids: string[];
  total: ReturnType<typeof totaisRelacao>;
  filtrosResumo: string[];
  onClose: () => void;
  onEnviado: (n: number, destinatarios: string) => void;
  onErro: (msg: string) => void;
}) {
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [gmailOk, setGmailOk] = useState<boolean | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await fetch("/api/ppv/relatorio-lista", { headers: await authHeaders() });
        const d = r.ok ? await r.json() : null;
        if (!vivo) return;
        if (d) { setTo(d.to || ""); setCc(d.cc || ""); setGmailOk(!!d.gmailConfigurado); }
      } catch { /* segue sem padrão */ }
      finally { if (vivo) setCarregando(false); }
    })();
    return () => { vivo = false; };
  }, []);

  const enviar = async () => {
    if (enviando) return;
    if (!to.trim()) { onErro("Informe pelo menos um destinatário."); return; }
    if (ids.length === 0) { onErro("Nenhum pedido na relação para enviar."); return; }
    setEnviando(true);
    try {
      const r = await fetch("/api/ppv/relatorio-lista", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ ids, to, cc, mensagem, filtrosResumo }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) { onErro(d.error || `Falha ao enviar (HTTP ${r.status})`); return; }
      onEnviado(d.total ?? ids.length, (d.destinatarios || []).join(", ") || to);
    } catch (e) {
      onErro("Erro de rede ao enviar: " + (e instanceof Error ? e.message : String(e)));
    } finally { setEnviando(false); }
  };

  const campo: React.CSSProperties = { width: "100%", padding: "9px 11px", fontSize: 14, borderRadius: 3, border: "1px solid var(--ppv-border-light)", background: "#fefefe", color: "var(--ppv-text)", outline: "none", fontFamily: "'Poppins', sans-serif" };
  const lbl: React.CSSProperties = { display: "block", fontSize: 11.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.4, color: "var(--ppv-text-light)", marginBottom: 4 };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 9000, background: "rgba(15,23,42,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 560, background: "var(--ppv-surface)", border: "1px solid var(--ppv-border-light)", borderTop: `4px solid ${LARANJA}`, borderRadius: 3, boxShadow: "0 24px 60px rgba(0,0,0,0.3)", padding: 20, display: "flex", flexDirection: "column", gap: 12, fontFamily: "'Poppins', sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: "var(--ppv-text)" }}><i className="fas fa-envelope" style={{ color: LARANJA, marginRight: 8 }} />Enviar relação por e-mail</div>
          <button type="button" onClick={onClose} style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 18, color: "var(--ppv-text-light)" }}><i className="fas fa-times" /></button>
        </div>
        <div style={{ fontSize: 13, color: "var(--ppv-text-light)", background: "var(--ppv-bg)", border: "1px solid var(--ppv-border-light)", borderRadius: 3, padding: "8px 11px" }}>
          <b style={{ color: "var(--ppv-text)" }}>{total.n} pedido{total.n !== 1 ? "s" : ""}</b> · {fmtBRL(total.valor)} · vai <b>PDF + CSV</b> exatamente como a tela está.<br />
          <span>Filtros: {filtrosResumo.length ? filtrosResumo.join(" · ") : "nenhum (relação completa)"}</span>
        </div>
        {gmailOk === false && (
          <div style={{ fontSize: 12.5, color: "#b91c1c", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 3, padding: "7px 10px" }}>
            O servidor está sem e-mail configurado (GMAIL_USER / GMAIL_APP_PASSWORD). O envio vai falhar até configurar.
          </div>
        )}
        {!carregando && !to.trim() && (
          <div style={{ fontSize: 12, color: "var(--ppv-text-light)" }}>
            Sem destinatário padrão. Um Dev define o padrão em <b>Envios de e-mail</b> (menu lateral) — ou informe abaixo só para este envio.
          </div>
        )}
        <div>
          <label style={lbl}>Para (separe por vírgula)</label>
          <input style={campo} value={to} onChange={(e) => setTo(e.target.value)} placeholder={carregando ? "carregando padrão…" : "email@empresa.com, outro@empresa.com"} />
        </div>
        <div>
          <label style={lbl}>Cc (opcional)</label>
          <input style={campo} value={cc} onChange={(e) => setCc(e.target.value)} placeholder="opcional" />
        </div>
        <div>
          <label style={lbl}>Mensagem (opcional)</label>
          <textarea style={{ ...campo, minHeight: 70, resize: "vertical" }} value={mensagem} onChange={(e) => setMensagem(e.target.value)} placeholder="Texto que vai no corpo do e-mail, acima do resumo" />
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
          <button type="button" onClick={onClose} style={btnBase}>Cancelar</button>
          <button type="button" onClick={enviar} disabled={enviando || carregando} style={{ ...btnBase, background: LARANJA, color: "#fefefe", borderColor: LARANJA, opacity: enviando || carregando ? 0.7 : 1 }}>
            <i className={`fas ${enviando ? "fa-spinner fa-spin" : "fa-paper-plane"}`} /> {enviando ? "Enviando…" : "Enviar"}
          </button>
        </div>
      </div>
    </div>
  );
}
