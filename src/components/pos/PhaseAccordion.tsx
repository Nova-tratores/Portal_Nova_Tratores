"use client";

import { useState, useMemo, memo, useCallback, useEffect } from "react";
import Link from "next/link";
import { PHASES } from "@/lib/pos/constants";
import { diasEntre } from "@/lib/pos/utils";
import type { KanbanCard } from "@/lib/pos/types";
import { STATUS_COR, STATUS_LABEL } from "@/lib/garantias/constants";
import { normName } from "@/lib/tecnico-utils";
import type { GarantiaStatus } from "@/lib/garantias/types";

interface PhaseViewProps {
  orders: KanbanCard[];
  searchTerm: string;
  onCardClick: (order: KanbanCard) => void;
  onPhaseChange?: (orderId: string, newPhase: string) => void;
  // Envio ao Omie (manual): botão por card e "Enviar todas" no cabeçalho da fase.
  onEnviarOmie?: (orderId: string) => void;
  onEnviarOmieTodas?: () => void;
  enviandoOmie?: string | null; // id da OS em envio, ou "__todas__"
  /** Filtro por técnico — controlado pelo header (fila de perfis com foto). */
  tecnicoFiltro?: string;
}

const FASE_ENVIAR_OMIE = "Enviar Omie";

// Fases SEM cor própria (pedido 21/08): tudo preto no claro — o #111827 é
// remapado pra claro no modo escuro pelas regras do globals.
const PRETO_FASE = "#111827";
export const PHASE_COLORS: Record<string, string> = {
  "Orçamento": PRETO_FASE,
  "Orçamento enviado para o cliente e aguardando": PRETO_FASE,
  "Aguardando ordem Técnico": PRETO_FASE,
  "Execução": PRETO_FASE,
  "Execução (Realizando Diagnóstico)": PRETO_FASE,
  "Execução aguardando peças (em transporte)": PRETO_FASE,
  "Relatório Atualizado": PRETO_FASE,
  "Aguardando outros": PRETO_FASE,
  "Executada": PRETO_FASE,
  "Relatório Concluído": PRETO_FASE,
  "Relatório Concluído - Garantia": PRETO_FASE,
  "Enviar Omie": PRETO_FASE,
  "Enviado Para Omie": PRETO_FASE,
  "Preenchido Garantia": PRETO_FASE,
  "Executada aguardando comercial": PRETO_FASE,
  "Concluída": PRETO_FASE,
  "Cancelada": PRETO_FASE,
};

// Seção virtual do quadro: as ordens na fase "Relatório Concluído" que têm
// garantia são separadas neste grupo próprio (não é um status real do banco).
const FASE_CONCLUIDO = "Relatório Concluído";
const FASE_CONCLUIDO_GAR = "Relatório Concluído - Garantia";

export const PHASE_SHORT: Record<string, string> = {
  "Orçamento": "Orçamento",
  "Orçamento enviado para o cliente e aguardando": "Orç. Enviado",
  "Aguardando ordem Técnico": "Aguard. Técnico",
  "Execução": "Execução",
  "Execução (Realizando Diagnóstico)": "Diagnóstico",
  "Execução aguardando peças (em transporte)": "Aguard. Peças",
  "Relatório Atualizado": "Rel. Atualizado",
  "Aguardando outros": "Aguard. Outros",
  "Executada": "Executada",
  "Relatório Concluído": "Rel. Concluído",
  "Enviar Omie": "Enviar Omie",
  "Enviado Para Omie": "Enviado Omie",
  "Preenchido Garantia": "Preench. Garantia",
  "Executada aguardando comercial": "Aguard. Comercial",
  "Concluída": "Concluída",
  "Cancelada": "Cancelada",
};

// Ícones "acesos" da capa do card em PRETO (pedido 21/08; o #111827 vira
// claro no modo escuro pelas regras do globals)
const S_ICON_COLOR = { color: "#111827" } as const;

function formatDateBR(dateStr: string): string {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return dateStr;
}

const MiniCard = memo(function MiniCard({ order: o, color, onClick, onPhaseChange, garantiaStatus, onDescEnter, onDescLeave, onEnviarOmie, enviandoOmie }: { order: KanbanCard; color: string; onClick: () => void; onPhaseChange?: (orderId: string, newPhase: string) => void; garantiaStatus?: GarantiaStatus; onDescEnter?: (rect: DOMRect, texto: string) => void; onDescLeave?: () => void; onEnviarOmie?: (orderId: string) => void; enviandoOmie?: string | null }) {
  const diasFase = diasEntre(o.dataFase);
  const temReqInfo = o.reqInfo && o.reqInfo.length > 0;
  const numero = String(o.id || "").replace(/^#?OS-?/i, "");

  return (
    <div className="mini-card" style={{ position: "relative", overflow: "visible" }} onClick={onClick}
      onMouseEnter={(e) => onDescEnter?.(e.currentTarget.getBoundingClientRect(), o.servSolicitado || "")}
      onMouseLeave={() => onDescLeave?.()}>
      {/* Título no padrão do PPV: número preto em destaque — cliente */}
      <div className="mini-card-titulo">
        <b className="pos-num-preto">{numero}</b>
        <span style={{ fontWeight: 400, color: "#334155" }}> — {o.cliente || "Sem Cliente"}</span>
      </div>
      {(o.servicoInterno || o.projetoCronograma) && (
        <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
          {o.servicoInterno && (
            <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.5, color: "#7C3AED", background: "#F3E8FF", border: "1px solid #DDD6FE", borderRadius: 3, padding: "1px 6px", textTransform: "uppercase" }}>
              <i className="fas fa-tools" style={{ marginRight: 3 }} />Interna
            </span>
          )}
          {o.projetoCronograma && (
            <Link href={`/cronograma/${o.projetoCronograma.id}`} onClick={(e) => e.stopPropagation()}
              title={`Projeto ${o.projetoCronograma.nome}`}
              style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.5, color: "#0D9488", background: "#CCFBF1", border: "1px solid #99F6E4", borderRadius: 3, padding: "1px 6px", textTransform: "uppercase", textDecoration: "none" }}>
              <i className="fas fa-diagram-project" style={{ marginRight: 3 }} />Cronograma
            </Link>
          )}
        </div>
      )}
      {onPhaseChange && (
        <div className="mini-card-phase" onClick={(e) => e.stopPropagation()}>
          <select
            value={o.status}
            onChange={(e) => onPhaseChange(o.id, e.target.value)}
            className="mini-card-phase-select"
          >
            {PHASES.map((p) => (
              <option key={p} value={p}>{PHASE_SHORT[p] || p}</option>
            ))}
          </select>
        </div>
      )}
      {/* Informações em LISTA (padrão PPV: rótulo à esquerda, valor à direita) */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 9 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 14 }}>
          <span style={{ color: "#94a3b8" }}><span className="mini-card-tipo-selo" style={{ marginRight: 6 }}>OS</span>Valor</span>
          <b style={{ color: "#0f172a", whiteSpace: "nowrap", fontSize: 15 }}>R$ {o.valor}</b>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 14 }}>
          <span style={{ color: "#94a3b8" }}><i className="fas fa-user-cog" style={{ marginRight: 5 }} />Técnico</span>
          <span style={{ color: "#334155", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.tecnico || "?"}</span>
        </div>
        {o.previsaoExecucao && (
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 14, alignItems: "center" }}>
            <span style={{ color: "#94a3b8" }}><i className="fas fa-wrench" style={{ marginRight: 5 }} />Execução</span>
            <span className="mini-card-date exec">{formatDateBR(o.previsaoExecucao)}</span>
          </div>
        )}
        {o.previsaoFaturamento && (
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 14, alignItems: "center" }}>
            <span style={{ color: "#94a3b8" }}><i className="fas fa-file-invoice-dollar" style={{ marginRight: 5 }} />Faturamento</span>
            <span className="mini-card-date fat">{formatDateBR(o.previsaoFaturamento)}</span>
          </div>
        )}
        {o.servSolicitado && <div className="mini-card-servico" style={{ marginTop: 2, marginBottom: 0 }}>{o.servSolicitado}</div>}
      </div>
      {/* Envio ao Omie: só nos cards da fila "Enviar Omie". Manual de propósito
          (cria ordem/pedido REAL no Omie). */}
      {onEnviarOmie && o.status === FASE_ENVIAR_OMIE && (
        <button
          onClick={(e) => { e.stopPropagation(); onEnviarOmie(o.id); }}
          disabled={!!enviandoOmie}
          title={`Enviar a ${o.id} ao Omie${o.temPPV ? " (com o PPV vinculado)" : ""}`}
          style={{
            width: "100%", marginTop: 8, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            padding: "7px 10px", borderRadius: 7, border: "none",
            background: enviandoOmie === o.id ? "#94A3B8" : "#0EA5E9", color: "#fff",
            fontSize: 12, fontWeight: 700, cursor: enviandoOmie ? "default" : "pointer",
            opacity: enviandoOmie && enviandoOmie !== o.id ? 0.5 : 1,
          }}>
          <i className={enviandoOmie === o.id ? "fas fa-spinner fa-spin" : "fas fa-paper-plane"} />
          {enviandoOmie === o.id ? "Enviando..." : "Enviar ao Omie"}
        </button>
      )}
      {o.diasAtraso > 0 &&!['execu', 'orçamento', 'orcamento', 'aguardando cliente'].some(s => (o.status || '').toLowerCase().includes(s)) && (
        <div className="mini-card-atraso">
          <i className="fas fa-exclamation-circle" /> {o.diasAtraso}d atrasado — cobrar {o.tecnico}
        </div>
      )}
      <div className="mini-card-bottom">
        <span className="mini-card-tecnico"><i className="fas fa-user-cog" /> {o.tecnico}</span>
        <span className="mini-card-dias">{diasFase}d</span>
        <span className="mini-card-icons">
          {o.temPPV && <i className="fas fa-box" style={S_ICON_COLOR} title="PPV vinculado" />}

          {/* Ícone REQ — tooltip no hover */}
          <span className="mc-icon-wrap" onClick={(e) => e.stopPropagation()}>
            <i className="fas fa-shopping-cart" title={o.temReq ? "Requisição vinculada" : "Sem requisição"} style={o.temReq ? S_ICON_COLOR : { color: "var(--border)" }} />
            {temReqInfo && (
              <div className="mc-tooltip">
                <div className="mc-tooltip-arrow" />
                <div style={{ fontSize: 9, fontWeight: 700, color: "#fbbf24", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
                  Requisições ({o.reqInfo!.length})
                </div>
                {o.reqInfo!.map((r) => (
                  <div key={r.id} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                    <span style={{ fontWeight: 700, color: "#fbbf24" }}>#{r.id}</span>
                    <span style={{ fontWeight: 700, color: "#34d399" }}>
                      R$ {r.valor.toFixed(2).replace(".", ",")}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </span>

          {/* Ícone REL — tooltip no hover */}
          <span className="mc-icon-wrap" onClick={(e) => e.stopPropagation()}>
            <i className="fas fa-file-alt" title={o.temRel ? "Relatório técnico anexado" : "Sem relatório técnico"} style={o.temRel ? S_ICON_COLOR : { color: "var(--border)" }} />
            {o.temRel && (
              <div className="mc-tooltip">
                <div className="mc-tooltip-arrow" />
                <div style={{ fontSize: 9, fontWeight: 700, color: "#60a5fa", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>
                  Relatório Técnico
                </div>
                <div style={{ color: "#e2e8f0", fontSize: 12 }}>
                  {o.relTecnico ? (
                    <>Preenchido por <span style={{ fontWeight: 700, color: "#60a5fa" }}>{o.relTecnico}</span></>
                  ) : "Relatório anexado"}
                </div>
              </div>
            )}
          </span>

          {/* Ícone GARANTIA — tooltip no hover */}
          <span className="mc-icon-wrap" onClick={(e) => e.stopPropagation()}>
            <i className="fas fa-shield-halved" title={garantiaStatus ? `Garantia: ${STATUS_LABEL[garantiaStatus]}` : "Sem garantia"} style={{ color: garantiaStatus ? "#111827" : "var(--border)" }} />
            {garantiaStatus && (
              <div className="mc-tooltip">
                <div className="mc-tooltip-arrow" />
                <div style={{ fontSize: 9, fontWeight: 700, color: "#38bdf8", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>
                  Garantia
                </div>
                <div style={{ color: "#e2e8f0", fontSize: 12 }}>{STATUS_LABEL[garantiaStatus]}</div>
              </div>
            )}
          </span>
        </span>
      </div>
    </div>
  );
});

// Fases abertas por padrão; só "Concluída" e "Cancelada" começam fechadas.
const COLLAPSED_DEFAULT = new Set(["Concluída", "Cancelada"]);
// Fases que aparecem no quadro mas SEM mostrar a contagem no cabeçalho.
const SEM_CONTAGEM = new Set(["Concluída", "Cancelada"]);

export default function PhaseView({ orders, searchTerm, onCardClick, onPhaseChange, onEnviarOmie, onEnviarOmieTodas, enviandoOmie, tecnicoFiltro = "" }: PhaseViewProps) {
  const [activePhase, setActivePhase] = useState<string>("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set(COLLAPSED_DEFAULT));
  const [garantiaMap, setGarantiaMap] = useState<Record<string, GarantiaStatus>>({});
  // Tooltip com a Descrição do Serviço completa ao passar o mouse no card
  const [descTip, setDescTip] = useState<{ texto: string; top: number; left: number } | null>(null);

  // Internas e externas ficam JUNTAS no quadro (decisão 21/08): interna vai
  // normal pro Omie, só muda que as peças saem como remessa. O selo INTERNA
  // no card continua identificando.
  const escopoOrders = orders;

  // Carrega quais OS têm garantia (para o ícone de escudo no card)
  useEffect(() => {
    fetch("/api/garantias")
      .then((r) => r.json())
      .then((d) => {
        const m: Record<string, GarantiaStatus> = {};
        for (const g of d.garantias || []) {
          if (g.id_ordem && !m[g.id_ordem]) m[g.id_ordem] = g.status;
        }
        setGarantiaMap(m);
      })
      .catch(() => {});
  }, []);

  // Mostra o tooltip da descrição ao lado do card (posição fixa, fora do fluxo)
  const onDescEnter = useCallback((rect: DOMRect, texto: string) => {
    if (!texto || !texto.trim()) { setDescTip(null); return; }
    const TW = 320;
    const left = rect.right + 12 + TW <= window.innerWidth ? rect.right + 12 : Math.max(12, rect.left - TW - 12);
    const top = Math.max(12, Math.min(rect.top, window.innerHeight - 260));
    setDescTip({ texto, top, left });
  }, []);
  const onDescLeave = useCallback(() => setDescTip(null), []);

  const toggleCollapse = useCallback((phase: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(phase)) next.delete(phase);
      else next.add(phase);
      return next;
    });
  }, []);

  // Pre-compute lowercase search term once
  const searchLower = useMemo(() => searchTerm.toLowerCase(), [searchTerm]);

  const filtered = useMemo(() => {
    return escopoOrders.filter(
      (o) =>
        (!searchLower ||
          o.cliente.toLowerCase().includes(searchLower) ||
          o.id.includes(searchLower) ||
          (o.ordemOmie || '').toLowerCase().includes(searchLower) || // nº que a OS virou no Omie
          o.servSolicitado.toLowerCase().includes(searchLower)) &&
        (!activePhase || o.status === activePhase) &&
        (!tecnicoFiltro || normName(o.tecnico || "") === normName(tecnicoFiltro))
    );
  }, [escopoOrders, searchLower, activePhase, tecnicoFiltro]);


  // Group by phase for "Todas" view
  const grouped = useMemo(() => {
    if (activePhase) return null;
    const map: Record<string, KanbanCard[]> = {};
    const phasesSet = new Set(PHASES);
    for (const phase of PHASES) {
      const items = filtered.filter((o) => o.status === phase);
      if (phase === FASE_CONCLUIDO) {
        // separa as concluídas: sem garantia ficam na fase; com garantia vão pro grupo próprio
        const semGar = items.filter((o) => !garantiaMap[o.id]);
        const comGar = items.filter((o) => garantiaMap[o.id]);
        if (semGar.length > 0) map[FASE_CONCLUIDO] = semGar;
        if (comGar.length > 0) map[FASE_CONCLUIDO_GAR] = comGar;
      } else if (items.length > 0) {
        // Fase vazia NÃO aparece (pedido 21/08 — antes Enviar/Enviado Omie e
        // Preenchido Garantia ficavam sempre visíveis, mesmo com 0).
        map[phase] = items;
      }
    }
    // Ordens com status desconhecido — não deixa sumir
    const orphans = filtered.filter((o) => !phasesSet.has(o.status));
    if (orphans.length > 0) map["Outros"] = orphans;
    return map;
  }, [filtered, activePhase, garantiaMap]);

  // Stable click handlers per card (avoid inline arrow in .map)
  const handleCardClick = useCallback((o: KanbanCard) => onCardClick(o), [onCardClick]);

  return (
    <>
      {/* Filtro por técnico agora vive no HEADER (fila de perfis com foto) */}

      {/* Cards */}
      <main className="cards-wrapper">
        {activePhase ? (
          /* Single phase grid */
          <div className="cards-grid">
            {filtered.map((o) => (
              <MiniCard
                key={o.id}
                order={o}
                color={PHASE_COLORS[o.status] || "#64748B"}
                onClick={() => handleCardClick(o)}
                onPhaseChange={onPhaseChange}
                garantiaStatus={garantiaMap[o.id]}
                onDescEnter={onDescEnter}
                onDescLeave={onDescLeave}
                onEnviarOmie={onEnviarOmie}
                enviandoOmie={enviandoOmie}
              />
            ))}
            {filtered.length === 0 && (
              <div className="cards-empty">Nenhuma ordem nesta fase</div>
            )}
          </div>
        ) : (
          /* Grouped view */
          grouped && Object.entries(grouped).map(([phase, items]) => (
            <div key={phase} className="phase-group">
              <div className="phase-group-header" onClick={() => toggleCollapse(phase)} style={{ cursor: "pointer" }}>
                <span className="phase-group-chevron" style={{ display: "inline-block", transition: "transform 0.2s", transform: collapsed.has(phase) ? "rotate(-90deg)" : "rotate(0deg)", marginRight: 6 }}>
                  <i className="fas fa-chevron-down" />
                </span>
                <span className="phase-group-dot" style={{ background: PHASE_COLORS[phase] }} />
                <span className="phase-group-name">{phase}</span>
                {!SEM_CONTAGEM.has(phase) && <span className="phase-group-count">{items.length}</span>}
                {/* "Enviar todas" — só no cabeçalho da fase "Enviar Omie" e se houver fila */}
                {onEnviarOmieTodas && phase === FASE_ENVIAR_OMIE && items.length > 0 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onEnviarOmieTodas(); }}
                    disabled={!!enviandoOmie}
                    title={`Enviar ao Omie as ${items.length} OS desta fase (uma a uma, com pausa entre elas)`}
                    style={{
                      marginLeft: 10, display: "inline-flex", alignItems: "center", gap: 6,
                      padding: "5px 12px", borderRadius: 7, border: "none",
                      background: enviandoOmie === "__todas__" ? "#94A3B8" : "#0EA5E9", color: "#fff",
                      fontSize: 12, fontWeight: 700, cursor: enviandoOmie ? "default" : "pointer",
                    }}>
                    <i className={enviandoOmie === "__todas__" ? "fas fa-spinner fa-spin" : "fas fa-paper-plane"} />
                    {enviandoOmie === "__todas__" ? "Enviando..." : `Enviar todas (${items.length})`}
                  </button>
                )}
                <div className="phase-group-line" />
              </div>
              {!collapsed.has(phase) && (
                <div className="cards-grid">
                  {items.map((o) => (
                    <MiniCard
                      key={o.id}
                      order={o}
                      color={PHASE_COLORS[phase] || "#64748B"}
                      onClick={() => handleCardClick(o)}
                      onPhaseChange={onPhaseChange}
                      garantiaStatus={garantiaMap[o.id]}
                      onDescEnter={onDescEnter}
                      onDescLeave={onDescLeave}
                onEnviarOmie={onEnviarOmie}
                enviandoOmie={enviandoOmie}
                    />
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </main>

      {/* Tooltip: Descrição do Serviço completa ao passar o mouse no card */}
      {descTip && (
        <div style={{
          position: "fixed", top: descTip.top, left: descTip.left, width: 320, maxHeight: "50vh", overflowY: "auto",
          zIndex: 100000, pointerEvents: "none", background: "#0f172a", color: "#e2e8f0",
          border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, boxShadow: "0 16px 40px rgba(0,0,0,0.35)", padding: "12px 14px",
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "#fbbf24", marginBottom: 6 }}>Descrição do Serviço</div>
          <div style={{ fontSize: 12.5, lineHeight: 1.55, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{descTip.texto}</div>
        </div>
      )}
    </>
  );
}
