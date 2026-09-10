"use client";

// =============================================
// MODO "RELAÇÃO" DO POS — tabela das Ordens de Serviço no mesmo padrão do modo
// Relação do PPV: atalhos por fase (+ Pendente), cards de resumo sobre o
// filtrado, cabeçalho ordenável, 2ª linha com filtro por coluna (fase e tipo
// em seletor; datas por período), Imprimir (PDF exatamente como a tela) e CSV.
// Respeita a busca e o filtro de técnico do header do POS.
// =============================================
import { useMemo, useState, useCallback } from "react";
import type { KanbanCard } from "@/lib/pos/types";
import { PHASES } from "@/lib/pos/constants";
import {
  COLS_RELACAO_OS, COLS_DATA_OS, FASES_OS, FASES_PDF_OS, FASE_PENDENTE_OS, faseOS, rotuloFaseOS, colTextoOS, filtrarOS, ordenarOS,
  resumoFiltrosOS, totaisOS, estaPendente, gerarCSVOS, valorOS, OPCOES_PERIODO, fmtBRL, type ColOSKey, type OrdemOS,
} from "@/lib/pos/relacao";
import { gerarPdfLista, hojeISO } from "@/lib/propostas/pdf-lista";
import { useAuditLog } from "@/hooks/useAuditLog";

interface Props {
  orders: KanbanCard[];
  searchTerm: string;
  tecnicoFiltro?: string;
  onCardClick: (order: KanbanCard) => void;
  onPhaseChange?: (orderId: string, newPhase: string) => void;
}

const AZUL = "#0369A1";
const COR_PDF: [number, number, number] = [3, 105, 161];
const T = { text: "var(--portal-text, #1e293b)", light: "var(--portal-text-secondary, #64748b)", border: "var(--portal-border, #e5e7eb)", surface: "var(--portal-bg-card, #fff)", bg: "var(--portal-bg-secondary, #f8fafc)" };

const thBase: React.CSSProperties = { textAlign: "left", padding: "11px 10px", fontSize: 12, fontWeight: 800, color: T.light, letterSpacing: 0.3, whiteSpace: "nowrap", userSelect: "none", cursor: "pointer" };
const tdBase: React.CSSProperties = { padding: "10px 10px", fontSize: 13.5, color: T.text, verticalAlign: "middle", borderTop: `1px solid ${T.border}` };
const btnBase: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, height: 34, padding: "0 13px", borderRadius: 8, border: `1px solid ${T.border}`, background: "#fefefe", color: "#111111", fontSize: 12.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit" };
const inputBase: React.CSSProperties = { width: "100%", minWidth: 60, padding: "6px 8px", fontSize: 12, borderRadius: 6, border: `1px solid ${T.border}`, background: "#fefefe", color: T.text, outline: "none", fontFamily: "inherit" };

export default function RelacaoOS({ orders, searchTerm, tecnicoFiltro = "", onCardClick, onPhaseChange }: Props) {
  const { log } = useAuditLog();
  const [filtroStatus, setFiltroStatus] = useState("");
  const [filtrosCol, setFiltrosCol] = useState<Partial<Record<ColOSKey, string>>>({});
  const [ordem, setOrdem] = useState<OrdemOS>({ key: "data", dir: "desc" });
  const [gerando, setGerando] = useState(false);
  const [aviso, setAviso] = useState("");
  const temFiltroCol = Object.values(filtrosCol).some((v) => v && v.trim());

  const filtradas = useMemo(
    () => filtrarOS(orders, { busca: searchTerm, tecnico: tecnicoFiltro, status: filtroStatus, filtrosCol }),
    [orders, searchTerm, tecnicoFiltro, filtroStatus, filtrosCol],
  );
  const ordenadas = useMemo(() => ordenarOS(filtradas, ordem), [filtradas, ordem]);
  const totais = useMemo(() => totaisOS(filtradas), [filtradas]);

  // Contagem por fase (busca + técnico + filtros de coluna, sem o atalho) — chips e seletor.
  const porFase = useMemo(() => {
    const base = filtrarOS(orders, { busca: searchTerm, tecnico: tecnicoFiltro, filtrosCol });
    const m: Record<string, number> = {};
    for (const o of base) m[o.status] = (m[o.status] || 0) + 1;
    return { m, pendentes: base.filter(estaPendente).length, total: base.length };
  }, [orders, searchTerm, tecnicoFiltro, filtrosCol]);
  const fasesPresentes = useMemo(() => FASES_OS.filter((f) => porFase.m[f.nome]).map((f) => ({ ...f, n: porFase.m[f.nome] })), [porFase]);
  const tiposPresentes = useMemo(() => {
    const m: Record<string, number> = {};
    for (const o of orders) { const t = (o.tipoServico || "").trim(); if (t) m[t] = (m[t] || 0) + 1; }
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [orders]);

  const filtrosResumo = useCallback(
    () => resumoFiltrosOS({ busca: searchTerm, tecnico: tecnicoFiltro, status: filtroStatus, filtrosCol }, ordem),
    [searchTerm, tecnicoFiltro, filtroStatus, filtrosCol, ordem],
  );
  const toggleSort = (k: ColOSKey) => setOrdem((s) => (s.key === k ? { key: k, dir: s.dir === "asc" ? "desc" : "asc" } : { key: k, dir: "asc" }));
  const limpar = () => { setFiltroStatus(""); setFiltrosCol({}); };
  const avisar = (m: string) => { setAviso(m); setTimeout(() => setAviso(""), 3500); };

  // ====== IMPRIMIR (PDF no navegador — mesma lib da relação de /propostas e do PPV) ======
  const imprimir = async () => {
    if (gerando) return;
    if (ordenadas.length === 0) { avisar("Nenhuma OS na tela para imprimir."); return; }
    setGerando(true);
    try {
      const resumo = filtrosResumo();
      await gerarPdfLista({
        titulo: "ORDENS DE SERVICO - RELACAO DA TELA",
        colunas: COLS_RELACAO_OS.map((c) => c.label),
        linhas: ordenadas.map((o) => COLS_RELACAO_OS.map((c) => colTextoOS(o, c.k) || "---")),
        filtrosResumo: resumo,
        rodape: [
          { texto: `VALOR TOTAL (${totais.n} OS): ${fmtBRL(totais.valor)}`, destaque: true },
          { texto: `Pendentes: ${totais.pendentesN} · ${fmtBRL(totais.pendentesV)}   |   Concluídas: ${totais.concluidasN} · ${fmtBRL(totais.concluidasV)}   |   Canceladas: ${totais.canceladasN}   |   Horas: ${totais.horas}   |   Km: ${totais.km}` },
        ],
        arquivo: `os_relacao_${hojeISO()}.pdf`,
        legenda: FASES_PDF_OS.filter((f) => porFase.m[f.nome]).map((f) => ({ label: f.label, fill: f.fill, text: f.text })),
        estiloLinha: (i: number) => { const f = FASES_PDF_OS.find((x) => x.nome === ordenadas[i]?.status); return f ? { fill: f.fill, text: f.text, linha: f.linha } : null; },
        colStatus: COLS_RELACAO_OS.findIndex((c) => c.k === "status"),
        columnStyles: { 0: { cellWidth: 12 }, 2: { cellWidth: 24 }, 3: { cellWidth: 20 }, 4: { cellWidth: 18 }, 5: { cellWidth: 22, halign: "right", fontStyle: "bold", textColor: [3, 105, 161] }, 6: { cellWidth: 26 }, 7: { cellWidth: 18 }, 8: { cellWidth: 18 }, 9: { cellWidth: 18 }, 10: { cellWidth: 18 }, 11: { cellWidth: 16 }, 12: { cellWidth: 16 } },
        cor: COR_PDF,
      });
      log({ sistema: "pos", acao: "relatorio", entidade: "os_relacao", detalhes: { total: ordenadas.length, filtros: resumo } });
    } catch (e) {
      avisar("Erro ao gerar PDF: " + (e instanceof Error ? e.message : String(e)));
    } finally { setGerando(false); }
  };

  const baixarCSV = () => {
    if (ordenadas.length === 0) { avisar("Nenhuma OS na tela para exportar."); return; }
    const blob = new Blob([gerarCSVOS(ordenadas)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `os_relacao_${hojeISO()}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const Th = ({ k, label, right }: { k: ColOSKey; label: string; right?: boolean }) => {
    const active = ordem.key === k;
    return (
      <th style={{ ...thBase, textAlign: right ? "right" : "left", color: active ? AZUL : thBase.color }} onClick={() => toggleSort(k)} title="Clique para ordenar">
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>{label}{active && <span style={{ fontSize: 9 }}>{ordem.dir === "asc" ? "▲" : "▼"}</span>}</span>
      </th>
    );
  };
  const chip = (active: boolean, extra?: React.CSSProperties): React.CSSProperties => ({
    padding: "5px 11px", borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
    border: `1px solid ${active ? AZUL : T.border}`, background: active ? AZUL : "#fefefe", color: active ? "#fefefe" : "#111111", fontFamily: "inherit", ...extra,
  });
  const ResumoCard = ({ titulo, n, valor, cor, ativo, onClick, sub }: { titulo: string; n: number; valor?: number; cor: string; ativo?: boolean; onClick?: () => void; sub?: string }) => (
    <button type="button" onClick={onClick} disabled={!onClick}
      style={{ textAlign: "left", border: `1px solid ${ativo ? AZUL : T.border}`, borderLeft: `4px solid ${cor}`, borderRadius: 8, padding: "10px 14px", background: ativo ? "#E0F2FE" : T.surface, cursor: onClick ? "pointer" : "default", fontFamily: "inherit" }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, color: T.light }}>{titulo}</div>
      <div style={{ fontSize: 19, fontWeight: 800, color: cor, marginTop: 2 }}>{valor != null ? fmtBRL(valor) : n}</div>
      <div style={{ fontSize: 12, color: T.light }}>{valor != null ? `${n} OS` : ""}{sub ? `${valor != null ? " · " : ""}${sub}` : ""}</div>
    </button>
  );

  const renderFiltro = (c: (typeof COLS_RELACAO_OS)[number]) => {
    const v = filtrosCol[c.k] || "";
    const setV = (nv: string) => setFiltrosCol((f) => ({ ...f, [c.k]: nv }));
    if (c.k === "status") {
      return (
        <select value={v} onChange={(e) => setV(e.target.value)} aria-label="Filtrar Fase" style={{ ...inputBase, cursor: "pointer" }} onClick={(e) => e.stopPropagation()}>
          <option value="">Todas</option>
          <option value={FASE_PENDENTE_OS}>Pendente (menos Concluída/Cancelada) ({porFase.pendentes})</option>
          {fasesPresentes.map((f) => <option key={f.nome} value={f.label}>{f.label} ({f.n})</option>)}
        </select>
      );
    }
    if (c.k === "tipoServico") {
      return (
        <select value={v} onChange={(e) => setV(e.target.value)} aria-label="Filtrar Tipo" style={{ ...inputBase, cursor: "pointer" }} onClick={(e) => e.stopPropagation()}>
          <option value="">Todos</option>
          {tiposPresentes.map(([t, n]) => <option key={t} value={t}>{t} ({n})</option>)}
        </select>
      );
    }
    if (COLS_DATA_OS.includes(c.k)) {
      const token = v.startsWith("a_partir") ? "a_partir" : v;
      const iso = v.startsWith("a_partir") ? (v.split(":")[1] || "") : "";
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <select value={token} onChange={(e) => setV(e.target.value === "a_partir" ? "a_partir" : e.target.value)} aria-label={`Filtrar ${c.label}`} style={{ ...inputBase, cursor: "pointer" }} onClick={(e) => e.stopPropagation()}>
            {OPCOES_PERIODO.map((o) => <option key={o.valor} value={o.valor}>{o.label}</option>)}
          </select>
          {token === "a_partir" && <input type="date" value={iso} onChange={(e) => setV(`a_partir:${e.target.value}`)} aria-label={`${c.label} a partir de`} style={inputBase} onClick={(e) => e.stopPropagation()} />}
        </div>
      );
    }
    return <input type="text" value={v} placeholder="filtrar…" aria-label={`Filtrar ${c.label}`} style={inputBase} onChange={(e) => setV(e.target.value)} onClick={(e) => e.stopPropagation()} />;
  };

  return (
    <div style={{ padding: "8px 16px 24px", display: "flex", flexDirection: "column", gap: 12, fontFamily: "inherit", color: T.text }}>
      {/* ATALHOS por fase */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, color: T.light, marginRight: 4 }}>Atalhos:</span>
        <button type="button" style={chip(!filtroStatus)} onClick={() => setFiltroStatus("")}>Todas ({porFase.total})</button>
        <button type="button" style={chip(filtroStatus === FASE_PENDENTE_OS, filtroStatus === FASE_PENDENTE_OS ? { background: "#047857", borderColor: "#047857" } : {})} onClick={() => setFiltroStatus(filtroStatus === FASE_PENDENTE_OS ? "" : FASE_PENDENTE_OS)} title="Todas as fases menos Concluída e Cancelada">Pendente ({porFase.pendentes})</button>
        {fasesPresentes.map((f) => {
          const ativo = filtroStatus === f.nome;
          return (
            <button key={f.nome} type="button" onClick={() => setFiltroStatus(ativo ? "" : f.nome)} title={f.nome}
              style={chip(ativo, ativo ? { background: f.text, borderColor: f.text } : { background: f.bg, color: f.text, borderColor: f.bg })}>
              {f.label} ({f.n})
            </button>
          );
        })}
        <div style={{ flex: 1 }} />
        {(filtroStatus || temFiltroCol) && (
          <button type="button" style={{ ...btnBase, color: "#b91c1c", borderColor: "#fecaca", background: "#fef2f2" }} onClick={limpar}><i className="fas fa-times" /> Limpar filtros</button>
        )}
        <button type="button" style={btnBase} onClick={baixarCSV} title="Baixa um CSV (Excel) com a relação como está na tela"><i className="fas fa-file-csv" /> CSV</button>
        <button type="button" style={{ ...btnBase, background: "#111111", color: "#fefefe", borderColor: "#111111" }} onClick={imprimir} disabled={gerando}
          title="Gera um PDF com a relação exatamente como está na tela (busca, técnico, atalhos, filtros do cabeçalho e ordenação)">
          <i className={`fas fa-print ${gerando ? "fa-beat" : ""}`} /> {gerando ? "Gerando..." : "Imprimir"}
        </button>
      </div>
      {aviso && <div style={{ fontSize: 13, fontWeight: 600, color: "#b91c1c" }}>{aviso}</div>}

      {/* CARDS DE RESUMO — sempre sobre o filtrado */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
        <ResumoCard titulo="No filtro" n={totais.n} valor={totais.valor} cor={AZUL} ativo={!filtroStatus} onClick={() => setFiltroStatus("")} />
        <ResumoCard titulo="Pendentes" n={totais.pendentesN} valor={totais.pendentesV} cor="#047857" ativo={filtroStatus === FASE_PENDENTE_OS} onClick={() => setFiltroStatus(filtroStatus === FASE_PENDENTE_OS ? "" : FASE_PENDENTE_OS)} sub="menos Concluída/Cancelada" />
        <ResumoCard titulo="Concluídas" n={totais.concluidasN} valor={totais.concluidasV} cor="#1d4ed8" ativo={filtroStatus === "Concluída"} onClick={() => setFiltroStatus(filtroStatus === "Concluída" ? "" : "Concluída")} />
        <ResumoCard titulo="Atrasadas (pendentes)" n={totais.atrasadasN} cor="#b91c1c" sub={`${totais.horas} h · ${totais.km} km no filtro`} />
      </div>

      {/* TABELA */}
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1500 }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${T.border}` }}>
              {COLS_RELACAO_OS.map((c) => <Th key={c.k} k={c.k} label={c.label} right={c.k === "valor"} />)}
              {onPhaseChange && <th style={{ ...thBase, cursor: "default", width: 190 }}>Alterar fase</th>}
            </tr>
            <tr style={{ background: T.bg }}>
              {COLS_RELACAO_OS.map((c) => <th key={c.k} style={{ padding: "4px 6px 8px" }}>{renderFiltro(c)}</th>)}
              {onPhaseChange && <th />}
            </tr>
          </thead>
          <tbody>
            {ordenadas.length === 0 ? (
              <tr><td colSpan={COLS_RELACAO_OS.length + 1} style={{ ...tdBase, textAlign: "center", padding: 40, color: T.light, fontWeight: 600 }}>Nenhuma OS encontrada</td></tr>
            ) : ordenadas.map((o) => {
              const f = faseOS(o.status);
              const atrasada = (o.diasAtraso || 0) > 0 && estaPendente(o);
              return (
                <tr key={o.id} onClick={() => onCardClick(o)} className="pos-relacao-row" style={{ cursor: "pointer" }}>
                  <td style={{ ...tdBase, fontWeight: 800, fontSize: 14.5, whiteSpace: "nowrap" }}>{colTextoOS(o, "id")}{o.servicoInterno && <span title="Serviço interno" style={{ marginLeft: 6, fontSize: 9.5, fontWeight: 800, padding: "1px 5px", borderRadius: 4, background: "#f1f5f9", color: "#334155" }}>INT</span>}</td>
                  <td style={{ ...tdBase, fontWeight: 700, fontSize: 14.5, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={o.cliente}>{colTextoOS(o, "cliente")}</td>
                  <td style={{ ...tdBase, maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={o.tecnico}>{o.tecnico || <span style={{ color: "#94a3b8" }}>—</span>}</td>
                  <td style={{ ...tdBase, whiteSpace: "nowrap" }}>{o.tipoServico || <span style={{ color: "#94a3b8" }}>—</span>}</td>
                  <td style={{ ...tdBase, whiteSpace: "nowrap" }}>{colTextoOS(o, "data") || "—"}</td>
                  <td style={{ ...tdBase, textAlign: "right", fontWeight: 800, fontSize: 14.5, color: AZUL, whiteSpace: "nowrap" }}>{fmtBRL(valorOS(o))}</td>
                  <td style={tdBase}><span title={o.status} style={{ fontSize: 12, fontWeight: 700, padding: "3px 9px", borderRadius: 6, background: f.bg, color: f.text, whiteSpace: "nowrap" }}>{f.label}</span></td>
                  <td style={{ ...tdBase, whiteSpace: "nowrap" }}>{colTextoOS(o, "dataFase") || "—"}{atrasada && <span title={`${o.diasAtraso} dia(s) de atraso`} style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 800, color: "#b91c1c" }}>+{o.diasAtraso}d</span>}</td>
                  <td style={{ ...tdBase, whiteSpace: "nowrap" }}>{colTextoOS(o, "previsaoExecucao") || <span style={{ color: "#94a3b8" }}>—</span>}</td>
                  <td style={{ ...tdBase, whiteSpace: "nowrap" }}>{colTextoOS(o, "dataFimServico") || <span style={{ color: "#94a3b8" }}>—</span>}</td>
                  <td style={{ ...tdBase, whiteSpace: "nowrap" }}>{colTextoOS(o, "previsaoFaturamento") || <span style={{ color: "#94a3b8" }}>—</span>}</td>
                  <td style={{ ...tdBase, whiteSpace: "nowrap" }}>{o.ordemOmie || <span style={{ color: "#94a3b8" }}>—</span>}</td>
                  <td style={{ ...tdBase, whiteSpace: "nowrap" }}>{o.ppvId || <span style={{ color: "#94a3b8" }}>—</span>}</td>
                  <td style={{ ...tdBase, fontSize: 12.5, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={o.projeto}>{o.projeto || <span style={{ color: "#94a3b8" }}>—</span>}</td>
                  <td style={{ ...tdBase, fontSize: 12.5, fontStyle: "italic", color: T.light, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={o.servSolicitado}>{colTextoOS(o, "servSolicitado")}</td>
                  {onPhaseChange && (
                    <td style={tdBase} onClick={(e) => e.stopPropagation()}>
                      <select value={o.status} onChange={(e) => onPhaseChange(o.id, e.target.value)}
                        style={{ width: "100%", padding: "7px 8px", fontSize: 12.5, fontWeight: 600, borderRadius: 6, border: `1px solid ${T.border}`, background: "#fefefe", color: T.text, cursor: "pointer", fontFamily: "inherit" }}>
                        {PHASES.map((p) => <option key={p} value={p}>{rotuloFaseOS(p)}</option>)}
                      </select>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ textAlign: "right", fontSize: 13, color: T.light, fontWeight: 600 }}>
        {ordenadas.length} OS{orders.length !== ordenadas.length ? ` (de ${orders.length})` : ""}
      </div>
      <style jsx global>{`
        .pos-relacao-row:hover td { background: rgba(3, 105, 161, 0.07); }
      `}</style>
    </div>
  );
}
