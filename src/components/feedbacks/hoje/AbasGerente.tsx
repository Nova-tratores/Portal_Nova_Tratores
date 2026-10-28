"use client";
// Abas do gerente na tela "Hoje": Painel (ao vivo) e Robô de oportunidades (só leitura nesta entrega).
import { useMemo, useState } from "react";
import { BONUS_RETORNO, BONUS_RFM_ABERTO, COTA_PADRAO, DIAS_URGENTE_REVISAO, FRACAO_EXTRA, GRUPOS, GRUPO_DA_REGRA, PENALIDADE_SEM_TELEFONE, PESO_REGRA, TETO_BONUS, distribuicao, type Grupo } from "@/lib/feedbacks/hoje";
import { DESFECHO_POR_VALOR, type Desfecho } from "@/lib/feedbacks/atendimento/chamada";
import { TODAS_REGRAS } from "@/lib/feedbacks/atendimento/areas";
import { REGRA_ROTULO } from "@/lib/feedbacks/atendimento/rotulos";
import type { Oportunidade, RegraOportunidade } from "@/lib/feedbacks/types";
import type { Hoje } from "./useHoje";
import { Contador, GRUPO } from "./kit";

const EM_BRANCO: Oportunidade[] = [];
const hora = (t: number) => new Date(t).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

const chaveNome = (n: string) => n.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
const iniciaisDe = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
const minutosTxt = (m: number) => (m >= 120 ? `${Math.floor(m / 60)} h` : `${m} min`);
const CORES_FAIXA = ["#4c1d95", "#6d28d9", "#8b5cf6", "#a78bfa", "#c4b5fd", "#cbd5e1"];

/** Painel → Ao vivo (José, 28/10/2026: "melhora essa tela confusa"): a equipe numa tabela só
 *  (em ligação + feitos hoje + semana), o que o gerente precisa tratar num cartão com abas e a fila
 *  do lado. Antes eram 7 cartões soltos, a maioria vazia. */
export function AbaPainel({ hoje, filtrarGrupo }: { hoje: Hoje; filtrarGrupo?: (g: Grupo) => void }) {
  const p = hoje.painel;
  const nomePorKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of hoje.clientes) m.set(c.key, c.nome);
    return m;
  }, [hoje.clientes]);
  const dist = useMemo(() => distribuicao(hoje.clientes), [hoje.clientes]);
  const s = p.semana.total;
  const [tratar, setTratar] = useState<"notas" | "parados">("notas");
  const [tudo, setTudo] = useState(false);

  // uma linha por pessoa juntando as três fontes
  const equipe = useMemo(() => {
    const m = new Map<string, { nome: string; ligacao?: (typeof p.emLigacao)[number]; feitos?: (typeof p.feitosHoje)[number]; semana?: (typeof p.semana.porPessoa)[number] }>();
    const pega = (nome: string) => {
      const k = chaveNome(nome);
      if (!m.has(k)) m.set(k, { nome: nome.trim() });
      return m.get(k)!;
    };
    for (const l of p.emLigacao) pega(l.atendente).ligacao = l;
    for (const x of p.feitosHoje) pega(x.pessoa).feitos = x;
    for (const x of p.semana.porPessoa) pega(x.pessoa).semana = x;
    return [...m.values()].sort((a, b) => Number(!!b.ligacao) - Number(!!a.ligacao) || (b.feitos?.total ?? 0) - (a.feitos?.total ?? 0) || (b.semana?.ligacoes ?? 0) - (a.semana?.ligacoes ?? 0) || a.nome.localeCompare(b.nome));
  }, [p]);
  const maxFeitos = Math.max(1, ...equipe.map((e) => e.feitos?.total ?? 0));

  const grupos = GRUPOS.map((g) => (g.k === "revisoes" && !hoje.exemplo ? { ...g, rot: "Garantia (cheques)" } : g));
  const maxGrupo = Math.max(1, ...grupos.map((g) => dist.porGrupo[g.k]));
  const faixas = Object.entries(dist.faixas);
  const totFaixas = Math.max(1, faixas.reduce((a, [, v]) => a + v, 0));

  const listaTratar = tratar === "notas" ? p.notasBaixas : p.parados;
  const mostrar = tudo ? listaTratar : listaTratar.slice(0, 6);

  const cont = [
    { rot: "em ligação agora", v: p.emLigacao.length, ico: "fa-headset", cor: "#d97706" },
    { rot: "feitos hoje pela equipe", v: p.feitosHoje.reduce((a, x) => a + x.total, 0), ico: "fa-circle-check", cor: "#16a34a" },
    { rot: "notas baixas em 30 dias", v: p.notasBaixas.length, ico: "fa-face-frown", cor: "#b91c1c", ir: "notas" as const },
    { rot: "coisas paradas", v: p.parados.length, ico: "fa-hourglass-end", cor: "#64748b", ir: "parados" as const },
    { rot: `viraram serviço na semana${s.taxa != null ? ` · ${s.taxa}%` : ""}`, v: s.conversoes, ico: "fa-chart-line", cor: "#0f766e" },
  ];

  return (
    <div className="fbp">
      <div className="fbh-cabeca">
        <details className="fbf-como" style={{ flex: "1 1 320px", minWidth: 0 }}>
          <summary><i className="fa-regular fa-circle-question" style={{ color: "var(--c)" }} /> Como ler esta tela</summary>
          <ul>
            <li><b>Equipe</b>: cada pessoa numa linha. Mostra se está em ligação agora (mais de 2 horas aberta é quase sempre esquecimento), quantos atendimentos fez hoje (ligações encerradas + concluídos + oportunidades) e como foi a semana (ligações e quantas viraram serviço ou venda).</li>
            <li><b>Para tratar</b>: <b>notas baixas</b> (pós-serviço com nota de 0 a 6 ou cliente insatisfeito nos últimos 30 dias; clique para abrir o histórico) e <b>coisas paradas</b> (atendimento aberto sem movimento há mais de 15 dias, fora quem espera um retorno combinado, e ligação aberta há mais de 2 horas).</li>
            <li><b>A fila agora</b>: quantos clientes têm cada tipo de motivo; clique numa linha para ver esses clientes nas Ligações do dia. Embaixo, a fila dividida por pontos: quanto mais pontos, mais na frente.</li>
          </ul>
        </details>
        <span className="fbh-vivo" style={{ marginLeft: "auto", paddingTop: 10 }}><span className="pt" /> Ao vivo · atualizado às {hora(hoje.geradoEm)}</span>
      </div>
      {hoje.exemplo && <p className="fbf-explica">Números <b>inventados</b> e coerentes com os clientes de exemplo. Troque para <b>Dados reais</b> lá em cima para ver a equipe de verdade.</p>}

      <div className="fbh-conts">
        {cont.map((t, i) => {
          const zero = !hoje.carregando && t.v === 0;
          const Tag = t.ir ? "button" : "div";
          return (
            <Tag key={t.rot} {...(t.ir ? { type: "button" as const, onClick: () => { setTratar(t.ir!); setTudo(false); document.getElementById("fbp-tratar")?.scrollIntoView({ behavior: "smooth", block: "start" }); } } : {})}
              className={`fbh-cont ${zero ? "fbp-zero" : ""}`} style={{ ["--k" as string]: t.cor, animationDelay: `${i * 60}ms`, cursor: t.ir ? "pointer" : "default" }}>
              <span className="fbn-ico"><i className={`fa-solid ${t.ico}`} /></span>
              <span><b>{hoje.carregando ? "…" : <Contador valor={t.v} />}</b><small>{t.rot}</small></span>
            </Tag>
          );
        })}
      </div>

      <div className="fbp-grade">
        <div className="fbp-col">
          <section className="fbh-cartao" style={{ ["--k" as string]: "#2563eb" }}>
            <h3><span className="fbn-ico"><i className="fa-solid fa-people-group" /></span> Equipe <small>{p.emLigacao.length ? `${p.emLigacao.length} em ligação agora` : "ninguém em ligação agora"}</small></h3>
            {equipe.length === 0 ? (
              <div className="fbp-vazio"><i className="fa-solid fa-mug-hot" /> Ninguém trabalhou na fila hoje nem nesta semana ainda.</div>
            ) : (
              <div className="fbp-equipe">
                <div className="fbp-eq-cab"><span>Pessoa</span><span>Agora</span><span>Feitos hoje</span><span>Semana</span></div>
                {equipe.map((e, i) => (
                  <div key={e.nome} className={`fbp-eq ${e.ligacao ? "ao-vivo" : ""}`} style={{ animationDelay: `${i * 40}ms` }}>
                    <span className="quem"><span className="av">{iniciaisDe(e.nome)}</span><span className="nm">{e.nome}</span></span>
                    <span className="agora">
                      {e.ligacao ? (
                        <span className={`fbp-lig ${e.ligacao.esquecida ? "esq" : ""}`} title={`desde ${hora(Date.parse(e.ligacao.desde))}`}>
                          <i className={`fa-solid ${e.ligacao.esquecida ? "fa-triangle-exclamation" : "fa-headset"}`} />
                          {(e.ligacao.cliente_key && nomePorKey.get(e.ligacao.cliente_key)) || "em ligação"} · {minutosTxt(e.ligacao.minutos)}
                        </span>
                      ) : <span className="livre">livre</span>}
                    </span>
                    <span className="feitos" title={e.feitos ? `${e.feitos.ligacoes} ligação(ões) · ${e.feitos.concluidos} concluído(s) · ${e.feitos.oportunidades} oportunidade(s)` : "nada hoje"}>
                      <span className="trilho"><span className="enche" style={{ width: `${((e.feitos?.total ?? 0) / maxFeitos) * 100}%` }} /></span>
                      <span className="n">{e.feitos?.total ?? 0}</span>
                    </span>
                    <span className="semana">{e.semana ? <>{e.semana.ligacoes} lig. · <span className="conv">{e.semana.conversoes} viraram</span></> : "—"}</span>
                  </div>
                ))}
              </div>
            )}
            {Object.keys(p.semana.porDesfecho).length > 0 && (
              <div className="fbp-desf">
                <span>Como terminaram as {s.ligacoes} ligações da semana ({s.contato} atenderam):</span>
                <div className="fbn-selos">
                  {Object.entries(p.semana.porDesfecho).sort((a, b) => b[1] - a[1]).map(([d, n]) => (
                    <span key={d} className="fbn-pilula">{DESFECHO_POR_VALOR[d as Desfecho]?.rotulo || d} · {n}</span>
                  ))}
                </div>
              </div>
            )}
          </section>

          <section id="fbp-tratar" className="fbh-cartao" style={{ ["--k" as string]: tratar === "notas" ? "#b91c1c" : "#64748b" }}>
            <h3><span className="fbn-ico"><i className="fa-solid fa-clipboard-list" /></span> Para tratar</h3>
            <div className="fbr-seg" role="tablist" aria-label="O que tratar">
              <button type="button" role="tab" aria-selected={tratar === "notas"} className={tratar === "notas" ? "on" : ""} onClick={() => { setTratar("notas"); setTudo(false); }}><i className="fa-solid fa-face-frown" /> Notas baixas · {p.notasBaixas.length}</button>
              <button type="button" role="tab" aria-selected={tratar === "parados"} className={tratar === "parados" ? "on" : ""} onClick={() => { setTratar("parados"); setTudo(false); }}><i className="fa-solid fa-hourglass-end" /> Coisas paradas · {p.parados.length}</button>
            </div>
            {listaTratar.length === 0 ? (
              <div className="fbp-vazio ok"><i className="fa-solid fa-circle-check" /> {tratar === "notas" ? "Nenhuma nota baixa no último mês." : "Nada parado. Tudo andando."}</div>
            ) : (
              <div className="fbp-lista">
                {tratar === "notas" ? p.notasBaixas.slice(0, mostrar.length).map((n) => (
                  <button key={n.id} type="button" className="fbp-li" onClick={() => hoje.abrirHistorico({ nome: n.nome, codigo_omie: n.codigo_omie })}>
                    <span className="av ruim">{n.nota != null ? n.nota : <i className="fa-solid fa-face-frown" />}</span>
                    <span className="tx"><span className="t">{n.nome}</span><span className="d">{n.feedback ? `“${n.feedback.slice(0, 110)}${n.feedback.length > 110 ? "…" : ""}”` : n.status || ""}{n.atendente ? ` · ${n.atendente.trim()}` : ""}</span></span>
                    <span className="q">{n.quando.split("-").reverse().slice(0, 2).join("/")}</span>
                  </button>
                )) : p.parados.slice(0, mostrar.length).map((x) => (
                  <div key={x.id} className="fbp-li">
                    <span className={`av ${x.tipo === "ligacao" ? "ruim" : ""}`}>{x.tipo === "registro" ? <i className="fa-solid fa-hourglass-end" /> : <i className="fa-solid fa-phone" />}</span>
                    <span className="tx"><span className="t">{x.titulo}</span><span className="d">{x.detalhe}</span></span>
                    {x.tipo === "registro" && <span className={`q dias ${x.dias > 60 ? "velho" : ""}`}>{x.dias} dias</span>}
                  </div>
                ))}
                {listaTratar.length > 6 && <button type="button" className="rl-link fbp-mais" onClick={() => setTudo(!tudo)}>{tudo ? "Mostrar menos" : `Ver todos (${listaTratar.length})`}</button>}
              </div>
            )}
          </section>
        </div>

        <section className="fbh-cartao fbp-fila" style={{ ["--k" as string]: "#dc2626" }}>
          <h3><span className="fbn-ico"><i className="fa-solid fa-list-ol" /></span> A fila agora</h3>
          <div className="fbp-fila-n">
            <span><b><Contador valor={hoje.clientes.length} /></b><small>clientes na fila</small></span>
            <span><b className="urg"><Contador valor={dist.urgentes} /></b><small>urgentes</small></span>
            <span><b><Contador valor={dist.varios} /></b><small>com mais de um motivo</small></span>
          </div>
          <div className="fbp-motivos">
            {grupos.map((g, i) => {
              const v = dist.porGrupo[g.k];
              return (
                <button key={g.k} type="button" className="fbp-mot" style={{ ["--k" as string]: g.cor, animationDelay: `${i * 50}ms` }} disabled={!filtrarGrupo} onClick={() => filtrarGrupo?.(g.k)} title={g.ajuda}>
                  <span className="ic"><i className={`fa-solid ${g.ico}`} /></span>
                  <span className="r">{g.rot}</span>
                  <span className="trilho"><span className="enche" style={{ width: `${Math.max(v ? 3 : 0, (v / maxGrupo) * 100)}%` }} /></span>
                  <span className="v">{v.toLocaleString("pt-BR")}</span>
                  {filtrarGrupo && <i className="fa-solid fa-arrow-right seta" />}
                </button>
              );
            })}
          </div>
          <div className="fbp-pontos">
            <span className="tit">A fila por pontos <small>quanto mais pontos, mais na frente</small></span>
            <div className="fbp-pilha">
              {faixas.map(([rot, v], i) => v > 0 && <span key={rot} style={{ flexGrow: v, background: CORES_FAIXA[Math.min(i, CORES_FAIXA.length - 1)] }} title={`${rot === "esperando" ? "esperando" : `${rot} pontos`}: ${v}`} />)}
            </div>
            <div className="fbp-leg">
              {faixas.map(([rot, v], i) => (
                <span key={rot}><i style={{ background: CORES_FAIXA[Math.min(i, CORES_FAIXA.length - 1)] }} />{rot === "esperando" ? "esperando" : `${rot} pts`} <b>{v.toLocaleString("pt-BR")}</b> <small>{Math.round((v / totFaixas) * 100)}%</small></span>
              ))}
            </div>
          </div>
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
