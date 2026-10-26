"use client";
// Robô → Triagem das oportunidades (23/10/2026, substitui o kanban de /feedbacks/oportunidades).
// Lista única com busca, filtro por regra, por situação (abertas, atendidas, dispensadas, expiradas)
// e "só urgentes"; cada linha diz o porquê em frase simples e tem: Ver na fila de hoje (a
// oportunidade aberta já entra na Hoje sozinha), Abrir no cockpit (quem tem feedbacks:atendimento)
// ou Atender (sem o cockpit, o mesmo fluxo rápido da tela antiga: abre um atendimento e marca a
// oportunidade como atendida), Dispensar (com motivo, sem prompt) e Histórico do cliente.
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { buscarClientePorOmieId, buscarClientesOmie, inserirRegistro } from "@/lib/feedbacks/api";
import { origemDaOportunidade } from "@/lib/feedbacks/origem";
import { fetchAuth } from "@/lib/auth/client";
import { renderizarDetalhes, renderizarUltimaInteracao } from "@/components/feedbacks/OportunidadeCard";
import { REGRA_ROTULO } from "@/lib/feedbacks/atendimento/rotulos";
import { TODAS_REGRAS } from "@/lib/feedbacks/atendimento/areas";
import { GRUPO_DA_REGRA } from "@/lib/feedbacks/hoje";
import { clienteKey, type FeedbackRegistro, type Oportunidade, type RegraOportunidade, type StatusOportunidade, type TipoFeedback } from "@/lib/feedbacks/types";
import { GRUPO } from "./kit";

export type StatusFiltro = StatusOportunidade | "todas";
export const STATUS_FILTROS: { v: StatusFiltro; rot: string }[] = [
  { v: "aberta", rot: "Abertas" }, { v: "atendida", rot: "Atendidas" }, { v: "dispensada", rot: "Dispensadas" }, { v: "expirada", rot: "Expiradas" }, { v: "todas", rot: "Todas" },
];

// Atender sem o cockpit (fluxo da tela antiga, decisão de 27/07): R4 = pós-serviço (CRM); o resto = reativação (RFM).
const TIPO_PADRAO_POR_REGRA: Record<RegraOportunidade, TipoFeedback> = {
  R1_revisao: "rfm", R2_sem_os: "rfm", R3_upsell: "rfm", R4_followup: "crm", R5_pecas: "rfm", R6_fora_garantia: "rfm", R7_garantia_risco: "rfm", R8_cadastro: "rfm",
};

function prefillDaOportunidade(op: Oportunidade): Partial<FeedbackRegistro> {
  const tipo = TIPO_PADRAO_POR_REGRA[op.regra];
  const d = op.detalhes || {};
  const base: Partial<FeedbackRegistro> = { tipo, nome: op.cliente_nome, codigo_omie: op.codigo_omie, trator: op.trator, data_contato: new Date().toISOString().slice(0, 10) };
  const sugestao = (d.sugestao as string | undefined) || "";
  if (tipo === "crm") {
    if (op.regra === "R4_followup") base.servico = "Follow-up apos feedback";
    base.feedback = sugestao;
  } else {
    if (op.regra === "R1_revisao") base.motivo = `Agendar a revisao ${(d.revisao_alvo as string | undefined) || ""}`.trim() + (sugestao ? ` — ${sugestao}` : "");
    else if (op.regra === "R7_garantia_risco") base.motivo = sugestao || "Agendar a revisao anual (garantia em risco)";
    else base.motivo = sugestao;
    base.prioridade = op.prioridade === "Urgente" ? "Urgente" : "Normal";
  }
  return base;
}

/** O texto das regras vem com palavras em caixa alta ("ATRASADA", "PERDEU"); aqui fica em letra normal. */
export function suavizar(t: string): string {
  return t.replace(/\(ATRASADA\)/g, "(atrasada)").replace(/\bPERDEU\b/g, "perdeu").replace(/\bNA garantia\b/g, "na garantia");
}

const PASSO = 60;
const fmtDia = (s: string | null | undefined) => (s ? String(s).slice(0, 10).split("-").reverse().join("/") : "");

interface Props {
  lista: Oportunidade[];
  carregando: boolean;
  status: StatusFiltro;
  setStatus: (s: StatusFiltro) => void;
  regra: RegraOportunidade | null;
  setRegra: (r: RegraOportunidade | null) => void;
  podeHoje: boolean;
  podeCockpit: boolean;
  usuario: { id: string; nome: string } | null;
  onMudou: () => void;
  abrirHistorico: (op: Oportunidade) => void;
  avisar: (t: string, tipo?: "ok" | "erro") => void;
}

export default function TriagemRobo({ lista, carregando, status, setStatus, regra, setRegra, podeHoje, podeCockpit, usuario, onMudou, abrirHistorico, avisar }: Props) {
  const router = useRouter();
  const [busca, setBusca] = useState("");
  const [soUrgentes, setSoUrgentes] = useState(false);
  const [n, setN] = useState(PASSO);
  const [dispensando, setDispensando] = useState<number | null>(null);
  const [motivo, setMotivo] = useState("");
  const [ocupado, setOcupado] = useState<number | null>(null);

  const filtrada = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return lista.filter((o) => {
      if (regra && o.regra !== regra) return false;
      if (soUrgentes && o.prioridade !== "Urgente") return false;
      if (q) {
        const hay = [o.cliente_nome, o.trator, o.chassis, o.codigo_omie, REGRA_ROTULO[o.regra]?.titulo].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [lista, regra, soUrgentes, busca]);
  const porRegra = useMemo(() => {
    const m: Partial<Record<RegraOportunidade, number>> = {};
    for (const o of lista) m[o.regra] = (m[o.regra] || 0) + 1;
    return m;
  }, [lista]);

  const patch = async (id: number, payload: Record<string, unknown>) => {
    const res = await fetchAuth(`/api/feedbacks/oportunidades?id=${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.erro || "Falha ao atualizar"); }
  };

  const atender = async (op: Oportunidade) => {
    if (podeCockpit) { router.push(`/feedbacks/atendimento/${encodeURIComponent(clienteKey(op.codigo_omie, op.cliente_nome))}?oportunidade=${op.id}`); return; }
    if (!usuario) return;
    setOcupado(op.id);
    const prefill = prefillDaOportunidade(op);
    let telefone: string | null = prefill.telefone || null;
    let email: string | null = null;
    let codigo = op.codigo_omie;
    let origem = origemDaOportunidade(op);
    try {
      if (op.codigo_omie) { const c = await buscarClientePorOmieId(op.codigo_omie); if (c) { telefone = telefone || c.telefone; email = c.email; } }
      else { const l = await buscarClientesOmie(op.cliente_nome); if (l.length) { telefone = telefone || l[0].telefone; email = l[0].email; codigo = l[0].id_omie; if (origem === "Tratores (Portal)") origem = "Omie"; } }
    } catch { /* contatos são só ajuda */ }
    try {
      const novo = await inserirRegistro({ ...prefill, telefone, email, codigo_omie: codigo, atendente_id: usuario.id, atendente_nome: usuario.nome, aberto_em: new Date().toISOString(), status_atendimento: "aberto", origem_dados: origem });
      await patch(op.id, { status: "atendida", feedback_id: novo.id });
      avisar(`${op.cliente_nome}: atendimento #${novo.id} aberto em seu nome. Ele aparece na aba Hoje.`);
      onMudou();
    } catch (e) { avisar(e instanceof Error ? e.message : String(e), "erro"); } finally { setOcupado(null); }
  };

  const dispensar = async (op: Oportunidade) => {
    setOcupado(op.id);
    try {
      await patch(op.id, { status: "dispensada", dispensada_motivo: motivo.trim() || "(sem motivo)" });
      avisar(`${op.cliente_nome}: oportunidade dispensada.`);
      setDispensando(null); setMotivo(""); onMudou();
    } catch (e) { avisar(e instanceof Error ? e.message : String(e), "erro"); } finally { setOcupado(null); }
  };

  return (
    <section className="fbh-cartao" style={{ ["--k" as string]: "#dc2626" }}>
      <h3><span className="fbn-ico"><i className="fa-solid fa-list-check" /></span> Triagem das oportunidades <small>{carregando ? "lendo…" : `${filtrada.length.toLocaleString("pt-BR")} de ${lista.length.toLocaleString("pt-BR")}`}</small></h3>

      <div className="fbh-filtros">
        <label className="fbn-busca">
          <i className="fa-solid fa-magnifying-glass" />
          <input type="text" value={busca} onChange={(e) => { setBusca(e.target.value); setN(PASSO); }} placeholder="Buscar cliente, trator, chassi ou código Omie" />
          {busca && <button type="button" className="fbn-acao cinza" style={{ height: 26, padding: "0 8px", border: 0 }} onClick={() => setBusca("")} aria-label="Limpar a busca"><i className="fa-solid fa-xmark" /></button>}
        </label>
        <select className="fbn-campo" value={regra || ""} onChange={(e) => { setRegra((e.target.value || null) as RegraOportunidade | null); setN(PASSO); }} aria-label="Regra">
          <option value="">Todas as regras</option>
          {TODAS_REGRAS.map((r) => <option key={r} value={r}>{REGRA_ROTULO[r].titulo} ({porRegra[r] || 0})</option>)}
        </select>
        <div className="fbr-seg" aria-label="Situação">
          {STATUS_FILTROS.map((s) => <button key={s.v} type="button" className={status === s.v ? "on" : ""} onClick={() => { setStatus(s.v); setN(PASSO); }}>{s.rot}</button>)}
        </div>
        <button type="button" className={`fbn-chip ${soUrgentes ? "on" : ""}`} style={{ ["--k" as string]: "#dc2626" }} aria-pressed={soUrgentes} onClick={() => setSoUrgentes(!soUrgentes)}>
          <i className="fa-solid fa-bolt" /> Só urgentes
        </button>
      </div>

      {carregando ? <div className="fbn-vazio"><i className="fa-solid fa-circle-notch fa-spin" /> Lendo as oportunidades…</div>
        : filtrada.length === 0 ? <div className="fbn-vazio">Nenhuma oportunidade com estes filtros.</div>
        : (
          <div className="fbh-sec">
            {filtrada.slice(0, n).map((op, i) => {
              const g = GRUPO[GRUPO_DA_REGRA[op.regra]];
              const ultima = renderizarUltimaInteracao(op);
              const key = clienteKey(op.codigo_omie, op.cliente_nome);
              const aberta = op.status === "aberta";
              return (
                <div key={op.id} className="fbh-motivo" style={{ ["--k" as string]: g.cor, gridTemplateColumns: "32px minmax(0, 1fr)", alignItems: "start", animation: `fbhEntra .3s ${Math.min(i, 14) * 25}ms both` }}>
                  <span className="fbn-ico"><i className={`fa-solid ${g.ico}`} /></span>
                  <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <span style={{ fontSize: 15, fontWeight: 500 }}>{op.cliente_nome}</span>
                      <span className="fbn-pilula" style={{ ["--k" as string]: REGRA_ROTULO[op.regra].cor }}>{REGRA_ROTULO[op.regra].titulo}</span>
                      {op.prioridade === "Urgente" && <span className="fbn-pilula" style={{ ["--k" as string]: "#dc2626" }}><i className="fa-solid fa-bolt" /> Urgente</span>}
                      {op.prioridade === "Baixa" && <span className="fbn-pilula" style={{ ["--k" as string]: "#64748b" }}>Baixa</span>}
                      {!aberta && <span className="fbn-pilula" style={{ ["--k" as string]: op.status === "atendida" ? "#16a34a" : "#64748b" }}>{op.status === "atendida" ? `Atendida${op.atendida_em ? ` em ${fmtDia(op.atendida_em)}` : ""}` : op.status === "dispensada" ? "Dispensada" : "Expirada"}</span>}
                    </div>
                    <div className="s">{suavizar(renderizarDetalhes(op))}</div>
                    <div className="p" style={{ display: "flex", gap: "4px 12px", flexWrap: "wrap" }}>
                      {op.trator && <span><i className="fa-solid fa-tractor" /> {op.trator}</span>}
                      {ultima && <span><i className="fa-solid fa-clock-rotate-left" /> {ultima}</span>}
                      <span><i className="fa-solid fa-database" /> {origemDaOportunidade(op)}</span>
                      {op.dispensada_motivo && <span>motivo: “{op.dispensada_motivo}”</span>}
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 2 }}>
                      {aberta && podeHoje && <Link className="fbn-acao" href={`/feedbacks?cliente=${encodeURIComponent(key)}`}><i className="fa-solid fa-sun" /> Ver na fila de hoje</Link>}
                      {aberta && <button type="button" className="fbn-acao" disabled={ocupado === op.id} onClick={() => void atender(op)}><i className={`fa-solid ${podeCockpit ? "fa-headset" : "fa-phone"}`} /> {podeCockpit ? "Abrir no cockpit" : "Atender"}</button>}
                      {aberta && <button type="button" className="fbn-acao cinza" onClick={() => { setDispensando(dispensando === op.id ? null : op.id); setMotivo(""); }}><i className="fa-solid fa-ban" /> Dispensar</button>}
                      <button type="button" className="fbn-acao cinza" onClick={() => abrirHistorico(op)}><i className="fa-solid fa-clock-rotate-left" /> Histórico</button>
                    </div>
                    {dispensando === op.id && (
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                        <input className="fbn-campo" style={{ flex: "1 1 240px", width: "auto" }} autoFocus value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Por que não é oportunidade? (já falou por outro canal, não interessa…)"
                          onKeyDown={(e) => { if (e.key === "Enter") void dispensar(op); if (e.key === "Escape") setDispensando(null); }} />
                        <button type="button" className="fbn-acao cheio" disabled={ocupado === op.id} onClick={() => void dispensar(op)}>Dispensar</button>
                        <button type="button" className="fbn-acao" onClick={() => setDispensando(null)}>Cancelar</button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {filtrada.length > n && <button type="button" className="fbn-btn fbh-mais" onClick={() => setN((x) => x + PASSO * 2)}>Mostrar mais ({(filtrada.length - n).toLocaleString("pt-BR")})</button>}
          </div>
        )}
    </section>
  );
}
