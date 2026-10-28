"use client";
// As 3 opções da página de teste na aba "Revisões" do RFM: 1 · um trator por vez; 2 · quadro
// (Atrasadas · Vence em 30 dias · Parou de fazer · Próximas · Agendadas); 3 · lista com painel.
// Mesmo CSS das opções do CRM (estiloFila.ts) + .fbr-* (estilo da ficha do trator).
import { useEffect, useMemo, useState } from "react";
import type { ItemRevisao } from "@/lib/feedbacks/previsao-revisao";
import { fmtDataBR, fmtH } from "@/lib/feedbacks/previsao-revisao";
import { comoItemFila, type FilaRevisoes } from "./useFilaRevisoes";
import { COR_ACAO, ICO_ACAO } from "./FichaCliente";
import FichaTrator, { COR_SITUACAO, fmtMedia, rotuloPrazo } from "./FichaTrator";
import AcoesAtendimento from "./AcoesAtendimento";

function Atender({ it, fila, grande, onFeito }: { it: ItemRevisao; fila: FilaRevisoes; grande?: boolean; onFeito?: () => void }) {
  const fi = useMemo(() => comoItemFila(it), [it]);
  return (
    <>
      <FichaTrator it={it} fi={fi} grande={grande} onHistorico={() => fila.abrirHistorico(fi.registro)} />
      <div style={{ paddingTop: 12, borderTop: "1px solid var(--b)" }}>
        <AcoesAtendimento item={fi} fila={fila} grande={grande} onFeito={onFeito} modo="revisao" />
      </div>
    </>
  );
}

const subTrator = (it: ItemRevisao) => `Mahindra ${it.trator.modelo} · final ${it.trator.chassi.slice(-7)}`;

// ─── opção 1 ─────────────────────────────────────────────────────────────────
export function RevProximo({ fila }: { fila: FilaRevisoes }) {
  const [selId, setSelId] = useState<string | null>(null);
  const [pulados, setPulados] = useState<string[]>([]);
  const ordem = useMemo(() => {
    const p = new Set(pulados);
    return [...fila.itens.filter((it) => !p.has(it.trator.id)), ...pulados.map((id) => fila.itens.find((it) => it.trator.id === id)).filter((x): x is ItemRevisao => !!x)];
  }, [fila.itens, pulados]);
  const idx = Math.max(0, ordem.findIndex((it) => it.trator.id === selId));
  const atual = ordem[idx] ?? null;
  const proximos = ordem.slice(idx + 1, idx + 6);
  const ir = (i: number) => setSelId(ordem[(i + ordem.length) % ordem.length]?.trator.id ?? null);
  if (!atual) return <div className="fbn-vazio">{fila.escopo === "agora" ? "Nenhuma revisão para oferecer agora." : "Nenhum trator nesta situação."}</div>;
  return (
    <div className="fbf-o1">
      <div className="fbn-card fbf-o1-card">
        <div className="fbf-o1-nav">
          <span className="fbf-falta"><i className="fa-solid fa-list-ol" style={{ color: "var(--c)" }} />
            <span>{fila.escopo === "agora" ? <>Faltam <b>{fila.contagem.agora}</b> tratores · este é o <b>{idx + 1}º</b></> : <>Trator <b>{idx + 1}</b> de <b>{ordem.length}</b></>}</span>
          </span>
          <span style={{ display: "flex", gap: 6 }}>
            <button type="button" className="fbn-acao cinza" onClick={() => ir(idx - 1)} disabled={ordem.length < 2} aria-label="Anterior"><i className="fa-solid fa-chevron-left" /></button>
            <button type="button" className="fbn-acao" disabled={ordem.length < 2} title="Manda este trator para o fim da fila (só nesta tela)"
              onClick={() => { setPulados((p) => [...p.filter((x) => x !== atual.trator.id), atual.trator.id]); setSelId(ordem[idx + 1]?.trator.id ?? null); }}><i className="fa-solid fa-forward" /> Pular</button>
            <button type="button" className="fbn-acao" onClick={() => ir(idx + 1)} disabled={ordem.length < 2}>Próximo <i className="fa-solid fa-chevron-right" /></button>
          </span>
        </div>
        <Atender it={atual} fila={fila} grande onFeito={() => setSelId(proximos[0]?.trator.id ?? null)} />
      </div>
      <aside className="fbf-prox">
        <h3>Depois deste</h3>
        {proximos.length === 0 && <div className="fbn-vazio" style={{ padding: "24px 14px" }}>Nenhum depois deste.</div>}
        {proximos.map((it, i) => (
          <button key={it.trator.id} type="button" className="fbf-mini" onClick={() => setSelId(it.trator.id)}>
            <span className="n">{idx + i + 2}</span>
            <span className="x">
              <div>{it.trator.cliente}</div>
              <small><i className="fa-solid fa-circle" style={{ color: COR_SITUACAO[it.trator.previsao.situacao], fontSize: 8 }} /> Revisão {it.trator.previsao.revisaoOferta} h · {rotuloPrazo(it.trator.previsao)}</small>
            </span>
          </button>
        ))}
      </aside>
    </div>
  );
}

// ─── opção 2 ─────────────────────────────────────────────────────────────────
type ColR = "atrasada" | "vence_30" | "parou" | "proxima" | "agendadas";
const COLS: { k: ColR; rot: string; ico: string; cor: string; dica: string }[] = [
  { k: "atrasada", rot: "Atrasadas", ico: "fa-triangle-exclamation", cor: "#dc2626", dica: "A revisão já passou pelo horímetro estimado (até 6 meses)" },
  { k: "vence_30", rot: "Este mês", ico: "fa-calendar-day", cor: "#d97706", dica: "Vence nos próximos 30 dias" },
  { k: "parou", rot: "Parou de fazer na loja", ico: "fa-user-slash", cor: "#7c3aed", dica: "Pulou uma revisão inteira ou está atrasada há mais de 6 meses: oportunidade" },
  { k: "proxima", rot: "Próximas", ico: "fa-calendar", cor: "#2563eb", dica: "Vence depois de 30 dias (e sem data de entrega)" },
  { k: "agendadas", rot: "Agendadas e fechadas", ico: "fa-circle-check", cor: "#16a34a", dica: "Revisão agendada, não quer ou arquivado" },
];
const colDe = (it: ItemRevisao): ColR => it.acao === "concluido" ? "agendadas" : it.trator.previsao.situacao === "sem_entrega" ? "proxima" : it.trator.previsao.situacao;
const LIMITE = 40;

export function RevQuadro({ fila }: { fila: FilaRevisoes }) {
  const [selId, setSelId] = useState<string | null>(null);
  const [mais, setMais] = useState<Partial<Record<ColR, boolean>>>({});
  const cols = useMemo(() => {
    const m: Record<ColR, ItemRevisao[]> = { atrasada: [], vence_30: [], parou: [], proxima: [], agendadas: [] };
    for (const it of fila.base) m[colDe(it)].push(it);
    m.proxima.sort((a, b) => (a.trator.previsao.dias ?? 9e9) - (b.trator.previsao.dias ?? 9e9));
    return m;
  }, [fila.base]);
  const sel = selId != null ? fila.base.find((it) => it.trator.id === selId) ?? null : null;
  useEffect(() => {
    if (selId == null) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setSelId(null); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [selId]);
  return (
    <>
      <div className="fbf-quadro fbr-quadro">
        {COLS.map((c) => {
          const lista = cols[c.k];
          const vis = mais[c.k] ? lista : lista.slice(0, LIMITE);
          return (
            <section key={c.k} className="fbf-col" style={{ ["--k" as string]: c.cor }}>
              <div className="fbf-col-cab" title={c.dica}><span className="fbn-ico p"><i className={`fa-solid ${c.ico}`} /></span>{c.rot}<span className="n">{lista.length}</span></div>
              {vis.length === 0 && <div className="fbf-mais">Nenhum trator aqui.</div>}
              {vis.map((it) => {
                const p = it.trator.previsao;
                return (
                  <button key={it.trator.id} type="button" className={`fbf-cartao ${selId === it.trator.id ? "sel" : ""}`} onClick={() => setSelId(it.trator.id)}>
                    <span className="nm">{it.trator.cliente}</span>
                    <span className="lin"><i className="fa-solid fa-tractor" /> {subTrator(it)}</span>
                    <span className="lin">Revisão {p.revisaoOferta.toLocaleString("pt-BR")} h · {rotuloPrazo(p)} · {fmtMedia(p.mediaHDia)}{p.mediaPadrao ? " (padrão)" : ""}</span>
                    <span><span className="fbn-pilula" style={{ ["--k" as string]: COR_ACAO[it.acao] }}><i className={`fa-solid ${ICO_ACAO[it.acao]}`} /> {it.oQueFazer}</span></span>
                  </button>
                );
              })}
              {lista.length > LIMITE && (
                <button type="button" className="fbn-acao cinza" style={{ justifyContent: "center" }} onClick={() => setMais((m) => ({ ...m, [c.k]: !m[c.k] }))}>
                  {mais[c.k] ? "Mostrar menos" : `Mostrar mais ${lista.length - LIMITE}`}
                </button>
              )}
            </section>
          );
        })}
      </div>
      {sel && (
        <>
          <div className="fbf-gaveta-fundo" onClick={() => setSelId(null)} />
          <aside className="fbf-gaveta" role="dialog" aria-label={`Revisão do trator de ${sel.trator.cliente}`}>
            <div className="fbf-gaveta-cab">
              <span className="fbf-falta"><i className="fa-solid fa-tractor" style={{ color: "var(--c)" }} /> Revisão</span>
              <button type="button" className="fbn-acao cinza" onClick={() => setSelId(null)} aria-label="Fechar"><i className="fa-solid fa-xmark" /> Fechar</button>
            </div>
            <div className="fbn-card"><Atender it={sel} fila={fila} /></div>
          </aside>
        </>
      )}
    </>
  );
}

// ─── opção 3 ─────────────────────────────────────────────────────────────────
type Col = "pos" | "cliente" | "trator" | "revisao" | "hoje" | "media" | "prevista" | "conf" | "oque";
const PESO_CONF = { alta: 3, media: 2, baixa: 1, sem_leitura: 0 };

export function RevLista({ fila }: { fila: FilaRevisoes }) {
  const [ordem, setOrdem] = useState<{ col: Col; dir: 1 | -1 }>({ col: "pos", dir: 1 });
  const [selId, setSelId] = useState<string | null>(null);
  const pos = useMemo(() => new Map(fila.itens.map((it, i) => [it.trator.id, i])), [fila.itens]);
  const linhas = useMemo(() => {
    const chave = (it: ItemRevisao): string | number => {
      const t = it.trator, p = t.previsao;
      switch (ordem.col) {
        case "cliente": return t.cliente.toLowerCase();
        case "trator": return t.modelo.toLowerCase();
        case "revisao": return p.revisaoOferta;
        case "hoje": return p.horimetroHoje;
        case "media": return p.mediaHDia;
        case "prevista": return p.dias ?? 9e9;
        case "conf": return PESO_CONF[p.confianca];
        case "oque": return it.oQueFazer.toLowerCase();
        default: return pos.get(t.id) ?? 0;
      }
    };
    return [...fila.itens].sort((a, b) => { const x = chave(a), y = chave(b); return (x < y ? -1 : x > y ? 1 : 0) * ordem.dir; });
  }, [fila.itens, pos, ordem]);
  const sel = selId != null ? fila.base.find((it) => it.trator.id === selId) ?? null : null;
  const th = (col: Col, rot: string, num = false) => {
    const on = ordem.col === col;
    return (
      <th className={`${on ? "on" : ""} ${num ? "num" : ""}`} aria-sort={on ? (ordem.dir === 1 ? "ascending" : "descending") : "none"}
        onClick={() => setOrdem((o) => ({ col, dir: o.col === col ? (o.dir === 1 ? -1 : 1) : 1 }))}>
        {rot}<i className={`fa-solid ${on ? (ordem.dir === 1 ? "fa-arrow-up" : "fa-arrow-down") : "fa-sort"}`} />
      </th>
    );
  };
  return (
    <div className="fbf-o3">
      <div className="fbf-tabela-caixa">
        {linhas.length === 0 ? <div className="fbn-vazio" style={{ border: 0 }}>Nenhum trator nesta situação.</div> : (
          <table className="fbf-tabela" style={{ minWidth: 980 }}>
            <thead>
              <tr>{th("pos", "#", true)}{th("cliente", "Cliente")}{th("trator", "Trator")}{th("revisao", "Revisão", true)}{th("hoje", "Horímetro hoje", true)}{th("media", "Média", true)}{th("prevista", "Prevista", true)}{th("conf", "Confiança")}{th("oque", "O que fazer")}</tr>
            </thead>
            <tbody>
              {linhas.map((it) => {
                const t = it.trator, p = t.previsao;
                return (
                  <tr key={t.id} className={selId === t.id ? "sel" : ""} onClick={() => setSelId(t.id)}>
                    <td className="num" style={{ color: "var(--t3)" }}>{(pos.get(t.id) ?? 0) + 1}</td>
                    <td className="cli" style={{ minWidth: 200 }}>{t.cliente}<small>{t.telefone || "sem telefone"}{t.cidade ? ` · ${t.cidade}` : ""}</small></td>
                    <td style={{ whiteSpace: "nowrap" }}>{t.modelo}<small style={{ display: "block", color: "var(--t2)", fontSize: 12 }}>final {t.chassi.slice(-7)}</small></td>
                    <td className="num">{p.revisaoOferta.toLocaleString("pt-BR")} h</td>
                    <td className="num">{fmtH(p.horimetroHoje)}</td>
                    <td className="num">{fmtMedia(p.mediaHDia)}{p.mediaPadrao ? "*" : ""}</td>
                    <td className="num">{fmtDataBR(p.dataPrevista)}<small style={{ display: "block", fontSize: 12, color: COR_SITUACAO[p.situacao] }}>{rotuloPrazo(p)}</small></td>
                    <td style={{ whiteSpace: "nowrap", fontSize: 12.5, color: "var(--t2)" }}>{p.confianca === "sem_leitura" ? "sem leitura" : p.confianca === "alta" ? "boa" : p.confianca === "media" ? "média" : "baixa"} · {p.validos.length} leit.</td>
                    <td><span className="fbn-pilula" style={{ ["--k" as string]: COR_ACAO[it.acao] }}><i className={`fa-solid ${ICO_ACAO[it.acao]}`} /> {it.oQueFazer}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <aside className={`fbf-lado ${sel ? "" : "vazio"}`}>
        {sel ? (
          <div style={{ display: "grid", gap: 12 }}>
            <div className="fbf-fechar-lado"><button type="button" className="fbn-acao cinza" onClick={() => setSelId(null)}><i className="fa-solid fa-chevron-down" /> Fechar</button></div>
            <div className="fbn-card"><Atender it={sel} fila={fila} /></div>
          </div>
        ) : <div className="fbf-lado-vazio"><i className="fa-regular fa-hand-pointer" /> Clique num trator da lista para ver a previsão e atender. * = média padrão (sem leitura).</div>}
      </aside>
    </div>
  );
}
