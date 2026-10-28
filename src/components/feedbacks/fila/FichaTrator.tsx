"use client";
// Ficha do TRATOR na aba "Revisões" do RFM (página de teste do CRM): quem é o dono, como falar, a
// previsão da próxima revisão (média h/dia, horímetro hoje, data, confiança), a régua das horas até
// a revisão, a linha do tempo das leituras (e as que saíram da conta, com o motivo) e o último
// serviço do cliente.
import { useMemo } from "react";
import type { ItemFila } from "@/lib/feedbacks/fila";
import {
  fmtDataBR, fmtH, revisaoSeguinte, ROTULO_CONFIANCA, ROTULO_FONTE, ROTULO_SITUACAO,
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

/** Régua das horas: as revisões da sequência como paradas e até onde o trator já chegou. */
// José, 28/10/2026: "troca esse gráfico" — a linha de horas pelo tempo não dizia nada para quem liga.
// A régua mostra direto: qual revisão é, se já passou ou quanto falta, e as horas lidas × estimadas.
export function Grafico({ p }: { p: Previsao }) {
  const r = useMemo(() => {
    const hoje = Math.max(0, Math.round(p.horimetroHoje));
    const ini = p.revisaoOferta > 1200 ? p.revisaoOferta - 1200 : 0;
    const ate = Math.max(revisaoSeguinte(p.revisaoOferta), revisaoSeguinte(hoje));
    const paradas: number[] = [];
    for (let h = revisaoSeguinte(ini); h <= ate; h = revisaoSeguinte(h)) paradas.push(h);
    const pct = (h: number) => Math.max(0, Math.min(100, ((h - ini) / (ate - ini || 1)) * 100));
    return { hoje, ini, paradas, pct };
  }, [p]);
  const lida = p.ultimaLeitura?.horas ?? 0;
  const atrasada = p.dias != null && p.dias < 0;
  const falta = Math.max(0, p.revisaoOferta - r.hoje);
  const estado = (h: number) =>
    h === p.revisaoOferta ? (atrasada ? "alvo atrasada" : "alvo")
      : p.ultimaRevisaoFeita != null && h <= p.ultimaRevisaoFeita ? (h === p.ultimaRevisaoFeita ? "feita" : "antes")
      : h < p.revisaoOferta ? "pulou" : "depois";
  const legenda = (h: number) =>
    h === p.revisaoOferta ? (atrasada ? "atrasada" : "a próxima")
      : h === p.ultimaRevisaoFeita ? "última feita"
      : h < p.revisaoOferta && (p.ultimaRevisaoFeita == null || h > p.ultimaRevisaoFeita) ? "não feita" : "";
  const esq = (h: number) => `${Math.max(6, Math.min(94, r.pct(h)))}%`;
  return (
    <figure className={`fbr-regua ${atrasada ? "atrasada" : ""}`} aria-label={`Revisão de ${p.revisaoOferta} h: horímetro hoje cerca de ${r.hoje} h`}>
      <div className="fbr-rg-frase">
        <i className={`fa-solid ${atrasada ? "fa-triangle-exclamation" : "fa-gauge-high"}`} />
        <div>
          {!p.dataPrevista ? <b>Sem data de entrega: não dá para prever a revisão de {p.revisaoOferta.toLocaleString("pt-BR")} h</b>
            : atrasada ? <b>Passou da revisão de {p.revisaoOferta.toLocaleString("pt-BR")} h há {Math.abs(p.dias ?? 0)} dias</b>
            : <b>Faltam ≈ {fmtH(falta)} para a revisão de {p.revisaoOferta.toLocaleString("pt-BR")} h</b>}
          <span>
            {p.dataPrevista && (atrasada ? `chegou nas horas em ${fmtDataBR(p.dataPrevista)}` : `por volta de ${fmtDataBR(p.dataPrevista)}${p.dias != null ? ` (${p.dias} dias)` : ""}`)}
            {p.dataPrevista ? " · " : ""}usa em média {fmtMedia(p.mediaHDia)}
          </span>
        </div>
      </div>
      <div className="fbr-rg-pista">
        <div className="fbr-rg-hoje" style={{ left: esq(r.hoje) }}><small>hoje</small><b>≈ {fmtH(r.hoje)}</b></div>
        <div className="fbr-rg-barra">
          <span className="est" style={{ width: `${r.pct(r.hoje)}%` }} />
          <span className="lido" style={{ width: `${r.pct(lida)}%` }} />
          {p.ultimaLeitura && <span className="tick" style={{ left: `${r.pct(lida)}%` }} title={`Última leitura: ${fmtH(lida)} em ${fmtDataBR(p.ultimaLeitura.data)} · ${p.ultimaLeitura.rotulo}`} />}
          {r.paradas.map((h) => <span key={h} className={`pino ${estado(h)}`} style={{ left: `${r.pct(h)}%` }} />)}
        </div>
        <div className="fbr-rg-paradas">
          {r.ini > 0 && <span className="ini" style={{ left: 0 }}>{fmtH(r.ini)}</span>}
          {r.paradas.map((h) => (
            <span key={h} className={estado(h)} style={{ left: `${r.pct(h)}%` }}>
              <b>{h.toLocaleString("pt-BR")} h</b>{legenda(h) && <small>{legenda(h)}</small>}
            </span>
          ))}
        </div>
      </div>
      <figcaption>
        <span><i className="lido" /> lido no horímetro{p.ultimaLeitura ? `: ${fmtH(lida)} em ${fmtDataBR(p.ultimaLeitura.data)}` : ": nenhuma leitura"}</span>
        <span><i className="est" /> estimado pela média até hoje</span>
      </figcaption>
    </figure>
  );
}
