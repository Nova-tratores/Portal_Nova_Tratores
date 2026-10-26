"use client";
// Ficha do TRATOR na aba "Revisões" do RFM (página de teste do CRM): quem é o dono, como falar, a
// previsão da próxima revisão (média h/dia, horímetro hoje, data, confiança), o gráfico das horas
// pelo tempo, a linha do tempo das leituras (e as que saíram da conta, com o motivo) e o último
// serviço do cliente.
import { useMemo } from "react";
import type { ItemFila } from "@/lib/feedbacks/fila";
import {
  fmtDataBR, fmtH, ROTULO_CONFIANCA, ROTULO_FONTE, ROTULO_SITUACAO,
  type ItemRevisao, type Previsao, type Situacao,
} from "@/lib/feedbacks/previsao-revisao";
import { COR_ACAO, ICO_ACAO, fmtDataHora, fmtTel } from "./FichaCliente";
import UltimoServico from "./UltimoServico";
import { casoExemplo } from "./exemplos";

export const COR_SITUACAO: Record<Situacao, string> = { atrasada: "#dc2626", vence_30: "#d97706", proxima: "#2563eb", parou: "#7c3aed", sem_entrega: "#64748b" };
export const ICO_SITUACAO: Record<Situacao, string> = { atrasada: "fa-triangle-exclamation", vence_30: "fa-calendar-day", proxima: "fa-calendar", parou: "fa-user-slash", sem_entrega: "fa-circle-question" };

/** "vence em 12 dias" / "atrasada há 30 dias" / "vence hoje". */
export function rotuloPrazo(p: Previsao): string {
  if (p.dias == null) return "sem data";
  if (p.dias === 0) return "vence hoje";
  if (p.dias < 0) return -p.dias >= 60 ? `atrasada há ${Math.round(-p.dias / 30)} meses` : `atrasada há ${-p.dias} dia${p.dias === -1 ? "" : "s"}`;
  return p.dias >= 60 ? `vence em ${Math.round(p.dias / 30)} meses` : `vence em ${p.dias} dia${p.dias === 1 ? "" : "s"}`;
}
export const fmtMedia = (m: number) => `${m.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} h/dia`;

export function PilulaSituacao({ p }: { p: Previsao }) {
  return <span className="fbn-pilula" style={{ ["--k" as string]: COR_SITUACAO[p.situacao] }}><i className={`fa-solid ${ICO_SITUACAO[p.situacao]}`} /> {ROTULO_SITUACAO[p.situacao]}</span>;
}

export default function FichaTrator({ it, fi, grande = false, onHistorico }: { it: ItemRevisao; fi: ItemFila; grande?: boolean; onHistorico?: () => void }) {
  const t = it.trator, p = t.previsao;
  const tent = [...it.contato.tentativas].sort((a, b) => b.data.localeCompare(a.data));
  const caso = Number(t.id) < 0 ? casoExemplo(t.id) : null;
  return (
    <div className={`fbf-ficha ${grande ? "grande" : ""}`}>
      <div className="fbn-cab">
        <span className="fbn-ico"><i className="fa-solid fa-tractor" /></span>
        <div style={{ minWidth: 0, flex: 1, display: "grid", gap: 8 }}>
          <h2 className="fbf-nome">{t.cliente}</h2>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {t.telefone ? (
              <a className="fbf-tel" href={`tel:${t.telefone.replace(/\D/g, "")}`} title="Ligar"><i className="fa-solid fa-phone" /> {fmtTel(t.telefone)}</a>
            ) : <span className="fbf-sem-tel"><i className="fa-solid fa-phone-slash" /> sem telefone (o nome não casou com o cadastro)</span>}
          </div>
          <div className="fbn-selos">
            <PilulaSituacao p={p} />
            <span className="fbn-pilula" style={{ ["--k" as string]: p.mediaPadrao ? "#64748b" : "#0f766e" }}><i className="fa-solid fa-gauge" /> {ROTULO_CONFIANCA[p.confianca]}</span>
            {caso && <span className="fbn-pilula" style={{ ["--k" as string]: "#7c3aed" }}><i className="fa-solid fa-flask" /> Exemplo: {caso}</span>}
          </div>
        </div>
      </div>

      <div className="fbf-faca" style={{ ["--k" as string]: COR_ACAO[it.acao] }}>
        <span className="fbn-ico p"><i className={`fa-solid ${ICO_ACAO[it.acao]}`} /></span>
        <div>
          <div className="t">{it.oQueFazer}</div>
          {it.porque && <div className="p">Por que agora: {it.porque}</div>}
        </div>
      </div>

      <div className="fbn-dados">
        <div><small>Trator</small><span>Mahindra {t.modelo || "—"}</span></div>
        <div><small>Chassi</small><span style={{ overflowWrap: "anywhere" }}>{t.chassi || "—"}</span></div>
        <div><small>Entrega</small><span>{fmtDataBR(p.entregaAnotada)}{p.entregaAjustada ? ` · conta a partir de ${fmtDataBR(p.entrega)}` : ""}</span></div>
        <div><small>Vendedor</small><span>{t.vendedor || "—"}</span></div>
        <div><small>Cidade</small><span>{t.cidade || "—"}</span></div>
        <div><small>Última revisão feita</small><span>{p.ultimaRevisaoFeita != null ? `${p.ultimaRevisaoFeita} h` : "nenhuma na loja"}</span></div>
      </div>

      <div className="fbr-prev">
        <div><small>Média de uso</small><b>{fmtMedia(p.mediaHDia)}</b><span>{p.mediaPadrao ? "padrão, sem leitura" : p.ritmoRecente != null ? `ritmo recente ${fmtMedia(p.ritmoRecente)}` : ""}</span></div>
        <div><small>Horímetro hoje</small><b>{fmtH(p.horimetroHoje)}</b><span>estimado</span></div>
        <div><small>Próxima revisão</small><b>{p.revisaoOferta.toLocaleString("pt-BR")} h</b><span>{p.revisaoOferta !== p.proximaDevida ? `devida era a de ${p.proximaDevida} h` : "a seguinte na sequência"}</span></div>
        <div><small>Data prevista</small><b>{fmtDataBR(p.dataPrevista)}</b><span style={{ color: COR_SITUACAO[p.situacao] }}>{rotuloPrazo(p)}</span></div>
      </div>
      {!it.porque.includes(p.explicacao) && <p className="fbr-expl">{p.explicacao}.</p>}

      <Grafico p={p} />

      <div>
        <p className="fbf-sub">Leituras do horímetro ({p.validos.length}{p.descartados.length ? ` · ${p.descartados.length} fora da conta` : ""})</p>
        {p.validos.length === 0 && p.descartados.length === 0 ? <div className="fbf-us-vazio">Nenhuma leitura: a previsão usa a média padrão desde a entrega.</div> : (
          <div className="fbr-linha">
            <div className="ok"><i className="fa-solid fa-truck-ramp-box" /><span className="d">{fmtDataBR(p.entrega)}</span><span className="h">0 h</span><span className="f">Entrega{p.entregaAjustada ? " (corrigida: a 1ª leitura é de antes da data anotada)" : ""}</span></div>
            {p.validos.map((x, i) => (
              <div key={`v${i}`} className="ok"><i className={`fa-solid ${x.aprox ? "fa-circle-half-stroke" : "fa-circle"}`} /><span className="d">{fmtDataBR(x.data)}</span><span className="h">{fmtH(x.horas)}</span><span className="f">{x.rotulo} · {ROTULO_FONTE[x.fonte].toLowerCase()}</span></div>
            ))}
            {p.descartados.filter((x) => !x.motivo.startsWith("repetida")).map((x, i) => (
              <div key={`d${i}`} className="fora"><i className="fa-solid fa-xmark" /><span className="d">{fmtDataBR(x.data)}</span><span className="h">{fmtH(x.horas)}</span><span className="f">{x.rotulo} — fora da conta: {x.motivo}</span></div>
            ))}
          </div>
        )}
      </div>

      {tent.length > 0 && (
        <div>
          <p className="fbf-sub">Tentativas ({tent.length})</p>
          <div className="fbf-tent">
            {tent.slice(0, 4).map((x, i) => <div key={i}><i className={`fa-solid ${x.canal === "wpp" ? "fa-comment-dots" : "fa-phone-slash"}`} /> {fmtDataHora(x.data)} · {x.canal === "wpp" ? "Mensagem no WhatsApp" : "Ligou, não atendeu"}</div>)}
          </div>
        </div>
      )}
      {it.contato.motivo && <div style={{ fontSize: 13.5, color: "var(--t2)" }}><i className="fa-regular fa-note-sticky" /> {it.contato.motivo}</div>}

      <UltimoServico key={fi.registro.id} r={fi.registro} onHistorico={onHistorico} />
    </div>
  );
}

/** Horas × tempo: entrega (0 h), leituras, reta da média, projeção até a próxima revisão. */
export function Grafico({ p }: { p: Previsao }) {
  const g = useMemo(() => {
    if (!p.entrega) return null;
    const t0 = Date.parse(`${p.entrega}T12:00:00`);
    // "hoje" sai da própria previsão (data prevista − dias), sem relógio no render
    const hoje = p.dataPrevista && p.dias != null ? Date.parse(`${p.dataPrevista}T12:00:00`) - p.dias * 86_400_000 : Date.parse(`${(p.ultimaLeitura?.data ?? p.entrega)}T12:00:00`);
    const fim = Math.max(hoje, p.dataPrevista ? Date.parse(`${p.dataPrevista}T12:00:00`) : hoje);
    const pts = p.validos.map((x) => ({ t: Date.parse(`${x.data}T12:00:00`), h: x.horas, x }));
    const fora = p.descartados.filter((x) => !x.motivo.startsWith("repetida")).map((x) => ({ t: Date.parse(`${x.data}T12:00:00`), h: x.horas, x }));
    const hMax = Math.max(p.revisaoOferta, p.horimetroHoje, ...pts.map((q) => q.h)) * 1.08 || 100;
    const tMin = Math.min(t0, ...fora.map((q) => q.t)), tMax = fim + (fim - tMin) * 0.03;
    const W = 640, H = 220, L = 46, R = 12, T = 12, B = 26;
    const X = (t: number) => L + ((t - tMin) / (tMax - tMin || 1)) * (W - L - R);
    const Y = (h: number) => T + (1 - Math.min(h, hMax) / hMax) * (H - T - B);
    const passo = hMax > 2000 ? 1000 : hMax > 800 ? 300 : hMax > 300 ? 100 : 50;
    const ticksY: number[] = []; for (let h = 0; h <= hMax; h += passo) ticksY.push(h);
    const anos: number[] = []; for (let a = new Date(tMin).getFullYear() + 1; a <= new Date(tMax).getFullYear(); a++) anos.push(Date.parse(`${a}-01-01T00:00:00`));
    const ult = p.ultimaLeitura ? { t: Date.parse(`${p.ultimaLeitura.data}T12:00:00`), h: p.ultimaLeitura.horas } : { t: t0, h: 0 };
    return { W, H, L, R, T, B, X, Y, ticksY, anos, pts, fora, t0, hoje, fim, ult, hMax };
  }, [p]);
  if (!g) return null;
  const { W, H, L, R, B, X, Y } = g;
  const prev = p.dataPrevista ? Date.parse(`${p.dataPrevista}T12:00:00`) : null;
  return (
    <figure className="fbr-graf" aria-label={`Horas do trator pelo tempo: média ${fmtMedia(p.mediaHDia)}, próxima revisão de ${p.revisaoOferta} h em ${fmtDataBR(p.dataPrevista)}`}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img">
        {g.ticksY.map((h) => (
          <g key={h}>
            <line x1={L} x2={W - R} y1={Y(h)} y2={Y(h)} className="grade" />
            <text x={L - 6} y={Y(h) + 4} textAnchor="end" className="eixo">{h.toLocaleString("pt-BR")}</text>
          </g>
        ))}
        {g.anos.map((a) => <text key={a} x={X(a)} y={H - 8} textAnchor="middle" className="eixo">{new Date(a).getFullYear()}</text>)}
        {/* revisão a oferecer */}
        <line x1={L} x2={W - R} y1={Y(p.revisaoOferta)} y2={Y(p.revisaoOferta)} className="alvo" />
        <text x={L + 4} y={Y(p.revisaoOferta) - 5} className="rot">revisão de {p.revisaoOferta.toLocaleString("pt-BR")} h</text>
        {/* hoje */}
        <line x1={X(g.hoje)} x2={X(g.hoje)} y1={g.T} y2={H - B} className="hoje" />
        <text x={X(g.hoje) - 4} y={H - B - 6} textAnchor="end" className="rot">hoje</text>
        {/* leituras ligadas + projeção */}
        <polyline className="linha" points={[[g.t0, 0], ...g.pts.map((q) => [q.t, q.h])].map(([t, h]) => `${X(t)},${Y(h)}`).join(" ")} />
        <line className="proj" x1={X(g.ult.t)} y1={Y(g.ult.h)} x2={X(g.hoje)} y2={Y(p.horimetroHoje)} />
        {prev && <line className="proj" x1={X(g.hoje)} y1={Y(p.horimetroHoje)} x2={X(prev)} y2={Y(p.revisaoOferta)} />}
        <circle cx={X(g.t0)} cy={Y(0)} r={4.5} className="ponto entrega"><title>{`Entrega · ${fmtDataBR(p.entrega)} · 0 h`}</title></circle>
        {g.pts.map((q, i) => (
          <g key={i}>
            <circle cx={X(q.t)} cy={Y(q.h)} r={9} fill="transparent"><title>{`${fmtDataBR(q.x.data)} · ${fmtH(q.h)} · ${q.x.rotulo}`}</title></circle>
            <circle cx={X(q.t)} cy={Y(q.h)} r={4.5} className={`ponto ${q.x.aprox ? "aprox" : ""}`} pointerEvents="none" />
          </g>
        ))}
        {g.fora.map((q, i) => (
          <g key={`f${i}`} className="fora">
            <path d={`M${X(q.t) - 4},${Y(q.h) - 4}l8,8m0,-8l-8,8`} />
            <circle cx={X(q.t)} cy={Y(q.h)} r={9} fill="transparent"><title>{`Fora da conta: ${fmtDataBR(q.x.data)} · ${fmtH(q.h)} · ${q.x.motivo}`}</title></circle>
          </g>
        ))}
        <circle cx={X(g.hoje)} cy={Y(p.horimetroHoje)} r={4.5} className="ponto hojep"><title>{`Hoje (estimado) · ${fmtH(p.horimetroHoje)}`}</title></circle>
        {prev && <circle cx={X(prev)} cy={Y(p.revisaoOferta)} r={5.5} className="ponto prev"><title>{`Previsão · ${fmtDataBR(p.dataPrevista)} · ${p.revisaoOferta} h`}</title></circle>}
      </svg>
      <figcaption>
        <span><i className="dot" /> leitura</span><span><i className="dot aprox" /> aproximada</span><span><i className="x">×</i> fora da conta</span><span><i className="tr" /> projeção pela média</span>
      </figcaption>
    </figure>
  );
}
