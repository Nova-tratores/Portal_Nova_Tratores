"use client";

// =============================================
// DASHBOARD DO POS — valor e quantidade de Ordens de Serviço por mês (data e
// fim do serviço), por técnico, por tipo de serviço, por fase e por cliente.
// Lê as mesmas OS do quadro; agregações puras em lib/pos/relacao.ts; peças de
// gráfico compartilhadas com o PPV (components/comum/PainelBarras).
// =============================================
import { useMemo, useState } from "react";
import type { KanbanCard } from "@/lib/pos/types";
import {
  OPCOES_PERIODO, passaPeriodo, rotuloPeriodo, estaPendente, valorOS, fmtBRL, FASES_OS, FASE_PENDENTE_OS, faseOS, rotuloFaseOS,
  porMesDataOS, porMesFimOS, porTecnicoOS, porClienteOS, porTipoOS, porFaseOS, porMesPrevisaoOS, topComOutros, colTextoOS, type Agregado,
} from "@/lib/pos/relacao";
import { Painel, Tile, PopupComposicao, estilosTema, useTemaEscuro, type Metrica, type Tema } from "@/components/comum/PainelBarras";

interface Props {
  orders: KanbanCard[];
  searchTerm?: string;
  tecnicoFiltro?: string;
  onAbrirOS?: (order: KanbanCard) => void;
}

const TEMA: Tema = {
  accent: "#0369A1", accentDark: "#38BDF8", accentText: "#fefefe",
  surface: "var(--portal-bg-card, #fff)", border: "var(--portal-border, #e5e7eb)",
  text: "var(--portal-text, #1e293b)", textLight: "var(--portal-text-secondary, #64748b)",
  bg: "var(--portal-bg-secondary, #f8fafc)", primaryLight: "#E0F2FE", primaryText: "#0369A1",
};

export default function DashboardOS({ orders, searchTerm = "", tecnicoFiltro = "", onAbrirOS }: Props) {
  const dark = useTemaEscuro();
  const { card, select, lbl } = estilosTema(TEMA);
  const [periodo, setPeriodo] = useState("ultimos_90");
  const [aPartir, setAPartir] = useState("");
  const [fase, setFase] = useState("");
  const [tipo, setTipo] = useState("");
  const [tecnico, setTecnico] = useState("");
  const [metrica, setMetrica] = useState<Metrica>("valor");
  // Popup de composição: barra clicada → OS que formam aquele valor.
  const [drill, setDrill] = useState<{ titulo: string; ids: string[] } | null>(null);
  const onBarra = (a: Agregado, tituloPainel: string) => setDrill({ titulo: `${tituloPainel} · ${a.label}`, ids: a.ids });
  const tokenPeriodo = periodo === "a_partir" ? `a_partir:${aPartir}` : periodo;

  const tecnicos = useMemo(() => Array.from(new Set(orders.map((o) => (o.tecnico || "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR")), [orders]);
  const tipos = useMemo(() => Array.from(new Set(orders.map((o) => (o.tipoServico || "").trim()).filter(Boolean))).sort(), [orders]);
  const fasesPresentes = useMemo(() => {
    const m: Record<string, number> = {};
    for (const o of orders) m[o.status] = (m[o.status] || 0) + 1;
    return FASES_OS.filter((f) => m[f.nome]).map((f) => ({ ...f, n: m[f.nome] }));
  }, [orders]);

  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
  const q = searchTerm.trim().toLowerCase();
  const filtrados = useMemo(() => orders.filter((o) => {
    if (!passaPeriodo(o.data, tokenPeriodo)) return false;
    if (fase === FASE_PENDENTE_OS ? !estaPendente(o) : fase && o.status !== fase) return false;
    if (tipo && (o.tipoServico || "") !== tipo) return false;
    const tec = tecnico || tecnicoFiltro;
    if (tec && norm(o.tecnico || "") !== norm(tec)) return false;
    if (q && ![o.id, o.cliente, o.tecnico, o.ordemOmie, o.servSolicitado, o.projeto].some((v) => String(v || "").toLowerCase().includes(q))) return false;
    return true;
  }), [orders, tokenPeriodo, fase, tipo, tecnico, tecnicoFiltro, q]);

  const kpi = useMemo(() => {
    const n = filtrados.length;
    const valor = filtrados.reduce((s, o) => s + valorOS(o), 0);
    const pend = filtrados.filter(estaPendente);
    const conc = filtrados.filter((o) => o.status === "Concluída");
    return {
      n, valor, ticket: n ? valor / n : 0,
      pendN: pend.length, pendV: pend.reduce((s, o) => s + valorOS(o), 0),
      concN: conc.length, concV: conc.reduce((s, o) => s + valorOS(o), 0),
      cancN: filtrados.filter((o) => o.status === "Cancelada").length,
      atrasN: pend.filter((o) => (o.diasAtraso || 0) > 0).length,
      horas: filtrados.reduce((s, o) => s + (Number(o.qtdHoras) || 0), 0),
      km: filtrados.reduce((s, o) => s + (Number(o.qtdKm) || 0), 0),
      clientes: new Set(filtrados.map((o) => (o.cliente || "").trim()).filter(Boolean)).size,
      semPrev: filtrados.filter((o) => !o.previsaoFaturamento).length,
    };
  }, [filtrados]);

  const agMes = useMemo(() => porMesDataOS(filtrados), [filtrados]);
  const agFim = useMemo(() => porMesFimOS(filtrados), [filtrados]);
  const agPrev = useMemo(() => porMesPrevisaoOS(filtrados), [filtrados]);
  const agTec = useMemo(() => topComOutros(porTecnicoOS(filtrados).sort((a, b) => b[metrica] - a[metrica]), 10), [filtrados, metrica]);
  const agTipo = useMemo(() => porTipoOS(filtrados).sort((a, b) => b[metrica] - a[metrica]), [filtrados, metrica]);
  const agFase = useMemo(() => porFaseOS(filtrados), [filtrados]);
  const agCli = useMemo(() => porClienteOS(filtrados).sort((a, b) => b[metrica] - a[metrica]), [filtrados, metrica]);
  const agCliTop = useMemo(() => topComOutros(agCli, 12), [agCli]);

  const filtrosTexto = [
    rotuloPeriodo(tokenPeriodo) || "Todo o histórico",
    fase === FASE_PENDENTE_OS ? "Pendente" : fase ? rotuloFaseOS(fase) : "Todas as fases",
    tipo || "Todos os tipos",
    tecnico || tecnicoFiltro || "Todos os técnicos",
  ].join(" · ");

  const comum = { tema: TEMA, metrica, dark, onBarra };

  return (
    <div style={{ padding: "14px 16px 30px", display: "flex", flexDirection: "column", gap: 12, fontFamily: "inherit", color: TEMA.text }}>
      <div style={{ ...card, flexDirection: "row", flexWrap: "wrap", alignItems: "flex-end", gap: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={lbl}>Período (data da OS)</span>
          <div style={{ display: "flex", gap: 6 }}>
            <select value={periodo} onChange={(e) => setPeriodo(e.target.value)} style={select}>
              {OPCOES_PERIODO.filter((o) => o.valor !== "sem_data").map((o) => <option key={o.valor || "todas"} value={o.valor}>{o.valor ? o.label : "Todo o histórico"}</option>)}
            </select>
            {periodo === "a_partir" && <input type="date" value={aPartir} onChange={(e) => setAPartir(e.target.value)} style={select} />}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={lbl}>Fase</span>
          <select value={fase} onChange={(e) => setFase(e.target.value)} style={select}>
            <option value="">Todas</option>
            <option value={FASE_PENDENTE_OS}>Pendente (menos Concluída/Cancelada)</option>
            {fasesPresentes.map((f) => <option key={f.nome} value={f.nome}>{f.label} ({f.n})</option>)}
          </select>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={lbl}>Tipo de serviço</span>
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} style={select}>
            <option value="">Todos</option>
            {tipos.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={lbl}>Técnico</span>
          <select value={tecnico} onChange={(e) => setTecnico(e.target.value)} style={{ ...select, maxWidth: 220 }}>
            <option value="">{tecnicoFiltro ? `(header) ${tecnicoFiltro}` : "Todos"}</option>
            {tecnicos.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={lbl}>Métrica dos gráficos</span>
          <div style={{ display: "inline-flex", border: `1px solid ${TEMA.border}`, borderRadius: 6, overflow: "hidden" }}>
            {(["valor", "n"] as Metrica[]).map((m) => (
              <button key={m} type="button" onClick={() => setMetrica(m)} style={{ padding: "7px 14px", fontSize: 12.5, fontWeight: 700, border: "none", cursor: "pointer", background: metrica === m ? TEMA.accent : "#fefefe", color: metrica === m ? "#fefefe" : "#111111", fontFamily: "inherit" }}>
                {m === "valor" ? "Valor (R$)" : "Quantidade"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
        <Tile tema={TEMA} label="Ordens de serviço" valor={String(kpi.n)} sub={`${kpi.clientes} cliente${kpi.clientes !== 1 ? "s" : ""} · ${kpi.horas} h · ${kpi.km} km`} />
        <Tile tema={TEMA} label="Valor total" valor={fmtBRL(kpi.valor)} sub={filtrosTexto} destaque />
        <Tile tema={TEMA} label="Ticket médio" valor={fmtBRL(kpi.ticket)} sub="valor ÷ OS" />
        <Tile tema={TEMA} label="Pendentes" valor={fmtBRL(kpi.pendV)} sub={`${kpi.pendN} OS · ${kpi.atrasN} atrasada${kpi.atrasN !== 1 ? "s" : ""}`} cor="#047857" />
        <Tile tema={TEMA} label="Concluídas" valor={fmtBRL(kpi.concV)} sub={`${kpi.concN} OS · ${kpi.cancN} cancelada${kpi.cancN !== 1 ? "s" : ""}`} cor="#1d4ed8" />
      </div>

      {filtrados.length === 0 ? (
        <div style={{ ...card, alignItems: "center", padding: 40, color: TEMA.textLight, fontWeight: 600 }}>Nenhuma OS no filtro.</div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(440px, 1fr))", gap: 12 }}>
            <Painel {...comum} titulo="Por data (mês da OS)" sub={`${agMes.length} mês${agMes.length !== 1 ? "es" : ""}`} itens={agMes} horizontal={false} />
            <Painel {...comum} titulo="Por fim do serviço (mês)" sub="OS sem data de fim viram 'Sem fim'" itens={agFim} horizontal={false} corDe={(a) => (a.chave === "zzzz" ? (dark ? "#64748b" : "#94a3b8") : dark ? TEMA.accentDark : TEMA.accent)} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(440px, 1fr))", gap: 12 }}>
            <Painel {...comum} titulo="Por técnico" sub="top 10 + outros" itens={agTec} horizontal />
            <Painel {...comum} titulo="Por fase" sub="cores iguais às da relação" itens={agFase} horizontal corDe={(a) => faseOS(a.chave).text} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(440px, 1fr))", gap: 12 }}>
            <Painel {...comum} titulo="Por tipo de serviço" itens={agTipo} horizontal />
            <Painel {...comum} titulo="Por previsão de faturamento" sub={kpi.semPrev ? `${kpi.semPrev} sem previsão informada` : "todas com previsão"} itens={agPrev} horizontal={false} corDe={(a) => (a.chave === "zzzz" ? (dark ? "#64748b" : "#94a3b8") : dark ? TEMA.accentDark : TEMA.accent)} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 3fr) minmax(0, 2fr)", gap: 12 }}>
            <Painel {...comum} titulo="Por cliente" sub="top 12 + outros" itens={agCliTop} horizontal altura={Math.max(300, agCliTop.length * 30 + 40)} />
            <div style={{ ...card, padding: 0, overflow: "hidden" }}>
              <div style={{ padding: "12px 16px 8px", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <b style={{ fontSize: 14 }}>Clientes no filtro</b>
                <span style={{ fontSize: 12, color: TEMA.textLight }}>{agCli.length} cliente{agCli.length !== 1 ? "s" : ""}</span>
              </div>
              <div style={{ overflow: "auto", maxHeight: 420 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead><tr>{["Cliente", "OS", "Valor"].map((h, i) => <th key={h} style={{ textAlign: i ? "right" : "left", padding: "7px 12px", fontSize: 11, fontWeight: 800, textTransform: "uppercase", color: TEMA.textLight, position: "sticky", top: 0, background: TEMA.bg }}>{h}</th>)}</tr></thead>
                  <tbody>
                    {agCli.slice(0, 40).map((a) => {
                      const doCliente = filtrados.filter((o) => ((o.cliente || "").trim() || "(sem cliente)") === a.chave);
                      return (
                        <tr key={a.chave} style={{ borderTop: `1px solid ${TEMA.border}`, cursor: onAbrirOS && doCliente.length === 1 ? "pointer" : "default" }} onClick={() => { if (onAbrirOS && doCliente.length === 1) onAbrirOS(doCliente[0]); }} title={doCliente.length === 1 ? `Abrir ${doCliente[0].id}` : `${doCliente.length} OS`}>
                          <td style={{ padding: "7px 12px", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.label}</td>
                          <td style={{ padding: "7px 12px", textAlign: "right" }}>{a.n}</td>
                          <td style={{ padding: "7px 12px", textAlign: "right", fontWeight: 700, whiteSpace: "nowrap" }}>{fmtBRL(a.valor)}</td>
                        </tr>
                      );
                    })}
                    {agCli.length > 40 && <tr><td colSpan={3} style={{ padding: "8px 12px", color: TEMA.textLight, fontSize: 12 }}>… e mais {agCli.length - 40} clientes (use o modo Relação com filtro por cliente).</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
      {drill && (() => {
        const set = new Set(drill.ids);
        const linhas = filtrados.filter((o) => set.has(o.id)).sort((a, b) => valorOS(b) - valorOS(a))
          .map((o) => ({ id: o.id, valor: valorOS(o), celulas: [colTextoOS(o, "id"), o.cliente || "", o.tecnico || "", o.tipoServico || "", colTextoOS(o, "data"), colTextoOS(o, "status"), colTextoOS(o, "valor")] }));
        return <PopupComposicao tema={TEMA} titulo={drill.titulo} colunas={["Nº", "Cliente", "Técnico", "Tipo", "Data", "Fase", "Valor"]} linhas={linhas} colValor={6}
          onAbrir={onAbrirOS ? (id) => { const o = orders.find((x) => x.id === id); setDrill(null); if (o) onAbrirOS(o); } : undefined} onClose={() => setDrill(null)} />;
      })()}
    </div>
  );
}
