"use client";
// Ficha do cliente usada nas 3 opções da página de teste do CRM/RFM: quem é, como falar, o que
// fazer agora e por quê, tentativas e o que ele já disse antes.
import type { Acao, ItemFila } from "@/lib/feedbacks/fila";
import type { FeedbackRegistro, Tentativa } from "@/lib/feedbacks/types";
import UltimoServico from "./UltimoServico";

type ComOS = FeedbackRegistro & { os_valor?: number | null; os_ref?: string | null; faturado_em?: string | null };
export const comOS = (r: FeedbackRegistro) => r as ComOS;

export const COR_ACAO: Record<Acao, string> = { ligar: "#2563eb", whatsapp: "#16a34a", retentar: "#d97706", aguardar: "#64748b", concluido: "#16a34a" };
export const ICO_ACAO: Record<Acao, string> = { ligar: "fa-phone", whatsapp: "fa-comment-dots", retentar: "fa-rotate-right", aguardar: "fa-hourglass-half", concluido: "fa-circle-check" };

export function fmtValor(v: number | null | undefined): string {
  const n = Number(v);
  return n > 0 ? n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
}
export function fmtData(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = iso.slice(0, 10).split("-");
  return d.length === 3 ? `${d[2]}/${d[1]}/${d[0]}` : iso;
}
export function fmtDataHora(iso: string): string {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return iso;
  return t.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
export function fmtTel(tel: string | null | undefined): string {
  const d = String(tel || "").replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return String(tel || "");
}
/** "há 5 dias" (CRM) ou "há 8 meses" (RFM). */
export function rotuloDias(it: ItemFila): string {
  if (it.dias == null) return "sem data";
  if (it.registro.tipo === "rfm" && it.dias >= 60) return `há ${Math.round(it.dias / 30)} meses`;
  if (it.dias === 0) return "hoje";
  return it.dias === 1 ? "há 1 dia" : `há ${it.dias} dias`;
}
export const primeiroTecnico = (t: string | null | undefined) => (t || "").split(/\s*(\/\/|,)\s*/)[0] || "—";

const ICO_CANAL: Record<Tentativa["canal"], string> = { telefone: "fa-phone-slash", wpp: "fa-comment-dots", email: "fa-envelope", outro: "fa-circle-dot" };
const ROT_CANAL: Record<Tentativa["canal"], string> = { telefone: "Ligou, não atendeu", wpp: "Mensagem no WhatsApp", email: "E-mail", outro: "Outro contato" };
const COR_STATUS: Record<string, string> = { Satisfeito: "#16a34a", Neutro: "#d97706", Insatisfeito: "#dc2626", Aguardando: "#64748b" };

export function PilulaAcao({ it }: { it: ItemFila }) {
  return (
    <span className="fbn-pilula" style={{ ["--k" as string]: COR_ACAO[it.acao] }}>
      <i className={`fa-solid ${ICO_ACAO[it.acao]}`} /> {it.oQueFazer}
    </span>
  );
}

export default function FichaCliente({ item, tags = [], grande = false, onHistorico }: { item: ItemFila; tags?: string[]; grande?: boolean; onHistorico?: () => void }) {
  const r = comOS(item.registro);
  const crm = r.tipo === "crm";
  const tent = Array.isArray(r.tentativas) ? [...r.tentativas].sort((a, b) => b.data.localeCompare(a.data)) : [];
  const jaDisse = crm
    ? [r.nota != null ? `nota ${r.nota}` : null, r.nps ? `indicaria: ${r.nps.toLowerCase()}` : null, r.melhoria ? `melhorar: ${r.melhoria.toLowerCase()}` : null].filter(Boolean).join(" · ")
    : [r.motivo ? `motivo: ${r.motivo}` : null, r.acao ? `ação: ${r.acao}` : null].filter(Boolean).join(" · ");
  const tagsVisiveis = tags.filter((t) => !["Cliente", "Fornecedor", "Funcionário"].includes(t)).slice(0, 4);

  return (
    <div className={`fbf-ficha ${grande ? "grande" : ""}`}>
      <div className="fbn-cab">
        <span className="fbn-ico"><i className={`fa-solid ${crm ? "fa-user-check" : "fa-user-clock"}`} /></span>
        <div style={{ minWidth: 0, flex: 1, display: "grid", gap: 8 }}>
          <h2 className="fbf-nome">{r.nome || "Cliente sem nome"}</h2>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {r.telefone ? (
              <a className="fbf-tel" href={`tel:${String(r.telefone).replace(/\D/g, "")}`} title="Ligar">
                <i className="fa-solid fa-phone" /> {fmtTel(r.telefone)}
              </a>
            ) : <span className="fbf-sem-tel"><i className="fa-solid fa-phone-slash" /> sem telefone</span>}
            {r.email && <span className="fbn-contato"><i className="fa-regular fa-envelope" /> {r.email}</span>}
          </div>
          {(tagsVisiveis.length > 0 || r.prioridade) && (
            <div className="fbn-selos">
              {!crm && r.prioridade && <span className="fbn-pilula" style={{ ["--k" as string]: r.prioridade === "Urgente" ? "#dc2626" : r.prioridade === "Normal" ? "#2563eb" : "#64748b" }}>Prioridade {r.prioridade.toLowerCase()}</span>}
              {tagsVisiveis.map((t) => <span key={t} className="fbn-pilula"><i className="fa-solid fa-tag" /> {t}</span>)}
            </div>
          )}
        </div>
      </div>

      <div className="fbf-faca" style={{ ["--k" as string]: COR_ACAO[item.acao] }}>
        <span className="fbn-ico p"><i className={`fa-solid ${ICO_ACAO[item.acao]}`} /></span>
        <div>
          <div className="t">{item.oQueFazer}</div>
          {item.porque && <div className="p">Por que agora: {item.porque}</div>}
        </div>
      </div>

      <div className="fbn-dados">
        <div><small>Equipamento</small><span>{r.trator || "—"}</span></div>
        <div><small>Técnico</small><span>{r.tecnico || "—"}</span></div>
        <div><small>{crm ? "Serviço" : "Último serviço"}</small><span>{crm ? (r.servico || "—") : fmtData(r.ultimo_servico)}</span></div>
        <div><small>{crm ? "Desde o serviço" : "Sem vir"}</small><span>{rotuloDias(item)}{crm && r.data_servico ? ` · ${fmtData(r.faturado_em || r.data_servico)}` : ""}</span></div>
        {crm && <div><small>Valor da OS</small><span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtValor(r.os_valor)}</span></div>}
        {r.os_ref && <div><small>OS</small><span>{r.os_ref}</span></div>}
        {r.proximo_contato_em && <div><small>Retornar em</small><span>{fmtData(r.proximo_contato_em)}</span></div>}
      </div>

      {!crm && <UltimoServico key={r.id} r={r} onHistorico={onHistorico} />}

      {tent.length > 0 && (
        <div>
          <p className="fbf-sub">Tentativas ({tent.length})</p>
          <div className="fbf-tent">
            {tent.slice(0, 4).map((t, i) => (
              <div key={i}><i className={`fa-solid ${ICO_CANAL[t.canal] || "fa-circle-dot"}`} /> {fmtDataHora(t.data)} · {ROT_CANAL[t.canal] || t.canal}{t.observacao ? ` · ${t.observacao}` : ""}</div>
            ))}
            {tent.length > 4 && <div style={{ color: "var(--t3)" }}>e mais {tent.length - 4}</div>}
          </div>
        </div>
      )}

      {(jaDisse || r.feedback || (crm && r.status_cliente && r.status_cliente !== "Aguardando")) && (
        <div>
          <p className="fbf-sub">
            {item.acao === "concluido" ? "O que o cliente disse" : "O que o cliente disse antes"}
            {crm && r.status_cliente && r.status_cliente !== "Aguardando" && <span className="fbn-pilula" style={{ ["--k" as string]: COR_STATUS[r.status_cliente], marginLeft: 8 }}>{r.status_cliente}</span>}
          </p>
          {jaDisse && <div style={{ fontSize: 13.5, color: "var(--t2)", marginBottom: r.feedback ? 6 : 0 }}>{jaDisse}</div>}
          {r.feedback && <p className="fbn-texto">“{r.feedback}”</p>}
        </div>
      )}
      {r.status_atendimento === "arquivado" && r.arquivado_motivo && (
        <div style={{ fontSize: 13.5, color: "var(--t2)" }}><i className="fa-solid fa-box-archive" /> Arquivado: {r.arquivado_motivo}</div>
      )}
    </div>
  );
}
