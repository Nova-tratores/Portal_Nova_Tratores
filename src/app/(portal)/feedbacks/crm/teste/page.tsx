"use client";
// PÁGINA DE TESTE do CRM/RFM (José, 23/10/2026: "a forma que a gente vê o CRM, RFM, a forma de
// filtrar, de concluir e tudo mais tá ruim"). Três jeitos de trabalhar a mesma fila
// (lib/feedbacks/fila) com os dados reais; a tela de verdade (/feedbacks/crm) não mudou.
// O RFM tem duas abas (José, 23/10/2026): "Serviço geral" (clientes que sumiram, por tempo desde o
// último serviço) e "Revisões" (um item por trator Mahindra, com a média de uso h/dia e a previsão
// da próxima revisão — lib/feedbacks/previsao-revisao).
// As ações só SIMULAM até ligar "Gravar de verdade".
// Permissão: o layout de /feedbacks confere a sub-tela pelo 1º segmento ("crm").
import { useState, type ReactNode } from "react";
import Link from "next/link";
import ModalHistoricoCliente from "@/components/feedbacks/ModalHistoricoCliente";
import { ESTILO_FBN } from "@/components/feedbacks/estiloNovo";
import { ESTILO_FILA } from "@/components/feedbacks/fila/estiloFila";
import { ESTILO_US } from "@/components/feedbacks/fila/UltimoServico";
import { useFila, type Escopo, type Toast } from "@/components/feedbacks/fila/useFila";
import { useFilaRevisoes } from "@/components/feedbacks/fila/useFilaRevisoes";
import OpcaoProximo from "@/components/feedbacks/fila/OpcaoProximo";
import OpcaoQuadro from "@/components/feedbacks/fila/OpcaoQuadro";
import OpcaoLista from "@/components/feedbacks/fila/OpcaoLista";
import { RevLista, RevProximo, RevQuadro } from "@/components/feedbacks/fila/OpcoesRevisao";
import { corTipo } from "@/lib/feedbacks/cores";
import { MEDIA_PADRAO_H_DIA } from "@/lib/feedbacks/previsao-revisao";
import type { TipoFeedback } from "@/lib/feedbacks/types";

const OPCOES = [
  { n: 1, nome: "Fila 'próximo cliente'", resumo: "Um cliente por vez, grande na tela, com o telefone, o que fazer e por quê. Terminou, a tela já mostra o próximo. Ao lado, quem vem depois." },
  { n: 2, nome: "Quadro por etapa", resumo: "Quatro colunas — A ligar, Tentando, Esperando e Concluídos — para ver de longe onde cada cliente está. Clique num cartão para abrir a ficha do lado." },
  { n: 3, nome: "Lista com painel ao lado", resumo: "Tabela compacta que ordena clicando no título da coluna. Clique numa linha e a ficha com os botões abre à direita, sem sair da lista." },
];
const RESUMO_REV: Record<number, string> = {
  1: "Um trator por vez, com o dono, o telefone, a revisão a oferecer e a previsão. Terminou, a tela já mostra o próximo.",
  2: "Cinco colunas — Atrasadas, Este mês, Parou de fazer na loja, Próximas e Agendadas — para ver de longe onde cada trator está.",
  3: "Tabela com revisão, horímetro estimado, média de uso e data prevista; ordena pelo título da coluna e abre a ficha ao lado.",
};

const ESCOPOS: { k: Escopo; rot: string; ico: string; cor: string }[] = [
  { k: "agora", rot: "Agora", ico: "fa-phone", cor: "#2563eb" },
  { k: "esperando", rot: "Esperando", ico: "fa-hourglass-half", cor: "#64748b" },
  { k: "concluidos", rot: "Concluídos", ico: "fa-circle-check", cor: "#16a34a" },
];
type AbaRfm = "geral" | "revisoes";

export default function CrmTestePage() {
  const [n, setN] = useState(1);
  const [tipo, setTipo] = useState<TipoFeedback>("crm");
  const [aba, setAba] = useState<AbaRfm>("geral");
  const [exemplo, setExemplo] = useState(true);
  const op = OPCOES[n - 1];
  const revisoes = tipo === "rfm" && aba === "revisoes";
  const comum = { tipo, setTipo, exemplo, setExemplo, opcao: n, aba, setAba };
  return (
    <div style={{ paddingTop: 14, display: "grid", gap: 12, minWidth: 0 }}>
      <div style={{ display: "flex", gap: 2, borderBottom: "1px solid var(--portal-border)", overflowX: "auto" }}>
        {OPCOES.map((o) => (
          <button key={o.n} type="button" onClick={() => setN(o.n)}
            style={{ padding: "9px 16px", border: "none", borderRadius: "10px 10px 0 0", cursor: "pointer", fontFamily: "inherit", fontWeight: 500, fontSize: 13, whiteSpace: "nowrap",
              background: n === o.n ? "var(--portal-bg-card)" : "transparent", color: n === o.n ? "var(--portal-text)" : "var(--portal-text-secondary)",
              boxShadow: n === o.n ? "0 -1px 0 var(--portal-border) inset, 1px 0 0 var(--portal-border), -1px 0 0 var(--portal-border)" : "none" }}>
            Opção {o.n} · {o.nome}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        <Link href="/feedbacks/crm/teste/hoje" style={{ alignSelf: "center", margin: "0 2px 4px", display: "inline-flex", alignItems: "center", gap: 7, height: 34, padding: "0 14px", borderRadius: 10, whiteSpace: "nowrap",
          fontSize: 13.5, fontWeight: 500, textDecoration: "none", color: "#fefefe", background: "#dc2626" }}>
          <i className="fa-solid fa-sun" /> Ver a tela Hoje (nova)
        </Link>
      </div>
      {revisoes
        ? <ConteudoRevisoes key={`rev-${exemplo}`} {...comum} resumo={`Opção ${op.n} — ${op.nome}.`} texto={RESUMO_REV[op.n]} />
        : <Conteudo key={`${tipo}-${exemplo}`} {...comum} resumo={`Opção ${op.n} — ${op.nome}.`} texto={op.resumo} />}
    </div>
  );
}

type Comum = { tipo: TipoFeedback; setTipo: (t: TipoFeedback) => void; exemplo: boolean; setExemplo: (v: boolean) => void; opcao: number; resumo: string; texto: string; aba: AbaRfm; setAba: (a: AbaRfm) => void };

/** Topo comum: CRM | RFM, exemplo | reais, "Gravar de verdade" (com confirmação) e as abas do RFM. */
function Topo({ tipo, setTipo, exemplo, setExemplo, gravar, setGravar, confirmaTexto, aba, setAba }: Pick<Comum, "tipo" | "setTipo" | "exemplo" | "setExemplo" | "aba" | "setAba"> & { gravar: boolean; setGravar: (v: boolean) => void; confirmaTexto: ReactNode }) {
  const [confirmando, setConfirmando] = useState(false);
  return (
    <>
      <div className="fbf-topo">
        <div className="fbf-seg" role="tablist" aria-label="CRM ou RFM">
          <button type="button" className={tipo === "crm" ? "on" : ""} style={{ ["--k" as string]: corTipo("crm") }} onClick={() => setTipo("crm")}>
            <i className="fa-solid fa-comments" /> CRM · atendidos há pouco
          </button>
          <button type="button" className={tipo === "rfm" ? "on" : ""} style={{ ["--k" as string]: corTipo("rfm") }} onClick={() => setTipo("rfm")}>
            <i className="fa-solid fa-user-clock" /> RFM · clientes que sumiram
          </button>
        </div>
        <span style={{ flex: 1 }} />
        <div className="fbf-seg" aria-label="Quais dados">
          <button type="button" className={exemplo ? "on" : ""} style={{ ["--k" as string]: "#7c3aed" }} onClick={() => setExemplo(true)}><i className="fa-solid fa-flask" /> Dados de exemplo</button>
          <button type="button" className={!exemplo ? "on" : ""} style={{ ["--k" as string]: "#0f766e" }} onClick={() => setExemplo(false)}><i className="fa-solid fa-database" /> Dados reais</button>
        </div>
        {!exemplo && <button type="button" className={`fbf-gravar ${gravar ? "on" : ""}`} aria-pressed={gravar}
          onClick={() => { if (gravar) { setGravar(false); setConfirmando(false); } else setConfirmando(true); }}>
          <span className="sw" /> {gravar ? "Gravando de verdade" : "Gravar de verdade: desligado"}
        </button>}
      </div>

      {confirmando && !gravar && (
        <div className="fbf-confirma">
          <i className="fa-solid fa-triangle-exclamation" style={{ color: "#dc2626" }} />
          <span style={{ flex: "1 1 260px" }}>{confirmaTexto}</span>
          <button type="button" className="fbn-acao cheio" style={{ ["--c" as string]: "#dc2626" }} onClick={() => { setGravar(true); setConfirmando(false); }}>Sim, gravar de verdade</button>
          <button type="button" className="fbn-acao" onClick={() => setConfirmando(false)}>Cancelar</button>
        </div>
      )}

      {tipo === "rfm" && (
        <div className="fbf-abas" role="tablist" aria-label="Tipo de RFM">
          <button type="button" role="tab" aria-selected={aba === "geral"} className={aba === "geral" ? "on" : ""} onClick={() => setAba("geral")}><i className="fa-solid fa-user-clock" /> Serviço geral · por tempo sem serviço</button>
          <button type="button" role="tab" aria-selected={aba === "revisoes"} className={aba === "revisoes" ? "on" : ""} onClick={() => setAba("revisoes")}><i className="fa-solid fa-tractor" /> Revisões · próxima revisão de cada trator</button>
        </div>
      )}
    </>
  );
}

function Aviso({ toast, fechar }: { toast: Toast | null; fechar: () => void }) {
  if (!toast) return null;
  return (
    <div key={toast.id} className={`fbf-toast ${toast.tipo}`} role="status">
      <i className={`fa-solid ${toast.tipo === "erro" ? "fa-circle-exclamation" : toast.tipo === "sim" ? "fa-flask" : "fa-circle-check"}`} />
      <span>{toast.texto}</span>
      <button type="button" onClick={fechar} aria-label="Fechar"><i className="fa-solid fa-xmark" /></button>
    </div>
  );
}

function Escopos({ escopo, setEscopo, contagem }: { escopo: Escopo; setEscopo: (e: Escopo) => void; contagem: Record<Escopo, number> }) {
  return (
    <div className="fbf-seg" aria-label="Situação">
      {ESCOPOS.map((e) => (
        <button key={e.k} type="button" className={escopo === e.k ? "on" : ""} style={{ ["--k" as string]: e.cor }} onClick={() => setEscopo(e.k)}>
          <i className={`fa-solid ${e.ico}`} /> {e.rot} <span className="fbn-conta" style={{ padding: "0 8px", fontSize: 12 }}>{contagem[e.k]}</span>
        </button>
      ))}
    </div>
  );
}

function Conteudo({ tipo, setTipo, exemplo, setExemplo, opcao, resumo, texto, aba, setAba }: Comum) {
  const fila = useFila(tipo, exemplo);
  const cor = corTipo(tipo);

  return (
    <div className="fbn" style={{ ["--c" as string]: cor, paddingTop: 0 }}>
      <style>{ESTILO_FBN + ESTILO_FILA + ESTILO_US}</style>

      <Topo tipo={tipo} setTipo={setTipo} exemplo={exemplo} setExemplo={setExemplo} aba={aba} setAba={setAba} gravar={fila.gravar} setGravar={fila.setGravar}
        confirmaTexto={<>Com isto ligado, concluir, tentativa, remarcar e arquivar <b>gravam no CRM de verdade</b> (a mesma tabela da tela atual). Ligar?</>} />

      <p className="fbf-explica"><b>{resumo}</b> {texto} {exemplo
        ? <>Estes clientes são <b>inventados</b>, só para ver como a tela fica: clique à vontade, nada é gravado e o WhatsApp não abre.</>
        : !fila.gravar && <>Os botões estão em <b>simulação</b>: mudam só esta tela, nada é gravado.</>}</p>

      <details className="fbf-como">
        <summary><i className="fa-regular fa-circle-question" style={{ color: "var(--c)" }} /> Como ler esta tela</summary>
        <ul>
          <li>A ordem é a <b>fila</b>: quem está no topo é quem vale mais a pena atender agora.</li>
          {tipo === "crm"
            ? <li>No CRM a melhor hora de ligar é de <b>3 a 7 dias</b> depois do serviço. Antes disso o cliente fica em <b>Esperando</b>; depois de 15 dias perde força. Serviço de valor alto e cliente insatisfeito sobem.</li>
            : <>
                <li>No RFM <b>Serviço geral</b> sobe primeiro quem tem <b>prioridade urgente</b> e quem está há mais tempo sem vir.</li>
                <li>A aba <b>Revisões</b> mostra cada trator Mahindra com a média de uso e a data prevista da próxima revisão.</li>
              </>}
          <li><b>Não atendeu</b> anota a tentativa e o cliente volta amanhã. Depois de 3 tentativas, a fila manda tentar pelo <b>WhatsApp</b>.</li>
          <li><b>Remarcar</b> tira o cliente da fila até a data combinada. <b>Arquivar</b> tira de vez, com o motivo.</li>
          <li>Nota de 0 a 6 ou cliente insatisfeito avisa o gerente do pós-vendas (só quando grava de verdade).</li>
          <li>Clientes marcados como “não contatar” não aparecem.</li>
        </ul>
      </details>

      <div className="fbf-filtros">
        <label className="fbn-busca">
          <i className="fa-solid fa-magnifying-glass" />
          <input type="text" value={fila.busca} onChange={(e) => fila.setBusca(e.target.value)} placeholder="Buscar cliente, telefone, equipamento, técnico ou o que o cliente disse" />
          {fila.busca && <button type="button" className="fbn-acao cinza" style={{ height: 26, padding: "0 8px", border: 0 }} onClick={() => fila.setBusca("")} aria-label="Limpar a busca"><i className="fa-solid fa-xmark" /></button>}
        </label>
        <select className="fbn-campo" value={fila.tecnico} onChange={(e) => fila.setTecnico(e.target.value)} aria-label="Técnico">
          <option value="">Todos os técnicos</option>
          {fila.tecnicos.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        {opcao !== 2 && <Escopos escopo={fila.escopo} setEscopo={fila.setEscopo} contagem={fila.contagem} />}
        <button type="button" className="fbn-btn" onClick={() => void fila.recarregar()} title="Ler de novo do banco"><i className="fa-solid fa-rotate" /> Atualizar</button>
      </div>

      {fila.erro && <div className="fbn-erro">Erro: {fila.erro}</div>}

      {fila.loading ? (
        <div className="fbn-vazio"><i className="fa-solid fa-circle-notch fa-spin" /> Carregando…</div>
      ) : fila.rows.length === 0 ? (
        <div className="fbn-vazio">Nenhum registro de {tipo.toUpperCase()} ainda.</div>
      ) : opcao === 1 ? <OpcaoProximo fila={fila} /> : opcao === 2 ? <OpcaoQuadro fila={fila} /> : <OpcaoLista fila={fila} />}

      <ModalHistoricoCliente aberto={!!fila.historico} nome={fila.historico?.nome || ""} codigoOmie={fila.historico?.codigoOmie ?? null} onFechar={fila.fecharHistorico} />
      <Aviso toast={fila.toast} fechar={fila.fecharToast} />
    </div>
  );
}

function ConteudoRevisoes({ tipo, setTipo, exemplo, setExemplo, opcao, resumo, texto, aba, setAba }: Comum) {
  const fila = useFilaRevisoes(exemplo);
  const media = MEDIA_PADRAO_H_DIA.toLocaleString("pt-BR");

  return (
    <div className="fbn" style={{ ["--c" as string]: corTipo("rfm"), paddingTop: 0 }}>
      <style>{ESTILO_FBN + ESTILO_FILA + ESTILO_US}</style>

      <Topo tipo={tipo} setTipo={setTipo} exemplo={exemplo} setExemplo={setExemplo} aba={aba} setAba={setAba} gravar={fila.gravar} setGravar={fila.setGravar}
        confirmaTexto={fila.tabelaContato
          ? <>Com isto ligado, tentativa, remarcar, arquivar e “revisão agendada / não quer” <b>gravam de verdade</b> no atendimento das revisões. Ligar?</>
          : <>A tabela do atendimento das revisões <b>ainda não existe</b> (sql/feedbacks-rfm-revisoes.sql). Mesmo ligado, os botões vão avisar e não gravar.</>} />

      <p className="fbf-explica"><b>{resumo}</b> {texto} {exemplo
        ? <>Estes tratores são <b>inventados</b>, um para cada caso (atrasada, vence em 10 dias, uso alto, uso baixo, sem revisão, leitura descartada…): clique à vontade, nada é gravado.</>
        : !fila.gravar && <>Os botões estão em <b>simulação</b>: mudam só esta tela, nada é gravado.</>}</p>

      {!exemplo && !fila.loading && !fila.tabelaContato && (
        <div className="fbf-aviso"><i className="fa-solid fa-database" /><span>O atendimento das revisões ainda <b>não tem onde gravar</b>: falta rodar <b>sql/feedbacks-rfm-revisoes.sql</b> no projeto do portal. Até lá a aba funciona só em leitura e simulação.</span></div>
      )}
      {fila.avisos.map((a) => <div key={a} className="fbf-aviso"><i className="fa-solid fa-triangle-exclamation" /><span>{a}</span></div>)}

      <details className="fbf-como">
        <summary><i className="fa-regular fa-circle-question" style={{ color: "var(--c)" }} /> Como ler esta tela</summary>
        <ul>
          <li>Cada item é um <b>trator Mahindra</b> do controle de revisões, com o cliente dono. O telefone vem do CRM ou do cadastro Omie, casado pelo <b>nome</b> do cliente (quando o nome não bate, aparece “sem telefone”).</li>
          <li><b>Média de uso (h/dia)</b>: a entrega é o ponto zero (0 h) e cada leitura do horímetro é um ponto — revisões anotadas, cheques de revisão, OS do Omie e, como aproximação, o envio do cheque à Mahindra. A média é a reta que sai do zero na entrega e passa mais perto de todas as leituras.</li>
          <li>Leituras que não fazem sentido <b>saem da conta</b> e aparecem riscadas na ficha, com o motivo: data no futuro ou antes da entrega, horímetro que volta, uso de mais de 20 h por dia, horímetro que não bate com a revisão.</li>
          <li><b>Horímetro hoje</b> = última leitura + média × dias desde ela. <b>Próxima revisão</b>: 50, 300, 600, 900… de 300 em 300, a seguinte à última feita. A <b>data prevista</b> é quando o horímetro estimado chega nela.</li>
          <li>Sem nenhuma leitura, usa a média padrão de <b>{media} h/dia</b> (a mediana dos tratores com leitura) e marca “estimada sem leitura”.</li>
          <li>A fila põe primeiro as <b>atrasadas</b> (a que acabou de vencer antes) e as que vencem em <b>30 dias</b>; depois quem <b>parou de fazer revisão na loja</b> (pulou uma revisão inteira ou está atrasada há mais de 6 meses) — é oportunidade. As próximas esperam até 30 dias antes.</li>
          <li><b>Confiança</b>: boa com 3 ou mais leituras recentes, média com 2, baixa com 1. <b>WhatsApp</b> abre com a mensagem pronta oferecendo a revisão; <b>Concluir</b> é “revisão agendada” ou “não quer agora” (com o motivo).</li>
        </ul>
      </details>

      <div className="fbf-filtros">
        <label className="fbn-busca">
          <i className="fa-solid fa-magnifying-glass" />
          <input type="text" value={fila.busca} onChange={(e) => fila.setBusca(e.target.value)} placeholder="Buscar cliente, telefone, modelo, chassi ou cidade" />
          {fila.busca && <button type="button" className="fbn-acao cinza" style={{ height: 26, padding: "0 8px", border: 0 }} onClick={() => fila.setBusca("")} aria-label="Limpar a busca"><i className="fa-solid fa-xmark" /></button>}
        </label>
        <select className="fbn-campo" value={fila.vendedor} onChange={(e) => fila.setVendedor(e.target.value)} aria-label="Vendedor">
          <option value="">Todos os vendedores</option>
          {fila.vendedores.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        {opcao !== 2 && <Escopos escopo={fila.escopo} setEscopo={fila.setEscopo} contagem={fila.contagem} />}
        <button type="button" className="fbn-btn" onClick={() => void fila.recarregar()} title="Ler de novo do banco"><i className="fa-solid fa-rotate" /> Atualizar</button>
      </div>

      {fila.erro && <div className="fbn-erro">Erro: {fila.erro}</div>}

      {fila.loading ? (
        <div className="fbn-vazio"><i className="fa-solid fa-circle-notch fa-spin" /> Calculando a previsão de cada trator…</div>
      ) : fila.tratores.length === 0 ? (
        <div className="fbn-vazio">Nenhum trator no controle de revisões.</div>
      ) : opcao === 1 ? <RevProximo fila={fila} /> : opcao === 2 ? <RevQuadro fila={fila} /> : <RevLista fila={fila} />}

      <ModalHistoricoCliente aberto={!!fila.historico} nome={fila.historico?.nome || ""} codigoOmie={fila.historico?.codigoOmie ?? null} onFechar={fila.fecharHistorico} />
      <Aviso toast={fila.toast} fechar={fila.fecharToast} />
    </div>
  );
}
