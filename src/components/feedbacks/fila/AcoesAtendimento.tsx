"use client";
// Botões do atendimento + os painéis que abrem ali mesmo (concluir, remarcar, arquivar).
// Igual nas 3 opções da página de teste. Quem grava (ou simula) é o useFila (CRM/RFM geral) ou o
// useFilaRevisoes (aba Revisões: modo="revisao", concluir = "revisão agendada" ou "não quer").
import { useState } from "react";
import type { ItemFila } from "@/lib/feedbacks/fila";
import { precisaAlerta } from "@/lib/feedbacks/fila";
import type { DadosConcluirRevisao } from "@/lib/feedbacks/previsao-revisao";
import type { FeedbackRegistro, Melhoria, NPS, PrioridadeRFM, StatusCliente } from "@/lib/feedbacks/types";
import type { DadosConcluirCrm, DadosConcluirRfm } from "./useFila";

type Painel = null | "concluir" | "remarcar" | "arquivar";
type Feito = Promise<boolean>;
/** O que os botões precisam da fila (useFila e useFilaRevisoes cumprem). */
export interface FilaAcoes {
  acoes: {
    concluirCrm?: (r: FeedbackRegistro, d: DadosConcluirCrm) => Feito;
    concluirRfm?: (r: FeedbackRegistro, d: DadosConcluirRfm) => Feito;
    concluirRevisao?: (r: FeedbackRegistro, d: DadosConcluirRevisao) => Feito;
    naoAtendeu: (r: FeedbackRegistro) => Feito;
    whatsapp: (r: FeedbackRegistro) => Feito;
    remarcar: (r: FeedbackRegistro, data: string) => Feito;
    arquivar: (r: FeedbackRegistro, motivo: string) => Feito;
    reabrir: (r: FeedbackRegistro) => Feito;
  };
  ocupado: number | null;
  abrirHistorico: (r: FeedbackRegistro) => void;
  gravar: boolean;
}
type Modo = "atendimento" | "revisao";

const STATUS: { v: StatusCliente; rot: string; ico: string; cor: string }[] = [
  { v: "Satisfeito", rot: "Satisfeito", ico: "fa-face-smile", cor: "#16a34a" },
  { v: "Neutro", rot: "Neutro", ico: "fa-face-meh", cor: "#d97706" },
  { v: "Insatisfeito", rot: "Insatisfeito", ico: "fa-face-frown", cor: "#dc2626" },
];
const NPS_OPS: { v: NPS; cor: string }[] = [{ v: "Sim", cor: "#16a34a" }, { v: "Talvez", cor: "#d97706" }, { v: "Não", cor: "#dc2626" }];
const MELHORIAS: Melhoria[] = ["Prazo", "Atendimento", "Preço", "Qualidade Técnica"];
const MOTIVOS_RFM = ["Vendeu a máquina", "Faz serviço em outro lugar", "Máquina parada", "Achou caro", "Não precisou ainda", "Mudou de região"];
const ACOES_RFM = ["Agendar revisão", "Mandar orçamento", "Ligar daqui a 3 meses", "Passar para o vendedor", "Nada a fazer"];
const PRIORIDADES: { v: PrioridadeRFM; cor: string }[] = [{ v: "Urgente", cor: "#dc2626" }, { v: "Normal", cor: "#2563eb" }, { v: "Inativo", cor: "#64748b" }];
const MOTIVOS_NAO_QUER = ["Já fez em outro lugar", "Vai fazer por conta", "Trator parado", "Vendeu o trator", "Achou caro", "Ainda não chegou nas horas"];
const MOTIVOS_ARQ = ["Não quer mais contato", "Telefone errado", "Vendeu a máquina", "Registro repetido", "Não é cliente"];

const corNota = (n: number) => (n >= 9 ? "#16a34a" : n >= 7 ? "#d97706" : "#dc2626");
const statusDaNota = (n: number): StatusCliente => (n >= 9 ? "Satisfeito" : n >= 7 ? "Neutro" : "Insatisfeito");
const somaDias = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString("sv-SE"); };

export default function AcoesAtendimento(props: { item: ItemFila; fila: FilaAcoes; grande?: boolean; onFeito?: () => void; painelInicial?: Painel; modo?: Modo }) {
  // key = id: trocar de cliente fecha o painel aberto
  return <Acoes key={props.item.registro.id} {...props} />;
}

function Acoes({ item, fila, grande, onFeito, painelInicial = null, modo = "atendimento" }: { item: ItemFila; fila: FilaAcoes; grande?: boolean; onFeito?: () => void; painelInicial?: Painel; modo?: Modo }) {
  const r = item.registro;
  const [painel, setPainel] = useState<Painel>(painelInicial);
  const ocupado = fila.ocupado === r.id;
  const fechado = item.acao === "concluido";
  const terminar = (ok: boolean) => { if (ok) { setPainel(null); onFeito?.(); } };
  const alternar = (p: Painel) => setPainel((x) => (x === p ? null : p));

  if (fechado) {
    return (
      <div className={`fbf-acoes ${grande ? "grande" : ""}`}>
        <button type="button" className="fbn-acao" disabled={ocupado} onClick={async () => terminar(await fila.acoes.reabrir(r))}><i className="fa-solid fa-rotate-left" /> Reabrir</button>
        <button type="button" className="fbn-acao cinza" onClick={() => fila.abrirHistorico(r)}><i className="fa-solid fa-clock-rotate-left" /> Histórico do cliente</button>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div className={`fbf-acoes ${grande ? "grande" : ""}`}>
        <button type="button" className={`fbn-acao cheio`} disabled={ocupado} onClick={() => alternar("concluir")}>
          <i className="fa-solid fa-check" /> {modo === "revisao" ? "Falei com ele · concluir" : r.tipo === "crm" ? "Atendeu · concluir" : "Falei com ele · concluir"}
        </button>
        <button type="button" className="fbn-acao ambar" disabled={ocupado} onClick={async () => terminar(await fila.acoes.naoAtendeu(r))}>
          <i className="fa-solid fa-phone-slash" /> Não atendeu
        </button>
        <button type="button" className="fbn-acao wpp" disabled={ocupado || !r.telefone} title={r.telefone ? "Abre o WhatsApp com a mensagem pronta e anota a tentativa" : "Sem telefone"}
          onClick={async () => terminar(await fila.acoes.whatsapp(r))}>
          <i className="fa-brands fa-whatsapp" /> WhatsApp
        </button>
        <button type="button" className={`fbn-acao azul ${painel === "remarcar" ? "on" : ""}`} disabled={ocupado} onClick={() => alternar("remarcar")}>
          <i className="fa-regular fa-calendar" /> Remarcar
        </button>
        <button type="button" className={`fbn-acao cinza ${painel === "arquivar" ? "on" : ""}`} disabled={ocupado} onClick={() => alternar("arquivar")}>
          <i className="fa-solid fa-box-archive" /> Arquivar
        </button>
        <button type="button" className="fbn-acao cinza" onClick={() => fila.abrirHistorico(r)}>
          <i className="fa-solid fa-clock-rotate-left" /> Histórico
        </button>
        {ocupado && <span style={{ alignSelf: "center", fontSize: 13, color: "var(--t2)" }}><i className="fa-solid fa-circle-notch fa-spin" /> gravando…</span>}
      </div>

      {painel === "concluir" && (modo === "revisao"
        ? <ConcluirRevisao revisao={r.servico} onCancelar={() => setPainel(null)} ocupado={ocupado}
            onSalvar={async (d) => terminar((await fila.acoes.concluirRevisao?.(r, d)) ?? false)} />
        : r.tipo === "crm"
        ? <ConcluirCrm onCancelar={() => setPainel(null)} ocupado={ocupado} gravar={fila.gravar}
            onSalvar={async (d) => terminar((await fila.acoes.concluirCrm?.(r, d)) ?? false)} />
        : <ConcluirRfm prioridadeAtual={r.prioridade} onCancelar={() => setPainel(null)} ocupado={ocupado}
            onSalvar={async (d) => terminar((await fila.acoes.concluirRfm?.(r, d)) ?? false)} />)}
      {painel === "remarcar" && <Remarcar atual={r.proximo_contato_em ?? null} ocupado={ocupado} onCancelar={() => setPainel(null)} onSalvar={async (d) => terminar(await fila.acoes.remarcar(r, d))} />}
      {painel === "arquivar" && <Arquivar ocupado={ocupado} onCancelar={() => setPainel(null)} onSalvar={async (m) => terminar(await fila.acoes.arquivar(r, m))} />}
    </div>
  );
}

function Rodape({ ocupado, podeSalvar, rotulo, onSalvar, onCancelar }: { ocupado: boolean; podeSalvar: boolean; rotulo: string; onSalvar: () => void; onCancelar: () => void }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <button type="button" className="fbn-acao cheio" disabled={ocupado || !podeSalvar} onClick={onSalvar}><i className="fa-solid fa-check" /> {rotulo}</button>
      <button type="button" className="fbn-acao" onClick={onCancelar}>Cancelar</button>
    </div>
  );
}

function ConcluirCrm({ onSalvar, onCancelar, ocupado, gravar }: { onSalvar: (d: { status_cliente: StatusCliente | null; nota: number | null; nps: NPS | null; melhoria: Melhoria | null; feedback: string }) => void; onCancelar: () => void; ocupado: boolean; gravar: boolean }) {
  const [status, setStatus] = useState<StatusCliente | null>(null);
  const [statusManual, setStatusManual] = useState(false);
  const [nota, setNota] = useState<number | null>(null);
  const [nps, setNps] = useState<NPS | null>(null);
  const [melhoria, setMelhoria] = useState<Melhoria | null>(null);
  const [texto, setTexto] = useState("");
  const alerta = precisaAlerta({ nota, status_cliente: status });
  return (
    <div className="fbf-painel">
      <div>
        <div className="rot">De 0 a 10, que nota o cliente deu?</div>
        <div className="fbf-opcoes">
          {Array.from({ length: 11 }, (_, n) => (
            <button key={n} type="button" className={`fbf-op nota ${nota === n ? "on" : ""}`} style={{ ["--k" as string]: corNota(n) }}
              onClick={() => { setNota(nota === n ? null : n); if (!statusManual) setStatus(nota === n ? null : statusDaNota(n)); }}>{n}</button>
          ))}
        </div>
      </div>
      <div>
        <div className="rot">Como o cliente ficou?</div>
        <div className="fbf-opcoes">
          {STATUS.map((s) => (
            <button key={s.v} type="button" className={`fbf-op ${status === s.v ? "on" : ""}`} style={{ ["--k" as string]: s.cor }}
              onClick={() => { setStatus(status === s.v ? null : s.v); setStatusManual(true); }}><i className={`fa-regular ${s.ico}`} /> {s.rot}</button>
          ))}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(240px, 100%), 1fr))", gap: 12 }}>
        <div>
          <div className="rot">Indicaria a Nova Tratores?</div>
          <div className="fbf-opcoes">
            {NPS_OPS.map((o) => <button key={o.v} type="button" className={`fbf-op ${nps === o.v ? "on" : ""}`} style={{ ["--k" as string]: o.cor }} onClick={() => setNps(nps === o.v ? null : o.v)}>{o.v}</button>)}
          </div>
        </div>
        <div>
          <div className="rot">O que podemos melhorar? (opcional)</div>
          <div className="fbf-opcoes">
            {MELHORIAS.map((m) => <button key={m} type="button" className={`fbf-op ${melhoria === m ? "on" : ""}`} onClick={() => setMelhoria(melhoria === m ? null : m)}>{m}</button>)}
          </div>
        </div>
      </div>
      <div>
        <div className="rot">O que o cliente disse</div>
        <textarea value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Escreva com as palavras do cliente" />
      </div>
      {alerta && <div className="fbf-alerta"><i className="fa-solid fa-bell" /> Nota baixa ou cliente insatisfeito: {gravar ? "o gerente do pós-vendas recebe um aviso." : "na gravação de verdade, o gerente do pós-vendas recebe um aviso."}</div>}
      <Rodape ocupado={ocupado} podeSalvar={!!status || nota != null} rotulo="Salvar e concluir" onCancelar={onCancelar}
        onSalvar={() => onSalvar({ status_cliente: status, nota, nps, melhoria, feedback: texto })} />
    </div>
  );
}

function ConcluirRfm({ onSalvar, onCancelar, ocupado, prioridadeAtual }: { onSalvar: (d: { motivo: string; acao: string; prioridade: PrioridadeRFM | null }) => void; onCancelar: () => void; ocupado: boolean; prioridadeAtual: PrioridadeRFM | null }) {
  const [motivo, setMotivo] = useState("");
  const [acao, setAcao] = useState("");
  const [prio, setPrio] = useState<PrioridadeRFM | null>(prioridadeAtual);
  return (
    <div className="fbf-painel">
      <div>
        <div className="rot">Por que o cliente parou de vir?</div>
        <div className="fbf-opcoes" style={{ marginBottom: 8 }}>
          {MOTIVOS_RFM.map((m) => <button key={m} type="button" className={`fbf-op ${motivo === m ? "on" : ""}`} onClick={() => setMotivo(motivo === m ? "" : m)}>{m}</button>)}
        </div>
        <input type="text" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ou escreva o motivo" />
      </div>
      <div>
        <div className="rot">O que vamos fazer?</div>
        <div className="fbf-opcoes" style={{ marginBottom: 8 }}>
          {ACOES_RFM.map((m) => <button key={m} type="button" className={`fbf-op ${acao === m ? "on" : ""}`} onClick={() => setAcao(acao === m ? "" : m)}>{m}</button>)}
        </div>
        <input type="text" value={acao} onChange={(e) => setAcao(e.target.value)} placeholder="Ou escreva a ação" />
      </div>
      <div>
        <div className="rot">Prioridade</div>
        <div className="fbf-opcoes">
          {PRIORIDADES.map((p) => <button key={p.v} type="button" className={`fbf-op ${prio === p.v ? "on" : ""}`} style={{ ["--k" as string]: p.cor }} onClick={() => setPrio(p.v)}>{p.v}</button>)}
        </div>
      </div>
      <Rodape ocupado={ocupado} podeSalvar={!!motivo.trim()} rotulo="Salvar e concluir" onCancelar={onCancelar} onSalvar={() => onSalvar({ motivo, acao, prioridade: prio })} />
    </div>
  );
}

function ConcluirRevisao({ onSalvar, onCancelar, ocupado, revisao }: { onSalvar: (d: DadosConcluirRevisao) => void; onCancelar: () => void; ocupado: boolean; revisao: string | null }) {
  const [status, setStatus] = useState<DadosConcluirRevisao["status"] | null>(null);
  const [data, setData] = useState(somaDias(7));
  const [motivo, setMotivo] = useState("");
  const podeSalvar = status === "agendada" || (status === "nao_quer" && !!motivo.trim());
  return (
    <div className="fbf-painel">
      <div>
        <div className="rot">Como ficou{revisao ? ` a ${revisao.toLowerCase()}` : ""}?</div>
        <div className="fbf-opcoes">
          <button type="button" className={`fbf-op ${status === "agendada" ? "on" : ""}`} style={{ ["--k" as string]: "#16a34a" }} onClick={() => setStatus("agendada")}><i className="fa-regular fa-calendar-check" /> Revisão agendada</button>
          <button type="button" className={`fbf-op ${status === "nao_quer" ? "on" : ""}`} style={{ ["--k" as string]: "#dc2626" }} onClick={() => setStatus("nao_quer")}><i className="fa-regular fa-circle-xmark" /> Não quer agora</button>
        </div>
      </div>
      {status === "agendada" && (
        <div>
          <div className="rot">Para quando? (opcional)</div>
          <input type="date" value={data} min={somaDias(0)} onChange={(e) => setData(e.target.value)} />
        </div>
      )}
      {status && (
        <div>
          <div className="rot">{status === "nao_quer" ? "Por que não quer?" : "Observação (opcional)"}</div>
          {status === "nao_quer" && (
            <div className="fbf-opcoes" style={{ marginBottom: 8 }}>
              {MOTIVOS_NAO_QUER.map((m) => <button key={m} type="button" className={`fbf-op ${motivo === m ? "on" : ""}`} onClick={() => setMotivo(motivo === m ? "" : m)}>{m}</button>)}
            </div>
          )}
          <input type="text" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder={status === "nao_quer" ? "Ou escreva o motivo" : "Ex.: técnico, peças a separar"} />
        </div>
      )}
      <Rodape ocupado={ocupado} podeSalvar={podeSalvar} rotulo="Salvar e concluir" onCancelar={onCancelar}
        onSalvar={() => status && onSalvar({ status, data_agendada: status === "agendada" ? data || null : null, motivo })} />
    </div>
  );
}

function Remarcar({ atual, onSalvar, onCancelar, ocupado }: { atual: string | null; onSalvar: (d: string) => void; onCancelar: () => void; ocupado: boolean }) {
  const [data, setData] = useState(atual && atual > somaDias(0) ? atual : somaDias(1));
  const atalhos: [string, number][] = [["Amanhã", 1], ["Em 3 dias", 3], ["Em 1 semana", 7], ["Em 15 dias", 15], ["Em 1 mês", 30]];
  return (
    <div className="fbf-painel">
      <div>
        <div className="rot">Quando falar de novo com o cliente?</div>
        <div className="fbf-opcoes" style={{ marginBottom: 8 }}>
          {atalhos.map(([rot, n]) => <button key={n} type="button" className={`fbf-op ${data === somaDias(n) ? "on" : ""}`} onClick={() => setData(somaDias(n))}>{rot}</button>)}
        </div>
        <input type="date" value={data} min={somaDias(1)} onChange={(e) => setData(e.target.value)} />
      </div>
      <Rodape ocupado={ocupado} podeSalvar={!!data} rotulo="Remarcar" onCancelar={onCancelar} onSalvar={() => onSalvar(data)} />
    </div>
  );
}

function Arquivar({ onSalvar, onCancelar, ocupado }: { onSalvar: (m: string) => void; onCancelar: () => void; ocupado: boolean }) {
  const [motivo, setMotivo] = useState("");
  return (
    <div className="fbf-painel">
      <div>
        <div className="rot">Por que arquivar este atendimento?</div>
        <div className="fbf-opcoes" style={{ marginBottom: 8 }}>
          {MOTIVOS_ARQ.map((m) => <button key={m} type="button" className={`fbf-op ${motivo === m ? "on" : ""}`} onClick={() => setMotivo(motivo === m ? "" : m)}>{m}</button>)}
        </div>
        <input type="text" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ou escreva o motivo" />
      </div>
      <Rodape ocupado={ocupado} podeSalvar={!!motivo.trim()} rotulo="Arquivar" onCancelar={onCancelar} onSalvar={() => onSalvar(motivo)} />
    </div>
  );
}
