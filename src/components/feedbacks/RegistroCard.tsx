"use client";
// Cartão de um cliente no CRM/RFM — visual "Estilo POS NewPortal" (José, 23/10/2026). Estilo em
// estiloNovo.ts (.fbn-*), carregado pela ListaRegistros. Mesmos dados e ações de antes.
import { TAG_NAO_CONTATAR, type FeedbackRegistro, type StatusAtendimento } from "@/lib/feedbacks/types";
import type { UltimaOS } from "@/lib/feedbacks/api";
import { COR_CRM, COR_RFM } from "@/lib/feedbacks/cores";

const TAG_PENDENCIA = "!!#Pendências Cadastrais#!!";

interface Props {
  registro: FeedbackRegistro;
  // Última OS (oficina) do cliente — quem foi o último técnico e quando.
  ultimaOS?: UltimaOS | null;
  // Tags do cliente (de feedback_clientes_info) — para ícones e a caveira.
  clienteTags?: string[];
  onEditar?: (r: FeedbackRegistro) => void;
  // Muda o status de atendimento do registro (concluir, reabrir, desarquivar…).
  onMudarAtendimento?: (r: FeedbackRegistro, novo: StatusAtendimento) => void;
  // Arquiva o atendimento com justificativa (cliente que não vale a pena).
  onArquivar?: (r: FeedbackRegistro) => void;
  // Abre o histórico completo do cliente (OS, pedidos, requisições).
  onVerHistorico?: (r: FeedbackRegistro) => void;
}

// Horas decorridas desde aberto_em (negativo se aberto_em for futuro)
function horasDesde(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60));
}

function fmtTempoDecorrido(horas: number): string {
  if (horas < 1) return "agora";
  if (horas < 24) return `${horas} h`;
  const dias = Math.floor(horas / 24);
  return `${dias} dia${dias > 1 ? "s" : ""}`;
}

function fmtData(iso: string | null): string {
  if (!iso) return "—";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return iso;
}

/** Situação do cliente (CRM) ou prioridade (RFM): cor e ícone. */
function situacao(isCrm: boolean, r: FeedbackRegistro): { txt: string; cor: string; ico: string } | null {
  const v = isCrm ? r.status_cliente : r.prioridade;
  if (!v) return null;
  const mapa: Record<string, { cor: string; ico: string }> = {
    Satisfeito: { cor: "#16a34a", ico: "fa-face-smile" },
    Neutro: { cor: "#d97706", ico: "fa-face-meh" },
    Insatisfeito: { cor: "#dc2626", ico: "fa-face-frown" },
    Aguardando: { cor: "#2563eb", ico: "fa-hourglass-half" },
    Urgente: { cor: "#dc2626", ico: "fa-bolt" },
    Normal: { cor: "#d97706", ico: "fa-circle" },
    Inativo: { cor: "#64748b", ico: "fa-moon" },
  };
  return { txt: v, ...(mapa[v] || { cor: "#64748b", ico: "fa-circle" }) };
}

/** Origem do cadastro: NOVA, CASTRO, Omie… */
function corOrigem(origem: string): string {
  const up = origem.toUpperCase();
  if (up.includes("NOVA")) return "#dc2626";
  if (up.includes("CASTRO")) return "#ea580c";
  if (up.includes("OMIE")) return "#2563eb";
  return "#64748b";
}

const k = (cor: string) => ({ ["--k" as string]: cor });

export default function RegistroCard({ registro: r, ultimaOS, clienteTags, onEditar, onMudarAtendimento, onArquivar, onVerHistorico }: Props) {
  const isCrm = r.tipo === "crm";
  const emAtendimento = r.status_atendimento === "aberto" || r.status_atendimento === "em_andamento";
  const horasAberto = horasDesde(r.aberto_em);
  const atrasado = emAtendimento && horasAberto !== null && horasAberto >= 24;
  const clicavel = !!onVerHistorico;
  const tags = clienteTags || [];
  const naoContatar = tags.includes(TAG_NAO_CONTATAR);
  // Falta info cadastral: sem e-mail e sem telefone, ou marcado com pendência cadastral.
  const faltaInfo = (!r.email && !r.telefone) || tags.includes(TAG_PENDENCIA);
  const cor = isCrm ? COR_CRM : COR_RFM;
  const sit = situacao(isCrm, r);

  // linha do atendimento: quem está cuidando e em que pé está
  let atend: { ico: string; cor: string; txt: string } | null = null;
  if (r.status_atendimento === "arquivado") atend = { ico: "fa-box-archive", cor: "#64748b", txt: r.atendente_nome ? "Arquivado por" : "Arquivado" };
  else if (emAtendimento && r.atendente_nome) atend = atrasado ? { ico: "fa-triangle-exclamation", cor: "#dc2626", txt: "Em atendimento por" } : { ico: "fa-headset", cor: "#16a34a", txt: "Em atendimento por" };
  else if (r.status_atendimento === "concluido" && r.atendente_nome) atend = { ico: "fa-circle-check", cor: "#16a34a", txt: "Concluído por" };
  else if (r.status_atendimento === "sem_resposta") atend = { ico: "fa-phone-slash", cor: "#dc2626", txt: r.atendente_nome ? "Sem resposta — ligou" : "Sem resposta" };

  const dados: [string, string][] = [];
  if (r.trator) dados.push(["Equipamento", r.trator]);
  if (r.tecnico) dados.push(["Técnico", r.tecnico]);
  if (isCrm && r.servico) dados.push(["Serviço", r.servico]);
  if (isCrm && r.data_servico) dados.push(["Data do serviço", fmtData(r.data_servico)]);
  if (!isCrm && r.ultimo_servico) dados.push(["Último serviço", fmtData(r.ultimo_servico)]);
  if (r.data_contato) dados.push(["Contato", fmtData(r.data_contato)]);
  if (isCrm && r.nota !== null && r.nota !== undefined) dados.push(["Nota", `${r.nota} de 10`]);
  if (isCrm && r.nps) dados.push(["NPS", String(r.nps)]);
  if (isCrm && r.melhoria) dados.push(["Melhoria", r.melhoria]);
  const texto = isCrm ? r.feedback : r.motivo;

  return (
    <article
      onClick={onVerHistorico ? () => onVerHistorico(r) : undefined}
      className={`fbn-card ${clicavel ? "clica" : ""} ${atrasado ? "atrasado" : ""}`}
      title={clicavel ? "Clique para ver o histórico do cliente (OS, pedidos, requisições)" : undefined}
      style={{ ["--c" as string]: cor }}
    >
      <div className="fbn-cab">
        <span className="fbn-ico p" style={{ ["--c" as string]: sit?.cor || cor }}><i className={`fa-solid ${sit?.ico || "fa-user"}`} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 className="fbn-nome">{r.nome}</h3>
          <div className="fbn-contato" onClick={(e) => e.stopPropagation()}>
            {r.telefone && <a href={`tel:${r.telefone}`} title="Ligar"><i className="fa-solid fa-phone" /> {r.telefone}</a>}
            {r.email && <a href={`mailto:${r.email}`} title="Enviar e-mail"><i className="fa-regular fa-envelope" /> {r.email}</a>}
            {r.codigo_omie && <span>Omie {r.codigo_omie}</span>}
          </div>
        </div>
      </div>

      <div className="fbn-selos">
        {sit && <span className="fbn-pilula" style={k(sit.cor)}>{sit.txt}</span>}
        {r.origem_dados && <span className="fbn-pilula" style={k(corOrigem(r.origem_dados))}>{r.origem_dados}</span>}
        {!isCrm && r.sem_resposta && <span className="fbn-pilula" style={k("#dc2626")}>Sem resposta</span>}
        {naoContatar && <span className="fbn-pilula" style={k("#0f172a")} title="Cliente marcado como 'não contatar'"><i className="fa-solid fa-skull" /> Não contatar</span>}
        {faltaInfo && <span className="fbn-pilula" style={k("#d97706")} title="Faltam informações cadastrais (sem contato e/ou pendência cadastral)"><i className="fa-solid fa-triangle-exclamation" /> Falta cadastro</span>}
      </div>

      {atend && (
        <div className="fbn-atend">
          <i className={`fa-solid ${atend.ico}`} style={{ color: atend.cor }} />
          <span>{atend.txt}{r.atendente_nome ? <> <b>{r.atendente_nome}</b></> : null}
            {emAtendimento && horasAberto !== null && <> · há {fmtTempoDecorrido(horasAberto)}</>}
            {atrasado && <span style={{ color: "#dc2626" }}> · atualize com os detalhes</span>}
            {r.status_atendimento === "arquivado" && r.arquivado_motivo && <><br />Motivo: {r.arquivado_motivo}</>}
          </span>
        </div>
      )}

      {dados.length > 0 && (
        <div className="fbn-dados">
          {dados.map(([rot, val]) => <div key={rot}><small>{rot}</small><span>{val}</span></div>)}
        </div>
      )}

      {ultimaOS && (ultimaOS.tecnico || ultimaOS.data) && (
        <div className="fbn-os">
          <i className="fa-solid fa-wrench" />
          <span>Último serviço na oficina: {ultimaOS.tecnico || "técnico não informado"}{ultimaOS.data ? ` · ${fmtData(ultimaOS.data)}` : ""}{ultimaOS.tipo ? ` · ${ultimaOS.tipo}` : ""}</span>
        </div>
      )}

      {texto && <p className="fbn-texto">{texto}</p>}

      {!isCrm && r.acao && <div className="fbn-atend"><span>Ação: <b>{r.acao}</b></span></div>}

      {(onEditar || onMudarAtendimento) && (
        <div className="fbn-acoes" onClick={(e) => e.stopPropagation()}>
          {onEditar && (
            <button type="button" className="fbn-acao cheio" onClick={() => onEditar(r)}>
              <i className="fa-solid fa-pen-to-square" /> Preencher atendimento
            </button>
          )}
          {onMudarAtendimento && (r.status_atendimento === "arquivado" ? (
            <button type="button" className="fbn-acao cinza" onClick={() => onMudarAtendimento(r, "em_andamento")}><i className="fa-solid fa-box-open" /> Desarquivar</button>
          ) : (
            <>
              {r.status_atendimento === "concluido"
                ? <button type="button" className="fbn-acao cinza" onClick={() => onMudarAtendimento(r, "em_andamento")}><i className="fa-solid fa-rotate-left" /> Reabrir</button>
                : <button type="button" className="fbn-acao verde" onClick={() => onMudarAtendimento(r, "concluido")}><i className="fa-solid fa-check" /> Concluir</button>}
              {/* Respondeu — só para reverter quando está sem resposta (marcar "sem resposta" é dentro de "Preencher atendimento") */}
              {r.status_atendimento === "sem_resposta" && (
                <button type="button" className="fbn-acao verde" onClick={() => onMudarAtendimento(r, "em_andamento")}><i className="fa-solid fa-phone" /> Respondeu</button>
              )}
              {onArquivar && (
                <button type="button" className="fbn-acao cinza" onClick={() => onArquivar(r)} title="Arquivar este atendimento (com justificativa)"><i className="fa-solid fa-box-archive" /> Arquivar</button>
              )}
            </>
          ))}
          {clicavel && (
            <button type="button" className="fbn-acao cinza" style={{ marginLeft: "auto" }} onClick={() => onVerHistorico?.(r)} title="Histórico do cliente: OS, pedidos, requisições">
              <i className="fa-solid fa-clock-rotate-left" /> Histórico
            </button>
          )}
        </div>
      )}
    </article>
  );
}
