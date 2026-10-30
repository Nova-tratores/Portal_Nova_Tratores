"use client";
// Abas da OS no FORMATO da OS do Omie (José, 13/10/2026): Lista de Serviços em
// grade (+ janela "Item da Ordem de Serviço" no duplo clique), Departamentos,
// Informações Adicionais, Parcelas (igual ao PPV), E-mail para o Cliente e a
// janela de Informações do cliente. Estado em OmieEspelho (lib/pos/omie-espelho).
import { EMAIL_INTERNO } from "@/lib/pos/omie-espelho";
import EditarClienteOmie from "@/components/clientes/EditarClienteOmie";
import { alertaCepGeral } from "@/lib/clientes/novo-cliente";
import { useEffect, useMemo, useRef, useState } from "react";
import { authHeaders } from "@/lib/auth/client";
import { supabase } from "@/lib/supabase";
import {
  CODIGOS_INTERNOS, calcularParcelas, diasDoEspelho, codigoRevisao, dadosAdicionaisAuto, textoContatos, type OmieEspelho, type ServicoExtra, type ContatoOS,
} from "@/lib/pos/omie-espelho";

type Rec = Record<string, unknown>;
export interface ServicoCadastro { codigo: string; nCod: number; nome: string; preco: number; cabecalho: Rec; impostos: Rec }
export interface ListasOmie {
  departamentos: { codigo: string; nome: string }[];
  parcelas: { codigo: string; nome: string; uso?: number }[];
  contas: { codigo: number; nome: string }[];
  categorias: { codigo: string; nome: string }[];
  servicos: ServicoCadastro[];
}

const TEAL = "#0F8B8D", TEAL_ESC = "#0B6E70", CINZA = "#6b7a89", BORDA = "var(--border, #cfd8de)";
const brl = (v: number) => (v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const rs = (v: number) => `R$ ${brl(v)}`;
const br = (iso: string) => iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "";
const n = (v: unknown) => Number(v || 0);
const sim = (v: unknown) => v === "S" || v === true;

/** listas do Omie + OS do Omie + cliente (rota só de leitura, cache 30 min no servidor) */
// Sem resposta em 90 s a tela desiste e mostra o erro com "Tentar de novo" —
// antes o erro ficava no estado e ninguém mostrava: spinner eterno.
export function useListasOmie(ativo: boolean, numOmie: string, cnpj: string) {
  const [dados, setDados] = useState<{ listas: ListasOmie | null; os: Rec | null; cliente: Rec | null; erro: string }>({ listas: null, os: null, cliente: null, erro: "" });
  const [tentativa, setTentativa] = useState(0);
  useEffect(() => {
    if (!ativo) return;
    let vivo = true;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 90_000);
    (async () => {
      try {
        const r = await fetch(`/api/pos/omie-listas?os=${encodeURIComponent(numOmie || "")}&cnpj=${encodeURIComponent(cnpj || "")}`, { headers: await authHeaders(), signal: ctrl.signal });
        const j = await r.json().catch(() => ({}));
        if (!vivo) return;
        if (!r.ok) setDados((d) => ({ ...d, erro: j.error || `Erro ${r.status}` }));
        else setDados({ listas: j.listas, os: j.os && !j.os.erro ? j.os : null, cliente: j.cliente || null, erro: "" });
      } catch (e) {
        if (vivo) setDados((d) => ({ ...d, erro: (e as Error)?.name === "AbortError" ? "O Omie não respondeu em 90 segundos." : "Não consegui ler as listas do Omie." }));
      } finally { clearTimeout(timer); }
    })();
    return () => { vivo = false; clearTimeout(timer); ctrl.abort(); };
  }, [ativo, numOmie, cnpj, tentativa]);
  const tentarDeNovo = () => { setDados((d) => ({ ...d, erro: "" })); setTentativa((t) => t + 1); };
  return { ...dados, tentarDeNovo };
}

// ── peças visuais no estilo do Omie
// estilos das caixas no formato Omie (rótulo em cima, caixa limpa, seta própria)
const ESTILOS_OMIE = `
.omie-campo > label { display: block; font-size: 11.5px; font-weight: 600; color: #6b7a89; margin: 0 0 5px 2px; text-transform: none; letter-spacing: 0; }
.omie-caixa { position: relative; display: flex; align-items: center; min-height: 40px; border: 1px solid var(--border, #d7dee3); border-radius: 8px; background: var(--surface, #fefefe); transition: border-color .15s, box-shadow .15s; }
.omie-caixa:focus-within { border-color: #0F8B8D; box-shadow: 0 0 0 3px rgba(15,139,141,.12); }
.omie-caixa.cinza { background: var(--portal-bg-secondary, #f4f6f7); }
.omie-caixa > input, .omie-caixa > select, .omie-caixa > textarea, .omie-caixa > button, .omie-caixa > div {
  border: none !important; outline: none !important; box-shadow: none !important; background: transparent !important; margin: 0 !important;
  min-height: 38px; padding: 9px 12px !important; font-size: 13px !important; color: var(--portal-text, #1f2d3d); width: 100%; font-family: inherit; box-sizing: border-box; border-radius: 8px; }
.omie-caixa > select { appearance: none; -webkit-appearance: none; padding-right: 34px !important; cursor: pointer; }
.omie-caixa > .omie-livre { padding: 0 !important; min-height: 38px; }
.omie-caixa > .omie-mini { width: auto !important; flex: 0 0 auto; padding: 0 12px !important; min-height: 0; color: #047857; cursor: pointer; }
.omie-caixa .omie-seta { position: absolute; right: 12px; pointer-events: none; font-size: 10px; color: #6b7a89; }
.omie-lista { position: absolute; z-index: 30; top: calc(100% + 4px); left: 0; right: 0; background: var(--surface, #fefefe); border: 1px solid var(--border, #d7dee3); border-radius: 10px; box-shadow: 0 14px 34px rgba(15,23,42,.16); overflow: hidden; }
.omie-lista-item { display: flex; align-items: center; gap: 8px; width: 100%; padding: 8px 12px; border: none; background: transparent; text-align: left; cursor: pointer; font-family: inherit; font-size: 13px; color: var(--portal-text, #1f2d3d); }
.omie-lista-item:hover, .omie-lista-item.ativo { background: color-mix(in srgb, #0F8B8D 9%, transparent); }
`;
export function EstilosOmie() { return <style>{ESTILOS_OMIE}</style>; }

export function Campo({ titulo, children, span = 1, cinza = false, seta = false }: { titulo: string; children: React.ReactNode; span?: number; cinza?: boolean; seta?: boolean }) {
  return (
    <div className="omie-campo" style={{ gridColumn: `span ${span}`, minWidth: 0 }}>
      <label>{titulo}</label>
      <div className={`omie-caixa${cinza ? " cinza" : ""}`}>{children}{seta && <i className="fas fa-chevron-down omie-seta" />}</div>
    </div>
  );
}
export const inpOmie: React.CSSProperties = { width: "100%", border: "none", outline: "none", background: "transparent", padding: "9px 12px 7px", fontSize: 13, color: "var(--portal-text, #1f2d3d)", fontFamily: "inherit", minWidth: 0, marginBottom: 0, boxShadow: "none" };
export function Chave({ ligada, onChange, rotulo, desab }: { ligada: boolean; onChange?: (v: boolean) => void; rotulo: string; desab?: boolean }) {
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 10, fontSize: 13, color: "var(--portal-text, #1f2d3d)", cursor: desab ? "default" : "pointer", textTransform: "none", letterSpacing: 0, margin: 0, fontWeight: 400 }}>
      <span onClick={() => !desab && onChange?.(!ligada)} style={{ width: 36, height: 20, borderRadius: 10, background: ligada ? TEAL : "#d5dbe0", position: "relative", transition: "background .15s", flexShrink: 0, opacity: desab ? 0.6 : 1 }}>
        <span style={{ position: "absolute", top: 2, left: ligada ? 18 : 2, width: 16, height: 16, borderRadius: 8, background: "#fefefe", boxShadow: "0 1px 2px rgba(0,0,0,.2)", transition: "left .15s" }} />
      </span>
      {rotulo}
    </label>
  );
}
const th: React.CSSProperties = { padding: "10px 12px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: .4, color: "#64748b", textAlign: "left", whiteSpace: "nowrap", background: "var(--portal-bg-secondary, #f6f8f9)", borderBottom: "1px solid var(--border, #e6ebee)" };
const td: React.CSSProperties = { padding: "10px 12px", fontSize: 13, borderTop: "1px solid var(--border, #eef1f3)", whiteSpace: "nowrap", verticalAlign: "middle" };
const linkBtn = (ativo: boolean): React.CSSProperties => ({ border: "none", background: "transparent", color: ativo ? TEAL : "#a8c9c9", cursor: ativo ? "pointer" : "default", fontFamily: "inherit", fontSize: 13, padding: 0 });
// botões da barra da grade (pílulas com contorno)
const btnBarra = (ativo: boolean, cor = TEAL): React.CSSProperties => ({ display: "inline-flex", alignItems: "center", gap: 7, height: 34, padding: "0 14px", borderRadius: 9, border: `1px solid ${ativo ? cor : "var(--border, #e2e8f0)"}`, background: ativo ? `color-mix(in srgb, ${cor} 7%, var(--surface, #fefefe))` : "transparent", color: ativo ? cor : "#a3b1bd", fontWeight: 700, fontSize: 12.5, cursor: ativo ? "pointer" : "default", fontFamily: "inherit" });

// ───────────────────────── Lista de Serviços ─────────────────────────
interface LinhaGrade {
  id: string; codigo: string; nome: string; descricao: string; qtde: number; unit: number; desconto: number;
  tipo: "sol" | "rev" | "hora" | "km" | "req" | "extra"; cobrar: boolean; editavel: boolean;
}
export function GradeServicosOmie(p: {
  listas: ListasOmie | null; osOmie: Rec | null; interna: boolean; podeEditar: boolean;
  servSolicitado: string; setServSolicitado: (v: string) => void;
  qtdHoras: number; setQtdHoras: (v: number) => void; valorHora: number; setValorHora?: (v: number) => void; descHora: number;
  qtdKm: number; setQtdKm: (v: number) => void; valorKm: number; setValorKm?: (v: number) => void; descKm: number;
  requisicoes: { id: string; valor: number; material: string }[];
  /** OS de revisão: a linha do serviço de revisão (ex.: rev5050.600) entra sozinha */
  tipoServico?: string; revisao?: string; projeto?: string;
  esp: OmieEspelho; setEsp: (f: (e: OmieEspelho) => OmieEspelho) => void;
}) {
  const [sel, setSel] = useState<string | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const L = p.listas;
  const cad = (c: string) => L?.servicos.find((s) => s.codigo.toLowerCase() === c.toLowerCase());
  const linhas: LinhaGrade[] = [
    { id: "sol", codigo: "sol.aber.os", nome: "Solicitação de Serviço", descricao: p.servSolicitado, qtde: 1, unit: 0, desconto: 0, tipo: "sol", cobrar: false, editavel: true },
    ...(() => {
      if (!/revis/i.test(p.tipoServico || "")) return [];
      const cod = codigoRevisao(p.revisao || "", p.projeto || "");
      const s = cod ? cad(cod) : undefined;
      return cod ? [{ id: "rev", codigo: cod, nome: s?.nome || `Revisão (${cod})`, descricao: s?.nome || p.revisao || "", qtde: 1, unit: 0.01, desconto: 0, tipo: "rev" as const, cobrar: true, editavel: false }] : [];
    })(),
    { id: "hr", codigo: "hr", nome: cad("hr")?.nome || "Hora Trabalhada", descricao: "", qtde: p.qtdHoras, unit: p.valorHora, desconto: p.descHora, tipo: "hora", cobrar: !p.esp.naoCobrar.hr, editavel: true },
    { id: "km", codigo: "KM", nome: cad("KM")?.nome || "KM Deslocamento", descricao: "", qtde: p.qtdKm, unit: p.valorKm, desconto: p.descKm, tipo: "km", cobrar: !p.esp.naoCobrar.km, editavel: true },
    ...p.requisicoes.filter((r) => !/^\s*alimenta/i.test(r.material || "")).map((r) => ({ id: `req-${r.id}`, codigo: "div.", nome: "Diversos", descricao: r.material || `Requisição #${r.id}`, qtde: 1, unit: n(r.valor), desconto: 0, tipo: "req" as const, cobrar: true, editavel: false })),
    ...p.esp.extras.map((x) => ({ id: x.id, codigo: x.codigo, nome: x.nome, descricao: x.descricao, qtde: x.qtde, unit: x.unit, desconto: x.cobrar ? 0 : x.qtde * x.unit, tipo: "extra" as const, cobrar: x.cobrar, editavel: true })),
  ];
  const setExtra = (id: string, patch: Partial<ServicoExtra>) => p.setEsp((e) => ({ ...e, extras: e.extras.map((x) => x.id === id ? { ...x, ...patch } : x) }));
  const alternarCobrar = (l: LinhaGrade) => {
    if (l.tipo === "hora") p.setEsp((e) => ({ ...e, naoCobrar: { ...e.naoCobrar, hr: l.cobrar } }));
    else if (l.tipo === "km") p.setEsp((e) => ({ ...e, naoCobrar: { ...e.naoCobrar, km: l.cobrar } }));
    else if (l.tipo === "extra") setExtra(l.id, { cobrar: !l.cobrar });
  };
  const incluir = (codigo: string) => {
    const s = cad(codigo); if (!s) return;
    const id = `x-${Date.now()}`;
    p.setEsp((e) => ({ ...e, extras: [...e.extras, { id, codigo: s.codigo, nome: s.nome, descricao: "", qtde: 1, unit: s.preco, cobrar: true }] }));
    return id;
  };
  const nomeCat = (c: string) => L?.categorias.find((x) => x.codigo === c)?.nome || c;
  // hora e km: quantidade digitada direto na linha
  const setQtd = (l: LinhaGrade, v: number) => { if (l.tipo === "hora") p.setQtdHoras(v); else if (l.tipo === "km") p.setQtdKm(v); };
  const celInp: React.CSSProperties = { width: 84, height: 32, textAlign: "right", border: "1px solid var(--border, #d7dee3)", borderRadius: 8, padding: "0 10px", fontSize: 13, background: "var(--surface, #fefefe)", fontFamily: "inherit", marginBottom: 0, color: "inherit", boxShadow: "none" };
  const itemAberto = linhas.find((l) => l.id === aberto) || null;
  const selLinha = linhas.find((l) => l.id === sel);

  return (
    <div>
      <EstilosOmie />
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        {p.podeEditar && <BuscaServico listas={L} onEscolher={(c) => { const id = incluir(c); if (id) setAberto(id); }} />}
        <button type="button" style={btnBarra(!!sel)} disabled={!sel} onClick={() => sel && setAberto(sel)}><i className="fas fa-pen" /> Editar</button>
        <button type="button" style={btnBarra(selLinha?.tipo === "extra", "#dc2626")} disabled={selLinha?.tipo !== "extra"} title="Só os serviços incluídos aqui podem ser excluídos"
          onClick={() => { p.setEsp((e) => ({ ...e, extras: e.extras.filter((x) => x.id !== sel) })); setSel(null); }}><i className="fas fa-trash" /> Excluir</button>
      </div>
      <div className="grade-omie" style={{ border: `1px solid ${BORDA}`, borderRadius: 12, overflowX: "auto", background: "var(--surface, #fefefe)" }}>
        <style>{`.grade-omie tbody tr { transition: background .12s; } .grade-omie tbody tr:hover { background: color-mix(in srgb, #0F8B8D 5%, transparent); }`}</style>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>
            <th style={th}>Categoria</th><th style={{ ...th, textAlign: "right" }}>Quantidade</th><th style={{ ...th, minWidth: 240 }}>Descrição</th><th style={{ ...th, textAlign: "right" }}>Valor Unitário</th>
            <th style={{ ...th, textAlign: "right" }}>Desconto</th><th style={{ ...th, textAlign: "right" }}>Valor Total</th><th style={{ ...th, textAlign: "center" }}>Gera Conta a Receber</th>
            <th style={{ ...th, textAlign: "center" }}>Cobrar</th><th style={{ ...th, textAlign: "right" }}>% ISS</th>
          </tr></thead>
          <tbody>
            {linhas.map((l) => {
              const c = cad(l.codigo);
              const bruto = l.tipo === "sol" ? 0 : l.qtde * l.unit;
              const tot = Math.max(0, bruto - l.desconto);
              const cobra = p.interna || l.cobrar;
              return (
                <tr key={l.id} onClick={() => setSel(l.id)} onDoubleClick={() => setAberto(l.id)} title="Dois cliques: abrir o item (códigos e impostos)"
                  style={{ background: sel === l.id ? "color-mix(in srgb, #0F8B8D 18%, transparent)" : "transparent", cursor: "default" }}>
                  <td style={td}><span title={nomeCat(String(c?.cabecalho.cCodCateg || "1.01.02"))} style={{ display: "inline-block", maxWidth: 190, overflow: "hidden", textOverflow: "ellipsis", verticalAlign: "middle", fontSize: 11.5, fontWeight: 600, padding: "3px 10px", borderRadius: 999, background: "color-mix(in srgb, #0F8B8D 10%, transparent)", color: "#0B6E70" }}>{nomeCat(String(c?.cabecalho.cCodCateg || "1.01.02"))}</span></td>
                  <td style={{ ...td, textAlign: "right", padding: "3px 8px" }} onDoubleClick={(e) => { if (l.tipo === "hora" || l.tipo === "km") e.stopPropagation(); }}>
                    {p.podeEditar && (l.tipo === "hora" || l.tipo === "km")
                      ? <input type="number" min={0} step={l.tipo === "km" ? 1 : 0.5} value={l.qtde} onChange={(e) => setQtd(l, Math.max(0, Number(e.target.value) || 0))} onClick={(e) => e.stopPropagation()} style={celInp} title="Digite a quantidade" />
                      : brl(l.qtde)}
                  </td>
                  <td style={{ ...td, maxWidth: 380, overflow: "hidden", textOverflow: "ellipsis" }}>{l.tipo === "sol" ? (l.descricao.replace(/\s*\n+\s*/g, " · ") || <i style={{ color: CINZA }}>Modelo, chassis, solicitação do cliente, serviço realizado…</i>) : (l.descricao || l.nome)}</td>
                  <td style={{ ...td, textAlign: "right" }}>{l.tipo === "sol" ? "0,00" : brl(l.unit)}</td>
                  <td style={{ ...td, textAlign: "right", color: l.desconto ? "#b45309" : undefined }}>{brl(l.desconto)}</td>
                  <td style={{ ...td, textAlign: "right" }}>{brl(tot)}</td>
                  <td style={{ ...td, textAlign: "center" }}>{p.interna || l.tipo === "sol" ? "Não" : "Sim"}</td>
                  <td style={{ ...td, textAlign: "center" }}>
                    {l.tipo === "sol" || l.tipo === "req" ? <span style={{ color: "#b7c0c8" }}>—</span> : (
                      <button type="button" disabled={p.interna || !p.podeEditar} onClick={(e) => { e.stopPropagation(); alternarCobrar(l); }}
                        title={p.interna ? "OS interna: valor cheio, sem conta a receber" : l.cobrar ? "Clique para NÃO cobrar (100% de desconto)" : "Clique para cobrar"}
                        style={{ padding: "2px 10px", borderRadius: 999, border: "none", fontSize: 11.5, fontWeight: 700, cursor: p.interna ? "default" : "pointer", fontFamily: "inherit",
                          background: p.interna ? "#ede9fe" : cobra ? "#dcfce7" : "#fef3c7", color: p.interna ? "#6d28d9" : cobra ? "#15803d" : "#b45309" }}>
                        {p.interna ? "Interna" : cobra ? "Cobrar" : "Não cobrar"}
                      </button>
                    )}
                  </td>
                  <td style={{ ...td, textAlign: "right" }}>{n(c?.impostos.nAliqISS)}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "9px 12px", fontSize: 11.5, color: CINZA, borderTop: `1px solid ${BORDA}`, background: "var(--portal-bg-secondary, #f6f8f9)" }}>
          <span>{linhas.length} {linhas.length === 1 ? "serviço" : "serviços"}</span><span><i className="fas fa-hand-pointer" /> dois cliques numa linha abre o item (códigos e impostos)</span>
        </div>
      </div>

      {itemAberto && (
        <ItemModal l={itemAberto} listas={L} osOmie={p.osOmie} interna={p.interna} podeEditar={p.podeEditar}
          linhas={linhas} abrir={setAberto} fechar={() => setAberto(null)}
          onDescricao={(v) => { if (itemAberto.tipo === "sol") p.setServSolicitado(v); else if (itemAberto.tipo === "extra") setExtra(itemAberto.id, { descricao: v }); }}
          onQtde={(v) => { if (itemAberto.tipo === "hora") p.setQtdHoras(v); else if (itemAberto.tipo === "km") p.setQtdKm(v); else if (itemAberto.tipo === "extra") setExtra(itemAberto.id, { qtde: v }); }}
          onUnit={(v) => { if (itemAberto.tipo === "extra") setExtra(itemAberto.id, { unit: v }); else if (itemAberto.tipo === "hora") p.setValorHora?.(v); else if (itemAberto.tipo === "km") p.setValorKm?.(v); }}
          onCodigo={(c) => { const s = cad(c); if (s && itemAberto.tipo === "extra") setExtra(itemAberto.id, { codigo: s.codigo, nome: s.nome, unit: itemAberto.unit || s.preco }); }}
          onCobrar={() => alternarCobrar(itemAberto)} />
      )}
    </div>
  );
}

function ItemModal({ l, listas, osOmie, interna, podeEditar, linhas, abrir, fechar, onDescricao, onQtde, onUnit, onCodigo, onCobrar }: {
  l: LinhaGrade; listas: ListasOmie | null; osOmie: Rec | null; interna: boolean; podeEditar: boolean; linhas: LinhaGrade[];
  abrir: (id: string) => void; fechar: () => void; onDescricao: (v: string) => void; onQtde: (v: number) => void; onUnit: (v: number) => void; onCodigo: (c: string) => void; onCobrar: () => void;
}) {
  const [aba, setAba] = useState<"serv" | "pis" | "ir" | "outras" | "lei" | "reforma">("serv");
  const s = listas?.servicos.find((x) => x.codigo.toLowerCase() === l.codigo.toLowerCase());
  const cc = s?.cabecalho || {}, ci = s?.impostos || {};
  // como esta linha está na OS do Omie (se já foi enviada)
  const naOS = ((osOmie?.ServicosPrestados as Rec[] | undefined) || []).find((x) => String(x.cCodigo || "").toLowerCase() === l.codigo.toLowerCase() && (l.tipo !== "req" || String(x.cDescServ || "") === l.descricao));
  const im = (naOS?.impostos || {}) as Rec;
  const v = (osV: unknown, cadV: unknown) => String((naOS ? osV : cadV) ?? "");
  const base = Math.max(0, (l.tipo === "sol" ? 0 : l.qtde * l.unit) - l.desconto);
  const idx = linhas.findIndex((x) => x.id === l.id);
  const editDesc = podeEditar && (l.tipo === "sol" || l.tipo === "extra");
  const editQtd = podeEditar && l.tipo !== "sol" && l.tipo !== "req";
  const editUnit = editQtd && (l.tipo === "extra" || l.tipo === "hora" || l.tipo === "km");
  const leit = (t: string, val: string, span = 1) => <Campo titulo={t} span={span} cinza><div style={{ ...inpOmie, textAlign: "right" }}>{val}</div></Campo>;
  const txt = (t: string, val: string, span = 1) => <Campo titulo={t} span={span} cinza><div style={inpOmie}>{val || "—"}</div></Campo>;
  const ABAS: [typeof aba, string][] = [["serv", "Serviço"], ["pis", "PIS, COFINS e CSLL"], ["ir", "IR e INSS"], ["outras", "Outras Informações"], ["lei", "Lei da Transparência dos Impostos"], ["reforma", "Reforma Tributária"]];
  const nbs = v(naOS?.cNbs, cc.nIdNBS), cst = v(im.cCST, ci.cCstIbsCbs);
  const nav = (ativo: boolean): React.CSSProperties => ({ border: "none", background: "transparent", color: ativo ? TEAL_ESC : "#a8c9c9", textAlign: "left", cursor: ativo ? "pointer" : "default", fontSize: 14, fontFamily: "inherit", padding: 0 });
  return (
    <div onClick={fechar} style={{ position: "fixed", inset: 0, zIndex: 100010, background: "rgba(15,23,42,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 1240, maxWidth: "98vw", maxHeight: "92vh", overflowY: "auto", background: "var(--surface, #fefefe)", borderRadius: 10 }}>
        <EstilosOmie />
        <div style={{ display: "flex", alignItems: "center", padding: "14px 22px", background: "var(--portal-bg-secondary, #f3f5f6)" }}>
          <b style={{ flex: 1, fontSize: 18, fontWeight: 600, color: TEAL_ESC }}>Item da Ordem de Serviço</b>
          <button type="button" onClick={fechar} style={{ border: "none", background: "transparent", color: TEAL_ESC, cursor: "pointer", fontSize: 14, fontFamily: "inherit" }}>Fechar ✕</button>
        </div>
        <div style={{ display: "flex", gap: 16, padding: "22px 22px 24px" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "grid", gridTemplateColumns: "2.4fr 1fr 1fr 1fr", gap: 14 }}>
              <Campo titulo="Descrição Resumida do Serviço" cinza={l.tipo !== "extra"}>
                {l.tipo === "extra" && podeEditar && listas ? (
                  <select style={inpOmie} value={l.codigo} onChange={(e) => onCodigo(e.target.value)}>
                    {listas.servicos.map((x) => <option key={x.codigo} value={x.codigo}>{x.nome}</option>)}
                  </select>
                ) : <div style={inpOmie}>{s?.nome || l.nome}</div>}
              </Campo>
              {leit("Valor da Dedução", "0,00")}{leit("Base de Cálculo (ISS)", brl(base))}{leit("Valor Total do Item", brl(base))}
            </div>
            <div style={{ display: "flex", borderBottom: `1px solid ${BORDA}`, margin: "18px 0", overflowX: "auto" }}>
              {ABAS.map(([k, t]) => (
                <button key={k} type="button" onClick={() => setAba(k)} style={{ padding: "8px 15px", fontSize: 13, whiteSpace: "nowrap", cursor: "pointer", fontFamily: "inherit", color: "var(--portal-text, #1f2d3d)",
                  border: aba === k ? `1px solid ${BORDA}` : "1px solid transparent", borderTop: aba === k ? `2px solid ${TEAL}` : "2px solid transparent", borderBottom: "none", background: aba === k ? "var(--portal-bg-secondary, #f3f5f6)" : "transparent", marginBottom: -1, borderRadius: "4px 4px 0 0" }}>{t}</button>
              ))}
            </div>
            {aba === "serv" && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0,1fr))", gap: "20px 14px" }}>
                {txt("Tipo de Tributação", v(naOS?.cTribServ, cc.cIdTrib) === "01" ? "Operação tributável / Tributado no município" : v(naOS?.cTribServ, cc.cIdTrib))}
                {txt("Código do Serviço do Município", v(naOS?.cCodServMun, cc.cCodServMun))}{txt("Código da LC116", v(naOS?.cCodServLC116, cc.cCodLC116))}
                {txt("% Alíquota do ISS", `${v(im.nAliqISS, ci.nAliqISS) || 0}%`)}
                <div style={{ display: "flex", alignItems: "center" }}><Chave ligada={sim(naOS ? naOS.cRetemISS : ci.cRetISS)} desab rotulo="Retido" /></div>
                <Campo titulo="Quantidade" cinza={!editQtd}>{editQtd ? <input type="number" step="any" min={0} style={{ ...inpOmie, textAlign: "right" }} value={l.qtde} onChange={(e) => onQtde(Number(e.target.value))} /> : <div style={{ ...inpOmie, textAlign: "right" }}>{brl(l.qtde)}</div>}</Campo>
                <Campo titulo="Valor Unitário" cinza={!editUnit}>{editUnit ? <input type="number" step="any" min={0} style={{ ...inpOmie, textAlign: "right" }} value={l.unit} onChange={(e) => onUnit(Number(e.target.value))} /> : <div style={{ ...inpOmie, textAlign: "right" }}>{l.tipo === "sol" ? "0,000001" : brl(l.unit)}</div>}</Campo>
                {/* desconto fica fora da janela do item (José, 23/10/2026): só Hora/KM/geral, na tela da OS */}
                {leit("Valor do ISS", brl(base * n(v(im.nAliqISS, ci.nAliqISS)) / 100))}{leit("Valor Total do Item", brl(base))}
                <Campo titulo="Descrição Detalhada do Serviço" span={5} cinza={!editDesc}>
                  {editDesc ? <textarea rows={l.tipo === "sol" ? 8 : 4} style={{ ...inpOmie, resize: "vertical" }} value={l.descricao} onChange={(e) => onDescricao(e.target.value)}
                    placeholder={l.tipo === "sol" ? "Modelo:\nChassis:\nSolicitação do Cliente:\nServiço realizado:" : ""} />
                    : <div style={{ ...inpOmie, whiteSpace: "pre-wrap" }}>{l.descricao || "—"}</div>}
                </Campo>
                {!interna && (l.tipo === "hora" || l.tipo === "km" || l.tipo === "extra") && podeEditar && <div style={{ gridColumn: "span 5" }}><Chave ligada={!l.cobrar} onChange={onCobrar} rotulo="Não cobrar este serviço (vai com 100% de desconto)" /></div>}
                {(l.tipo === "hora" || l.tipo === "km") && <div style={{ gridColumn: "span 5", fontSize: 12, color: CINZA }}>O valor unitário vale só para esta OS (o padrão continua em Mais → Configurações).</div>}
              </div>
            )}
            {aba === "pis" && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 24 }}>
                {([["PIS", im.nAliqPIS, ci.nAliqPIS, im.cRetemPIS, ci.cRetPIS], ["COFINS", im.nAliqCOFINS, ci.nAliqCOFINS, im.cRetemCOFINS, ci.cRetCOFINS], ["CSLL", im.nAliqCSLL, ci.nAliqCSLL, im.cRetemCSLL, ci.cRetCSLL]] as const).map(([t, a1, a2, r1, r2]) => (
                  <div key={t} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <b style={{ color: TEAL_ESC, fontSize: 15 }}>{t}</b>
                    <Chave ligada={sim(naOS ? r1 : r2)} desab rotulo="Retido" />
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>{leit(`% Alíquota do ${t} Retido`, `${n(naOS ? a1 : a2)}`)}{leit(`Valor do ${t} Retido`, brl(base * n(naOS ? a1 : a2) / 100))}</div>
                  </div>
                ))}
              </div>
            )}
            {aba === "ir" && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 24, maxWidth: 1000 }}>
                {([["IR", im.nAliqIRRF, ci.nAliqIR, im.cRetemIRRF, ci.cRetIR], ["INSS", im.nAliqINSS, ci.nAliqINSS, im.cRetemINSS, ci.cRetINSS]] as const).map(([t, a1, a2, r1, r2]) => (
                  <div key={t} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <b style={{ color: TEAL_ESC, fontSize: 15 }}>{t}</b>
                    <Chave ligada={sim(naOS ? r1 : r2)} desab rotulo="Retido" />
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>{leit(`% Alíquota do ${t}`, `${n(naOS ? a1 : a2)}`)}{leit(`Valor do ${t}`, brl(base * n(naOS ? a1 : a2) / 100))}</div>
                  </div>
                ))}
              </div>
            )}
            {aba === "outras" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px 14px", maxWidth: 760 }}>
                {txt("Categoria do Item", listas?.categorias.find((x) => x.codigo === v(naOS?.cCodCategItem, cc.cCodCateg))?.nome || v(naOS?.cCodCategItem, cc.cCodCateg), 2)}
                <div style={{ gridColumn: "span 2" }}><Chave ligada={interna || l.tipo === "sol" || sim(naOS?.cNaoGerarFinanceiro)} desab rotulo="Não gerar conta a receber para este item" /></div>
              </div>
            )}
            {aba === "lei" && (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "2.4fr 1fr 1fr 1fr", gap: 14 }}>
                  {txt("Código NBS", nbs === "120015000" ? "1.2001.50.00 Serviços de manutenção e reparação de maquinários e equipamentos de uso industrial" : nbs)}
                  {leit("% Carga Trib. Aprox. Federal", brl(n(im.nAliqFederalIBPT)))}{leit("% Carga Trib. Aprox. Estadual", brl(n(im.nAliqEstadualIBPT)))}{leit("% Carga Trib. Aprox. Municipal", brl(n(im.nAliqMunicipalIBPT)))}
                </div>
                <div style={{ marginTop: 18, background: "#fdf7cf", color: "#1f2d3d", padding: "10px 14px", fontSize: 14 }}>
                  ☰ Será destacado na NFS-e Nacional:<br />Tributos Federais: <b>{brl(n(im.nAliqFederalIBPT))}%</b> | Tributos Estaduais: <b>{brl(n(im.nAliqEstadualIBPT))}%</b> | Tributos Municipais: <b>{brl(n(im.nAliqMunicipalIBPT))}%</b>
                </div>
              </>
            )}
            {aba === "reforma" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "20px 14px", maxWidth: 1100 }}>
                {txt("Código de Situação Tributária (CST)", cst)}{leit("Base de Cálculo do IBS/CBS", brl(base))}<div />
                {txt("Classificação Tributária", v(im.cClassTrib, ci.cClassTrib))}{leit("% Alíquota do IBS Municipal", `${n(v(im.nAliqIbsMun, ci.nAliqIbsMun))}`)}{leit("Valor do IBS Municipal", brl(base * n(v(im.nAliqIbsMun, ci.nAliqIbsMun)) / 100))}
                {txt("Indicador de Operação", v(im.cIndOPer, ci.cIndOper))}{leit("% Alíquota do IBS Estadual", `${n(v(im.nAliqIbsUf, ci.nAliqIbsUf))}`)}{leit("Valor do IBS Estadual", brl(base * n(v(im.nAliqIbsUf, ci.nAliqIbsUf)) / 100))}
                <div />{leit("% Alíquota da CBS", `${n(v(im.nAliqCbs, ci.nAliqCbs))}`)}{leit("Valor da CBS", brl(base * n(v(im.nAliqCbs, ci.nAliqCbs)) / 100))}
              </div>
            )}
            {nbs === "120015000" && cst !== "000" && <div style={{ marginTop: 18, fontSize: 14 }}><i className="fas fa-circle-exclamation" style={{ color: "#dc2626" }} /> Para o NBS <b>1.2001.50.00</b> é necessário informar o CST e o correto é <b>000</b>.</div>}
            <div style={{ marginTop: 16, fontSize: 11.5, color: CINZA }}>{naOS ? "Códigos e impostos como estão nesta OS no Omie." : "Códigos e impostos do cadastro do serviço no Omie (a OS ainda não foi enviada)."}</div>
          </div>
          <div style={{ width: 210, flexShrink: 0, border: `1px solid ${BORDA}`, borderRadius: 8, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 18, fontSize: 14 }}>
            <button type="button" onClick={fechar} style={nav(true)}><i className="fas fa-check" /> Pronto</button>
            <button type="button" disabled={idx <= 0} onClick={() => abrir(linhas[idx - 1].id)} style={nav(idx > 0)}><i className="fas fa-backward" /> Item Anterior</button>
            <button type="button" disabled={idx >= linhas.length - 1} onClick={() => abrir(linhas[idx + 1].id)} style={nav(idx < linhas.length - 1)}><i className="fas fa-forward" /> Próximo Item</button>
            <div style={{ fontSize: 11.5, color: CINZA }}>As alterações valem ao clicar em <b>Salvar</b> na coluna da OS.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────── Departamentos ─────────────────────────
export function AbaDepartamentos({ esp, setEsp, listas, total, podeEditar, erroListas, tentarListas }: { esp: OmieEspelho; setEsp: (f: (e: OmieEspelho) => OmieEspelho) => void; listas: ListasOmie | null; total: number; podeEditar: boolean; erroListas?: string; tentarListas?: () => void }) {
  if (!listas) return <Carregando erro={erroListas} tentar={tentarListas} />;
  const soma = Object.values(esp.deptos).reduce((a, b) => a + (b || 0), 0);
  // marcar/desmarcar: os marcados dividem 100% igualmente (o último fica com o resto); o % segue editável
  const alternar = (codigo: string) => setEsp((x) => {
    const marcados = Object.keys(x.deptos);
    const novos = marcados.includes(codigo) ? marcados.filter((c) => c !== codigo) : [...marcados, codigo];
    const parte = novos.length ? Math.floor((100 / novos.length) * 100) / 100 : 0;
    const d: Record<string, number> = {};
    novos.forEach((c, i) => { d[c] = i === novos.length - 1 ? Math.round((100 - parte * (novos.length - 1)) * 100) / 100 : parte; });
    return { ...x, deptos: d };
  });
  return (
    <div>
      <div style={{ fontSize: 13, marginBottom: 8 }}>Distribuição por Departamento <span style={{ color: "#a0aab3" }}>(marque os departamentos — o % é dividido igual e dá pra ajustar)</span></div>
      <div style={{ border: `1px solid ${BORDA}`, borderRadius: 6, maxHeight: 380, overflowY: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr><th style={{ ...th, width: 38, textAlign: "center" }} /><th style={th}>Descrição</th><th style={{ ...th, textAlign: "right", width: 170 }}>% da Distribuição</th><th style={{ ...th, textAlign: "right", width: 160 }}>Valor</th></tr></thead>
          <tbody>{listas.departamentos.map((d) => {
            const p = esp.deptos[d.codigo] || 0;
            return (
              <tr key={d.codigo} style={{ background: d.codigo in esp.deptos ? "color-mix(in srgb, #0F8B8D 10%, transparent)" : "transparent" }}>
                <td style={{ ...td, textAlign: "center", padding: "4px" }}>
                  <input type="checkbox" checked={d.codigo in esp.deptos} disabled={!podeEditar} onChange={() => alternar(d.codigo)} style={{ width: 16, height: 16, accentColor: "#0F8B8D", margin: 0, cursor: podeEditar ? "pointer" : "default" }} />
                </td>
                <td style={{ ...td, color: d.codigo in esp.deptos ? undefined : "#8a96a1", cursor: podeEditar ? "pointer" : "default" }} onClick={() => podeEditar && alternar(d.codigo)}>{d.nome}</td>
                <td style={{ ...td, textAlign: "right" }}>
                  <input type="number" min={0} max={100} value={p || ""} placeholder="0" disabled={!podeEditar}
                    onChange={(e) => setEsp((x) => { const v = Number(e.target.value) || 0; const c = { ...x.deptos }; if (v) c[d.codigo] = v; else delete c[d.codigo]; return { ...x, deptos: c }; })}
                    style={{ width: 70, textAlign: "right", border: "1px solid transparent", borderRadius: 4, padding: "2px 6px", fontSize: 12.5, background: "transparent", fontFamily: "inherit", marginBottom: 0, display: "inline-block" }} />%
                </td>
                <td style={{ ...td, textAlign: "right", color: p ? undefined : "#8a96a1" }}>{rs(total * p / 100)}</td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
      <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 12.5 }}>
        {podeEditar && <button type="button" onClick={() => setEsp((x) => ({ ...x, deptos: {} }))} style={linkBtn(true)}>× Remover distribuição</button>}
        <span style={{ fontWeight: 700, color: soma === 100 ? "#15803d" : soma === 0 ? CINZA : "#b91c1c" }}>Total {soma}%{soma && soma !== 100 ? " — tem que dar 100%" : ""}</span>
      </div>
    </div>
  );
}

// ───────────────────────── Informações Adicionais ─────────────────────────
export function AbaInfoAdicionais({ esp, setEsp, listas, interna, projeto, onTrocarProjeto, onNovaMaquina, pedidoCliente, ppv, oficina, cnpj, podeEditar, erroListas, tentarListas }: {
  esp: OmieEspelho; setEsp: (f: (e: OmieEspelho) => OmieEspelho) => void; listas: ListasOmie | null; interna: boolean; projeto: string;
  onTrocarProjeto?: () => void; onNovaMaquina?: () => void; numOmie: string; pedidoCliente: string; ppv?: string; oficina?: boolean; cnpj?: string; podeEditar: boolean; erroListas?: string; tentarListas?: () => void;
}) {
  if (!listas) return <Carregando erro={erroListas} tentar={tentarListas} />;
  const i = esp.info;
  const set = (p: Partial<OmieEspelho["info"]>) => setEsp((x) => ({ ...x, info: { ...x.info, ...p } }));
  const quando = CODIGOS_INTERNOS.find((c) => c.codigo === i.contrato)?.quando;
  const auto = dadosAdicionaisAuto({ ppv, projeto, oficina });
  const manual = !!i.dadosNF.trim();
  const secao = (t: string) => <div style={{ gridColumn: "span 4", fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: .6, color: "#0B6E70", marginTop: 4 }}>{t}</div>;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: "14px 14px", paddingTop: 2, alignItems: "start" }}>
      <EstilosOmie />
      {secao("Financeiro")}
      <Campo titulo="Categoria"><SeletorOmie valor={i.categoria} podeEditar={podeEditar} onChange={(v) => set({ categoria: v })} opcoes={categoriasServico(listas, i.categoria).map((c) => ({ valor: c.codigo, rotulo: c.nome }))} /></Campo>
      <Campo titulo="Conta Corrente"><SeletorOmie valor={i.conta} podeEditar={podeEditar} onChange={(v) => set({ conta: v })} opcoes={listas.contas.map((c) => ({ valor: c.codigo, rotulo: c.nome }))} /></Campo>
      <Campo titulo={interna ? "Nº do Contrato de Venda *" : "Nº do Contrato de Venda"}>
        <SeletorContrato valor={i.contrato} onChange={(v) => set({ contrato: v })} interna={interna} podeEditar={podeEditar} />
      </Campo>
      <Campo titulo="Nº do Pedido do Cliente" cinza><div title="Preenchido sozinho com o nº do pedido de venda (peças) no Omie">{pedidoCliente || "—"}</div></Campo>
      {quando && <div style={{ gridColumn: "3 / span 2", marginTop: -8, fontSize: 11.5, color: CINZA }}><i className="fas fa-circle-info" /> <b>{i.contrato}:</b> {quando}</div>}

      {secao("Serviço")}
      <Campo titulo="Projeto (trator)" span={2} cinza={!onTrocarProjeto}>
        <button type="button" disabled={!onTrocarProjeto} onClick={onTrocarProjeto} title={onTrocarProjeto ? "Trocar o trator (projeto) da OS" : ""}
          style={{ display: "flex", gap: 8, alignItems: "center", textAlign: "left", cursor: onTrocarProjeto ? "pointer" : "default" }}>
          <i className="fas fa-search" style={{ fontSize: 11, color: CINZA }} />
          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={projeto}>{projeto || "Escolher o trator…"}</span>
        </button>
        {onNovaMaquina && <button type="button" className="omie-mini" onClick={onNovaMaquina} title="Cadastrar máquina nova no Omie"><i className="fas fa-plus" /></button>}
      </Campo>
      <Campo titulo="Cidade da Prestação do Serviço"><input disabled={!podeEditar} value={i.cidade} onChange={(e) => set({ cidade: e.target.value })} /></Campo>
      <Campo titulo="Data de Competência"><input disabled={!podeEditar} type="date" value={i.competencia} onChange={(e) => set({ competencia: e.target.value })} /></Campo>
      <Campo titulo="Contato(s)" span={2}><ContatoNovaZap escolhidos={i.contatos} onChange={(l) => set({ contatos: l, contato: textoContatos(l) })} cnpj={cnpj || ""} podeEditar={podeEditar} /></Campo>
      <Campo titulo="Código da Obra"><input disabled={!podeEditar} value={i.obra} onChange={(e) => set({ obra: e.target.value })} /></Campo>
      <Campo titulo="Código CEI"><input disabled={!podeEditar} value={i.cei} onChange={(e) => set({ cei: e.target.value })} /></Campo>

      {secao("Nota fiscal")}
      <div style={{ gridColumn: "span 4", border: "1px solid var(--border, #d7dee3)", borderRadius: 10, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", background: "var(--portal-bg-secondary, #f4f6f7)", borderBottom: "1px solid var(--border, #e6ebee)" }}>
          <i className="fas fa-file-lines" style={{ color: "#0B6E70" }} />
          <b style={{ fontSize: 13, flex: 1 }}>Dados Adicionais para a Nota Fiscal</b>
          <span style={{ fontSize: 11.5, fontWeight: 700, padding: "2px 9px", borderRadius: 999, background: manual ? "#fef3c7" : "#e0f2f1", color: manual ? "#92400e" : "#0B6E70" }}>{manual ? "escrito à mão" : "automático"}</span>
          {podeEditar && (manual
            ? <button type="button" onClick={() => set({ dadosNF: "" })} style={{ ...linkBtn(true), fontWeight: 700 }}><i className="fas fa-rotate-left" /> Voltar ao automático</button>
            : <button type="button" onClick={() => set({ dadosNF: auto || " " })} style={{ ...linkBtn(true), fontWeight: 700 }}><i className="fas fa-pen" /> Escrever à mão</button>)}
        </div>
        {manual ? (
          <textarea disabled={!podeEditar} rows={4} value={i.dadosNF} onChange={(e) => set({ dadosNF: e.target.value })} maxLength={500}
            style={{ display: "block", width: "100%", boxSizing: "border-box", border: "none", outline: "none", resize: "vertical", padding: "10px 12px", fontSize: 13, fontFamily: "inherit", background: "var(--surface, #fefefe)", color: "inherit", marginBottom: 0 }} />
        ) : (
          <div style={{ padding: "10px 12px", fontSize: 13, lineHeight: 1.6, color: auto ? "inherit" : CINZA }}>
            {auto ? auto.split(" | ").map((t, k) => <div key={k}><i className="fas fa-check" style={{ color: "#0F8B8D", fontSize: 10, marginRight: 6 }} />{t}</div>) : "Nada a acrescentar na nota."}
          </div>
        )}
        <div style={{ padding: "6px 12px", fontSize: 11, color: CINZA, borderTop: "1px solid var(--border, #eef1f3)" }}>
          Sai na nota (NFS-e) como informação adicional. {manual ? `${i.dadosNF.length}/500` : "Montado pelo portal com o PPV, o chassis e se foi na oficina."}
        </div>
      </div>
    </div>
  );
}

// ───────────────────────── Parcelas (igual ao PPV) ─────────────────────────
export function AbaParcelas({ esp, setEsp, previsao, total, interna, faturada, podeEditar }: {
  esp: OmieEspelho; setEsp: (f: (e: OmieEspelho) => OmieEspelho) => void; previsao: string; total: number; interna: boolean; faturada: boolean; podeEditar: boolean;
}) {
  const calc = calcularParcelas(diasDoEspelho(esp), previsao, total);
  const linhas = esp.parcelas.length ? esp.parcelas : calc;
  const fixar = (k: number, pp: Partial<{ venc: string; valor: number }>) => setEsp((x) => ({ ...x, parcelas: linhas.map((p, j) => j === k ? { ...p, ...pp } : p) }));
  const inp: React.CSSProperties = { fontSize: 12.5, fontFamily: "inherit", border: `1px solid ${BORDA}`, borderRadius: 4, padding: "3px 6px", background: "transparent", marginBottom: 0, color: "inherit" };
  // OS interna não é cobrada: sem parcelas (José, 15/10/2026)
  if (interna) return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "14px 16px", borderRadius: 10, background: "#f5f3ff", border: "1px solid #ddd6fe", color: "#4c1d95" }}>
      <i className="fas fa-receipt" style={{ fontSize: 18, marginTop: 2 }} />
      <div style={{ fontSize: 13, lineHeight: 1.55 }}>
        <b>OS interna — sem parcelas.</b><br />
        Não gera conta a receber: todos os serviços vão ao Omie com &quot;não gerar conta a receber&quot;, conta corrente INTERNO
        e &quot;Enviar recibo em vez da NFS-e&quot; ligado. Ao faturar sai um <b>recibo</b>; as peças vão como <b>remessa</b>.
      </div>
    </div>
  );
  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", marginBottom: 10, gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, fontSize: 13, minWidth: 260 }}>
          <div>Contas a Receber <span style={{ color: "#a0aab3" }}>(edite a data de vencimento de cada parcela)</span></div>
          <div style={{ marginTop: 8 }}>Abaixo as parcelas e vencimentos desta venda — <b>{esp.condicaoNome || esp.condicao}</b> a partir da previsão de faturamento ({br(previsao) || "hoje"}){interna ? ". OS interna: valor a receber zerado." : "."}</div>
        </div>
        {podeEditar && <button type="button" onClick={() => setEsp((x) => ({ ...x, parcelas: [] }))} title="Recalcular a partir do Número de Parcelas e da Previsão de Faturamento" style={{ ...linkBtn(true), fontWeight: 700 }}><i className="fas fa-rotate" /> Refazer Parcelas</button>}
      </div>
      <div style={{ border: `1px solid ${BORDA}`, borderRadius: 6, minHeight: 160 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr><th style={th}>Situação</th><th style={th}>Parcela</th><th style={th}>Dias</th><th style={th}>Vencimento</th><th style={{ ...th, textAlign: "right" }}>Valor a Receber</th><th style={{ ...th, textAlign: "right" }}>Percentual</th><th style={th}>Tipo de Documento</th><th style={th}>Gerar Boleto</th></tr></thead>
          <tbody>{linhas.map((x0, k) => {
            const x = interna ? { ...x0, valor: 0 } : x0;
            return (
              <tr key={k}>
                <td style={{ ...td, textAlign: "center" }}>{faturada ? "A receber" : "Previsão"}</td>
                <td style={td}>{String(x.n).padStart(3, "0")}/{String(linhas.length).padStart(3, "0")}</td>
                <td style={td}>{x.dias}</td>
                <td style={{ ...td, padding: "4px 10px" }}>
                  {(() => {
                    const dow = x.venc ? new Date(x.venc + "T12:00:00").getDay() : -1;
                    const fds = dow === 0 || dow === 6;
                    return (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                        <input type="date" disabled={!podeEditar} value={x.venc} onChange={(e) => fixar(k, { venc: e.target.value })} style={{ ...inp, borderColor: fds ? "#dc2626" : undefined }} />
                        {dow >= 0 && (
                          <span className={fds ? "venc-fds" : undefined} title={fds ? "Vencimento no fim de semana — confira a data" : ""}
                            style={{ fontSize: 12, fontWeight: 700, minWidth: 64, color: fds ? "#dc2626" : "#475569" }}>
                            {fds && <i className="fas fa-triangle-exclamation" style={{ marginRight: 4 }} />}
                            {["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"][dow]}
                          </span>
                        )}
                      </span>
                    );
                  })()}
                </td>
                <td style={{ ...td, textAlign: "right", padding: "4px 10px" }}><input type="number" step="0.01" disabled={interna || !podeEditar} value={x.valor} onChange={(e) => fixar(k, { valor: Number(e.target.value) })} style={{ ...inp, width: 110, textAlign: "right" }} /></td>
                <td style={{ ...td, textAlign: "right" }}>{total && !interna ? `${Math.round((x.valor / total) * 10000) / 100}%` : "0%"}</td>
                <td style={td} /><td style={td}>Não</td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
      <div style={{ fontSize: 11.5, color: CINZA, marginTop: 6 }}>1 - {linhas.length} de {linhas.length} registros{esp.parcelas.length ? " · editadas à mão" : ""}</div>
      <style>{`@keyframes vencFds { 0%, 100% { opacity: 1 } 50% { opacity: .25 } } .venc-fds { animation: vencFds 1s ease-in-out infinite; }`}</style>
    </div>
  );
}
export function SeletorCondicao({ esp, setEsp, podeEditar, listas }: { esp: OmieEspelho; setEsp: (f: (e: OmieEspelho) => OmieEspelho) => void; podeEditar: boolean; listas: ListasOmie | null }) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) { setAberto(false); setBusca(""); } };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);
  const opcoes = (listas?.parcelas || []).filter((p) => !busca.trim() || p.nome.toLowerCase().includes(busca.trim().toLowerCase()) || p.codigo.toLowerCase().includes(busca.trim().toLowerCase()));
  const nome = esp.condicaoNome || listas?.parcelas.find((p) => p.codigo === esp.condicao)?.nome || esp.condicao;
  const escolher = (codigo: string, n: string) => { setEsp((x) => ({ ...x, condicao: codigo, condicaoNome: n, condicaoQtd: codigo === "999" ? (x.condicaoQtd || 1) : undefined, parcelas: [] })); setAberto(false); setBusca(""); };
  return (
    <div ref={ref} style={{ position: "relative", display: "flex", gap: 6 }}>
      <button type="button" disabled={!podeEditar} onClick={() => setAberto((a) => !a)} title={nome}
        style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8, height: 40, padding: "0 12px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface, #fefefe)", color: "inherit", font: "inherit", fontSize: 13.5, textAlign: "left", cursor: podeEditar ? "pointer" : "default" }}>
        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nome}</span>
        <i className="fas fa-chevron-down" style={{ fontSize: 10, color: "#64748b", transform: aberto ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
      </button>
      {esp.condicao === "999" && (
        <input type="number" min={1} max={60} value={esp.condicaoQtd || 1} disabled={!podeEditar} title="Número de parcelas (a cada 30 dias)"
          onChange={(e) => { const v = Math.max(1, Math.min(60, Number(e.target.value) || 1)); setEsp((x) => ({ ...x, condicaoQtd: v, parcelas: [] })); }}
          style={{ width: 64, height: 40, borderRadius: 6, border: "1px solid var(--border)", textAlign: "center", fontSize: 13.5, marginBottom: 0 }} />
      )}
      {aberto && (
        <div className="omie-lista" style={{ minWidth: 300 }}>
          <style>{ESTILOS_OMIE}</style>
          <div style={{ padding: 8, borderBottom: "1px solid var(--border, #eef1f3)" }}>
            <input autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar condição… (ex.: 30, vista, 3 parcelas)"
              style={{ width: "100%", boxSizing: "border-box", padding: "7px 10px", borderRadius: 8, border: "1px solid #d7dee3", fontSize: 13, fontFamily: "inherit", marginBottom: 0 }} />
          </div>
          <div style={{ maxHeight: 300, overflowY: "auto" }}>
            {!listas && <div style={{ padding: "10px 12px", fontSize: 12.5, color: "#6b7a89" }}><i className="fas fa-spinner fa-spin" /> Carregando as condições do Omie…</div>}
            {opcoes.map((p) => (
              <button key={p.codigo} type="button" className={`omie-lista-item${p.codigo === esp.condicao ? " ativo" : ""}`} onClick={() => escolher(p.codigo, p.nome)}>
                <span style={{ flex: 1, minWidth: 0 }}>{p.nome}</span>
                {(p.uso || 0) > 0 && <span title="Vezes usada nas OS recentes do Omie" style={{ fontSize: 10.5, fontWeight: 700, padding: "1px 7px", borderRadius: 999, background: "var(--portal-bg-secondary, #f1f5f9)", color: "#64748b" }}>{p.uso}×</span>}
                {p.codigo === esp.condicao && <i className="fas fa-check" style={{ color: "#0F8B8D", fontSize: 12 }} />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ───────────────────────── E-mail para o Cliente ─────────────────────────
export function AbaEmail({ esp, setEsp, interna, podeEditar, emailCliente = "" }: { esp: OmieEspelho; setEsp: (f: (e: OmieEspelho) => OmieEspelho) => void; interna: boolean; podeEditar: boolean; emailCliente?: string }) {
  const m = esp.email;
  const set = (p: Partial<OmieEspelho["email"]>) => setEsp((x) => ({ ...x, email: { ...x.email, ...p } }));
  // OS interna: nada vai para o cliente — recibo só para o pós-vendas (José, 15/10/2026)
  if (interna) return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "14px 16px", borderRadius: 10, background: "#f5f3ff", border: "1px solid #ddd6fe", color: "#4c1d95" }}>
      <i className="fas fa-envelope-circle-check" style={{ fontSize: 18, marginTop: 2 }} />
      <div style={{ fontSize: 13, lineHeight: 1.55 }}>
        <b>OS interna — nenhum e-mail vai para o cliente.</b><br />
        O recibo de prestação de serviço vai só para <b>{EMAIL_INTERNO}</b>. O link da NFS-e fica desligado (não há NFS-e).
      </div>
    </div>
  );
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, paddingTop: 6 }}>
      <EstilosOmie />
      <div>
        <Campo titulo="Utilizar os seguintes endereços de e-mail"><textarea disabled={!podeEditar} rows={7} style={{ ...inpOmie, resize: "vertical" }} value={m.para || emailCliente} onChange={(e) => set({ para: e.target.value })} placeholder="Cliente sem e-mail no cadastro do Omie" /></Campo>
        {!m.para && emailCliente && <div style={{ fontSize: 11.5, color: CINZA, marginTop: 6 }}><i className="fas fa-circle-info" /> E-mail do cadastro do cliente no Omie. Pode trocar ou acrescentar outros, um por linha.</div>}
        <div style={{ marginTop: 14, background: "#fff8dc", padding: "8px 12px", fontSize: 12.5, color: "#1d4ed8", borderRadius: 4 }}>
          {m.recibo ? "Apenas o recibo de prestação de serviço é enviado por e-mail para o cliente." : m.link ? "O link da NFS-e é enviado por e-mail para o cliente." : "Nada é enviado por e-mail ao cliente."}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 18, paddingTop: 4 }}>
        <Chave ligada={m.recibo} desab={!podeEditar} onChange={(v) => set({ recibo: v })} rotulo="Enviar um Recibo de Prestação de Serviço (ao invés da NFS-e)" />
        <Chave ligada={m.link} desab={!podeEditar} onChange={(v) => set({ link: v })} rotulo="Enviar o link da NFS-e gerada na prefeitura" />
        {interna && <div style={{ fontSize: 12, color: "#6d28d9" }}>OS interna: vai com <b>recibo</b> (não emite NFS-e).</div>}
      </div>
    </div>
  );
}

// ───────────────────────── Informações do cliente ─────────────────────────
export function ClienteOmieModal({ cliente: cliOmie, cnpj, fechar }: { cliente: Rec | null; cnpj: string; fechar: () => void }) {
  // depois de editar, mostra o que foi salvo (o Omie é a fonte; a OS relê na próxima abertura)
  const [salvo, setSalvo] = useState<Rec | null>(null);
  // veio sem cliente (a leitura junto com as listas pode ter falhado): busca de novo pelo CPF/CNPJ.
  // Erro de leitura NÃO vira "não achei" (OS-0824, 23/10/2026: o cliente existia no Omie).
  const [buscado, setBuscado] = useState<{ cliente: Rec | null; erro: string | null } | null>(null);
  const [buscando, setBuscando] = useState(false);
  const buscar = async () => {
    if (!cnpj) return;
    setBuscando(true);
    try {
      const r = await fetch(`/api/pos/omie-listas?so=cliente&cnpj=${encodeURIComponent(cnpj)}`, { headers: await authHeaders() });
      const j = await r.json().catch(() => ({}));
      setBuscado(r.ok ? { cliente: j.cliente || null, erro: j.clienteErro || null } : { cliente: null, erro: j.error || `Erro ${r.status}` });
    } catch { setBuscado({ cliente: null, erro: "Sem conexão com o portal." }); }
    setBuscando(false);
  };
  useEffect(() => {
    if (cliOmie || !cnpj) return;
    let vivo = true;
    Promise.resolve().then(() => { if (vivo) void buscar(); });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cliOmie, cnpj]);
  const base = cliOmie || buscado?.cliente || null;
  const cliente = base ? { ...base, ...(salvo || {}) } : null;
  const v = (k: string) => String(cliente?.[k] ?? "");
  const alertaCep = cliente ? alertaCepGeral(v("cep")) : null;
  const tags = Array.isArray(cliente?.tags) ? (cliente!.tags as { tag?: string }[]).map((t) => t.tag).filter(Boolean).join(", ") : "";
  const f = (t: string, val: string, span: number) => <Campo key={t} titulo={t} span={span} cinza><div style={inpOmie}>{val || "—"}</div></Campo>;
  return (
    <div onClick={fechar} style={{ position: "fixed", inset: 0, zIndex: 100010, background: "rgba(15,23,42,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 980, maxWidth: "96vw", maxHeight: "90vh", overflowY: "auto", background: "var(--surface, #fefefe)", borderRadius: 10 }}>
        <div style={{ display: "flex", alignItems: "center", padding: "14px 20px", background: "var(--portal-bg-secondary, #f3f5f6)" }}>
          <EstilosOmie />
          <b style={{ flex: 1, fontSize: 17, fontWeight: 600, color: TEAL_ESC }}>Informações do cliente</b>
          {cliente && (
            <span style={{ marginRight: 14 }}>
              <EditarClienteOmie doc={v("cnpj_cpf") || cnpj} cod={Number(v("codigo_cliente_omie")) || null} zIndex={100020}
                onSalvo={(r) => { const f = r.form; setSalvo({
                  razao_social: f.razao_social, nome_fantasia: f.nome_fantasia, email: f.email, cep: f.cep, endereco: f.endereco, endereco_numero: f.numero,
                  complemento: f.complemento, bairro: f.bairro, cidade: f.cidade, estado: f.estado,
                  inscricao_estadual: f.isento_ie ? "ISENTO" : f.inscricao_estadual,
                  telefone1_ddd: (f.telefone || "").replace(/\D/g, "").slice(0, 2), telefone1_numero: (f.telefone || "").replace(/\D/g, "").slice(2),
                }); }} />
            </span>
          )}
          <button type="button" onClick={fechar} style={{ border: "none", background: "transparent", color: TEAL_ESC, cursor: "pointer", fontSize: 14, fontFamily: "inherit" }}>Fechar ✕</button>
        </div>
        <div style={{ padding: "22px 20px", display: "grid", gridTemplateColumns: "repeat(6, minmax(0,1fr))", gap: "20px 14px" }}>
          {!cliente ? (
            <div style={{ gridColumn: "span 6", color: CINZA }}>
              {buscando || (!buscado && cnpj) ? <><i className="fas fa-spinner fa-spin" /> Buscando o cliente no Omie (CPF/CNPJ {cnpj})…</>
                : buscado?.erro ? <>
                  <div style={{ color: "#b91c1c" }}>Não consegui ler o cadastro no Omie agora: {buscado.erro}</div>
                  <button type="button" onClick={() => void buscar()} style={{ marginTop: 10, padding: "8px 14px", borderRadius: 8, border: "none", background: TEAL, color: "#fefefe", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Tentar de novo</button>
                </>
                : <>Não achei este cliente no Omie (CPF/CNPJ {cnpj || "vazio"}).</>}
            </div>
          ) : [
            f("Razão Social / Nome", v("razao_social"), 3), f("Nome Fantasia", v("nome_fantasia"), 3), f("CPF / CNPJ", v("cnpj_cpf"), 2),
            f("Inscrição Estadual", v("inscricao_estadual") || (v("contribuinte") === "N" ? "ISENTO" : ""), 2), f("Código no Omie", v("codigo_cliente_omie"), 2),
            f("Endereço", v("endereco"), 3), f("Número", v("endereco_numero"), 1), f("Complemento", v("complemento"), 2), f("Bairro", v("bairro"), 2), f("Cidade", v("cidade"), 2),
            f("UF", v("estado"), 1), f("CEP", v("cep"), 1), f("Telefone", [v("telefone1_ddd"), v("telefone1_numero")].filter(Boolean).join(" "), 2), f("E-mail", v("email"), 2),
            f("Contato", v("contato"), 2), f("Tags", tags, 6),
          ]}
          {alertaCep && <div style={{ gridColumn: "span 6", fontSize: 12.5, color: "#92400e", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "9px 12px", lineHeight: 1.5 }}><i className="fas fa-triangle-exclamation" style={{ marginRight: 6 }} />{alertaCep}</div>}
          <div style={{ gridColumn: "span 6", fontSize: 12, color: CINZA }}>Cadastro do Omie. O botão Editar cliente altera na Nova e na Castro.</div>
        </div>
      </div>
    </div>
  );
}

export function SeletorContrato({ valor, onChange, interna, podeEditar }: { valor: string; onChange: (v: string) => void; interna: boolean; podeEditar: boolean }) {
  const [codigos, setCodigos] = useState(CODIGOS_INTERNOS);
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [form, setForm] = useState<{ antigo: string; codigo: string; quando: string } | null>(null);
  const [erro, setErro] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const carregar = async () => {
    try { const r = await fetch("/api/pos/codigos-contrato", { headers: await authHeaders() }); const j = await r.json(); if (r.ok && Array.isArray(j.codigos)) setCodigos(j.codigos); } catch { /* fica o padrão */ }
  };
  useEffect(() => {
    let vivo = true;
    (async () => {
      try { const r = await fetch("/api/pos/codigos-contrato", { headers: await authHeaders() }); const j = await r.json(); if (vivo && r.ok && Array.isArray(j.codigos)) setCodigos(j.codigos); } catch { /* fica o padrão */ }
    })();
    return () => { vivo = false; };
  }, []);
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) { setAberto(false); setForm(null); } };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);
  const q = busca.trim().toLowerCase();
  const lista = codigos.filter((c) => !q || c.codigo.toLowerCase().includes(q) || c.quando.toLowerCase().includes(q));
  const quando = codigos.find((c) => c.codigo === valor)?.quando;
  const salvar = async () => {
    if (!form || !form.codigo.trim()) return;
    setErro("");
    const r = await fetch("/api/pos/codigos-contrato", { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeaders()) }, body: JSON.stringify(form) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErro(j.error || "Não salvou."); return; }
    await carregar();
    if (!form.antigo || form.antigo === valor) onChange(j.codigo);
    setForm(null); setAberto(false);
  };
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button type="button" disabled={!podeEditar} onClick={() => setAberto((a) => !a)} title={quando || ""}
        style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", border: "none", background: "transparent", padding: 0, font: "inherit", fontSize: 13, cursor: podeEditar ? "pointer" : "default", color: interna && !valor ? "#b91c1c" : "inherit" }}>
        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{valor || (interna ? "Escolha o código interno…" : "— nenhum —")}</span>
        <i className="fas fa-chevron-down" style={{ fontSize: 10, color: "#6b7a89" }} />
      </button>
      {aberto && (
        <div className="omie-lista" style={{ minWidth: 300 }}>
          {form ? (
            <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              <b style={{ fontSize: 13 }}>{form.antigo ? `Editar “${form.antigo}”` : "Novo código"}</b>
              <input autoFocus maxLength={20} value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} placeholder="Código (até 20 letras, vai pro Omie)"
                style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #d7dee3", fontSize: 13, fontFamily: "inherit", marginBottom: 0 }} />
              <input value={form.quando} onChange={(e) => setForm({ ...form, quando: e.target.value })} placeholder="Quando usar (explicação)"
                style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #d7dee3", fontSize: 13, fontFamily: "inherit", marginBottom: 0 }} />
              {erro && <div style={{ fontSize: 12, color: "#b91c1c" }}>{erro}</div>}
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button type="button" onClick={() => { setForm(null); setErro(""); }} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #d7dee3", background: "transparent", cursor: "pointer", fontFamily: "inherit" }}>Voltar</button>
                <button type="button" onClick={salvar} disabled={!form.codigo.trim()} style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: "#0F8B8D", color: "#fefefe", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Salvar</button>
              </div>
            </div>
          ) : (
            <>
              <div style={{ padding: 8, borderBottom: "1px solid var(--border, #eef1f3)" }}>
                <input autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar código…"
                  style={{ width: "100%", boxSizing: "border-box", padding: "7px 10px", borderRadius: 8, border: "1px solid #d7dee3", fontSize: 13, fontFamily: "inherit", marginBottom: 0 }} />
              </div>
              <div style={{ maxHeight: 260, overflowY: "auto" }}>
                {!interna && <button type="button" className={`omie-lista-item${!valor ? " ativo" : ""}`} onClick={() => { onChange(""); setAberto(false); }}><span style={{ color: "#6b7a89" }}>— nenhum (OS normal) —</span></button>}
                {lista.map((c) => (
                  <div key={c.codigo} className={`omie-lista-item${c.codigo === valor ? " ativo" : ""}`} style={{ padding: 0 }}>
                    <button type="button" onClick={() => { onChange(c.codigo); setAberto(false); }} style={{ flex: 1, minWidth: 0, textAlign: "left", border: "none", background: "transparent", padding: "8px 12px", cursor: "pointer", fontFamily: "inherit", color: "inherit" }}>
                      <span style={{ display: "block", fontWeight: 700, fontSize: 13 }}>{c.codigo}</span>
                      {c.quando && <span style={{ display: "block", fontSize: 11.5, color: "#6b7a89", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.quando}</span>}
                    </button>
                    <button type="button" title="Editar este código" onClick={() => setForm({ antigo: c.codigo, codigo: c.codigo, quando: c.quando })}
                      style={{ border: "none", background: "transparent", color: "#94a3b8", cursor: "pointer", padding: "8px 12px" }}><i className="fas fa-pen" style={{ fontSize: 11 }} /></button>
                  </div>
                ))}
                {lista.length === 0 && <div style={{ padding: "10px 12px", fontSize: 12.5, color: "#6b7a89" }}>Nenhum código com “{busca}”.</div>}
              </div>
              <button type="button" onClick={() => setForm({ antigo: "", codigo: busca.trim(), quando: "" })}
                style={{ width: "100%", padding: "9px 12px", border: "none", borderTop: "1px solid var(--border, #eef1f3)", background: "transparent", color: "#0F8B8D", fontWeight: 700, cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
                <i className="fas fa-plus" /> Adicionar código{busca.trim() ? ` “${busca.trim()}”` : ""}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── lista suspensa no estilo Omie (no lugar do <select> nativo)
export function SeletorOmie<V extends string | number>({ valor, opcoes, onChange, podeEditar = true, vazio = "Escolha…" }: {
  valor: V; opcoes: { valor: V; rotulo: string; sub?: string }[]; onChange: (v: V) => void; podeEditar?: boolean; vazio?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false); };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);
  const atual = opcoes.find((o) => o.valor === valor);
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button type="button" disabled={!podeEditar} onClick={() => setAberto((a) => !a)}
        style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", border: "none", background: "transparent", padding: 0, font: "inherit", fontSize: 13, color: "inherit", cursor: podeEditar ? "pointer" : "default" }}>
        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: atual ? undefined : "#94a3b8" }}>{atual?.rotulo || (valor ? String(valor) : vazio)}</span>
        <i className="fas fa-chevron-down" style={{ fontSize: 10, color: "#6b7a89", transform: aberto ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
      </button>
      {aberto && (
        <div className="omie-lista" style={{ maxHeight: 300, overflowY: "auto" }}>
          {opcoes.map((o) => (
            <button key={String(o.valor)} type="button" className={`omie-lista-item${o.valor === valor ? " ativo" : ""}`} onClick={() => { onChange(o.valor); setAberto(false); }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontWeight: o.valor === valor ? 700 : 500 }}>{o.rotulo}</span>
                {o.sub && <span style={{ display: "block", fontSize: 11.5, color: "#6b7a89" }}>{o.sub}</span>}
              </span>
              {o.valor === valor && <i className="fas fa-check" style={{ color: "#0F8B8D", fontSize: 12 }} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** categorias de serviço = as que começam com "#" (ex.: "1. #Serv Prest Manutenção"), em ordem do número */
export function categoriasServico(listas: ListasOmie | null, atual?: string) {
  const todas = listas?.categorias || [];
  const ok = todas.filter((c) => /^\s*(\d+\.\s*)?#/.test(c.nome) || c.codigo === atual);
  const num = (n: string) => Number(n.match(/^\s*(\d+)/)?.[1] || 999);
  return ok.sort((a, b) => num(a.nome) - num(b.nome) || a.nome.localeCompare(b.nome, "pt-BR"));
}

// ── técnicos num campo só (José, 14/10/2026): "A" sozinho e as duplas "A / B".
// No banco continua técnico 1 e técnico 2 — é só a forma de escolher.
export function SeletorTecnicos({ tecnicos, t1, t2, onChange, podeEditar, unico }: { tecnicos: string[]; t1: string; t2: string; onChange: (t1: string, t2: string) => void; podeEditar: boolean; /** só um técnico (sem pares) */ unico?: boolean }) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) { setAberto(false); setBusca(""); } };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);
  // s\u00f3 t\u00e9cnicos ATIVOS (conta do portal desativada = some da lista)
  const [inativos, setInativos] = useState<Set<string>>(new Set());
  useEffect(() => {
    let vivo = true;
    fetch("/api/pos/tecnicos?perfil=1").then((r) => (r.ok ? r.json() : [])).then((l: { nome: string; inativo?: boolean }[]) => {
      if (vivo) setInativos(new Set(l.filter((x) => x.inativo).map((x) => x.nome.trim())));
    }).catch(() => {});
    return () => { vivo = false; };
  }, []);
  const sem = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const opcoes = useMemo(() => {
    const ativos = tecnicos.filter((t) => !inativos.has(t.trim()));
    const q = sem(busca.trim());
    const base = q ? ativos.filter((t) => sem(t).includes(q)) : ativos;
    const out: { a: string; b: string }[] = [];
    for (const a of base) {
      out.push({ a, b: "" });
      if (q && !unico) for (const b of ativos) if (b !== a) out.push({ a, b });
    }
    if (!q && !unico) for (const a of ativos) for (const b of ativos) if (b !== a) out.push({ a, b });
    return out.slice(0, 300);
  }, [busca, tecnicos, inativos, unico]);
  const rotulo = t1 ? (t2 ? `${t1} / ${t2}` : t1) : "Selecione…";
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button type="button" disabled={!podeEditar} onClick={() => setAberto((a) => !a)} title={rotulo}
        style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", height: 40, padding: "0 12px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface, #fefefe)", color: "inherit", font: "inherit", fontSize: 13.5, textAlign: "left", cursor: podeEditar ? "pointer" : "default" }}>
        <i className="fas fa-user-gear" style={{ color: "#64748b", fontSize: 12 }} />
        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: t1 ? undefined : "#94a3b8" }}>{rotulo}</span>
        <i className="fas fa-chevron-down" style={{ fontSize: 10, color: "#64748b", transform: aberto ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
      </button>
      {aberto && (
        <div className="omie-lista" style={{ minWidth: 320 }}>
          <style>{ESTILOS_OMIE}</style>
          <div style={{ padding: 8, borderBottom: "1px solid var(--border, #eef1f3)", position: "relative" }}>
            <i className="fas fa-search" style={{ position: "absolute", left: 18, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: "#94a3b8" }} />
            <input autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar técnico… (ex.: jose antonio)"
              style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px 8px 30px", borderRadius: 8, border: "1px solid #d7dee3", fontSize: 13, fontFamily: "inherit", marginBottom: 0 }} />
          </div>
          <div style={{ maxHeight: 300, overflowY: "auto" }}>
            {opcoes.map((o) => {
              const ativo = o.a === t1 && o.b === (t2 || "");
              return (
                <button key={`${o.a}|${o.b}`} type="button" className={`omie-lista-item${ativo ? " ativo" : ""}`} onClick={() => { onChange(o.a, o.b); setAberto(false); setBusca(""); }}>
                  <i className={o.b ? "fas fa-user-group" : "fas fa-user"} style={{ width: 16, color: o.b ? "#0F8B8D" : "#64748b", fontSize: 11 }} />
                  <span style={{ flex: 1, minWidth: 0 }}>{o.a}{o.b && <span style={{ color: "#64748b" }}> / {o.b}</span>}</span>
                  {ativo && <i className="fas fa-check" style={{ color: "#0F8B8D", fontSize: 12 }} />}
                </button>
              );
            })}
            {opcoes.length === 0 && <div style={{ padding: "10px 12px", fontSize: 12.5, color: "#6b7a89" }}>Nenhum técnico com “{busca}”.</div>}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Um usuário do portal (vendedor do PPV): mesmo visual do seletor de técnicos, com foto e função
interface UsuarioPortal { nome: string; funcao: string; foto: string }
export function SeletorUsuario({ atual, onChange, podeEditar = true, placeholder = "Escolher usuário do portal…" }: { atual: string; onChange: (nome: string) => void; podeEditar?: boolean; placeholder?: string }) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [usuarios, setUsuarios] = useState<UsuarioPortal[] | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) { setAberto(false); setBusca(""); } };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);
  const abrir = async () => {
    setAberto((a) => !a);
    if (usuarios) return;
    const { data } = await supabase.from("financeiro_usu").select("nome, funcao, avatar_url, ativo").order("nome");
    setUsuarios(((data || []) as { nome?: string; funcao?: string | null; avatar_url?: string | null; ativo?: boolean | null }[])
      .filter((u) => u.nome && u.ativo !== false).map((u) => ({ nome: String(u.nome), funcao: String(u.funcao || ""), foto: String(u.avatar_url || "") })));
  };
  const sem = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const q = sem(busca.trim());
  const opcoes = (usuarios || []).filter((u) => !q || sem(u.nome).includes(q) || sem(u.funcao).includes(q));
  const eu = usuarios?.find((u) => u.nome === atual);
  const ini = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const avatar = (u: { nome: string; foto?: string }, tam: number) => u.foto
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={u.foto} alt="" style={{ width: tam, height: tam, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
    : <span style={{ width: tam, height: tam, borderRadius: "50%", flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: tam * 0.4, fontWeight: 800, color: "#0B6E70", background: "color-mix(in srgb, #0F8B8D 14%, transparent)" }}>{ini(u.nome)}</span>;
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button type="button" disabled={!podeEditar} onClick={abrir} title={atual || placeholder}
        style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", height: 40, padding: "0 12px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface, #fefefe)", color: "inherit", font: "inherit", fontSize: 13.5, textAlign: "left", cursor: podeEditar ? "pointer" : "default" }}>
        {atual ? avatar({ nome: atual, foto: eu?.foto }, 22) : <i className="fas fa-user-tie" style={{ color: "#64748b", fontSize: 12 }} />}
        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: atual ? undefined : "#94a3b8" }}>{atual || placeholder}</span>
        <i className="fas fa-chevron-down" style={{ fontSize: 10, color: "#64748b", transform: aberto ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
      </button>
      {aberto && (
        <div className="omie-lista" style={{ minWidth: 320 }}>
          <style>{ESTILOS_OMIE}</style>
          <div style={{ padding: 8, borderBottom: "1px solid var(--border, #eef1f3)", position: "relative" }}>
            <i className="fas fa-search" style={{ position: "absolute", left: 18, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: "#94a3b8" }} />
            <input autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou função…"
              style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px 8px 30px", borderRadius: 8, border: "1px solid #d7dee3", fontSize: 13, fontFamily: "inherit", marginBottom: 0 }} />
          </div>
          <div style={{ maxHeight: 300, overflowY: "auto" }}>
            {!usuarios && <div style={{ padding: "10px 12px", fontSize: 12.5, color: "#6b7a89" }}><i className="fas fa-spinner fa-spin" /> Carregando usuários…</div>}
            {opcoes.map((u) => (
              <button key={u.nome} type="button" className={`omie-lista-item${u.nome === atual ? " ativo" : ""}`} onClick={() => { onChange(u.nome); setAberto(false); setBusca(""); }}>
                {avatar(u, 26)}
                <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", lineHeight: 1.25 }}>
                  <span>{u.nome}</span>{u.funcao && <span style={{ fontSize: 11, color: "#64748b" }}>{u.funcao}</span>}
                </span>
                {u.nome === atual && <i className="fas fa-check" style={{ color: "#0F8B8D", fontSize: 12 }} />}
              </button>
            ))}
            {usuarios && opcoes.length === 0 && <div style={{ padding: "10px 12px", fontSize: 12.5, color: "#6b7a89" }}>Ninguém com “{busca}”.</div>}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Contato: sugere os contatos do NovaZap (Chatwoot) vinculados ao CNPJ da OS; dá pra digitar à mão
interface ContatoNZ { id: number; nome: string; cargo: string | null; telefone: string | null; thumbnail: string | null }
export function ContatoNovaZap({ escolhidos, onChange, cnpj, podeEditar }: { escolhidos: ContatoOS[] | undefined; onChange: (l: ContatoOS[]) => void; cnpj: string; podeEditar: boolean }) {
  const [aberto, setAberto] = useState(false);
  const [livre, setLivre] = useState("");
  const [estado, setEstado] = useState<{ carregando: boolean; contatos: ContatoNZ[]; aviso: string; base: string }>({ carregando: false, contatos: [], aviso: "", base: "" });
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false); };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);
  useEffect(() => {
    const doc = cnpj.replace(/\D/g, "");
    if (!doc) return;
    let vivo = true;
    (async () => {
      if (vivo) setEstado((e) => ({ ...e, carregando: true }));
      try {
        const r = await fetch(`/api/clientes/contatos-chatwoot?cnpj=${doc}`, { headers: await authHeaders() });
        const j = await r.json().catch(() => ({}));
        const sec = j.secao || {};
        if (!vivo) return;
        if (sec.estado === "ok") setEstado({ carregando: false, contatos: sec.contatos || [], aviso: "", base: j.urlContatoBase || "" });
        else setEstado({ carregando: false, contatos: [], base: j.urlContatoBase || "", aviso: sec.estado === "nao_configurado" ? "NovaZap não está ligado neste ambiente." : sec.estado === "sem_contatos" ? "Nenhum contato do NovaZap vinculado a este CNPJ." : (j.error || sec.motivo || "Não consegui ler o NovaZap.") });
      } catch { if (vivo) setEstado((e) => ({ ...e, carregando: false, aviso: "Não consegui ler o NovaZap." })); }
    })();
    return () => { vivo = false; };
  }, [cnpj]);
  // nunca escolheu = mostra os vinculados ao CNPJ
  const lista: ContatoOS[] = escolhidos ?? estado.contatos.map((c) => ({ id: c.id, nome: c.nome, cargo: c.cargo, telefone: c.telefone, thumbnail: c.thumbnail }));
  const disponiveis = estado.contatos.filter((c) => !lista.some((x) => x.id === c.id));
  const iniciais = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
  const foto = (c: ContatoOS, t = 26) => c.thumbnail
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={c.thumbnail} alt="" style={{ width: t, height: t, borderRadius: t / 2, objectFit: "cover", flexShrink: 0 }} />
    : <span style={{ width: t, height: t, borderRadius: t / 2, background: "#dcfce7", color: "#15803d", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10.5, fontWeight: 800, flexShrink: 0 }}>{iniciais(c.nome) || "?"}</span>;
  return (
    <div ref={ref} className="omie-livre" style={{ position: "relative", display: "flex", alignItems: "center", gap: 6, padding: "4px 6px", flexWrap: "wrap", minHeight: 38 }}>
      {lista.map((c) => (
        <span key={c.id || c.nome} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "3px 6px 3px 3px", borderRadius: 999, background: "var(--portal-bg-secondary, #f1f5f9)", border: "1px solid var(--border, #e2e8f0)", maxWidth: "100%" }}>
          {foto(c)}
          <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.15, minWidth: 0 }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.nome}</span>
            {(c.telefone || c.cargo) && <span style={{ fontSize: 10.5, color: "#64748b", whiteSpace: "nowrap" }}>{[c.cargo, c.telefone].filter(Boolean).join(" · ")}</span>}
          </span>
          {c.id > 0 && estado.base && (
            <a href={`${estado.base}${c.id}`} target="_blank" rel="noreferrer" title="Abrir a conversa no NovaZap" onClick={(e) => e.stopPropagation()}
              style={{ color: "#16a34a", fontSize: 13, padding: "0 2px" }}><i className="fab fa-whatsapp" /></a>
          )}
          {podeEditar && <button type="button" title="Tirar este contato" onClick={() => onChange(lista.filter((x) => x !== c))}
            style={{ border: "none", background: "transparent", color: "#94a3b8", cursor: "pointer", fontSize: 12, padding: "0 2px" }}><i className="fas fa-times" /></button>}
        </span>
      ))}
      {!lista.length && <span style={{ fontSize: 12.5, color: "#94a3b8", padding: "0 6px" }}>{estado.carregando ? "Buscando no NovaZap…" : "Nenhum contato"}</span>}
      {podeEditar && (
        <button type="button" onClick={() => setAberto((a) => !a)} title="Adicionar contato"
          style={{ marginLeft: "auto", width: 28, height: 28, borderRadius: 14, border: "1px dashed #16a34a", background: "transparent", color: "#16a34a", cursor: "pointer", flexShrink: 0 }}>
          {estado.carregando ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-plus" style={{ fontSize: 11 }} />}
        </button>
      )}
      {aberto && (
        <div className="omie-lista" style={{ minWidth: 300 }}>
          <div style={{ padding: "8px 12px", fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: .5, color: "#16a34a", borderBottom: "1px solid var(--border, #eef1f3)" }}><i className="fab fa-whatsapp" /> Contatos do NovaZap deste CNPJ</div>
          <div style={{ maxHeight: 240, overflowY: "auto" }}>
            {disponiveis.map((c) => (
              <button key={c.id} type="button" className="omie-lista-item" onClick={() => { onChange([...lista, { id: c.id, nome: c.nome, cargo: c.cargo, telefone: c.telefone, thumbnail: c.thumbnail }]); setAberto(false); }}>
                {foto(c, 28)}
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontWeight: 600 }}>{c.nome}{c.cargo ? <span style={{ fontWeight: 400, color: "#6b7a89" }}> · {c.cargo}</span> : null}</span>
                  {c.telefone && <span style={{ display: "block", fontSize: 11.5, color: "#6b7a89" }}>{c.telefone}</span>}
                </span>
              </button>
            ))}
            {!estado.carregando && !disponiveis.length && <div style={{ padding: "10px 12px", fontSize: 12.5, color: "#6b7a89" }}>{estado.aviso || (estado.contatos.length ? "Todos os contatos do NovaZap já estão na OS." : "Nenhum contato do NovaZap.")}</div>}
          </div>
          <div style={{ display: "flex", gap: 6, padding: 8, borderTop: "1px solid var(--border, #eef1f3)" }}>
            <input value={livre} onChange={(e) => setLivre(e.target.value)} placeholder="Ou digite um contato (nome - telefone)"
              onKeyDown={(e) => { if (e.key === "Enter" && livre.trim()) { onChange([...lista, { id: 0, nome: livre.trim() }]); setLivre(""); setAberto(false); } }}
              style={{ flex: 1, minWidth: 0, padding: "7px 10px", borderRadius: 8, border: "1px solid #d7dee3", fontSize: 13, fontFamily: "inherit", marginBottom: 0 }} />
            <button type="button" disabled={!livre.trim()} onClick={() => { onChange([...lista, { id: 0, nome: livre.trim() }]); setLivre(""); setAberto(false); }}
              style={{ padding: "0 12px", borderRadius: 8, border: "none", background: livre.trim() ? "#0F8B8D" : "#cbd5e1", color: "#fefefe", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Adicionar</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── busca de serviço do cadastro do Omie (no lugar da lista enorme)
export function BuscaServico({ listas, onEscolher, rotulo = "+ Incluir serviço" }: { listas: ListasOmie | null; onEscolher: (codigo: string) => void; rotulo?: string }) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false); };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);
  const sem = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const achados = useMemo(() => {
    const termos = sem(busca).split(/\s+/).filter(Boolean);
    return (listas?.servicos || []).filter((s) => termos.every((t) => sem(`${s.nome} ${s.codigo}`).includes(t))).slice(0, 60);
  }, [busca, listas]);
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button type="button" onClick={() => setAberto((a) => !a)} disabled={!listas}
        style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 34, padding: "0 14px", borderRadius: 9, border: "none", background: listas ? "#0F8B8D" : "#94a3b8", color: "#fefefe", fontWeight: 700, fontSize: 12.5, cursor: listas ? "pointer" : "default", fontFamily: "inherit", boxShadow: listas ? "0 2px 6px rgba(15,139,141,.25)" : "none" }}>
        <i className="fas fa-plus" /> {rotulo.replace(/^\+\s*/, "")}
      </button>
      {aberto && (
        <div className="omie-lista" style={{ width: 420, maxWidth: "88vw", right: "auto" }}>
          <div style={{ padding: 8, borderBottom: "1px solid var(--border, #eef1f3)", position: "relative" }}>
            <i className="fas fa-search" style={{ position: "absolute", left: 18, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: "#94a3b8" }} />
            <input autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar serviço por nome ou código… (ex.: revisão 600 5050)"
              style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px 8px 30px", borderRadius: 8, border: "1px solid #d7dee3", fontSize: 13, fontFamily: "inherit", marginBottom: 0 }} />
          </div>
          <div style={{ maxHeight: 300, overflowY: "auto" }}>
            {achados.map((s) => (
              <button key={s.codigo} type="button" className="omie-lista-item" onClick={() => { onEscolher(s.codigo); setAberto(false); setBusca(""); }}>
                <span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "block", fontWeight: 600 }}>{s.nome}</span><span style={{ fontSize: 11.5, color: "#6b7a89" }}>{s.codigo}</span></span>
                {s.preco >= 0.01 && <span style={{ fontSize: 12, color: "#6b7a89", whiteSpace: "nowrap" }}>{rs(s.preco)}</span>}
              </button>
            ))}
            {achados.length === 0 && <div style={{ padding: "10px 12px", fontSize: 12.5, color: "#6b7a89" }}>Nenhum serviço encontrado.</div>}
          </div>
        </div>
      )}
    </div>
  );
}

function Carregando({ erro, tentar }: { erro?: string; tentar?: () => void }) {
  if (erro) return (
    <div style={{ fontSize: 13, color: "#b91c1c", padding: 10, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <span><i className="fas fa-triangle-exclamation" /> Não carregou as listas do Omie: {erro}</span>
      {tentar && <button type="button" onClick={tentar} style={{ height: 30, padding: "0 12px", borderRadius: 8, border: "1px solid #0F8B8D", background: "transparent", color: "#0F8B8D", fontWeight: 700, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" }}>Tentar de novo</button>}
    </div>
  );
  return <div style={{ fontSize: 13, color: CINZA, padding: 10 }}><i className="fas fa-spinner fa-spin" /> Carregando as listas do Omie…</div>;
}
