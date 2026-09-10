"use client";

// =============================================
// ABA DASHBOARD DO PPV — valor e quantidade de pedidos por data (mês), por
// técnico, por cliente, por previsão de faturamento e por fase. Lê os mesmos
// pedidos do kanban (PPVContext); as agregações são puras (lib/ppv/relacao.ts).
// Um eixo por gráfico (Valor OU Quantidade — o toggle troca a métrica em todos),
// uma cor só para "magnitude" (laranja do sistema Peças), fase com as cores da
// tela, tooltip em todo mark e visão em tabela em cada painel.
// =============================================
import { useMemo, useState } from "react";
import { Painel, Tile, PopupComposicao, estilosTema, useTemaEscuro, type Metrica, type Tema } from "@/components/comum/PainelBarras";
import type { KanbanItem } from "@/lib/ppv/types";
import { STATUS_COLORS, STATUS_OPTIONS, rotuloStatus } from "@/lib/ppv/constants";
import {
  OPCOES_PERIODO, passaPeriodo, rotuloPeriodo, isRemessa, statusNorm, estaAberto, fmtBRL, valorNum,
  porMesData, porMesPrevisao, porTecnico, porCliente, porFase, topComOutros, colTextoRelacao, type Agregado,
} from "@/lib/ppv/relacao";

interface Props {
  orders: KanbanItem[];
  onAbrirPedido?: (id: string) => void;
}

const LARANJA = "#e8730c";
const LARANJA_ESCURO = "#f59e4b";   // passo mais claro para o fundo escuro (não é o mesmo tom invertido)

// Tema do PPV para as peças compartilhadas de gráfico (components/comum/PainelBarras).
const TEMA_PPV: Tema = {
  accent: LARANJA, accentDark: LARANJA_ESCURO, accentText: "#fefefe",
  surface: "var(--ppv-surface)", border: "var(--ppv-border-light)", text: "var(--ppv-text)", textLight: "var(--ppv-text-light)",
  bg: "var(--ppv-bg)", primaryLight: "var(--ppv-primary-light)", primaryText: "#c2570a",
};
const { card, select: selectStyle, lbl } = estilosTema(TEMA_PPV);

export default function DashboardPPV({ orders, onAbrirPedido }: Props) {
  const dark = useTemaEscuro();
  const corBarra = dark ? LARANJA_ESCURO : LARANJA;

  // ---- filtros (uma linha, acima dos painéis) ----
  const [periodo, setPeriodo] = useState("ultimos_90");   // padrão: 3 meses (com "este mês" o gráfico por data vira uma barra só)
  const [aPartir, setAPartir] = useState("");
  const [fase, setFase] = useState("");
  const [tipo, setTipo] = useState<"TODOS" | "PPV" | "REM">("TODOS");
  const [tecnico, setTecnico] = useState("");
  const [metrica, setMetrica] = useState<Metrica>("valor");
  // Popup de composição: barra clicada → pedidos que formam aquele valor.
  const [drill, setDrill] = useState<{ titulo: string; ids: string[] } | null>(null);
  const onBarra = (a: Agregado, tituloPainel: string) => setDrill({ titulo: `${tituloPainel} · ${a.label}`, ids: a.ids });
  const tokenPeriodo = periodo === "a_partir" ? `a_partir:${aPartir}` : periodo;

  const tecnicos = useMemo(() => Array.from(new Set(orders.map((o) => (o.tecnico || "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR")), [orders]);
  const fasesPresentes = useMemo(() => {
    const m: Record<string, number> = {};
    for (const o of orders) { const s = statusNorm(o); m[s] = (m[s] || 0) + 1; }
    return STATUS_OPTIONS.filter((s) => m[s.value]).map((s) => ({ value: s.value, label: s.label, n: m[s.value] }));
  }, [orders]);

  const filtrados = useMemo(() => orders.filter((o) => {
    if (!passaPeriodo(o.data, tokenPeriodo)) return false;
    if (fase === "__abertos" ? !estaAberto(o) : fase && statusNorm(o) !== fase) return false;
    if (tipo === "PPV" && isRemessa(o)) return false;
    if (tipo === "REM" && !isRemessa(o)) return false;
    if (tecnico && (o.tecnico || "").trim() !== tecnico) return false;
    return true;
  }), [orders, tokenPeriodo, fase, tipo, tecnico]);

  // ---- números de cabeça ----
  const kpi = useMemo(() => {
    const n = filtrados.length;
    const valor = filtrados.reduce((s, o) => s + valorNum(o), 0);
    const abertos = filtrados.filter(estaAberto);
    const faturados = filtrados.filter((o) => statusNorm(o) === "Concluída");
    const cancelados = filtrados.filter((o) => statusNorm(o) === "Cancelada");
    return {
      n, valor, ticket: n ? valor / n : 0,
      abertosN: abertos.length, abertosV: abertos.reduce((s, o) => s + valorNum(o), 0),
      faturadosN: faturados.length, faturadosV: faturados.reduce((s, o) => s + valorNum(o), 0),
      canceladosN: cancelados.length,
      clientes: new Set(filtrados.map((o) => (o.cliente || "").trim()).filter(Boolean)).size,
      semPrevisao: filtrados.filter((o) => !o.previsaoFaturamento).length,
    };
  }, [filtrados]);

  // ---- agregações ----
  const agMes = useMemo(() => porMesData(filtrados), [filtrados]);
  const agPrev = useMemo(() => porMesPrevisao(filtrados), [filtrados]);
  const agTec = useMemo(() => topComOutros(porTecnico(filtrados).sort((a, b) => b[metrica] - a[metrica]), 10), [filtrados, metrica]);
  const agCli = useMemo(() => porCliente(filtrados).sort((a, b) => b[metrica] - a[metrica]), [filtrados, metrica]);
  const agCliTop = useMemo(() => topComOutros(agCli, 12), [agCli]);
  const agFase = useMemo(() => porFase(filtrados), [filtrados]);

  const filtrosTexto = [
    rotuloPeriodo(tokenPeriodo) || "Todas as datas",
    fase === "__abertos" ? "Pendente" : fase ? rotuloStatus(fase) : "Todas as fases",
    tipo === "TODOS" ? "PPV + REM" : tipo,
    tecnico || "Todos os técnicos",
  ].join(" · ");

  return (
    <div style={{ padding: "14px 16px 30px", display: "flex", flexDirection: "column", gap: 12, fontFamily: "'Poppins', sans-serif", color: "var(--ppv-text)" }}>
      {/* FILTROS — uma linha */}
      <div style={{ ...card, flexDirection: "row", flexWrap: "wrap", alignItems: "flex-end", gap: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={lbl}>Período (data do pedido)</span>
          <div style={{ display: "flex", gap: 6 }}>
            <select value={periodo} onChange={(e) => setPeriodo(e.target.value)} style={selectStyle}>
              {OPCOES_PERIODO.filter((o) => o.valor !== "sem_data").map((o) => <option key={o.valor || "todas"} value={o.valor}>{o.valor ? o.label : "Todo o histórico"}</option>)}
            </select>
            {periodo === "a_partir" && <input type="date" value={aPartir} onChange={(e) => setAPartir(e.target.value)} style={selectStyle} />}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={lbl}>Fase</span>
          <select value={fase} onChange={(e) => setFase(e.target.value)} style={selectStyle}>
            <option value="">Todas</option>
            <option value="__abertos">Pendente (menos Faturado/Cancelada)</option>
            {fasesPresentes.map((f) => <option key={f.value} value={f.value}>{f.label} ({f.n})</option>)}
          </select>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={lbl}>Tipo</span>
          <select value={tipo} onChange={(e) => setTipo(e.target.value as "TODOS" | "PPV" | "REM")} style={selectStyle}>
            <option value="TODOS">PPV + REM</option><option value="PPV">Só PPV</option><option value="REM">Só REM</option>
          </select>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={lbl}>Técnico</span>
          <select value={tecnico} onChange={(e) => setTecnico(e.target.value)} style={{ ...selectStyle, maxWidth: 220 }}>
            <option value="">Todos</option>
            {tecnicos.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={lbl}>Métrica dos gráficos</span>
          <div style={{ display: "inline-flex", border: "1px solid var(--ppv-border-light)", borderRadius: 3, overflow: "hidden" }}>
            {(["valor", "n"] as Metrica[]).map((m) => (
              <button key={m} type="button" onClick={() => setMetrica(m)} style={{ padding: "7px 14px", fontSize: 12.5, fontWeight: 700, border: "none", cursor: "pointer", background: metrica === m ? LARANJA : "#fefefe", color: metrica === m ? "#fefefe" : "#5f574c", fontFamily: "inherit" }}>
                {m === "valor" ? "Valor (R$)" : "Quantidade"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* NÚMEROS DE CABEÇA */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
        <Tile tema={TEMA_PPV} label="Pedidos" valor={String(kpi.n)} sub={`${kpi.clientes} cliente${kpi.clientes !== 1 ? "s" : ""}`} />
        <Tile tema={TEMA_PPV} label="Valor total" valor={fmtBRL(kpi.valor)} sub={filtrosTexto} destaque />
        <Tile tema={TEMA_PPV} label="Ticket médio" valor={fmtBRL(kpi.ticket)} sub="valor ÷ pedidos" />
        <Tile tema={TEMA_PPV} label="Pendente" valor={fmtBRL(kpi.abertosV)} sub={`${kpi.abertosN} pedido${kpi.abertosN !== 1 ? "s" : ""} · menos Faturado/Cancelada`} cor="#047857" />
        <Tile tema={TEMA_PPV} label="Faturados" valor={fmtBRL(kpi.faturadosV)} sub={`${kpi.faturadosN} pedido${kpi.faturadosN !== 1 ? "s" : ""} · ${kpi.canceladosN} cancelado${kpi.canceladosN !== 1 ? "s" : ""}`} cor="#1d4ed8" />
      </div>

      {filtrados.length === 0 ? (
        <div style={{ ...card, alignItems: "center", padding: 40, color: "var(--ppv-text-light)", fontWeight: 600 }}>Nenhum pedido no filtro.</div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(440px, 1fr))", gap: 12 }}>
            <Painel titulo="Por data (mês do pedido)" sub={`${agMes.length} mês${agMes.length !== 1 ? "es" : ""}`} itens={agMes} metrica={metrica} horizontal={false} tema={TEMA_PPV} dark={dark} onBarra={onBarra} />
            <Painel titulo="Por previsão de faturamento" sub={kpi.semPrevisao ? `${kpi.semPrevisao} sem previsão informada` : "todos com previsão"} itens={agPrev} metrica={metrica} horizontal={false} tema={TEMA_PPV} dark={dark} onBarra={onBarra}
              corDe={(a) => (a.chave === "zzzz" ? (dark ? "#64748b" : "#94a3b8") : corBarra)} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(440px, 1fr))", gap: 12 }}>
            <Painel titulo="Por técnico" sub="top 10 + outros" itens={agTec} metrica={metrica} horizontal tema={TEMA_PPV} dark={dark} onBarra={onBarra} />
            <Painel titulo="Por fase" sub="cores iguais às da tela" itens={agFase} metrica={metrica} horizontal tema={TEMA_PPV} dark={dark} onBarra={onBarra}
              corDe={(a) => STATUS_COLORS[a.chave]?.text || corBarra} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 3fr) minmax(0, 2fr)", gap: 12 }}>
            <Painel titulo="Por cliente" sub="top 12 + outros" itens={agCliTop} metrica={metrica} horizontal tema={TEMA_PPV} dark={dark} onBarra={onBarra} altura={Math.max(300, agCliTop.length * 30 + 40)} />
            <div style={{ ...card, padding: 0, overflow: "hidden" }}>
              <div style={{ padding: "12px 16px 8px", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <b style={{ fontSize: 14 }}>Clientes no filtro</b>
                <span style={{ fontSize: 12, color: "var(--ppv-text-light)" }}>{agCli.length} cliente{agCli.length !== 1 ? "s" : ""}</span>
              </div>
              <div style={{ overflow: "auto", maxHeight: 420 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead><tr style={{ background: "var(--ppv-bg)" }}>{["Cliente", "Pedidos", "Valor"].map((h, i) => <th key={h} style={{ textAlign: i ? "right" : "left", padding: "7px 12px", fontSize: 11, fontWeight: 800, textTransform: "uppercase", color: "var(--ppv-text-light)", position: "sticky", top: 0, background: "var(--ppv-bg)" }}>{h}</th>)}</tr></thead>
                  <tbody>
                    {agCli.slice(0, 40).map((a) => {
                      const ids = filtrados.filter((o) => ((o.cliente || "").trim() || "(sem cliente)") === a.chave).map((o) => o.id);
                      return (
                        <tr key={a.chave} style={{ borderTop: "1px solid var(--ppv-border-light)", cursor: onAbrirPedido && ids.length === 1 ? "pointer" : "default" }} onClick={() => { if (onAbrirPedido && ids.length === 1) onAbrirPedido(ids[0]); }} title={ids.length === 1 ? `Abrir ${ids[0]}` : `${ids.length} pedidos`}>
                          <td style={{ padding: "7px 12px", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.label}</td>
                          <td style={{ padding: "7px 12px", textAlign: "right" }}>{a.n}</td>
                          <td style={{ padding: "7px 12px", textAlign: "right", fontWeight: 700, whiteSpace: "nowrap" }}>{fmtBRL(a.valor)}</td>
                        </tr>
                      );
                    })}
                    {agCli.length > 40 && <tr><td colSpan={3} style={{ padding: "8px 12px", color: "var(--ppv-text-light)", fontSize: 12 }}>… e mais {agCli.length - 40} clientes (use o modo Relação com filtro por cliente).</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
      {drill && (() => {
        const set = new Set(drill.ids);
        const linhas = filtrados.filter((o) => set.has(o.id)).sort((a, b) => valorNum(b) - valorNum(a))
          .map((o) => ({ id: o.id, valor: valorNum(o), celulas: [colTextoRelacao(o, "id"), colTextoRelacao(o, "tipo"), o.cliente || "", o.tecnico || "", colTextoRelacao(o, "data"), colTextoRelacao(o, "status"), colTextoRelacao(o, "valor")] }));
        return <PopupComposicao tema={TEMA_PPV} titulo={drill.titulo} colunas={["Nº", "Tipo", "Cliente", "Técnico", "Data", "Fase", "Valor"]} linhas={linhas} colValor={6}
          onAbrir={onAbrirPedido ? (id) => { setDrill(null); onAbrirPedido(id); } : undefined} onClose={() => setDrill(null)} />;
      })()}
    </div>
  );
}

