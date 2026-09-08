"use client";

// =============================================
// ABA DASHBOARD DO PPV — valor e quantidade de pedidos por data (mês), por
// técnico, por cliente, por previsão de faturamento e por fase. Lê os mesmos
// pedidos do kanban (PPVContext); as agregações são puras (lib/ppv/relacao.ts).
// Um eixo por gráfico (Valor OU Quantidade — o toggle troca a métrica em todos),
// uma cor só para "magnitude" (laranja do sistema Peças), fase com as cores da
// tela, tooltip em todo mark e visão em tabela em cada painel.
// =============================================
import { useEffect, useMemo, useState } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, LabelList } from "recharts";
import type { KanbanItem } from "@/lib/ppv/types";
import { STATUS_COLORS, STATUS_OPTIONS, rotuloStatus } from "@/lib/ppv/constants";
import {
  OPCOES_PERIODO, passaPeriodo, rotuloPeriodo, isRemessa, statusNorm, estaAberto, fmtBRL, valorNum,
  porMesData, porMesPrevisao, porTecnico, porCliente, porFase, topComOutros, type Agregado,
} from "@/lib/ppv/relacao";

interface Props {
  orders: KanbanItem[];
  onAbrirPedido?: (id: string) => void;
}

type Metrica = "valor" | "n";

const LARANJA = "#e8730c";
const LARANJA_ESCURO = "#f59e4b";   // passo mais claro para o fundo escuro (não é o mesmo tom invertido)

/** "R$ 12,3 mil" / "1,2 mi" — pra rótulos curtos nos eixos e nas barras. */
function compacto(n: number, moeda = true): string {
  const abs = Math.abs(n);
  const p = moeda ? "R$ " : "";
  if (abs >= 1e6) return `${p}${(n / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (abs >= 1e3) return `${p}${(n / 1e3).toLocaleString("pt-BR", { maximumFractionDigits: abs >= 1e5 ? 0 : 1 })} mil`;
  return moeda ? fmtBRL(n) : String(Math.round(n));
}

function useTemaEscuro(): boolean {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const calc = () => {
      const t = document.documentElement.getAttribute("data-theme");
      setDark(t === "dark" || (t !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches));
    };
    calc();
    const mo = new MutationObserver(calc);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", calc);
    return () => { mo.disconnect(); mq.removeEventListener("change", calc); };
  }, []);
  return dark;
}

const card: React.CSSProperties = { background: "var(--ppv-surface)", border: "1px solid var(--ppv-border-light)", borderRadius: 3, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8, minWidth: 0 };
const selectStyle: React.CSSProperties = { padding: "7px 10px", fontSize: 13, borderRadius: 3, border: "1px solid var(--ppv-border-light)", background: "#fefefe", color: "var(--ppv-text)", fontFamily: "'Poppins', sans-serif", cursor: "pointer" };
const lbl: React.CSSProperties = { fontSize: 10.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--ppv-text-light)" };

export default function DashboardPPV({ orders, onAbrirPedido }: Props) {
  const dark = useTemaEscuro();
  const corBarra = dark ? LARANJA_ESCURO : LARANJA;
  const corGrade = dark ? "#334155" : "#e5e7eb";
  const corTexto = dark ? "#94a3b8" : "#64748b";

  // ---- filtros (uma linha, acima dos painéis) ----
  const [periodo, setPeriodo] = useState("ultimos_90");   // padrão: 3 meses (com "este mês" o gráfico por data vira uma barra só)
  const [aPartir, setAPartir] = useState("");
  const [fase, setFase] = useState("");
  const [tipo, setTipo] = useState<"TODOS" | "PPV" | "REM">("TODOS");
  const [tecnico, setTecnico] = useState("");
  const [metrica, setMetrica] = useState<Metrica>("valor");
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
    fase === "__abertos" ? "Em aberto" : fase ? rotuloStatus(fase) : "Todas as fases",
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
            <option value="__abertos">Em aberto (menos Faturado/Cancelada)</option>
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
        <Tile label="Pedidos" valor={String(kpi.n)} sub={`${kpi.clientes} cliente${kpi.clientes !== 1 ? "s" : ""}`} />
        <Tile label="Valor total" valor={fmtBRL(kpi.valor)} sub={filtrosTexto} destaque />
        <Tile label="Ticket médio" valor={fmtBRL(kpi.ticket)} sub="valor ÷ pedidos" />
        <Tile label="Em aberto" valor={fmtBRL(kpi.abertosV)} sub={`${kpi.abertosN} pedido${kpi.abertosN !== 1 ? "s" : ""}`} cor="#047857" />
        <Tile label="Faturados" valor={fmtBRL(kpi.faturadosV)} sub={`${kpi.faturadosN} pedido${kpi.faturadosN !== 1 ? "s" : ""} · ${kpi.canceladosN} cancelado${kpi.canceladosN !== 1 ? "s" : ""}`} cor="#1d4ed8" />
      </div>

      {filtrados.length === 0 ? (
        <div style={{ ...card, alignItems: "center", padding: 40, color: "var(--ppv-text-light)", fontWeight: 600 }}>Nenhum pedido no filtro.</div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(440px, 1fr))", gap: 12 }}>
            <Painel titulo="Por data (mês do pedido)" sub={`${agMes.length} mês${agMes.length !== 1 ? "es" : ""}`} itens={agMes} metrica={metrica} horizontal={false} cor={corBarra} corGrade={corGrade} corTexto={corTexto} />
            <Painel titulo="Por previsão de faturamento" sub={kpi.semPrevisao ? `${kpi.semPrevisao} sem previsão informada` : "todos com previsão"} itens={agPrev} metrica={metrica} horizontal={false} cor={corBarra} corGrade={corGrade} corTexto={corTexto}
              corDe={(a) => (a.chave === "zzzz" ? (dark ? "#64748b" : "#94a3b8") : corBarra)} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(440px, 1fr))", gap: 12 }}>
            <Painel titulo="Por técnico" sub="top 10 + outros" itens={agTec} metrica={metrica} horizontal cor={corBarra} corGrade={corGrade} corTexto={corTexto} />
            <Painel titulo="Por fase" sub="cores iguais às da tela" itens={agFase} metrica={metrica} horizontal cor={corBarra} corGrade={corGrade} corTexto={corTexto}
              corDe={(a) => STATUS_COLORS[a.chave]?.text || corBarra} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 3fr) minmax(0, 2fr)", gap: 12 }}>
            <Painel titulo="Por cliente" sub="top 12 + outros" itens={agCliTop} metrica={metrica} horizontal cor={corBarra} corGrade={corGrade} corTexto={corTexto} altura={Math.max(300, agCliTop.length * 30 + 40)} />
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
    </div>
  );
}

function Tile({ label, valor, sub, cor, destaque }: { label: string; valor: string; sub?: string; cor?: string; destaque?: boolean }) {
  return (
    <div style={{ ...card, borderLeft: `4px solid ${cor || LARANJA}`, gap: 2 }}>
      <span style={lbl}>{label}</span>
      <span style={{ fontSize: destaque ? 24 : 21, fontWeight: 800, color: "var(--ppv-text)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{valor}</span>
      {sub && <span style={{ fontSize: 11.5, color: "var(--ppv-text-light)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={sub}>{sub}</span>}
    </div>
  );
}

interface PainelProps {
  titulo: string; sub?: string; itens: Agregado[]; metrica: Metrica; horizontal: boolean;
  cor: string; corGrade: string; corTexto: string; corDe?: (a: Agregado) => string; altura?: number;
}

/** Um gráfico de barras (uma série, um eixo) com alternância pra tabela. Tooltip mostra valor E quantidade. */
function Painel({ titulo, sub, itens, metrica, horizontal, cor, corGrade, corTexto, corDe, altura }: PainelProps) {
  const [modo, setModo] = useState<"grafico" | "tabela">("grafico");
  const dados = itens.map((a) => ({ ...a, y: metrica === "valor" ? a.valor : a.n }));
  const total = itens.reduce((s, a) => s + (metrica === "valor" ? a.valor : a.n), 0);
  const fmt = (v: number) => (metrica === "valor" ? compacto(v) : String(Math.round(v)));
  const rotularTodas = dados.length <= 8;   // rótulo direto só quando cabe; senão fica no tooltip
  const h = altura || (horizontal ? Math.max(220, dados.length * 30 + 40) : 260);
  // Ticks desenhados à mão (o <Text> do recharts quebra em várias linhas na largura do eixo).
  const trunc = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
  const tickCat = (p: TickProps) => {
    const { x = 0, y = 0, payload } = p;
    const txt = String(payload?.value ?? "");
    return horizontal
      ? <text x={x} y={y} dy={4} textAnchor="end" fill={corTexto} fontSize={11} fontFamily="Poppins, sans-serif"><title>{txt}</title>{trunc(txt, 22)}</text>
      : <text x={x} y={y} dy={12} textAnchor={dados.length > 9 ? "end" : "middle"} transform={dados.length > 9 ? `rotate(-35 ${x} ${y})` : undefined} fill={corTexto} fontSize={11.5} fontFamily="Poppins, sans-serif">{trunc(txt, 16)}</text>;
  };
  const tickNum = (p: TickProps) => {
    const { x = 0, y = 0, payload } = p;
    return horizontal
      ? <text x={x} y={y} dy={12} textAnchor="middle" fill={corTexto} fontSize={11} fontFamily="Poppins, sans-serif">{fmt(Number(payload?.value) || 0)}</text>
      : <text x={x} y={y} dy={4} textAnchor="end" fill={corTexto} fontSize={11} fontFamily="Poppins, sans-serif">{fmt(Number(payload?.value) || 0)}</text>;
  };
  const eixoCat = { tick: tickCat, axisLine: false, tickLine: false } as const;
  const eixoNum = { tick: tickNum, axisLine: false, tickLine: false } as const;

  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
        <div><b style={{ fontSize: 14 }}>{titulo}</b>{sub && <span style={{ fontSize: 12, color: "var(--ppv-text-light)", marginLeft: 8 }}>{sub}</span>}</div>
        <div style={{ display: "inline-flex", gap: 4 }}>
          {(["grafico", "tabela"] as const).map((m) => (
            <button key={m} type="button" onClick={() => setModo(m)} style={{ padding: "3px 9px", fontSize: 11.5, fontWeight: 700, borderRadius: 3, border: "1px solid var(--ppv-border-light)", background: modo === m ? "var(--ppv-primary-light)" : "#fefefe", color: modo === m ? "#c2570a" : "#5f574c", cursor: "pointer", fontFamily: "inherit" }}>
              {m === "grafico" ? "Gráfico" : "Tabela"}
            </button>
          ))}
        </div>
      </div>
      {modo === "tabela" ? (
        <div style={{ overflow: "auto", maxHeight: h }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr style={{ background: "var(--ppv-bg)" }}>{["", "Pedidos", "Valor", "% do total"].map((c, i) => <th key={i} style={{ textAlign: i ? "right" : "left", padding: "6px 10px", fontSize: 11, fontWeight: 800, textTransform: "uppercase", color: "var(--ppv-text-light)" }}>{c}</th>)}</tr></thead>
            <tbody>
              {itens.map((a) => (
                <tr key={a.chave} style={{ borderTop: "1px solid var(--ppv-border-light)" }}>
                  <td style={{ padding: "6px 10px" }}>{a.label}</td>
                  <td style={{ padding: "6px 10px", textAlign: "right" }}>{a.n}</td>
                  <td style={{ padding: "6px 10px", textAlign: "right", fontWeight: 700, whiteSpace: "nowrap" }}>{fmtBRL(a.valor)}</td>
                  <td style={{ padding: "6px 10px", textAlign: "right", color: "var(--ppv-text-light)" }}>{total ? `${(((metrica === "valor" ? a.valor : a.n) / total) * 100).toFixed(1)}%` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ width: "100%", height: h }}>
          <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 480, height: h }} debounce={30}>
            <BarChart data={dados} layout={horizontal ? "vertical" : "horizontal"} margin={{ top: 18, right: horizontal ? 60 : 12, left: horizontal ? 8 : 0, bottom: 4 }} barCategoryGap="28%">
              <CartesianGrid stroke={corGrade} strokeDasharray="2 4" vertical={horizontal} horizontal={!horizontal} />
              {/* Eixos como filhos DIRETOS do gráfico (dentro de Fragment o recharts 2 não os enxerga). */}
              {horizontal
                ? <XAxis type="number" {...eixoNum} />
                : <XAxis type="category" dataKey="label" {...eixoCat} interval={0} height={dados.length > 9 ? 56 : 30} />}
              {horizontal
                ? <YAxis type="category" dataKey="label" width={160} interval={0} {...eixoCat} />
                : <YAxis type="number" {...eixoNum} width={76} />}
              <Tooltip cursor={{ fill: "rgba(232,115,12,0.08)" }} content={<Dica />} />
              <Bar dataKey="y" fill={cor} radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]} maxBarSize={26} isAnimationActive={false}>
                {dados.map((a) => <Cell key={a.chave} fill={corDe ? corDe(a) : cor} />)}
                {rotularTodas && <LabelList dataKey="y" content={(p) => <RotuloBarra {...(p as RotuloProps)} horizontal={horizontal} fmt={fmt} cor={corTexto} />} />}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

interface TickProps { x?: number; y?: number; payload?: { value?: string | number } }

// Rótulo direto na barra, numa linha só (o LabelList padrão quebra o texto na largura da barra).
interface RotuloProps { x?: number | string; y?: number | string; width?: number | string; height?: number | string; value?: number | string }
function RotuloBarra({ x, y, width, height, value, horizontal, fmt, cor }: RotuloProps & { horizontal: boolean; fmt: (v: number) => string; cor: string }) {
  const nx = Number(x) || 0, ny = Number(y) || 0, nw = Number(width) || 0, nh = Number(height) || 0;
  const v = Number(value) || 0;
  if (!v) return null;
  const px = horizontal ? nx + nw + 6 : nx + nw / 2;
  const py = horizontal ? ny + nh / 2 : ny - 6;
  return (
    <text x={px} y={py} fill={cor} fontSize={11} fontWeight={600} fontFamily="Poppins, sans-serif" textAnchor={horizontal ? "start" : "middle"} dominantBaseline={horizontal ? "central" : "auto"}>
      {fmt(v)}
    </text>
  );
}

// Tooltip: rótulo + valor + quantidade (texto em cor de texto, nunca na cor da série).
function Dica({ active, payload }: { active?: boolean; payload?: { payload: Agregado }[] }) {
  if (!active || !payload?.length) return null;
  const a = payload[0].payload;
  return (
    <div style={{ background: "#0f172a", color: "#e2e8f0", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 6, padding: "8px 11px", fontSize: 12.5, fontFamily: "Poppins, sans-serif", boxShadow: "0 8px 24px rgba(0,0,0,0.3)" }}>
      <div style={{ fontWeight: 700, marginBottom: 3 }}>{a.label}</div>
      <div>Valor: <b>{fmtBRL(a.valor)}</b></div>
      <div>Pedidos: <b>{a.n}</b>{a.n ? <span style={{ color: "#94a3b8" }}> · média {fmtBRL(a.valor / a.n)}</span> : null}</div>
    </div>
  );
}
