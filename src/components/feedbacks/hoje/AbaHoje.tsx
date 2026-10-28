"use client";
// Aba "Hoje" (principal): números do topo, chips de filtro, a cota do dia e o cliente aberto ao lado.
// Três jeitos de mostrar a mesma fila, para o José escolher (docs/padrao-telas.md §5):
//   Opção 1 · Lista + painel ao lado (recomendada; no celular o painel vira gaveta)
//   Opção 2 · Um cliente por vez, grande, com os próximos ao lado
//   Opção 3 · Cartões em grade; o cliente abre numa gaveta lateral
import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { estadoRevisaoCliente, GRUPOS, ROTULO_ESTADO_REVISAO, separarPorRevisao, TETO_BONUS, type ClienteHoje, type EstadoRevisaoCliente, type Grupo } from "@/lib/feedbacks/hoje";
import type { Hoje } from "./useHoje";
import PainelCliente from "./PainelCliente";
import { Contador, GRUPO, LinhaCliente } from "./kit";

const OPCOES = [
  { n: 1, nome: "Lista + painel ao lado", resumo: "A fila do dia à esquerda; clique num cliente e a ficha com o concluir abre à direita (no celular, de baixo para cima). Concluiu, o próximo já abre." },
  { n: 2, nome: "Um cliente por vez", resumo: "O cliente da vez grande na tela, com tudo para a ligação; ao lado, quem vem depois. Concluiu ou pulou, a tela já mostra o próximo." },
  { n: 3, nome: "Cartões", resumo: "Os clientes do dia em cartões lado a lado, para ver de longe os motivos de cada um. Clique num cartão e a ficha abre numa gaveta." },
];
const PASSO_LISTA = 40;

export default function AbaHoje({ hoje, gerente, irPainel, topo, selKey, setSelKey, opcaoInicial = 1, real = false }: { hoje: Hoje; gerente: boolean; irPainel: () => void; topo: ReactNode; selKey: string | null; setSelKey: (k: string | null) => void; opcaoInicial?: number; real?: boolean }) {
  // real = tela de verdade (/feedbacks): só a Opção 1 (escolhida pelo José), sem a explicação da página de teste
  const [opcaoEscolhida, setOpcao] = useState(opcaoInicial);
  const opcao = real ? 1 : opcaoEscolhida;
  const [pulados, setPulados] = useState<string[]>([]);
  const { fila } = hoje;

  // José, 26/10/2026: "separa as que venceu com que vai vencer" — revisão vencida, depois a que vai
  // vencer, depois os outros motivos (cada bloco na ordem dos pontos); o "Próximo" segue essa ordem.
  const ordemHoje = useMemo(() => {
    const p = new Set(pulados);
    const b = separarPorRevisao(fila.hoje.filter((c) => !p.has(c.key)));
    return [...b.vencida, ...b.vai_vencer, ...b.outros, ...fila.hoje.filter((c) => p.has(c.key))];
  }, [fila.hoje, pulados]);
  const todos = useMemo(() => [...fila.hoje, ...fila.depois, ...fila.esperando], [fila]);
  const sel = selKey ? todos.find((c) => c.key === selKey) ?? hoje.clientes.find((c) => c.key === selKey) ?? null : null;

  /** Depois de concluir: abre o próximo da lista do dia. */
  const proximoDe = (key: string) => {
    const i = ordemHoje.findIndex((c) => c.key === key);
    const prox = ordemHoje.slice(i + 1).find((c) => c.key !== key) ?? ordemHoje.find((c) => c.key !== key) ?? null;
    return () => setSelKey(prox?.key ?? null);
  };

  const k = hoje.numeros;
  const tiles: { rot: string; v: number; ico: string; cor: string; on: boolean; clique: () => void; titulo: string }[] = [
    { rot: "para hoje", v: k.paraHoje, ico: "fa-list-check", cor: "#dc2626", on: false, titulo: "Os melhores clientes para atender hoje (a cota). Clique para limpar os filtros.",
      clique: () => { hoje.setGrupos(new Set()); hoje.setSoAcao(""); hoje.setBusca(""); hoje.setTecnico(""); hoje.setMinhaArea(false); } },
    { rot: "feitos hoje", v: k.feitosHoje, ico: "fa-circle-check", cor: "#16a34a", on: false, titulo: "Clientes com algum motivo fechado hoje (atendimento concluído, oportunidade atendida, revisão resolvida).",
      clique: () => (gerente ? irPainel() : hoje.avisar(`${k.feitosHoje} cliente(s) com algo fechado hoje.`, "ok")) },
    { rot: "sem resposta", v: k.semResposta, ico: "fa-comment-dots", cor: "#d97706", on: hoje.soAcao === "whatsapp", titulo: "Três ligações sem resposta: a fila manda tentar pelo WhatsApp. Clique para ver só eles.",
      clique: () => hoje.setSoAcao(hoje.soAcao === "whatsapp" ? "" : "whatsapp") },
    { rot: "retornos combinados", v: k.retornos, ico: "fa-calendar-check", cor: GRUPO.retornos.cor, on: hoje.grupos.has("retornos"), titulo: "O cliente pediu para falar numa data que já chegou. Clique para filtrar.",
      clique: () => hoje.alternarGrupo("retornos") },
    { rot: "notas baixas (30 dias)", v: k.notasBaixas, ico: "fa-face-frown", cor: "#b91c1c", on: false, titulo: "Pós-serviço com nota de 0 a 6 ou insatisfeito nos últimos 30 dias. Clique para ver no Painel.",
      clique: () => (gerente ? irPainel() : hoje.avisar("As notas baixas ficam no Painel do gerente.", "sim")) },
  ];

  const carregando = hoje.carregando;
  const vazio = !carregando && fila.hoje.length === 0;

  return (
    <div style={{ display: "grid", gap: 14, minWidth: 0 }}>
      {!real && <div className="fbh-opcoes" role="tablist" aria-label="Opções de tela">
        {OPCOES.map((o) => <button key={o.n} type="button" role="tab" aria-selected={opcao === o.n} className={opcao === o.n ? "on" : ""} onClick={() => setOpcao(o.n)}>Opção {o.n} · {o.nome}{o.n === 1 ? " (recomendada)" : ""}</button>)}
      </div>}

      {!real && <p className="fbf-explica"><b>Opção {opcao} — {OPCOES[opcao - 1].nome}.</b> {OPCOES[opcao - 1].resumo} {hoje.exemplo
        ? <>Estes clientes são <b>inventados</b>, um para cada caso (pós-serviço com revisão e peças, retorno vencido, só cadastro, sem telefone…): clique à vontade, nada é gravado e o WhatsApp não abre.</>
        : hoje.simulando && <>Os botões estão em <b>simulação</b>: mudam só esta tela, nada é gravado.</>}</p>}

      {/* "Como ler" e o topo (cota, Atualizar) numa linha só — José, 28/10/2026: "melhora esse gap, espaço em branco" */}
      <div className="fbh-cabeca">

      <details className="fbf-como" style={{ flex: "1 1 320px", minWidth: 0 }}>
        <summary><i className="fa-regular fa-circle-question" style={{ color: "var(--c)" }} /> Como ler esta tela</summary>
        <ul>
          <li><b>Ligações do dia</b> é a lista de quem ligar, juntando o que antes ficava espalhado: <b>Pós-serviço</b> (o antigo CRM: OS faturada há poucos dias), <b>Reativação</b> (o antigo RFM: cliente que sumiu), <b>Garantia</b> (cheque de revisão perto de vencer), <b>Peças</b>, <b>Cadastro</b> e <b>Retornos combinados</b> (a antiga Agenda). Escolha a lista em cima: <b>Pós-serviço (CRM)</b>, <b>Reativação (RFM)</b>, <b>Outros</b> ou <b>Tudo junto</b>; cada uma tem a sua cota do dia.</li>
          <li>As <b>revisões Mahindra</b> não ficam aqui: estão na aba <b>Radar Tratores → Controle de Revisões</b>.</li>
          <li>Cada cliente aparece <b>uma vez só</b>, com a lista <b>Por que ligar</b>: uma linha por motivo, o tipo à esquerda (Pós-serviço, Reativação, Risco de perder garantia, Peças, Cadastro…) e o detalhe ao lado; o primeiro é o principal. À direita, o que fazer e os pontos de prioridade</li>
          <li>A ordem é pelos <b>pontos de hoje</b> (passe o mouse nos pontos ou abra o cliente para ver a conta). Pós-serviço de 3 a 7 dias, revisão atrasada e retorno combinado vencido pesam mais; peças, fora de garantia e cadastro pesam pouco e nunca são urgentes.</li>
          <li>Vários motivos no mesmo cliente <b>somam</b>: o mais forte vale inteiro e cada um dos outros vale metade, até +{TETO_BONUS}. Sem telefone perde pontos.</li>
          <li><b>Hoje</b> mostra os {hoje.cota} melhores (o número muda ali em cima); o resto fica em <b>Depois</b>. Quem já foi tentado hoje volta amanhã; quem pediu para falar numa data espera até ela.</li>
          <li>Os números do topo: <b>para hoje</b> = quantos entram na cota (clique limpa os filtros) · <b>feitos hoje</b> = clientes com algo fechado hoje · <b>sem resposta</b> = 3 ligações sem atender, tentar pelo WhatsApp (clique filtra) · <b>retornos combinados</b> = data pedida pelo cliente que chegou (clique filtra) · <b>notas baixas</b> = pós-serviço com nota 0 a 6 nos últimos 30 dias.</li>
          <li>Os chips filtram por tipo de motivo (dá para marcar mais de um). <b>Minha área</b> mostra só o que é da sua função; <b>Só urgentes</b>, só os marcados com raio. A busca procura nome, telefone, cidade e motivo.</li>
          <li>Abra o cliente e diga <b>como foi</b>: um desfecho só fecha todos os motivos que fizerem sentido — a lista do que vai acontecer aparece antes de confirmar e dá para marcar ou desmarcar.</li>
          <li>Nota de 0 a 6 ou cliente insatisfeito avisa o gerente do pós-vendas{real ? "" : " (só gravando de verdade)"}. Clientes “não contatar” não aparecem.</li>
        </ul>
      </details>
        <div style={{ flex: "0 1 auto", marginLeft: "auto" }}>{topo}</div>
      </div>

      <div className="fbh-conts">
        {tiles.map((t, i) => (
          <button key={t.rot} type="button" className={`fbh-cont ${t.on ? "on" : ""}`} style={{ ["--k" as string]: t.cor, animationDelay: `${i * 60}ms` }} onClick={t.clique} title={t.titulo}>
            <span className="fbn-ico"><i className={`fa-solid ${t.ico}`} /></span>
            <span><b>{carregando ? "…" : <Contador valor={t.v} />}</b><small>{t.rot}</small></span>
          </button>
        ))}
      </div>

      {/* Por que ligar (José, 26/10: "melhora esses botões, deixa de uma outra forma") — cartões com
          o número grande e o que cada um quer dizer; "Todos" limpa. Dá para marcar mais de um. */}
      {/* José, 26/10/2026: "deixa mais as revisões, e os outros mais ocultos" — Revisões em destaque;
          os outros motivos ficam recolhidos numa linha discreta (abrem no clique). */}
      {(() => {
        const rev = GRUPOS.find((g) => g.k === "revisoes")!;
        const onRev = hoje.grupos.has("revisoes");
        // tela de verdade (28/10/2026): as revisões moram no Radar Tratores; aqui só sobra a garantia (cheque)
        const outros = real ? GRUPOS.map((g) => (g.k === "revisoes" ? { ...g, rot: "Garantia (cheques)", ico: "fa-shield-halved" } : g)) : GRUPOS.filter((g) => g.k !== "revisoes");
        const marcadosOutros = outros.filter((g) => hoje.grupos.has(g.k));
        return (
          <>
            {real ? (
              <a className="fbh-rev" href="/feedbacks/tratores?aba=revisoes" style={{ ["--k" as string]: rev.cor, textDecoration: "none" }}>
                <span className="i"><i className="fa-solid fa-tractor" /></span>
                <span className="tx">
                  <span className="r">As revisões Mahindra ficam na aba Radar Tratores</span>
                  <small>Aqui são só as ligações de pós-serviço, reativação, peças, cadastro e retornos. Revisão atrasada ou vencendo de cada trator: Radar Tratores → Controle de Revisões.</small>
                </span>
                <span className="acao">Abrir o Controle de Revisões <i className="fa-solid fa-arrow-right" /></span>
              </a>
            ) : (
            <button type="button" className={`fbh-rev ${onRev ? "on" : ""}`} style={{ ["--k" as string]: rev.cor }} aria-pressed={onRev}
              onClick={() => hoje.setGrupos(onRev ? new Set() : new Set(["revisoes"]))} title={rev.ajuda}>
              <span className="i"><i className="fa-solid fa-tractor" /></span>
              <span className="tx">
                <b>{hoje.porGrupo.revisoes}</b>
                <span className="r">Revisões Mahindra para oferecer</span>
                <small>Tratores com revisão atrasada, vencendo ou que pararam de fazer revisão na loja — pela média de uso de cada um.</small>
              </span>
              <span className="acao">{onRev ? <><i className="fa-solid fa-xmark" /> Mostrar todos</> : <>Ver só revisões <i className="fa-solid fa-arrow-right" /></>}</span>
            </button>
            )}
            {real && <ListasDoDia hoje={hoje} />}
            {/* tela de verdade: os 4 cartões das listas substituem os chips (José, 28/10/2026: "muitos filtros, confundindo") */}
            {!real && <details className="fbh-outros" open={marcadosOutros.length > 0 || undefined}>
              <summary>
                <i className="fa-solid fa-chevron-right seta" /> Outros motivos
                <span className="n">{outros.reduce((t, g) => t + hoje.porGrupo[g.k], 0)}</span>
                {marcadosOutros.length > 0 && <span className="marc">filtrando: {marcadosOutros.map((g) => g.rot).join(", ")}</span>}
              </summary>
              <div className="fbh-outros-lista">
                <button type="button" className={`fbn-chip ${hoje.grupos.size === 0 ? "on" : ""}`} style={{ ["--k" as string]: "#475569" }} onClick={() => hoje.setGrupos(new Set())}>
                  <i className="fa-solid fa-layer-group" /> Todos <span className="n">{hoje.basicos.length}</span>
                </button>
                {outros.map((g) => (
                  <button key={g.k} type="button" className={`fbn-chip ${hoje.grupos.has(g.k) ? "on" : ""}`} style={{ ["--k" as string]: g.cor }} title={g.ajuda}
                    aria-pressed={hoje.grupos.has(g.k)} onClick={() => hoje.alternarGrupo(g.k)}>
                    <i className={`fa-solid ${g.ico}`} /> {g.rot} <span className="n">{hoje.porGrupo[g.k]}</span>
                  </button>
                ))}
              </div>
            </details>}
          </>
        );
      })()}

      <div className="fbh-filtros">
        <div className="fbh-chaves">
          {(!real || hoje.area) && <button type="button" className={`fbh-chave ${hoje.minhaArea ? "on" : ""}`} style={{ ["--k" as string]: "#0369a1" }} disabled={!hoje.area} aria-pressed={hoje.minhaArea}
            title={hoje.area ? `Só o que é da área ${hoje.area.area}` : "Sua função não tem área definida (Ajustes da área no Atendimento)"} onClick={() => hoje.setMinhaArea(!hoje.minhaArea)}>
            <span className="sw" /> Minha área{hoje.area ? ` · ${hoje.area.area}` : ""}
          </button>}
          <button type="button" className={`fbh-chave ${hoje.soAcao === "urgente" ? "on" : ""}`} style={{ ["--k" as string]: "#dc2626" }} aria-pressed={hoje.soAcao === "urgente"} onClick={() => hoje.setSoAcao(hoje.soAcao === "urgente" ? "" : "urgente")}>
            <span className="sw" /> Só urgentes <span className="n">{hoje.basicos.filter((c) => c.urgente).length}</span>
          </button>
        </div>
        <label className="fbn-busca">
          <i className="fa-solid fa-magnifying-glass" />
          <input type="text" value={hoje.busca} onChange={(e) => hoje.setBusca(e.target.value)} placeholder="Buscar cliente, telefone, cidade ou motivo" />
          {hoje.busca && <button type="button" className="fbn-acao cinza" style={{ height: 26, padding: "0 8px", border: 0 }} onClick={() => hoje.setBusca("")} aria-label="Limpar a busca"><i className="fa-solid fa-xmark" /></button>}
        </label>
        <select className="fbn-campo" value={hoje.tecnico} onChange={(e) => hoje.setTecnico(e.target.value)} aria-label="Técnico">
          <option value="">Todos os técnicos</option>
          {hoje.tecnicos.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {hoje.erro && <div className="fbn-erro">Erro: {hoje.erro}</div>}
      {hoje.avisos.map((a) => <div key={a} className="fbf-aviso"><i className="fa-solid fa-triangle-exclamation" /><span>{a}</span></div>)}
      {!hoje.exemplo && hoje.carregandoRev && !carregando && <div className="fbf-aviso" style={{ background: "var(--soft)", borderColor: "var(--b)" }}><i className="fa-solid fa-circle-notch fa-spin" style={{ color: "var(--t3)" }} /><span>Calculando a previsão das revisões Mahindra… os clientes com revisão entram na fila assim que terminar.</span></div>}

      {carregando ? <div className="fbn-vazio"><i className="fa-solid fa-circle-notch fa-spin" /> Juntando atendimentos, oportunidades, revisões e retornos…</div>
        : vazio ? <div className="fbn-vazio">{hoje.clientes.length ? "Nenhum cliente com estes filtros." : "Ninguém para atender hoje. Bom trabalho."}</div>
        : opcao === 1 ? <Opcao1 hoje={hoje} lista={ordemHoje} sel={sel} setSel={setSelKey} proximoDe={proximoDe} />
        : opcao === 2 ? <Opcao2 hoje={hoje} lista={ordemHoje} sel={sel} setSel={setSelKey} proximoDe={proximoDe} pular={(key) => { setPulados((p) => [...p.filter((x) => x !== key), key]); proximoDe(key)(); }} />
        : <Opcao3 hoje={hoje} lista={ordemHoje} sel={sel} setSel={setSelKey} />}
    </div>
  );
}

/** José, 28/10/2026: "separar a ligação diária de CRM e RFM" — uma lista por vez: Pós-serviço (CRM),
 *  Reativação (RFM), os outros motivos ou tudo junto. Cada lista tem a sua cota do dia. Usa o mesmo
 *  filtro de grupos dos chips (um cliente com os dois motivos aparece nas duas). */
const LISTAS: { id: string; rot: string; sub: string; ico: string; cor: string; grupos: Grupo[] }[] = [
  { id: "crm", rot: "Pós-serviço", sub: "CRM · OS faturada há poucos dias", ico: "fa-screwdriver-wrench", cor: "#dc2626", grupos: ["pos_servico"] },
  { id: "rfm", rot: "Reativação", sub: "RFM · cliente que sumiu", ico: "fa-user-clock", cor: "#6366f1", grupos: ["reativacao"] },
  { id: "outros", rot: "Outros", sub: "garantia, peças, cadastro, retornos", ico: "fa-layer-group", cor: "#d97706", grupos: ["revisoes", "pecas", "cadastro", "retornos"] },
  { id: "todos", rot: "Tudo junto", sub: "a fila inteira", ico: "fa-list", cor: "#475569", grupos: [] },
];
function ListasDoDia({ hoje }: { hoje: Hoje }) {
  const igual = (gs: Grupo[]) => gs.length === hoje.grupos.size && gs.every((g) => hoje.grupos.has(g));
  return (
    <div className="fbh-listas" role="tablist" aria-label="Qual lista">
      {LISTAS.map((l) => {
        const on = igual(l.grupos);
        const n = l.grupos.length ? hoje.basicos.filter((c) => c.grupos.some((g) => l.grupos.includes(g))).length : hoje.basicos.length;
        return (
          <button key={l.id} type="button" role="tab" aria-selected={on} className={on ? "on" : ""} style={{ ["--k" as string]: l.cor }} onClick={() => hoje.setGrupos(new Set(l.grupos))}>
            <span className="ic"><i className={`fa-solid ${l.ico}`} /></span>
            <span className="tx"><span className="r">{l.rot} <span className="n">{n.toLocaleString("pt-BR")}</span></span><small>{l.sub}</small></span>
          </button>
        );
      })}
    </div>
  );
}

type PropsOp = { hoje: Hoje; lista: ClienteHoje[]; sel: ClienteHoje | null; setSel: (k: string | null) => void };

function Resto({ hoje, setSel, sel, grade = false }: { hoje: Hoje; setSel: (k: string) => void; sel: ClienteHoje | null; grade?: boolean }) {
  const [nDepois, setNDepois] = useState(PASSO_LISTA);
  const [nEsp, setNEsp] = useState(PASSO_LISTA);
  const { depois, esperando } = hoje.fila;
  const caixa = grade ? "fbh-grade" : "fbh-sec";
  return (
    <>
      {depois.length > 0 && (
        <details className="fbh-depois">
          <summary><i className="fa-solid fa-layer-group" style={{ color: "var(--t3)" }} /> Depois <span className="n">{depois.length.toLocaleString("pt-BR")}</span> <small style={{ color: "var(--t2)" }}>dá para atender, mas vale menos que os de hoje</small></summary>
          <div className={caixa}>{depois.slice(0, nDepois).map((c, i) => <LinhaCliente key={c.key} c={c} pos={hoje.cota + i + 1} sel={sel?.key === c.key} onClick={() => setSel(c.key)} atraso={i} />)}</div>
          {depois.length > nDepois && <button type="button" className="fbn-btn fbh-mais" onClick={() => setNDepois((n) => n + PASSO_LISTA * 2)}>Mostrar mais ({(depois.length - nDepois).toLocaleString("pt-BR")})</button>}
        </details>
      )}
      {esperando.length > 0 && (
        <details className="fbh-depois">
          <summary><i className="fa-solid fa-hourglass-half" style={{ color: "var(--t3)" }} /> Esperando <span className="n">{esperando.length}</span> <small style={{ color: "var(--t2)" }}>tentou hoje, retorno combinado para outro dia ou ainda cedo</small></summary>
          <div className={caixa}>{esperando.slice(0, nEsp).map((c, i) => <LinhaCliente key={c.key} c={c} pos={null} sel={sel?.key === c.key} onClick={() => setSel(c.key)} atraso={i} />)}</div>
          {esperando.length > nEsp && <button type="button" className="fbn-btn fbh-mais" onClick={() => setNEsp((n) => n + PASSO_LISTA * 2)}>Mostrar mais</button>}
        </details>
      )}
    </>
  );
}

/** A lista do dia com um cabeçalho em cada bloco: revisão vencida · vai vencer · outros motivos. */
function ListaEmBlocos({ lista, sel, setSel }: { lista: ClienteHoje[]; sel: ClienteHoje | null; setSel: (k: string) => void }) {
  const estados = lista.map((c) => estadoRevisaoCliente(c) ?? "outros");
  const conta = (e: EstadoRevisaoCliente | "outros") => estados.filter((x) => x === e).length;
  const algumBloco = estados.some((e) => e !== "outros");
  return (
    <>
      {lista.map((c, i) => {
        const e = estados[i];
        const novoBloco = algumBloco && (i === 0 || estados[i - 1] !== e);
        const r = e === "outros" ? { titulo: "Outros motivos", ajuda: "pós-serviço, retorno, reativação, peças, cadastro…", cor: "#475569", ico: "fa-layer-group" } : ROTULO_ESTADO_REVISAO[e];
        return (
          <Fragment key={c.key}>
            {novoBloco && (
              <div className="fbh-bloco" style={{ ["--k" as string]: r.cor }}>
                <span className="fbn-ico p"><i className={`fa-solid ${r.ico}`} /></span>
                <b>{r.titulo}</b><span className="n">{conta(e)}</span><small>{r.ajuda}</small>
              </div>
            )}
            <LinhaCliente c={c} pos={i + 1} sel={sel?.key === c.key} onClick={() => setSel(c.key)} atraso={i} />
          </Fragment>
        );
      })}
    </>
  );
}

function CabHoje({ hoje, n }: { hoje: Hoje; n: number }) {
  return <div className="fbh-sec-cab"><i className="fa-solid fa-sun" style={{ color: "#d97706" }} /> Hoje <span className="n">{n}</span><small>os {hoje.cota} melhores pela pontuação</small></div>;
}

// José, 26/10/2026: "tem que abrir um modal e não a aba lateral quando a gente clicar no cliente" —
// a lista ocupa a tela toda e o cliente abre numa janela; concluiu, a janela já mostra o próximo.
function Opcao1({ hoje, lista, sel, setSel, proximoDe }: PropsOp & { proximoDe: (k: string) => () => void }) {
  const idx = sel ? lista.findIndex((c) => c.key === sel.key) : -1;
  return (
    <div style={{ display: "grid", gap: 12, minWidth: 0 }}>
      <div className="fbh-sec">
        <CabHoje hoje={hoje} n={lista.length} />
        <ListaEmBlocos lista={lista} sel={sel} setSel={setSel} />
      </div>
      <Resto hoje={hoje} sel={sel} setSel={setSel} />
      {sel && (
        <JanelaCliente titulo={idx >= 0 ? `${idx + 1}º de ${lista.length} de hoje` : "Cliente"} onFechar={() => setSel(null)}
          anterior={idx > 0 ? () => setSel(lista[idx - 1].key) : undefined} proximo={idx >= 0 && idx < lista.length - 1 ? () => setSel(lista[idx + 1].key) : undefined}>
          <PainelCliente key={sel.key} c={sel} hoje={hoje} onFeito={proximoDe(sel.key)} modal />
        </JanelaCliente>
      )}
    </div>
  );
}

function JanelaCliente({ titulo, onFechar, anterior, proximo, children }: { titulo: string; onFechar: () => void; anterior?: () => void; proximo?: () => void; children: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (document.querySelectorAll("[role='dialog']").length > 1) return; // outra janela por cima (máquina, histórico): o Esc é dela
      onFechar();
    };
    window.addEventListener("keydown", k);
    const ov = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", k); document.body.style.overflow = ov; };
  }, [onFechar]);
  return (
    <div className="fbh-jan-fundo" onClick={onFechar}>
      {/* José, 28/10/2026: janela maior (sem tela cheia) e as setas de anterior/próximo nas laterais */}
      <button type="button" className="fbh-jan-lado" disabled={!anterior} onClick={(e) => { e.stopPropagation(); anterior?.(); }} aria-label="Cliente anterior" title="Cliente anterior"><i className="fa-solid fa-chevron-left" /></button>
      <div className="fbh-jan" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="fbh-jan-cab">
          <span className="t">{titulo}</span>
          <button type="button" className="fbn-acao cinza" onClick={onFechar} aria-label="Fechar (Esc)"><i className="fa-solid fa-xmark" /></button>
        </div>
        <div className="fbh-jan-corpo">{children}</div>
      </div>
      <button type="button" className="fbh-jan-lado" disabled={!proximo} onClick={(e) => { e.stopPropagation(); proximo?.(); }} aria-label="Próximo cliente" title="Próximo cliente"><i className="fa-solid fa-chevron-right" /></button>
    </div>
  );
}

function Opcao2({ hoje, lista, sel, setSel, proximoDe, pular }: PropsOp & { proximoDe: (k: string) => () => void; pular: (k: string) => void }) {
  const atual = sel && lista.some((c) => c.key === sel.key) ? sel : lista[0] ?? sel;
  const idx = atual ? lista.findIndex((c) => c.key === atual.key) : -1;
  const ir = (d: number) => { if (!lista.length) return; setSel(lista[(Math.max(0, idx) + d + lista.length) % lista.length].key); };
  const proximos = idx >= 0 ? lista.slice(idx + 1, idx + 7) : lista.slice(0, 6);
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="fbh-o2">
        <div style={{ display: "grid", gap: 10, minWidth: 0 }}>
          <div className="fbh-o2-nav">
            <span>Cliente <b>{idx >= 0 ? idx + 1 : "—"}</b> de <b>{lista.length}</b> de hoje</span>
            <span style={{ display: "flex", gap: 6 }}>
              <button type="button" className="fbn-acao" onClick={() => ir(-1)}><i className="fa-solid fa-arrow-left" /> Anterior</button>
              {atual && <button type="button" className="fbn-acao cinza" onClick={() => pular(atual.key)} title="Manda para o fim da lista (só nesta tela)"><i className="fa-solid fa-forward" /> Pular</button>}
              <button type="button" className="fbn-acao" onClick={() => ir(1)}>Próximo <i className="fa-solid fa-arrow-right" /></button>
            </span>
          </div>
          {atual ? <PainelCliente key={atual.key} c={atual} hoje={hoje} onFeito={proximoDe(atual.key)} /> : <div className="fbh-lado-vazio">Ninguém na lista de hoje.</div>}
        </div>
        <div className="fbh-prox">
          <p className="fbf-sub" style={{ margin: 0 }}>Depois deste</p>
          {proximos.map((c, i) => <LinhaCliente key={c.key} c={c} pos={idx + i + 2} onClick={() => setSel(c.key)} atraso={i} maxSelos={2} />)}
          {!proximos.length && <div className="fbh-lado-vazio" style={{ padding: 20 }}>É o último de hoje.</div>}
        </div>
      </div>
      <Resto hoje={hoje} sel={sel} setSel={setSel} />
    </div>
  );
}

function Opcao3({ hoje, lista, sel, setSel }: PropsOp) {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <CabHoje hoje={hoje} n={lista.length} />
      <div className="fbh-grade">
        {lista.map((c, i) => <LinhaCliente key={c.key} c={c} pos={i + 1} sel={sel?.key === c.key} onClick={() => setSel(c.key)} atraso={i} maxSelos={4} />)}
      </div>
      <Resto hoje={hoje} sel={sel} setSel={setSel} grade />
      {sel && (
        <>
          <div className="fbf-gaveta-fundo" onClick={() => setSel(null)} />
          <div className="fbf-gaveta" role="dialog" aria-label={sel.nome} style={{ width: "min(600px, 100vw)" }}>
            <div className="fbf-gaveta-cab"><span className="fbf-sub" style={{ margin: 0 }}>Cliente</span><button type="button" className="fbn-acao cinza" onClick={() => setSel(null)} aria-label="Fechar"><i className="fa-solid fa-xmark" /></button></div>
            <PainelCliente key={sel.key} c={sel} hoje={hoje} onFeito={() => setSel(null)} />
          </div>
        </>
      )}
    </div>
  );
}
