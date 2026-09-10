"use client";

// =============================================
// PEÇAS COMPARTILHADAS DOS DASHBOARDS (PPV, POS…): tile de número, painel de
// barras (uma série, um eixo, tooltip com valor E quantidade, alternância pra
// tabela) e utilitários (formato compacto, tema escuro). O módulo passa um
// `Tema` com as suas variáveis de cor; nada aqui conhece PPV ou OS.
//
// Gotchas recharts 2 já resolvidos aqui: eixos NÃO podem ficar dentro de
// Fragment (somem); ticks e rótulos são <text> à mão (o <Text> do recharts
// quebra linha na largura do eixo); `initialDimension` evita width NaN.
// =============================================
import { useEffect, useState } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, LabelList } from "recharts";
import { fmtBRL, type Agregado } from "@/lib/ppv/relacao";

export type Metrica = "valor" | "n";

/** Cores/superfícies do módulo (CSS vars ou hex). */
export interface Tema {
  accent: string;        // cor das barras e dos botões ativos (modo claro)
  accentDark: string;    // passo mais claro para o fundo escuro
  accentText: string;    // texto sobre o accent
  surface: string;       // fundo dos cards
  border: string;
  text: string;
  textLight: string;
  bg: string;            // fundo de cabeçalhos de tabela
  primaryLight: string;  // fundo do botão ativo (Gráfico/Tabela)
  primaryText: string;   // texto do botão ativo
}

/** "R$ 12,3 mil" / "1,2 mi" — pra rótulos curtos nos eixos e nas barras. */
export function compacto(n: number, moeda = true): string {
  const abs = Math.abs(n);
  const p = moeda ? "R$ " : "";
  if (abs >= 1e6) return `${p}${(n / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (abs >= 1e3) return `${p}${(n / 1e3).toLocaleString("pt-BR", { maximumFractionDigits: abs >= 1e5 ? 0 : 1 })} mil`;
  return moeda ? fmtBRL(n) : String(Math.round(n));
}

export function useTemaEscuro(): boolean {
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

export function estilosTema(t: Tema) {
  const card: React.CSSProperties = { background: t.surface, border: `1px solid ${t.border}`, borderRadius: 3, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8, minWidth: 0 };
  const select: React.CSSProperties = { padding: "7px 10px", fontSize: 13, borderRadius: 3, border: `1px solid ${t.border}`, background: "#fefefe", color: t.text, fontFamily: "inherit", cursor: "pointer" };
  const lbl: React.CSSProperties = { fontSize: 10.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, color: t.textLight };
  return { card, select, lbl };
}

export function Tile({ tema, label, valor, sub, cor, destaque }: { tema: Tema; label: string; valor: string; sub?: string; cor?: string; destaque?: boolean }) {
  const { card, lbl } = estilosTema(tema);
  return (
    <div style={{ ...card, borderLeft: `4px solid ${cor || tema.accent}`, gap: 2 }}>
      <span style={lbl}>{label}</span>
      <span style={{ fontSize: destaque ? 24 : 21, fontWeight: 800, color: tema.text, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{valor}</span>
      {sub && <span style={{ fontSize: 11.5, color: tema.textLight, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={sub}>{sub}</span>}
    </div>
  );
}

export interface PainelProps {
  tema: Tema;
  titulo: string;
  sub?: string;
  itens: Agregado[];
  metrica: Metrica;
  horizontal: boolean;
  /** cor por item (ex.: fase) — default: accent do tema */
  corDe?: (a: Agregado) => string;
  altura?: number;
  dark?: boolean;
}

interface TickProps { x?: number; y?: number; payload?: { value?: string | number } }
interface RotuloProps { x?: number | string; y?: number | string; width?: number | string; height?: number | string; value?: number | string }

/** Um gráfico de barras (uma série, um eixo) com alternância pra tabela. Tooltip mostra valor E quantidade. */
export function Painel({ tema, titulo, sub, itens, metrica, horizontal, corDe, altura, dark = false }: PainelProps) {
  const [modo, setModo] = useState<"grafico" | "tabela">("grafico");
  const { card } = estilosTema(tema);
  const cor = dark ? tema.accentDark : tema.accent;
  const corGrade = dark ? "#334155" : "#e5e7eb";
  const corTexto = dark ? "#94a3b8" : "#64748b";
  const dados = itens.map((a) => ({ ...a, y: metrica === "valor" ? a.valor : a.n }));
  const total = itens.reduce((s, a) => s + (metrica === "valor" ? a.valor : a.n), 0);
  const fmt = (v: number) => (metrica === "valor" ? compacto(v) : String(Math.round(v)));
  const rotularTodas = dados.length <= 8;   // rótulo direto só quando cabe; senão fica no tooltip
  const h = altura || (horizontal ? Math.max(220, dados.length * 30 + 40) : 260);
  const trunc = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
  const tickCat = (p: TickProps) => {
    const { x = 0, y = 0, payload } = p;
    const txt = String(payload?.value ?? "");
    return horizontal
      ? <text x={x} y={y} dy={4} textAnchor="end" fill={corTexto} fontSize={11} fontFamily="inherit"><title>{txt}</title>{trunc(txt, 22)}</text>
      : <text x={x} y={y} dy={12} textAnchor={dados.length > 9 ? "end" : "middle"} transform={dados.length > 9 ? `rotate(-35 ${x} ${y})` : undefined} fill={corTexto} fontSize={11.5} fontFamily="inherit">{trunc(txt, 16)}</text>;
  };
  const tickNum = (p: TickProps) => {
    const { x = 0, y = 0, payload } = p;
    return horizontal
      ? <text x={x} y={y} dy={12} textAnchor="middle" fill={corTexto} fontSize={11} fontFamily="inherit">{fmt(Number(payload?.value) || 0)}</text>
      : <text x={x} y={y} dy={4} textAnchor="end" fill={corTexto} fontSize={11} fontFamily="inherit">{fmt(Number(payload?.value) || 0)}</text>;
  };
  const rotulo = (p: RotuloProps) => {
    const nx = Number(p.x) || 0, ny = Number(p.y) || 0, nw = Number(p.width) || 0, nh = Number(p.height) || 0;
    const v = Number(p.value) || 0;
    if (!v) return null;
    return (
      <text x={horizontal ? nx + nw + 6 : nx + nw / 2} y={horizontal ? ny + nh / 2 : ny - 6} fill={corTexto} fontSize={11} fontWeight={600} fontFamily="inherit" textAnchor={horizontal ? "start" : "middle"} dominantBaseline={horizontal ? "central" : "auto"}>
        {fmt(v)}
      </text>
    );
  };
  const botao = (ativo: boolean): React.CSSProperties => ({ padding: "3px 9px", fontSize: 11.5, fontWeight: 700, borderRadius: 3, border: `1px solid ${tema.border}`, background: ativo ? tema.primaryLight : "#fefefe", color: ativo ? tema.primaryText : "#5f574c", cursor: "pointer", fontFamily: "inherit" });

  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
        <div><b style={{ fontSize: 14, color: tema.text }}>{titulo}</b>{sub && <span style={{ fontSize: 12, color: tema.textLight, marginLeft: 8 }}>{sub}</span>}</div>
        <div style={{ display: "inline-flex", gap: 4 }}>
          <button type="button" onClick={() => setModo("grafico")} style={botao(modo === "grafico")}>Gráfico</button>
          <button type="button" onClick={() => setModo("tabela")} style={botao(modo === "tabela")}>Tabela</button>
        </div>
      </div>
      {modo === "tabela" ? (
        <div style={{ overflow: "auto", maxHeight: h }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, color: tema.text }}>
            <thead><tr style={{ background: tema.bg }}>{["", "Qtd", "Valor", "% do total"].map((c, i) => <th key={i} style={{ textAlign: i ? "right" : "left", padding: "6px 10px", fontSize: 11, fontWeight: 800, textTransform: "uppercase", color: tema.textLight }}>{c}</th>)}</tr></thead>
            <tbody>
              {itens.map((a) => (
                <tr key={a.chave} style={{ borderTop: `1px solid ${tema.border}` }}>
                  <td style={{ padding: "6px 10px" }}>{a.label}</td>
                  <td style={{ padding: "6px 10px", textAlign: "right" }}>{a.n}</td>
                  <td style={{ padding: "6px 10px", textAlign: "right", fontWeight: 700, whiteSpace: "nowrap" }}>{fmtBRL(a.valor)}</td>
                  <td style={{ padding: "6px 10px", textAlign: "right", color: tema.textLight }}>{total ? `${(((metrica === "valor" ? a.valor : a.n) / total) * 100).toFixed(1)}%` : "—"}</td>
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
                ? <XAxis type="number" tick={tickNum} axisLine={false} tickLine={false} />
                : <XAxis type="category" dataKey="label" tick={tickCat} axisLine={false} tickLine={false} interval={0} height={dados.length > 9 ? 56 : 30} />}
              {horizontal
                ? <YAxis type="category" dataKey="label" width={160} interval={0} tick={tickCat} axisLine={false} tickLine={false} />
                : <YAxis type="number" tick={tickNum} axisLine={false} tickLine={false} width={76} />}
              <Tooltip cursor={{ fill: "rgba(100,116,139,0.10)" }} content={<Dica />} />
              <Bar dataKey="y" fill={cor} radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]} maxBarSize={26} isAnimationActive={false}>
                {dados.map((a) => <Cell key={a.chave} fill={corDe ? corDe(a) : cor} />)}
                {rotularTodas && <LabelList dataKey="y" content={(p) => rotulo(p as RotuloProps)} />}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// Tooltip: rótulo + valor + quantidade (texto em cor de texto, nunca na cor da série).
function Dica({ active, payload }: { active?: boolean; payload?: { payload: Agregado }[] }) {
  if (!active || !payload?.length) return null;
  const a = payload[0].payload;
  return (
    <div style={{ background: "#0f172a", color: "#e2e8f0", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 6, padding: "8px 11px", fontSize: 12.5, fontFamily: "inherit", boxShadow: "0 8px 24px rgba(0,0,0,0.3)" }}>
      <div style={{ fontWeight: 700, marginBottom: 3 }}>{a.label}</div>
      <div>Valor: <b>{fmtBRL(a.valor)}</b></div>
      <div>Qtd: <b>{a.n}</b>{a.n ? <span style={{ color: "#94a3b8" }}> · média {fmtBRL(a.valor / a.n)}</span> : null}</div>
    </div>
  );
}
