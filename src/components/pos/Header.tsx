"use client";

import { useState, useRef, useEffect } from "react";
import { gateBtn, estiloSemPermissao } from "@/lib/permissoes/ui";
import ProjetosBusca, { abrirBuscaTrator } from "./ProjetosBusca";
import MenuRadial, { BotaoRedondo } from "@/components/comum/MenuRadial";
import { ESTILO_POS_VN, usePosVisualNovo } from "./VisualNovoPOS";
import { normName } from "@/lib/tecnico-utils";
import { BTN_BARRA } from "./botoes-barra";
import BuscaPOS from "./BuscaPOS";
import type { KanbanCard } from "@/lib/pos/types";

export interface PerfilTecnico { nome: string; avatar: string; inativo?: boolean }

// "JOSE ANTONIO DE OLIVEIRA" → "Jose Antonio de Oliveira"
const nomeBonito = (n: string) => n.trim().toLowerCase().replace(/(^|\s)(\S)/g, (_m, a: string, b: string) => a + b.toUpperCase()).replace(/ (De|Da|Do|Dos|Das|E) /g, (m) => m.toLowerCase());

interface HeaderProps {
  searchTerm: string;
  onSearch: (term: string) => void;
  onNewOS: () => void;
  onGenerateReport: (filtros: { tecnico: string; tipo: string }) => void;
  onLembretes?: () => void;
  tecnicos?: string[];
  valorHora: number;
  valorKm: number;
  onConfigSaved?: (valorHora: number, valorKm: number) => void;
  podeCriar?: boolean;
  /** Perfis dos TÉCNICOS (usuário do portal, com foto) — filtro por clique. */
  tecnicosPerfil?: PerfilTecnico[];
  tecnicoFiltro?: string;
  onTecnicoFiltro?: (nome: string) => void;
  /** OS em aberto por técnico (chave = normName do nome) */
  abertasPorTecnico?: Record<string, number>;
  /** OS da lista (para as sugestões e o histórico da busca, com a fase de agora) */
  ordens?: KanbanCard[];
  onAbrirOS?: (o: KanbanCard) => void;
}

export default function Header({ searchTerm, onSearch, onNewOS, onGenerateReport, onLembretes, tecnicos = [], valorHora, valorKm, onConfigSaved, podeCriar = true, tecnicosPerfil = [], tecnicoFiltro = "", onTecnicoFiltro, abertasPorTecnico = {}, ordens = [], onAbrirOS }: HeaderProps) {
  usePosVisualNovo();
  const [showFiltroRelatorio, setShowFiltroRelatorio] = useState(false);
  const [filtroTecnico, setFiltroTecnico] = useState("todos");
  const [filtroTipo, setFiltroTipo] = useState("todas");
  const [showConfig, setShowConfig] = useState(false);
  const [cfgHora, setCfgHora] = useState(valorHora);
  const [cfgKm, setCfgKm] = useState(valorKm);
  const [salvando, setSalvando] = useState(false);
  // Dropdown do filtro de técnicos (escondido por padrão)
  const [tecOpen, setTecOpen] = useState(false);
  const [tecBusca, setTecBusca] = useState("");
  const tecRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!tecOpen) return;
    function onDoc(e: MouseEvent) {
      if (tecRef.current && !tecRef.current.contains(e.target as Node)) setTecOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [tecOpen]);

  const handleGerar = () => {
    setShowFiltroRelatorio(false);
    onGenerateReport({ tecnico: filtroTecnico, tipo: filtroTipo });
  };

  const handleOpenConfig = () => {
    setCfgHora(valorHora);
    setCfgKm(valorKm);
    setShowConfig(true);
  };

  const handleSalvarConfig = async () => {
    setSalvando(true);
    try {
      const res = await fetch("/api/pos/configuracoes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ valor_hora: cfgHora, valor_km: cfgKm }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.erro || "Erro ao salvar");
        return;
      }
      onConfigSaved?.(cfgHora, cfgKm);
      setShowConfig(false);
    } catch {
      alert("Erro ao salvar configurações");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <>
      <header style={{ flexWrap: "wrap", rowGap: 10 }}>
        {/* Busca na ESQUERDA + perfis dos técnicos (filtro por foto) na direita
            dela + botões na cor da faixa azul (sem o logo — pedido de 21/08) */}
        <BuscaPOS searchTerm={searchTerm} onSearch={onSearch} ordens={ordens} onAbrirOS={onAbrirOS} />

        {tecnicosPerfil.length > 0 && (() => {
          const sel = tecnicosPerfil.find((t) => t.nome === tecnicoFiltro) || null;
          const bolinha = (t: PerfilTecnico, tam: number, marcado = false) => (
            <span style={{ position: "relative", width: tam, height: tam, flexShrink: 0, filter: t.inativo ? "grayscale(1)" : "none", opacity: t.inativo ? 0.6 : 1 }}>
              {t.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={t.avatar} alt={t.nome} style={{ width: tam, height: tam, borderRadius: "50%", objectFit: "cover", display: "block",
                  boxShadow: marcado ? "0 0 0 2px var(--surface, #fefefe), 0 0 0 4px #0369A1" : "0 0 0 1px var(--border, #E4D9C8)" }} />
              ) : (
                <span style={{ width: tam, height: tam, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                  background: "color-mix(in srgb, #0369A1 14%, var(--surface, #fefefe))", color: "#0369A1", fontWeight: 800, fontSize: tam / 2.5,
                  boxShadow: marcado ? "0 0 0 2px var(--surface, #fefefe), 0 0 0 4px #0369A1" : "none" }}>{t.nome.trim().charAt(0).toUpperCase()}</span>
              )}
            </span>
          );
          const q = normName(tecBusca);
          const casa = (t: PerfilTecnico) => !q || normName(t.nome).includes(q);
          const ordenar = (l: PerfilTecnico[]) => [...l].sort((a, b) => (abertasPorTecnico[normName(b.nome)] || 0) - (abertasPorTecnico[normName(a.nome)] || 0) || a.nome.localeCompare(b.nome, "pt-BR"));
          const ativos = ordenar(tecnicosPerfil.filter((t) => !t.inativo && casa(t)));
          const linha = (t: PerfilTecnico) => {
            const marcado = tecnicoFiltro === t.nome;
            const n = abertasPorTecnico[normName(t.nome)] || 0;
            return (
              <button key={t.nome} type="button"
                onClick={() => { onTecnicoFiltro?.(marcado ? "" : t.nome); setTecOpen(false); setTecBusca(""); }}
                title={marcado ? `Filtrando por ${t.nome} — clique pra limpar` : `Ver só as OS de ${t.nome}`}
                className="pos-tec-linha" data-marcado={marcado ? "1" : undefined}
                style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", border: "none", borderRadius: 9, cursor: "pointer", padding: "6px 8px", fontFamily: "inherit",
                  background: marcado ? "color-mix(in srgb, #0369A1 10%, transparent)" : "transparent", color: t.inativo ? "var(--portal-text-muted, #94a3b8)" : "var(--portal-text, #111827)" }}>
                {bolinha(t, 30, marcado)}
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13, fontWeight: marcado ? 800 : 600 }}>{nomeBonito(t.nome)}</span>
                {n > 0 && <span title={`${n} OS em aberto`} style={{ fontSize: 11, fontWeight: 800, padding: "1px 8px", borderRadius: 999, background: "var(--portal-bg-secondary, #eef2f6)", color: "var(--portal-text-secondary, #475569)", fontVariantNumeric: "tabular-nums" }}>{n}</span>}
                {marcado && <i className="fas fa-check" style={{ color: "#0369A1", fontSize: 12 }} />}
              </button>
            );
          };
          return (
            <>
              {/* O filtro abre pelo menu circular (José, 21/10/2026: "coloca isso no atalho"); na barra fica só o
                  aviso de quem está filtrado, pra não esquecer o filtro ligado */}
              {sel && (
                <button type="button" onClick={() => setTecOpen(true)} title="Trocar o técnico"
                  style={{ ...BTN_BARRA, borderColor: "#0369A1", background: "color-mix(in srgb, #0369A1 8%, var(--surface, #fefefe))" }}>
                  {bolinha(sel, 24)}
                  {nomeBonito(sel.nome).split(" ")[0]}
                  <span role="button" title="Limpar filtro" onClick={(e) => { e.stopPropagation(); onTecnicoFiltro?.(""); }}
                    style={{ marginLeft: 2, width: 18, height: 18, borderRadius: 9, display: "inline-flex", alignItems: "center", justifyContent: "center", background: "#0369A1", color: "#fefefe", fontSize: 10 }}>
                    <i className="fas fa-times" />
                  </span>
                </button>
              )}

              {tecOpen && (
                <div style={{ position: "fixed", inset: 0, zIndex: 9800, display: "grid", placeItems: "center", background: "rgba(15,23,42,.38)", backdropFilter: "blur(9px)", WebkitBackdropFilter: "blur(9px)" }}>
                <div ref={tecRef} style={{ width: 360, maxWidth: "92vw",
                  background: "var(--surface, #fefefe)", borderRadius: 16, border: "1px solid var(--border, #E4D9C8)", boxShadow: "0 24px 60px rgba(15,23,42,0.35)", overflow: "hidden" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px 4px" }}>
                    <span style={{ width: 34, height: 34, borderRadius: 10, display: "grid", placeItems: "center", color: "#0369A1", background: "color-mix(in srgb, #0369A1 10%, var(--surface, #fefefe))" }}><i className="fas fa-user-gear" /></span>
                    <span style={{ flex: 1, fontSize: 15.5, fontWeight: 500, color: "var(--portal-text, #0f172a)" }}>Filtrar por técnico</span>
                    <button type="button" onClick={() => setTecOpen(false)} aria-label="fechar" style={{ border: "none", background: "transparent", color: "#94a3b8", fontSize: 20, cursor: "pointer" }}>×</button>
                  </div>
                  <div style={{ padding: 8, borderBottom: "1px solid var(--border, #eef2f7)" }}>
                    <div style={{ position: "relative" }}>
                      <i className="fas fa-search" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: "var(--portal-text-muted, #94a3b8)" }} />
                      <input autoFocus value={tecBusca} onChange={(e) => setTecBusca(e.target.value)} placeholder="Buscar técnico…"
                        style={{ width: "100%", boxSizing: "border-box", padding: "7px 10px 7px 30px", borderRadius: 8, border: "1px solid var(--border, #E4D9C8)", background: "var(--portal-bg-secondary, #f8fafc)", fontSize: 13, color: "var(--portal-text, #111827)", fontFamily: "inherit" }} />
                    </div>
                  </div>
                  <div style={{ maxHeight: "55vh", overflowY: "auto", padding: 6 }}>
                    {!q && (
                      <button type="button" onClick={() => { onTecnicoFiltro?.(""); setTecOpen(false); }}
                        className="pos-tec-linha"
                        style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", border: "none", borderRadius: 9, cursor: "pointer", padding: "6px 8px", fontFamily: "inherit",
                          background: !tecnicoFiltro ? "color-mix(in srgb, #0369A1 10%, transparent)" : "transparent", color: "var(--portal-text, #111827)" }}>
                        <span style={{ width: 30, height: 30, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--portal-bg-secondary, #eef2f6)", color: "#0369A1", flexShrink: 0 }}><i className="fas fa-users" style={{ fontSize: 12 }} /></span>
                        <span style={{ flex: 1, fontSize: 13, fontWeight: !tecnicoFiltro ? 800 : 600 }}>Todos os técnicos</span>
                        {!tecnicoFiltro && <i className="fas fa-check" style={{ color: "#0369A1", fontSize: 12 }} />}
                      </button>
                    )}
                    {/* só os técnicos ativos (os inativados não aparecem — José, 14/10/2026) */}
                    {ativos.map(linha)}
                    {!ativos.length && <div style={{ padding: "14px 8px", textAlign: "center", fontSize: 12.5, color: "var(--portal-text-muted, #94a3b8)" }}>Nenhum técnico com esse nome.</div>}
                  </div>
                  <style>{`.pos-tec-linha:not([data-marcado]):hover { background: var(--portal-bg-secondary, #f1f5f9) !important; }`}</style>
                </div>
                </div>
              )}
            </>
          );
        })()}

        {/* Busca de PROJETOS (tratores): modelo + cliente + final do chassis */}
        <ProjetosBusca semBotao />

        {/* Atalhos num círculo + "+" da Nova ordem, os dois redondos (José, 21/10/2026) */}
        <div className="header-actions" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <style>{ESTILO_POS_VN}</style>
          <MenuRadial titulo="Atalhos: técnicos, buscar trator, lembretes, relatório, configurações" corGatilho="linear-gradient(135deg, #38bdf8, #0369a1)"
            centro={{ t: "Buscar trator", sub: "modelo, cliente ou chassi", ic: "fa-tractor", ir: abrirBuscaTrator }}
            itens={[
              ...(tecnicosPerfil.length > 0 ? [{ k: "tecnicos", t: "Técnicos", sub: tecnicoFiltro ? `filtrando: ${nomeBonito(tecnicoFiltro).split(" ")[0]}` : "ver as OS de um técnico", ic: "fa-user-gear", cor: "#0369a1", on: !!tecnicoFiltro, ir: () => { setTecBusca(""); setTecOpen(true); } }] : []),
              { k: "lembretes", t: "Lembretes", sub: "por cliente e máquina", ic: "fa-bell", cor: "#b45309", ir: () => onLembretes?.() },
              { k: "relatorio", t: "Gerar relatório", sub: "PDF por técnico e tipo", ic: "fa-file-invoice", cor: "#047857", ir: () => setShowFiltroRelatorio(true) },
              { k: "config", t: "Configurações", sub: "valor da hora e do km", ic: "fa-gear", cor: "#475569", ir: handleOpenConfig },
            ]} />
          <BotaoRedondo icone="fa-plus" titulo={podeCriar ? "Nova ordem de serviço" : "Sem permissão para criar OS"} onClick={onNewOS}
            {...gateBtn(podeCriar)} style={estiloSemPermissao(podeCriar)} />
        </div>
      </header>

      {showFiltroRelatorio && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setShowFiltroRelatorio(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--portal-bg-card)", borderRadius: 16, padding: 32, width: 420, maxWidth: "90vw",
              boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
              color: "var(--portal-text)",
            }}
          >
            <h3 style={{ margin: "0 0 24px", fontSize: 18, fontWeight: 700, color: "var(--portal-text)" }}>
              <i className="fas fa-filter" style={{ marginRight: 8, color: "#6366F1" }} />
              Filtros do Relatório
            </h3>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#64748B", textTransform: "uppercase", marginBottom: 8 }}>
                Técnico
              </label>
              <select
                value={filtroTecnico}
                onChange={(e) => setFiltroTecnico(e.target.value)}
                style={{
                  width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #E2E8F0",
                  fontSize: 14, color: "#1E293B", background: "#F8FAFC", cursor: "pointer",
                }}
              >
                <option value="todos">Todos os técnicos</option>
                {tecnicos.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: 28 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#64748B", textTransform: "uppercase", marginBottom: 8 }}>
                Tipo de ordens
              </label>
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={() => setFiltroTipo("todas")}
                  style={{
                    flex: 1, padding: "12px 16px", borderRadius: 10, border: "2px solid",
                    borderColor: filtroTipo === "todas" ? "#6366F1" : "#E2E8F0",
                    background: filtroTipo === "todas" ? "#EEF2FF" : "#fff",
                    color: filtroTipo === "todas" ? "#4F46E5" : "#64748B",
                    fontWeight: 600, fontSize: 13, cursor: "pointer", transition: "all 0.15s",
                  }}
                >
                  <i className="fas fa-list" style={{ marginRight: 6 }} />
                  Todas
                </button>
                <button
                  onClick={() => setFiltroTipo("atrasadas")}
                  style={{
                    flex: 1, padding: "12px 16px", borderRadius: 10, border: "2px solid",
                    borderColor: filtroTipo === "atrasadas" ? "#EF4444" : "#E2E8F0",
                    background: filtroTipo === "atrasadas" ? "#FEF2F2" : "#fff",
                    color: filtroTipo === "atrasadas" ? "#DC2626" : "#64748B",
                    fontWeight: 600, fontSize: 13, cursor: "pointer", transition: "all 0.15s",
                  }}
                >
                  <i className="fas fa-clock" style={{ marginRight: 6 }} />
                  Atrasadas
                </button>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setShowFiltroRelatorio(false)}
                style={{
                  flex: 1, padding: "12px", borderRadius: 10, border: "1px solid #E2E8F0",
                  background: "#fff", color: "#64748B", fontWeight: 600, fontSize: 14, cursor: "pointer",
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleGerar}
                style={{
                  flex: 1, padding: "12px", borderRadius: 10, border: "none",
                  background: "#1E293B", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer",
                }}
              >
                <i className="fas fa-file-invoice" style={{ marginRight: 6 }} />
                Gerar
              </button>
            </div>
          </div>
        </div>
      )}
      {showConfig && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setShowConfig(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--portal-bg-card)", borderRadius: 16, padding: 32, width: 420, maxWidth: "90vw",
              boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
              color: "var(--portal-text)",
            }}
          >
            <h3 style={{ margin: "0 0 24px", fontSize: 18, fontWeight: 700, color: "var(--portal-text)" }}>
              <i className="fas fa-cog" style={{ marginRight: 8, color: "#6366F1" }} />
              Configurações de Valores
            </h3>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#64748B", textTransform: "uppercase", marginBottom: 8 }}>
                Valor da Hora (R$)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={cfgHora}
                onChange={(e) => setCfgHora(parseFloat(e.target.value) || 0)}
                style={{
                  width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #E2E8F0",
                  fontSize: 14, color: "#1E293B", background: "#F8FAFC", boxSizing: "border-box",
                }}
              />
            </div>

            <div style={{ marginBottom: 28 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#64748B", textTransform: "uppercase", marginBottom: 8 }}>
                Valor do KM (R$)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={cfgKm}
                onChange={(e) => setCfgKm(parseFloat(e.target.value) || 0)}
                style={{
                  width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #E2E8F0",
                  fontSize: 14, color: "#1E293B", background: "#F8FAFC", boxSizing: "border-box",
                }}
              />
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setShowConfig(false)}
                style={{
                  flex: 1, padding: "12px", borderRadius: 10, border: "1px solid #E2E8F0",
                  background: "#fff", color: "#64748B", fontWeight: 600, fontSize: 14, cursor: "pointer",
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleSalvarConfig}
                disabled={salvando}
                style={{
                  flex: 1, padding: "12px", borderRadius: 10, border: "none",
                  background: "#1E293B", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer",
                  opacity: salvando ? 0.6 : 1,
                }}
              >
                <i className="fas fa-save" style={{ marginRight: 6 }} />
                {salvando ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
