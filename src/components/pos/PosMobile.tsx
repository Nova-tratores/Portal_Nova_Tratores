"use client";
import { casaBusca } from '@/lib/texto';
// Versão MOBILE do POS: tela pensada pro celular — busca, visão (Lista |
// Relação | Painel), filtros de tipo/fase/técnico e a lista de OS em CARTÕES
// grandes (nada de kanban de colunas). Reaproveita os mesmos dados, o mesmo
// drawer de detalhe e, na Relação/Painel, os mesmos componentes do PC.
// A versão de PC não usa este componente, então ela não muda.
import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import type { KanbanCard } from "@/lib/pos/types";
import { PHASE_COLORS, PHASE_SHORT, TIPOS_OS, tipoDaOS, type TipoOS } from "./PhaseAccordion";
import { PHASES } from "@/lib/pos/constants";
import { normName } from "@/lib/tecnico-utils";
import type { PerfilTecnico } from "./Header";

// Ordem canônica das fases (Concluída/Cancelada por último). Fase desconhecida vai pro fim.
const ordemFase = (s: string) => { const i = PHASES.indexOf(s); return i === -1 ? 998 : i; };

export type VisaoPos = "cards" | "relacao" | "dashboard";

interface Props {
  orders: KanbanCard[];
  searchTerm: string;
  onSearchChange: (v: string) => void;
  onCardClick: (order: KanbanCard) => void;
  onNewOS: () => void;
  podeCriar: boolean;
  loading: boolean;
  // Visão (a mesma escolha do PC, lembrada no navegador) — Relação/Painel vêm como children
  visao: VisaoPos;
  onVisao: (v: VisaoPos) => void;
  children?: ReactNode;
  // Filtro por técnico (o mesmo do cabeçalho do PC)
  tecnicosPerfil: PerfilTecnico[];
  abertasPorTecnico: Record<string, number>;
  tecnicoFiltro: string;
  onTecnicoFiltro: (nome: string) => void;
  onLembretes: () => void;
}

const cor = (s: string) => PHASE_COLORS[s] || "#64748b";
const curto = (s: string) => PHASE_SHORT[s] || s;
const dataBR = (d: string) => {
  if (!d) return "";
  const p = d.split("-");
  return p.length === 3 ? `${p[2]}/${p[1]}` : d;
};
// "JOSE ANTONIO DE OLIVEIRA" → "Jose Antonio de Oliveira"
const nomeBonito = (n: string) => n.trim().toLowerCase().replace(/(^|\s)(\S)/g, (_m, a: string, b: string) => a + b.toUpperCase()).replace(/ (De|Da|Do|Dos|Das|E) /g, (m) => m.toLowerCase());

// Linha de resumo do cartão: a descrição vem num modelo "Modelo: … Chassis: … Horimetro: …";
// rótulo sem valor (ex.: "Modelo: Chassis:") some pra não ocupar a linha à toa.
const resumoServico = (s?: string) => (s || "")
  .replace(/(Modelo|Chassis|Hor[ií]metro)\s*:\s*(?=(Modelo|Chassis|Hor[ií]metro|Solicita[çc][ãa]o[^:]*)\s*:|$)/gi, "")
  .replace(/\s+/g, " ").trim();

const LOTE = 60;

const VISOES: { v: VisaoPos; icone: string; rotulo: string }[] = [
  { v: "cards", icone: "fa-list", rotulo: "Lista" },
  { v: "relacao", icone: "fa-table-list", rotulo: "Relação" },
  { v: "dashboard", icone: "fa-chart-simple", rotulo: "Painel" },
];

const campo: React.CSSProperties = {
  width: "100%", minWidth: 0, height: 44, padding: "0 12px", borderRadius: 10, border: "1.5px solid var(--portal-border, #e2e8f0)",
  background: "var(--portal-bg-secondary, #f8fafc)", color: "var(--portal-text, #0f172a)", fontWeight: 600, outline: "none", marginBottom: 0, boxSizing: "border-box",
};

export default function PosMobile({ orders, searchTerm, onSearchChange, onCardClick, onNewOS, podeCriar, loading, visao, onVisao, children, tecnicosPerfil, abertasPorTecnico, tecnicoFiltro, onTecnicoFiltro, onLembretes }: Props) {
  const [fase, setFase] = useState<string>("TODAS");
  const [tipo, setTipo] = useState<TipoOS | "">("");
  // Celular fraco: desenha a lista aos poucos (838 cartões de uma vez travavam a tela)
  // (o lote volta ao primeiro quando muda filtro/busca: a chave do lote é o próprio filtro)
  const [lote, setLote] = useState({ chave: "", n: LOTE });

  // Quais OS têm garantia (mesma regra das abas do PC: garantia vale mais que interna)
  const [garantiaMap, setGarantiaMap] = useState<Record<string, boolean>>({});
  useEffect(() => {
    let ativo = true;
    fetch("/api/garantias").then((r) => r.json()).then((d) => {
      if (!ativo) return;
      const m: Record<string, boolean> = {};
      for (const g of d.garantias || []) if (g.id_ordem) m[g.id_ordem] = true;
      setGarantiaMap(m);
    }).catch(() => {});
    return () => { ativo = false; };
  }, []);

  // Busca + técnico (valem para tudo); tipo e fase só na lista
  const buscadas = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return orders.filter((o) =>
      (!q || casaBusca(q, o.id, o.cliente, o.tecnico, o.servSolicitado, o.ordemOmie)) &&
      (!tecnicoFiltro || normName(o.tecnico || "") === normName(tecnicoFiltro)));
  }, [orders, searchTerm, tecnicoFiltro]);

  const contaTipo = useMemo(() => {
    const c: Record<TipoOS, number> = { cliente: 0, garantia: 0, interna: 0 };
    for (const o of buscadas) if (o.status !== "Concluída" && o.status !== "Cancelada") c[tipoDaOS(o, !!garantiaMap[o.id])]++;
    return c;
  }, [buscadas, garantiaMap]);

  const doTipo = useMemo(() => tipo ? buscadas.filter((o) => tipoDaOS(o, !!garantiaMap[o.id]) === tipo) : buscadas, [buscadas, tipo, garantiaMap]);

  // Fases presentes (com contagem), na ordem canônica.
  const fasesPresentes = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of doTipo) m.set(o.status, (m.get(o.status) || 0) + 1);
    return [...m.entries()].sort((a, b) => ordemFase(a[0]) - ordemFase(b[0]));
  }, [doTipo]);

  const chaveLote = `${searchTerm}|${tecnicoFiltro}|${tipo}|${fase}`;
  const limite = lote.chave === chaveLote ? lote.n : LOTE;
  const contaFase = useMemo(() => { const m: Record<string, number> = {}; for (const o of doTipo) m[o.status] = (m[o.status] || 0) + 1; return m; }, [doTipo]);

  const filtradas = useMemo(() => doTipo
    .filter((o) => fase === "TODAS" || o.status === fase)
    // Mesma ordem do PC: agrupadas por fase (Concluída/Cancelada por último),
    // nunca misturando cancelada com aberta. Sort estável mantém a ordem dentro da fase.
    .sort((a, b) => ordemFase(a.status) - ordemFase(b.status)), [doTipo, fase]);

  // Técnicos: ativos primeiro (por nº de OS em aberto), inativos no fim
  const tecnicosOrdenados = useMemo(() => [...tecnicosPerfil].sort((a, b) =>
    (a.inativo ? 1 : 0) - (b.inativo ? 1 : 0) || (abertasPorTecnico[normName(b.nome)] || 0) - (abertasPorTecnico[normName(a.nome)] || 0) || a.nome.localeCompare(b.nome)),
  [tecnicosPerfil, abertasPorTecnico]);
  const perfilAtivo = tecnicosPerfil.find((t) => normName(t.nome) === normName(tecnicoFiltro));
  const naLista = visao === "cards";

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "calc(100dvh - var(--portal-header-h))", background: "var(--portal-bg, #f1f5f9)" }}>
      {/* Topo: título, lembretes e visão */}
      <div style={{ background: "var(--portal-bg-card, #fff)", padding: "12px 14px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <span style={{ fontSize: 19, fontWeight: 800, color: "var(--portal-text, #0f172a)", flex: 1, minWidth: 0 }}>Ordens de Serviço</span>
          {naLista && <span style={{ fontSize: 13, color: "var(--portal-text-secondary, #64748b)", fontWeight: 700 }}>{filtradas.length}</span>}
          <button type="button" onClick={onLembretes} aria-label="Lembretes" title="Lembretes"
            style={{ width: 44, height: 44, borderRadius: 12, border: "1.5px solid #FB923C", background: "#FFF7ED", color: "#C2410C", fontSize: 17, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
            <i className="fas fa-bell" />
          </button>
        </div>
        <div role="tablist" aria-label="Visão" style={{ display: "flex", padding: 3, gap: 3, borderRadius: 12, background: "var(--portal-bg-secondary, #f1f5f9)", border: "1px solid var(--portal-border, #e5e7eb)" }}>
          {VISOES.map(({ v, icone, rotulo }) => {
            const ativo = visao === v;
            return (
              <button key={v} type="button" role="tab" aria-selected={ativo} onClick={() => onVisao(v)}
                style={{ flex: 1, height: 40, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, borderRadius: 9, border: "none", background: ativo ? "#0369A1" : "transparent", color: ativo ? "#fefefe" : "var(--portal-text-secondary, #475569)", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                <i className={`fas ${icone}`} /> {rotulo}
              </button>
            );
          })}
        </div>
      </div>

      {/* Busca gruda no topo ao rolar (vale para as três visões) */}
      <div style={{ position: "sticky", top: "var(--portal-header-h)", zIndex: 10, background: "var(--portal-bg-card, #fff)", padding: "10px 14px", borderBottom: "1px solid var(--portal-border, #e2e8f0)" }}>
        <div style={{ position: "relative" }}>
          <i className="fas fa-search" style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#94a3b8", fontSize: 15 }} />
          <input value={searchTerm} onChange={(e) => onSearchChange(e.target.value)} placeholder="Buscar OS, cliente, técnico…" aria-label="Buscar OS"
            style={{ ...campo, height: 46, padding: "0 44px 0 40px", fontWeight: 400, borderRadius: 12 }} />
          {searchTerm && (
            <button onClick={() => onSearchChange("")} aria-label="Limpar busca" style={{ position: "absolute", right: 2, width: 44, height: 44, top: "50%", transform: "translateY(-50%)", border: "none", background: "transparent", color: "#94a3b8", cursor: "pointer", fontSize: 16 }}><i className="fas fa-times" /></button>
          )}
        </div>
      </div>

      {/* Filtros: técnico (todas as visões) + tipo e fase (lista) */}
      <div style={{ background: "var(--portal-bg-card, #fff)", padding: "10px 14px", borderBottom: "1px solid var(--portal-border, #eef2f7)", display: "flex", flexDirection: "column", gap: 10 }}>
        {naLista && (
          <div className="m-rolar-x" style={{ display: "flex", gap: 8, margin: "0 -14px", padding: "0 14px" }}>
            {[{ id: "" as const, curto: "Todas", cor: "#0f172a", icone: "fa-layer-group" }, ...TIPOS_OS].map((t) => {
              const ativo = tipo === t.id;
              const n = t.id ? contaTipo[t.id] : 0;
              return (
                <button key={t.id || "todas"} type="button" onClick={() => { setTipo(t.id); setFase("TODAS"); }}
                  style={{ height: 38, padding: "0 14px", borderRadius: 999, border: `1.5px solid ${ativo ? t.cor : "var(--portal-border, #e2e8f0)"}`, background: ativo ? t.cor : "var(--portal-bg-card, #fff)", color: ativo ? "#fefefe" : "var(--portal-text, #334155)", fontSize: 13.5, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 7, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                  <i className={`fas ${t.icone}`} style={{ color: ativo ? "#fefefe" : t.cor }} /> {t.curto}
                  {t.id && n > 0 && <span style={{ fontSize: 12, fontWeight: 800, opacity: 0.85 }}>{n}</span>}
                </button>
              );
            })}
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: naLista ? "1fr 1fr" : "1fr", gap: 8 }}>
          {naLista && (
            <div style={{ position: "relative", minWidth: 0 }}>
              <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", width: 10, height: 10, borderRadius: "50%", background: fase === "TODAS" ? "#0f172a" : cor(fase), pointerEvents: "none" }} />
              <select value={fase} onChange={(e) => setFase(e.target.value)} aria-label="Fase" style={{ ...campo, paddingLeft: 28 }}>
                <option value="TODAS">Fase ({doTipo.length})</option>
                {fasesPresentes.map(([s, n]) => <option key={s} value={s}>{curto(s)} ({n})</option>)}
              </select>
            </div>
          )}
          <div style={{ position: "relative", minWidth: 0 }}>
            {perfilAtivo?.avatar
              ? <img src={perfilAtivo.avatar} alt="" style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", width: 26, height: 26, borderRadius: "50%", objectFit: "cover", pointerEvents: "none" }} />
              : <i className="fas fa-user-gear" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: tecnicoFiltro ? "#0369A1" : "#94a3b8", fontSize: 13, pointerEvents: "none" }} />}
            <select value={tecnicoFiltro} onChange={(e) => onTecnicoFiltro(e.target.value)} aria-label="Técnico"
              style={{ ...campo, paddingLeft: perfilAtivo?.avatar ? 40 : 34, borderColor: tecnicoFiltro ? "#0369A1" : "var(--portal-border, #e2e8f0)" }}>
              <option value="">Técnico</option>
              {tecnicosOrdenados.map((t) => {
                const n = abertasPorTecnico[normName(t.nome)] || 0;
                return <option key={t.nome} value={t.nome}>{nomeBonito(t.nome)}{n ? ` (${n})` : ""}{t.inativo ? " · inativo" : ""}</option>;
              })}
            </select>
          </div>
        </div>
      </div>

      {/* Relação / Painel: os mesmos componentes do PC */}
      {!naLista && <div style={{ background: "var(--portal-bg, #f1f5f9)", paddingBottom: 90 }}>{children}</div>}

      {/* Lista de cartões */}
      {naLista && (
      <div style={{ flex: 1, padding: "12px 14px 96px" }}>
        {loading && orders.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "#94a3b8" }}><i className="fas fa-spinner fa-spin" style={{ marginRight: 8 }} />Carregando…</div>
        ) : filtradas.length === 0 ? (
          <div style={{ textAlign: "center", padding: 50, color: "#94a3b8" }}>
            <i className="fas fa-inbox" style={{ fontSize: 34, display: "block", marginBottom: 12, color: "#cbd5e1" }} />
            Nenhuma OS {fase !== "TODAS" ? "nesta fase" : ""}{searchTerm ? " para essa busca" : ""}{tecnicoFiltro ? " deste técnico" : ""}.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {filtradas.slice(0, limite).map((o, idx) => {
              const c = cor(o.status);
              const atraso = Number(o.diasAtraso) || 0;
              const tipoOS = tipoDaOS(o, !!garantiaMap[o.id]);
              const tipoInfo = TIPOS_OS.find((t) => t.id === tipoOS);
              // Cabeçalho da fase quando muda (só em "Todas") — leitura em grupos, como no PC.
              const header = fase === "TODAS" && (idx === 0 || filtradas[idx - 1].status !== o.status);
              return (
                <Fragment key={o.id}>
                {header && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 2px 0", marginTop: idx === 0 ? 0 : 6 }}>
                    <span style={{ width: 9, height: 9, borderRadius: "50%", background: c }} />
                    <span style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.4, color: "var(--portal-text-secondary, #475569)" }}>{curto(o.status)}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#94a3b8" }}>{contaFase[o.status] || 0}</span>
                  </div>
                )}
                <button onClick={() => onCardClick(o)} style={{
                  textAlign: "left", display: "flex", padding: 0, borderRadius: 14, border: "1px solid var(--portal-border, #e7ebf0)", background: "var(--portal-bg-card, #fff)", cursor: "pointer",
                  overflow: "hidden", boxShadow: "0 1px 2px rgba(16,24,40,0.04)", fontFamily: "inherit", width: "100%",
                }}>
                  <div style={{ width: 5, background: c, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0, padding: "12px 14px" }}>
                    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
                      <span style={{ fontSize: 15.5, fontWeight: 700, color: "var(--portal-text, #0f172a)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.cliente || "Sem cliente"}</span>
                      <span style={{ fontSize: 15, fontWeight: 800, color: "var(--portal-text, #0f172a)", flexShrink: 0 }}>R$ {o.valor || "0,00"}</span>
                    </div>
                    {resumoServico(o.servSolicitado) && (
                      <div style={{ fontSize: 13, color: "var(--portal-text-secondary, #64748b)", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{resumoServico(o.servSolicitado)}</div>
                    )}
                    <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "8px 0 7px", flexWrap: "wrap" }}>
                      <span style={{ fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 999, background: `${c}18`, color: c }}>{curto(o.status)}</span>
                      {atraso > 0 && <span style={{ fontSize: 12, fontWeight: 700, padding: "3px 9px", borderRadius: 999, background: "#fee2e2", color: "#dc2626" }}><i className="fas fa-clock" style={{ marginRight: 4 }} />{atraso}d atraso</span>}
                      {tipoOS !== "cliente" && tipoInfo && <span style={{ fontSize: 12, fontWeight: 700, padding: "3px 9px", borderRadius: 999, background: `${tipoInfo.cor}1a`, color: tipoInfo.cor }}><i className={`fas ${tipoInfo.icone}`} style={{ marginRight: 4 }} />{tipoInfo.curto === "Garantias" ? "Garantia" : "Interna"}</span>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "4px 12px", fontSize: 12.5, color: "var(--portal-text-secondary, #64748b)", flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 700, color: "#dc2626" }}>{o.id}</span>
                      {o.tecnico && <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}><i className="fas fa-user-gear" style={{ marginRight: 4, opacity: .7 }} />{nomeBonito(o.tecnico)}</span>}
                      {o.data && <span><i className="fas fa-calendar" style={{ marginRight: 4, opacity: .7 }} />{dataBR(o.data)}</span>}
                      {(o.temPPV || o.temReq || o.temRel) && (
                        <span style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
                          {o.temPPV && <i className="fas fa-boxes" style={{ color: "#dc2626" }} title="Tem PPV" aria-label="Tem PPV" />}
                          {o.temReq && <i className="fas fa-clipboard-list" style={{ color: "#f97316" }} title="Tem requisição" aria-label="Tem requisição" />}
                          {o.temRel && <i className="fas fa-file-lines" style={{ color: "#0ea5e9" }} title="Tem relatório" aria-label="Tem relatório" />}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
                </Fragment>
              );
            })}
            {filtradas.length > limite && (
              <button type="button" onClick={() => setLote({ chave: chaveLote, n: limite + LOTE })}
                style={{ marginTop: 6, height: 48, borderRadius: 12, border: "1.5px solid var(--portal-border, #e2e8f0)", background: "var(--portal-bg-card, #fff)", color: "#0369A1", fontSize: 14.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                Mostrar mais ({filtradas.length - limite} restantes)
              </button>
            )}
          </div>
        )}
      </div>
      )}

      {/* Botão flutuante Nova OS */}
      {podeCriar && (
        <button onClick={onNewOS} title="Nova OS" aria-label="Nova OS" style={{
          position: "fixed", right: 18, bottom: "calc(22px + env(safe-area-inset-bottom))", zIndex: 20, width: 58, height: 58, borderRadius: "50%", border: "none",
          background: "#dc2626", color: "#fefefe", fontSize: 24, cursor: "pointer", boxShadow: "0 8px 22px rgba(220,38,38,0.45)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <i className="fas fa-plus" />
        </button>
      )}
    </div>
  );
}
