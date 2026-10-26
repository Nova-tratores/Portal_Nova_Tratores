"use client";
// Abas do gerente na tela "Hoje": Painel (ao vivo) e Robô de oportunidades (só leitura nesta entrega).
import { useMemo } from "react";
import { BONUS_RETORNO, BONUS_RFM_ABERTO, COTA_PADRAO, DIAS_URGENTE_REVISAO, FRACAO_EXTRA, GRUPOS, GRUPO_DA_REGRA, PENALIDADE_SEM_TELEFONE, PESO_REGRA, TETO_BONUS, distribuicao, type Grupo } from "@/lib/feedbacks/hoje";
import { DESFECHO_POR_VALOR, type Desfecho } from "@/lib/feedbacks/atendimento/chamada";
import { TODAS_REGRAS } from "@/lib/feedbacks/atendimento/areas";
import { REGRA_ROTULO } from "@/lib/feedbacks/atendimento/rotulos";
import type { Oportunidade, RegraOportunidade } from "@/lib/feedbacks/types";
import type { Hoje } from "./useHoje";
import { Contador, GRUPO } from "./kit";

const EM_BRANCO: Oportunidade[] = [];
const hora = (t: number) => new Date(t).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

function Barras({ itens, cor, onClick }: { itens: { rot: string; v: number; extra?: string; k?: string }[]; cor: string; onClick?: (k: string) => void }) {
  const max = Math.max(1, ...itens.map((i) => i.v));
  if (!itens.length) return <div style={{ fontSize: 13.5, color: "var(--t2)" }}>Nada por aqui.</div>;
  return (
    <div className="fbh-barras">
      {itens.map((i, n) => (
        <button key={i.k || i.rot} type="button" className="fbh-barra" style={{ ["--k" as string]: cor }} disabled={!onClick} onClick={() => i.k && onClick?.(i.k)} title={i.extra || undefined}>
          <span className="r">{i.rot}</span>
          <span className="trilho"><span className="enche" style={{ width: `${Math.max(2, (i.v / max) * 100)}%`, animationDelay: `${n * 50}ms` }} /></span>
          <span className="v">{i.v.toLocaleString("pt-BR")}</span>
        </button>
      ))}
    </div>
  );
}

export function AbaPainel({ hoje, filtrarGrupo }: { hoje: Hoje; filtrarGrupo?: (g: Grupo) => void }) {
  const p = hoje.painel;
  const nomePorKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of hoje.clientes) m.set(c.key, c.nome);
    return m;
  }, [hoje.clientes]);
  const dist = useMemo(() => distribuicao(hoje.clientes), [hoje.clientes]);
  const s = p.semana.total;

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="fbh-linha-topo">
        <span className="fbh-vivo"><span className="pt" /> Ao vivo · atualizado às {hora(hoje.geradoEm)} · recarrega a cada 60 s e quando você volta para esta aba</span>
      </div>
      {hoje.exemplo && <p className="fbf-explica">Números <b>inventados</b> e coerentes com os clientes de exemplo da aba Hoje. Troque para <b>Dados reais</b> lá em cima para ver a equipe de verdade.</p>}
      <details className="fbf-como">
        <summary><i className="fa-regular fa-circle-question" style={{ color: "var(--c)" }} /> Como ler esta tela</summary>
        <ul>
          <li><b>Em ligação agora</b>: quem abriu uma ligação no cockpit e ainda não encerrou. Mais de 2 horas aberta é quase sempre esquecimento.</li>
          <li><b>Feitos hoje</b>: por pessoa, ligações encerradas + atendimentos concluídos + oportunidades atendidas hoje.</li>
          <li><b>Notas baixas</b>: pós-serviço com nota de 0 a 6 ou cliente insatisfeito nos últimos 30 dias — o gerente precisa tratar.</li>
          <li><b>Coisas paradas</b>: atendimento aberto sem nenhum movimento há mais de 15 dias (fora quem está esperando um retorno combinado) e ligação aberta há mais de 2 horas.</li>
          <li><b>Fila por motivo</b>: quantos clientes têm cada tipo de motivo. Clique numa barra para ver esses clientes na aba Hoje.</li>
          <li><b>Conversão da semana</b>: das ligações dos últimos 7 dias em que o cliente atendeu, quantas viraram serviço agendado ou venda.</li>
        </ul>
      </details>

      <div className="fbh-conts">
        {[
          { rot: "em ligação agora", v: p.emLigacao.length, ico: "fa-headset", cor: "#d97706" },
          { rot: "feitos hoje (equipe)", v: p.feitosHoje.reduce((a, x) => a + x.total, 0), ico: "fa-circle-check", cor: "#16a34a" },
          { rot: "notas baixas (30 dias)", v: p.notasBaixas.length, ico: "fa-face-frown", cor: "#b91c1c" },
          { rot: "coisas paradas", v: p.parados.length, ico: "fa-hourglass-end", cor: "#64748b" },
          { rot: `conversão da semana${s.taxa != null ? ` · ${s.taxa}%` : ""}`, v: s.conversoes, ico: "fa-chart-line", cor: "#0f766e" },
        ].map((t, i) => (
          <div key={t.rot} className="fbh-cont" style={{ ["--k" as string]: t.cor, animationDelay: `${i * 60}ms`, cursor: "default" }}>
            <span className="fbn-ico"><i className={`fa-solid ${t.ico}`} /></span>
            <span><b>{hoje.carregando ? "…" : <Contador valor={t.v} />}</b><small>{t.rot}</small></span>
          </div>
        ))}
      </div>

      <div className="fbh-pg">
        <section className="fbh-cartao" style={{ ["--k" as string]: "#d97706" }}>
          <h3><span className="fbn-ico"><i className="fa-solid fa-headset" /></span> Em ligação agora <small>{p.emLigacao.length}</small></h3>
          {p.emLigacao.length === 0 ? <div style={{ fontSize: 13.5, color: "var(--t2)" }}>Ninguém em ligação neste momento.</div> : p.emLigacao.map((l) => (
            <div key={l.id} className="fbh-item">
              <span>{l.atendente}<div className="d">{(l.cliente_key && nomePorKey.get(l.cliente_key)) || "cliente"} · desde {hora(Date.parse(l.desde))}</div></span>
              <span className="v" style={{ color: l.esquecida ? "#b91c1c" : "var(--t)" }}>{l.esquecida && <i className="fa-solid fa-triangle-exclamation" />} {l.minutos >= 120 ? `${Math.floor(l.minutos / 60)} h` : `${l.minutos} min`}</span>
            </div>
          ))}
        </section>

        <section className="fbh-cartao" style={{ ["--k" as string]: "#16a34a" }}>
          <h3><span className="fbn-ico"><i className="fa-solid fa-user-check" /></span> Feitos hoje por pessoa</h3>
          <Barras cor="#16a34a" itens={p.feitosHoje.map((x) => ({ rot: x.pessoa, v: x.total, extra: `${x.ligacoes} ligação(ões) · ${x.concluidos} concluído(s) · ${x.oportunidades} oportunidade(s)` }))} />
          {p.feitosHoje.length > 0 && <div style={{ fontSize: 12.5, color: "var(--t2)" }}>Passe o mouse na barra: ligações · concluídos · oportunidades.</div>}
        </section>

        <section className="fbh-cartao" style={{ ["--k" as string]: "#b91c1c" }}>
          <h3><span className="fbn-ico"><i className="fa-solid fa-face-frown" /></span> Notas baixas para tratar <small>últimos 30 dias</small></h3>
          {p.notasBaixas.length === 0 ? <div style={{ fontSize: 13.5, color: "var(--t2)" }}>Nenhuma nota baixa no último mês.</div> : p.notasBaixas.slice(0, 12).map((n) => (
            <button key={n.id} type="button" className="fbh-item" style={{ background: "transparent", border: 0, borderTop: "1px solid var(--b)", font: "inherit", color: "inherit", textAlign: "left", cursor: "pointer", width: "100%" }}
              onClick={() => hoje.abrirHistorico({ nome: n.nome, codigo_omie: n.codigo_omie })}>
              <span>{n.nome}<div className="d">{n.feedback ? `“${n.feedback.slice(0, 90)}${n.feedback.length > 90 ? "…" : ""}”` : n.status || ""}{n.atendente ? ` · ${n.atendente.trim()}` : ""}</div></span>
              <span className="v" style={{ color: "#b91c1c" }}>{n.nota != null ? `nota ${n.nota}` : "insatisfeito"} · {n.quando.split("-").reverse().slice(0, 2).join("/")}</span>
            </button>
          ))}
        </section>

        <section className="fbh-cartao" style={{ ["--k" as string]: "#64748b" }}>
          <h3><span className="fbn-ico"><i className="fa-solid fa-hourglass-end" /></span> Coisas paradas <small>{p.parados.length}</small></h3>
          {p.parados.length === 0 ? <div style={{ fontSize: 13.5, color: "var(--t2)" }}>Nada parado. Tudo andando.</div> : p.parados.slice(0, 12).map((x) => (
            <div key={x.id} className="fbh-item">
              <span>{x.titulo}<div className="d">{x.detalhe}</div></span>
              <span className="v">{x.tipo === "registro" ? `${x.dias} dias` : <i className="fa-solid fa-phone" style={{ color: "#b91c1c" }} />}</span>
            </div>
          ))}
        </section>

        <section className="fbh-cartao" style={{ ["--k" as string]: "#dc2626" }}>
          <h3><span className="fbn-ico"><i className="fa-solid fa-filter" /></span> Fila por motivo <small>{filtrarGrupo ? "clique para filtrar a aba Hoje" : "clientes com cada motivo"}</small></h3>
          <Barras cor="#dc2626" onClick={filtrarGrupo ? (k) => filtrarGrupo(k as Grupo) : undefined} itens={GRUPOS.map((g) => ({ rot: g.rot, v: dist.porGrupo[g.k], k: g.k, extra: g.ajuda }))} />
          <div style={{ fontSize: 12.5, color: "var(--t2)" }}>{hoje.clientes.length.toLocaleString("pt-BR")} clientes na fila · {dist.varios.toLocaleString("pt-BR")} com mais de um motivo · {dist.urgentes} urgentes</div>
        </section>

        <section className="fbh-cartao" style={{ ["--k" as string]: "#0f766e" }}>
          <h3><span className="fbn-ico"><i className="fa-solid fa-chart-line" /></span> Conversão da semana <small>{s.ligacoes} ligações · {s.contato} atenderam</small></h3>
          <Barras cor="#0f766e" itens={p.semana.porPessoa.map((x) => ({ rot: x.pessoa, v: x.conversoes, extra: `${x.ligacoes} ligações · ${x.contato} atenderam · ${x.taxa ?? 0}% viraram serviço ou venda` }))} />
          <div className="fbn-selos">
            {Object.entries(p.semana.porDesfecho).sort((a, b) => b[1] - a[1]).map(([d, n]) => (
              <span key={d} className="fbn-pilula">{DESFECHO_POR_VALOR[d as Desfecho]?.rotulo || d} · {n}</span>
            ))}
          </div>
        </section>

        <section className="fbh-cartao" style={{ ["--k" as string]: "#7c3aed" }}>
          <h3><span className="fbn-ico"><i className="fa-solid fa-ranking-star" /></span> Como está a fila <small>clientes por pontos</small></h3>
          <Barras cor="#7c3aed" itens={Object.entries(dist.faixas).map(([rot, v]) => ({ rot: rot === "esperando" ? "esperando" : `${rot} pontos`, v }))} />
        </section>
      </div>
    </div>
  );
}

/** Só estas viram "urgente" na fila (R1 marcada urgente pelo robô; R7 com o prazo em 30 dias). */
const PODE_URGENTE: RegraOportunidade[] = ["R1_revisao", "R7_garantia_risco"];

const FRASE_REGRA: Record<RegraOportunidade, string> = {
  R1_revisao: "Trator na garantia com a revisão de garantia vencendo: ligar para agendar.",
  R2_sem_os: "Cliente com máquina que não passa na oficina há meses: perguntar como está e oferecer revisão.",
  R3_upsell: "Cliente que comprou máquina com a gente e esfriou: sondar implemento ou trator novo.",
  R4_followup: "Serviço já feito: conferir se ficou bom (retorno de pós-venda).",
  R5_pecas: "Cliente que comprava peças e parou de comprar: oferecer reposição ou kit de manutenção.",
  R6_fora_garantia: "Trator ou implemento que saiu da garantia: oferecer revisão paga ou plano de manutenção.",
  R7_garantia_risco: "Cheque de revisão perto do prazo: sem ele o cliente perde a garantia.",
  R8_cadastro: "Falta telefone ou e-mail no cadastro: confirmar na ligação e corrigir.",
};
const PESO_TEXTO: Partial<Record<RegraOportunidade, string>> = {
  R1_revisao: "110 (130 se o robô marcou urgente)",
  R7_garantia_risco: "100 (130 se o prazo vence em até 30 dias)",
  R2_sem_os: "40 a 60 (sobe com o tempo sem serviço)",
  R5_pecas: "15 a 25 (sobe com os meses sem comprar)",
  R6_fora_garantia: "15 trator · 10 implemento",
  R8_cadastro: "12 (6 se o cliente não aparece há tempo)",
};

/** Regras do robô. Na página de teste recebe o `hoje`; na tela de verdade (/feedbacks/robo) recebe as
 *  oportunidades abertas e um clique por regra (filtra a triagem logo abaixo). */
export function AbaRobo({ hoje, abertas: abertasProp, construcao = true, regraSel, onRegra, carregando = false }: {
  hoje?: Pick<Hoje, "oportunidadesAbertas" | "exemplo">; abertas?: Oportunidade[]; construcao?: boolean;
  regraSel?: RegraOportunidade | null; onRegra?: (r: RegraOportunidade) => void; carregando?: boolean;
}) {
  const abertas = abertasProp ?? hoje?.oportunidadesAbertas ?? EM_BRANCO;
  const exemplo = hoje?.exemplo ?? false;
  const porRegra = useMemo(() => {
    const m = new Map<RegraOportunidade, { n: number; clientes: Set<string> }>();
    for (const r of TODAS_REGRAS) m.set(r, { n: 0, clientes: new Set() });
    for (const o of abertas) { const x = m.get(o.regra); if (x) { x.n++; x.clientes.add(o.codigo_omie || o.cliente_nome); } }
    return m;
  }, [abertas]);
  const total = abertas.length;

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <p className="fbf-explica">O <b>robô de oportunidades</b> roda todo dia às 06:00 e procura clientes para chamar em 8 regras. Aqui está o que cada regra quer dizer, quantas estão abertas agora e <b>quanto cada uma pesa</b> na fila da aba Hoje. {exemplo ? <>Contagens dos <b>dados de exemplo</b>.</> : <><b>{total.toLocaleString("pt-BR")}</b> oportunidades abertas agora.</>}</p>
      {construcao && <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <span className="fbh-construcao"><i className="fa-solid fa-person-digging" /> Em construção: mudar os pesos e a cota por aqui (nesta entrega é só leitura)</span>
        <span className="fbh-construcao"><i className="fa-solid fa-person-digging" /> Em construção: ligar e desligar regras e recalcular agora (hoje fica na tela de Oportunidades)</span>
      </div>}
      <div style={{ display: "grid", gap: 8 }}>
        {TODAS_REGRAS.map((r, i) => {
          const x = porRegra.get(r)!;
          const g = GRUPO[GRUPO_DA_REGRA[r]];
          const cor = REGRA_ROTULO[r].cor;
          return (
            <div key={r} className={`fbh-regra ${onRegra ? "clica" : ""} ${regraSel === r ? "on" : ""}`} style={{ ["--k" as string]: cor, animationDelay: `${i * 50}ms` }}
              onClick={onRegra ? () => onRegra(r) : undefined} role={onRegra ? "button" : undefined} tabIndex={onRegra ? 0 : undefined}
              onKeyDown={onRegra ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onRegra(r); } } : undefined}
              aria-pressed={onRegra ? regraSel === r : undefined} title={onRegra ? "Clique para ver só esta regra na lista abaixo" : undefined}>
              <span className="fbn-ico"><i className={`fa-solid ${g.ico}`} /></span>
              <div style={{ minWidth: 0 }}>
                <h4>{REGRA_ROTULO[r].titulo}</h4>
                <p>{FRASE_REGRA[r]}</p>
                <div className="fbn-selos" style={{ marginTop: 6 }}>
                  <span className="fbn-pilula" style={{ ["--k" as string]: g.cor }}><i className={`fa-solid ${g.ico}`} /> chip {g.rot}</span>
                  <span className="fbn-pilula">peso na fila: {PESO_TEXTO[r] || String(PESO_REGRA[r])}</span>
                  <span className="fbn-pilula" style={{ ["--k" as string]: PODE_URGENTE.includes(r) ? "#dc2626" : "#64748b" }}>{PODE_URGENTE.includes(r) ? "pode ser urgente" : "nunca urgente"}</span>
                </div>
              </div>
              <div className="num"><b>{carregando ? "…" : <Contador valor={x.n} />}</b><small>abertas · {x.clientes.size.toLocaleString("pt-BR")} clientes</small></div>
            </div>
          );
        })}
      </div>

      <section className="fbh-cartao" style={{ ["--k" as string]: "#dc2626" }}>
        <h3><span className="fbn-ico"><i className="fa-solid fa-scale-balanced" /></span> A régua da fila Hoje <small>só leitura</small></h3>
        {[
          ["Cota do dia", `${COTA_PADRAO} clientes (dá para mudar na aba Hoje, só para você)`],
          ["Pós-serviço (OS faturada)", "100 entre 3 e 7 dias depois do serviço; cai até 15 dias; depois disso 20. Valor da OS até +40, insatisfeito +80"],
          ["Reativação (RFM aberto)", `prioridade (urgente 90, normal 50, inativo 15) + até 40 pelo tempo sem vir + ${BONUS_RFM_ABERTO} por já ter atendimento aberto`],
          ["Revisão Mahindra", `atrasada 80 a 140 (urgente até ${DIAS_URGENTE_REVISAO} dias de atraso) · vence em 30 dias 90 a 120 · parou de fazer na loja 20 a 45 · +10 com previsão confiável`],
          ["Retorno combinado", `+${BONUS_RETORNO} quando a data chega (urgente se passou há 2 dias ou mais); antes disso o cliente espera`],
          ["Vários motivos", `o mais forte inteiro + ${Math.round(FRACAO_EXTRA * 100)}% de cada outro, até +${TETO_BONUS}`],
          ["Sem telefone", `−${PENALIDADE_SEM_TELEFONE}`],
          ["Tentativas", "tentou hoje → volta amanhã; 3 ligações sem resposta → WhatsApp (−20)"],
        ].map(([a, b]) => <div key={a} className="fbh-item"><span>{a}</span><span className="d" style={{ textAlign: "right", maxWidth: "60%" }}>{b}</span></div>)}
      </section>
    </div>
  );
}
