"use client";
// Painel → Desempenho (23/10/2026): o que valia a pena da antiga tela de Relatórios, no visual novo.
// Período por botões, fonte (Tudo · Pós-serviço · Reativação), números do período, ranking dos
// atendentes (clique abre os atendimentos da pessoa), satisfação por técnico, atendimentos que viraram
// serviço, dia a dia e exportação CSV (registros e atendentes). Lê como a tela antiga: registros
// CRM/RFM + ligações do cockpit pelo navegador (listarRegistros / listarChamadasResumo).
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { listarChamadasResumo, listarRegistros } from "@/lib/feedbacks/api";
import {
  agregarPerformance, CSV_PERFORMANCE_CABECALHO, linhaCSVPerformance, normalizarAtendente, periodoDoPreset, porDia, PRESETS_PERIODO, totalPerformance, dentroDoPeriodo, diaDoRegistro,
  type ChamadaResumo, type PresetPeriodo,
} from "@/lib/feedbacks/atendimento/performance";
import { formatarDuracao } from "@/lib/feedbacks/atendimento/tempo";
import { baixarCsvAtendentes, baixarCsvRegistros } from "@/lib/feedbacks/relatorio-csv";
import type { FeedbackRegistro, TipoFeedback } from "@/lib/feedbacks/types";
import { Contador } from "./kit";
import { Pct } from "./Casca";

type Fonte = "todos" | TipoFeedback;
const FONTES: { v: Fonte; rot: string; ico: string }[] = [
  { v: "todos", rot: "Tudo", ico: "fa-layer-group" },
  { v: "crm", rot: "Pós-serviço", ico: "fa-screwdriver-wrench" },
  { v: "rfm", rot: "Reativação", ico: "fa-user-clock" },
];
const fmtDia = (d: string) => d.split("-").reverse().join("/");
const media = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

export default function PainelDesempenho() {
  const [registros, setRegistros] = useState<FeedbackRegistro[]>([]);
  const [chamadas, setChamadas] = useState<ChamadaResumo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [erroLig, setErroLig] = useState<string | null>(null);
  const [preset, setPreset] = useState<PresetPeriodo>("30d");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [fonte, setFonte] = useState<Fonte>("todos");
  const [aberto, setAberto] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true); setErro(null); setErroLig(null);
    try {
      const [crm, rfm, lig] = await Promise.all([
        listarRegistros("crm"), listarRegistros("rfm"),
        listarChamadasResumo().catch((e) => { setErroLig(e instanceof Error ? e.message : String(e)); return [] as ChamadaResumo[]; }),
      ]);
      setRegistros([...crm, ...rfm]); setChamadas(lig);
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)); } finally { setCarregando(false); }
  }, []);
  useEffect(() => {
    let vivo = true;
    Promise.resolve().then(() => { if (vivo) void carregar(); });
    return () => { vivo = false; };
  }, [carregar]);

  const periodo = useMemo(() => periodoDoPreset(preset, new Date(), { de: de || null, ate: ate || null }), [preset, de, ate]);
  const rotuloPeriodo = !periodo.de && !periodo.ate ? "todo o histórico" : periodo.de === periodo.ate ? fmtDia(periodo.de || "") : `${fmtDia(periodo.de || "…")} a ${fmtDia(periodo.ate || "…")}`;
  const doPeriodo = useMemo(() => registros.filter((r) => (fonte === "todos" || r.tipo === fonte) && dentroDoPeriodo(diaDoRegistro(r), periodo)), [registros, fonte, periodo]);
  const perf = useMemo(() => agregarPerformance(registros, chamadas, periodo, fonte), [registros, chamadas, periodo, fonte]);
  const total = useMemo(() => totalPerformance(perf), [perf]);
  const dias = useMemo(() => porDia(registros, chamadas, periodo, fonte).slice(0, 31), [registros, chamadas, periodo, fonte]);
  const notas = doPeriodo.map((r) => r.nota).filter((n): n is number => n != null);
  const comStatus = doPeriodo.filter((r) => r.status_cliente);
  const pctSat = comStatus.length ? Math.round((comStatus.filter((r) => r.status_cliente === "Satisfeito").length / comStatus.length) * 100) : null;
  const viraramServico = useMemo(() => doPeriodo.filter((r) => (r.revisao_confirmada || "").trim()), [doPeriodo]);

  const tecnicos = useMemo(() => {
    const m = new Map<string, { t: string; total: number; sat: number; ins: number; notas: number[] }>();
    for (const r of doPeriodo) {
      if (!r.tecnico) continue;
      const x = m.get(r.tecnico) || { t: r.tecnico, total: 0, sat: 0, ins: 0, notas: [] };
      x.total++; if (r.status_cliente === "Satisfeito") x.sat++; if (r.status_cliente === "Insatisfeito") x.ins++; if (r.nota != null) x.notas.push(r.nota);
      m.set(r.tecnico, x);
    }
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [doPeriodo]);
  const maxDia = Math.max(1, ...dias.map((d) => d.atendimentos + d.ligacoes));

  const tiles = [
    { rot: "atendimentos", v: total.atendimentos.total, ico: "fa-list-check", cor: "#dc2626" },
    { rot: `concluídos · ${total.atendimentos.pctConclusao}%`, v: total.atendimentos.concluidos, ico: "fa-circle-check", cor: "#16a34a" },
    { rot: "ligações no cockpit", v: total.ligacoes.total, ico: "fa-headset", cor: "#d97706" },
    { rot: `conversões${total.ligacoes.taxaConversao != null ? ` · ${total.ligacoes.taxaConversao}%` : ""}`, v: total.ligacoes.conversoes, ico: "fa-chart-line", cor: "#0f766e" },
    { rot: "viraram serviço", v: viraramServico.length, ico: "fa-wrench", cor: "#0369a1" },
  ];

  const listaAtendente = aberto ? registros
    .filter((r) => normalizarAtendente(r.atendente_nome) === aberto && (fonte === "todos" || r.tipo === fonte) && dentroDoPeriodo(diaDoRegistro(r), periodo))
    .sort((a, b) => diaDoRegistro(b).localeCompare(diaDoRegistro(a))) : [];

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="fbh-linha-topo">
        <div className="fbr-seg" aria-label="Período">
          {PRESETS_PERIODO.map((p) => <button key={p.valor} type="button" className={preset === p.valor ? "on" : ""} onClick={() => setPreset(p.valor)}>{p.rotulo}</button>)}
        </div>
        {preset === "custom" && (
          <>
            <input type="date" className="fbn-campo" style={{ width: "auto" }} value={de} onChange={(e) => setDe(e.target.value)} aria-label="De" />
            <input type="date" className="fbn-campo" style={{ width: "auto" }} value={ate} onChange={(e) => setAte(e.target.value)} aria-label="Até" />
          </>
        )}
        <div className="fbr-seg" aria-label="Fonte">
          {FONTES.map((f) => <button key={f.v} type="button" className={fonte === f.v ? "on" : ""} onClick={() => setFonte(f.v)}><i className={`fa-solid ${f.ico}`} /> {f.rot}</button>)}
        </div>
        <span style={{ flex: 1 }} />
        <button type="button" className="fbn-btn" onClick={() => baixarCsvRegistros(doPeriodo, `atendimentos-${new Date().toISOString().slice(0, 10)}.csv`)} disabled={carregando}><i className="fa-solid fa-file-csv" /> CSV dos atendimentos ({doPeriodo.length})</button>
        <button type="button" className="fbn-btn" onClick={() => baixarCsvAtendentes([...perf, total], rotuloPeriodo, CSV_PERFORMANCE_CABECALHO, linhaCSVPerformance)} disabled={carregando}><i className="fa-solid fa-file-csv" /> CSV dos atendentes ({perf.length})</button>
        <button type="button" className="fbn-btn" onClick={() => void carregar()} title="Ler de novo do banco"><i className="fa-solid fa-rotate" /> Atualizar</button>
      </div>

      <details className="fbf-como">
        <summary><i className="fa-regular fa-circle-question" style={{ color: "var(--c)" }} /> Como ler esta tela</summary>
        <ul>
          <li>Os botões de cima escolhem o <b>período</b> e a <b>fonte</b>: <b>Pós-serviço</b> é o antigo CRM (pesquisa depois da OS), <b>Reativação</b> é o antigo RFM (cliente que sumiu, revisão, peças).</li>
          <li><b>Atendimentos</b> = registros que passaram pela mão de alguém no período (conta a data de conclusão, senão a de abertura). <b>Concluídos</b> = fechados, com a porcentagem.</li>
          <li><b>Ligações</b> = chamadas encerradas no cockpit. <b>Atenderam</b> = ligações em que alguém atendeu (tira “não atendeu” e “número errado”). <b>Conversões</b> = serviço agendado + venda, sobre as que atenderam.</li>
          <li><b>Viraram serviço</b> = atendimento com o “serviço confirmado” preenchido. <b>Nota média</b> e <b>% satisfeitos</b> vêm do pós-serviço.</li>
          <li>Clique numa pessoa da tabela para ver os atendimentos dela; clique num atendimento para abrir em Clientes. Os botões CSV baixam o que está na tela (abre no Excel).</li>
          <li>Verde a partir de 80%, âmbar de 50% a 79%, vermelho abaixo de 50%.</li>
        </ul>
      </details>

      {erro && <div className="fbn-erro">Erro: {erro}</div>}
      {erroLig && <div className="fbf-aviso"><i className="fa-solid fa-triangle-exclamation" /><span>Ligações do cockpit indisponíveis ({erroLig}). Os números de atendimentos continuam valendo.</span></div>}

      <div className="fbh-conts">
        {tiles.map((t, i) => (
          <div key={t.rot} className="fbh-cont" style={{ ["--k" as string]: t.cor, animationDelay: `${i * 60}ms`, cursor: "default" }}>
            <span className="fbn-ico"><i className={`fa-solid ${t.ico}`} /></span>
            <span><b>{carregando ? "…" : <Contador valor={t.v} />}</b><small>{t.rot}</small></span>
          </div>
        ))}
        <div className="fbh-cont" style={{ ["--k" as string]: "#ca8a04", cursor: "default" }}>
          <span className="fbn-ico"><i className="fa-solid fa-star" /></span>
          <span><b>{carregando ? "…" : media(notas) ?? "—"}</b><small>nota média{pctSat != null ? ` · ${pctSat}% satisfeitos` : ""}</small></span>
        </div>
      </div>

      <section className="fbh-cartao" style={{ ["--k" as string]: "#dc2626" }}>
        <h3><span className="fbn-ico"><i className="fa-solid fa-ranking-star" /></span> Atendentes <small>{rotuloPeriodo} · clique na pessoa para ver os atendimentos</small></h3>
        {carregando ? <div style={{ fontSize: 13.5, color: "var(--t2)" }}>Carregando…</div> : perf.length === 0 ? <div style={{ fontSize: 13.5, color: "var(--t2)" }}>Nenhum atendimento nem ligação no período.</div> : (
          <div className="fbr-rola">
            <table className="fbr-tab">
              <thead><tr><th>#</th><th>Atendente</th><th className="n">Atendimentos</th><th className="n">Concluídos</th><th className="n">Viraram serviço</th><th className="n">Ligações</th><th className="n">Tempo</th><th className="n">Atenderam</th><th className="n">Conversões</th><th className="n">Humor</th></tr></thead>
              <tbody>
                {[...perf, total].map((s, i) => {
                  const ehTotal = i === perf.length; const a = s.atendimentos, l = s.ligacoes;
                  return (
                    <tr key={s.atendente + i} className={ehTotal ? "" : "clica"} onClick={ehTotal ? undefined : () => setAberto(s.atendente)} style={ehTotal ? { background: "var(--soft)" } : undefined}>
                      <td>{ehTotal ? "" : i === 0 ? <i className="fa-solid fa-medal" style={{ color: "#ca8a04" }} title="Quem mais deu resultado" /> : i + 1}</td>
                      <td>{ehTotal ? "Equipe" : s.atendente}{!ehTotal && l.abertas > 0 && <span className="fbn-pilula" style={{ ["--k" as string]: "#d97706", marginLeft: 6 }}><i className="fa-solid fa-headset" /> agora</span>}</td>
                      <td className="n">{a.total}</td>
                      <td className="n">{a.concluidos} <Pct v={a.pctConclusao} /></td>
                      <td className="n">{a.gerouServico}</td>
                      <td className="n">{l.total}</td>
                      <td className="n">{l.total ? formatarDuracao(l.tempoTotalSeg) : "—"}</td>
                      <td className="n">{l.taxaContato != null ? <>{l.contatoEfetivo} <Pct v={l.taxaContato} /></> : "—"}</td>
                      <td className="n">{l.conversoes}{l.taxaConversao != null ? ` · ${l.taxaConversao}%` : ""}</td>
                      <td className="n">{l.humorMedio ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="fbh-pg">
        <section className="fbh-cartao">
          <h3><span className="fbn-ico" style={{ ["--c" as string]: "#7c3aed" }}><i className="fa-solid fa-user-gear" /></span> Satisfação por técnico <small>pós-serviço do período</small></h3>
          {tecnicos.length === 0 ? <div style={{ fontSize: 13.5, color: "var(--t2)" }}>Sem dados no período.</div> : (
            <div className="fbr-rola">
              <table className="fbr-tab">
                <thead><tr><th>Técnico</th><th className="n">Atendimentos</th><th className="n">Satisfeitos</th><th className="n">Insatisfeitos</th><th className="n">Nota média</th></tr></thead>
                <tbody>{tecnicos.map((t) => (
                  <tr key={t.t}><td>{t.t}</td><td className="n">{t.total}</td><td className="n">{t.sat} <Pct v={t.total ? Math.round((t.sat / t.total) * 100) : null} /></td><td className="n">{t.ins}</td><td className="n">{media(t.notas) ?? "—"}</td></tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </section>

        <section className="fbh-cartao">
          <h3><span className="fbn-ico" style={{ ["--c" as string]: "#0369a1" }}><i className="fa-solid fa-wrench" /></span> Viraram serviço <small>{viraramServico.length} · campo “serviço confirmado”</small></h3>
          {viraramServico.length === 0 ? <div style={{ fontSize: 13.5, color: "var(--t2)" }}>Nenhum atendimento do período virou serviço agendado.</div>
            : viraramServico.slice(0, 15).map((r) => (
              <Link key={r.id} href={`/feedbacks/clientes?registro=${r.id}`} className="fbh-item" style={{ color: "inherit", textDecoration: "none" }}>
                <span>{r.nome}<div className="d">{r.revisao_confirmada}{r.atendente_nome ? ` · ${r.atendente_nome.trim()}` : ""}</div></span>
                <span className="v">{fmtDia(diaDoRegistro(r))}</span>
              </Link>
            ))}
          {viraramServico.length > 15 && <div style={{ fontSize: 12.5, color: "var(--t2)" }}>e mais {viraramServico.length - 15} (estão no CSV de atendimentos).</div>}
        </section>

        <section className="fbh-cartao">
          <h3><span className="fbn-ico" style={{ ["--c" as string]: "#d97706" }}><i className="fa-solid fa-calendar-days" /></span> Dia a dia <small>atendimentos · ligações</small></h3>
          {dias.length === 0 ? <div style={{ fontSize: 13.5, color: "var(--t2)" }}>Nada no período.</div> : (
            <div className="fbh-barras">
              {dias.map((d, n) => (
                <div key={d.dia} className="fbh-barra" style={{ ["--k" as string]: "#dc2626", cursor: "default" }} title={Object.entries(d.porAtendente).map(([p, c]) => `${p}: ${c.atendimentos} atend. · ${c.ligacoes} lig.`).join("\n")}>
                  <span className="r">{fmtDia(d.dia).slice(0, 5)}</span>
                  <span className="trilho" style={{ display: "flex" }}>
                    <span className="enche" style={{ width: `${(d.atendimentos / maxDia) * 100}%`, animationDelay: `${n * 30}ms`, borderRadius: 0 }} />
                    <span className="enche" style={{ width: `${(d.ligacoes / maxDia) * 100}%`, background: "#d97706", animationDelay: `${n * 30}ms`, borderRadius: 0 }} />
                  </span>
                  <span className="v">{d.atendimentos} · {d.ligacoes}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {aberto && (
        <>
          <div className="fbf-gaveta-fundo" onClick={() => setAberto(null)} />
          <div className="fbf-gaveta" role="dialog" aria-label={aberto} style={{ width: "min(560px, 100vw)" }}>
            <div className="fbf-gaveta-cab"><span className="fbf-sub" style={{ margin: 0 }}>{aberto} · {listaAtendente.length} atendimento(s) · {rotuloPeriodo}</span><button type="button" className="fbn-acao cinza" onClick={() => setAberto(null)} aria-label="Fechar"><i className="fa-solid fa-xmark" /></button></div>
            <div style={{ display: "grid", gap: 2 }}>
              {listaAtendente.length === 0 ? <div className="fbn-vazio">Só ligações no período, sem atendimento registrado.</div> : listaAtendente.map((r) => (
                <Link key={r.id} href={`/feedbacks/clientes?registro=${r.id}`} className="fbh-item" style={{ color: "inherit", textDecoration: "none" }}>
                  <span>{r.nome}<div className="d">{r.tipo === "crm" ? "Pós-serviço" : "Reativação"} · {(r.tipo === "crm" ? r.servico || r.feedback : r.motivo || r.acao) || "—"}</div></span>
                  <span className="v">{fmtDia(diaDoRegistro(r))}<div className="d">{(r.status_atendimento || "").replace(/_/g, " ")}</div></span>
                </Link>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
