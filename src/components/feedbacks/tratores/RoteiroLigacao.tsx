"use client";
// Roteiro de ligação do Radar de tratores (José, 27/10/2026: escolheu o roteiro entre as opções e
// perguntou "depois que eu clicar que já liguei, acontece o quê?"). Um trator por vez, com o que falar;
// "Liguei" pergunta como foi e GRAVA (quem, quando, resultado) em radar_tratores_contatos — o trator
// sai da fila até o próximo marco (30 → 60 → 90 dias). "Não atendeu" conta a tentativa e manda pro fim
// da fila; "Tem problema" fica em "Precisa retorno" até outra conversa. Regras: lib/revisoes/contatos-radar.ts.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { fetchAuth } from "@/lib/auth/client";
import FotoMaquina from "@/components/comum/FotoMaquina";
import VisualizadorDocumento, { type DocumentoVisualizavel } from "@/components/comum/VisualizadorDocumento";
import { pdfDoCertificado } from "@/lib/mahindra/certificados";
import { Contador } from "../hoje/kit";
import { guardar, lerGuardado } from "./cacheTela";
import type { TratorVendido } from "@/lib/revisoes/vendidos-server";
import {
  DIAS_ANTES_50, ROTULO_MOTIVO, ROTULO_RESULTADO, ordemDaFila, situacaoContato, vermelho,
  type AtendimentoRadar, type Contato, type Estado, type Situacao,
} from "@/lib/revisoes/contatos-radar";

/** O que a ficha precisa para formalizar o atendimento dentro dela (Iniciar → atendeu? → como foi). */
export interface CtxAtendimento {
  s: Situacao;
  /** atendimento já aberto para o trator (por quem quer que seja) */
  aberto: AtendimentoRadar | null;
  /** abrir a ficha já iniciando o atendimento (botão "Iniciar atendimento" do cartão) */
  iniciar?: boolean;
  /** abriu/cancelou: recarrega a lista de "Em atendimento agora" */
  onMudou: () => void;
  onGravado: (c: Contato, aviso: string) => void;
}

// José, 28/10/2026: 11 quadros estava "muito difícil de entender e visualizar" — agora são 3 grupos
// (Precisa de ação · Esperando · Resolvido) e o detalhe vira uma linha de filtros embaixo.
type Grupo = "acao" | "esperando" | "resolvido";
type Filtro = "acao" | "vermelho" | "ligar" | "tentar" | "retorno" | "orcar" | "esperando" | "espera" | "aguarda" | "justificado" | "antes" | "resolvido" | "orcado" | "feita";
const GRUPOS: { id: Grupo; rotulo: string; sub: string; cor: string; ico: string; estados: Estado[]; filtros: { id: Filtro; rotulo: string }[] }[] = [
  { id: "acao", rotulo: "Precisa de ação", sub: "ligar ou abrir o orçamento da 50 h", cor: "#dc2626", ico: "fa-phone-volume", estados: ["ligar", "tentar", "retorno", "orcar"],
    filtros: [{ id: "acao", rotulo: "Todos" }, { id: "vermelho", rotulo: "Passaram de 90 dias" }, { id: "ligar", rotulo: "Para ligar" }, { id: "tentar", rotulo: "Não atenderam" }, { id: "retorno", rotulo: "Falaram de problema" }, { id: "orcar", rotulo: "Falta o orçamento" }] },
  { id: "esperando", rotulo: "Esperando", sub: "falar depois, ainda sem horas, motivo ou antes dos 30 dias", cor: "#0e7490", ico: "fa-hourglass-half", estados: ["espera", "aguarda", "justificado", "antes"],
    filtros: [{ id: "esperando", rotulo: "Todos" }, { id: "espera", rotulo: "Falar de novo depois" }, { id: "aguarda", rotulo: "Ainda não deu as horas" }, { id: "justificado", rotulo: "Com motivo" }, { id: "antes", rotulo: "Antes dos 30 dias" }] },
  { id: "resolvido", rotulo: "Resolvido", sub: "OS da 50 h aberta ou feita", cor: "#16a34a", ico: "fa-circle-check", estados: ["orcado", "feita"],
    filtros: [{ id: "resolvido", rotulo: "Todos" }, { id: "orcado", rotulo: "OS da 50 h aberta" }, { id: "feita", rotulo: "50 h feita" }] },
];
const grupoDe = (f: Filtro): Grupo => GRUPOS.find((g) => g.filtros.some((x) => x.id === f))!.id;
const COR_ESTADO: Record<Estado, string> = { ligar: "#db2777", tentar: "#d97706", retorno: "#ea580c", orcar: "#7c3aed", espera: "#0891b2", aguarda: "#0e7490", justificado: "#64748b", orcado: "#2563eb", feita: "#16a34a", antes: "#94a3b8" };
const VERMELHO = "#dc2626";
const dataBR = (iso: string | null | undefined) => (iso ? new Date(iso.slice(0, 10) + "T12:00:00").toLocaleDateString("pt-BR") : "—");

const hojeISO = () => { const d = new Date(Date.now() - 3 * 3_600_000); return d.toISOString().slice(0, 10); };
const dataHora = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const diaMes = (d: string | null | undefined) => {
  if (!d) return "—";
  if (/^\d{2}\/\d{2}\/\d{4}/.test(d)) return d.slice(0, 5);
  return new Date(d.slice(0, 10) + "T12:00:00").toLocaleDateString("pt-BR").slice(0, 5);
};
const primeiroNome = (n: string | null | undefined) => { const p = (n || "").trim().split(/\s+/)[0] || ""; return p ? p[0] + p.slice(1).toLowerCase() : ""; };

/** O que falar, a partir da situação. */
function oQueFalar(t: TratorVendido, s: Situacao): string[] {
  const nome = primeiroNome(t.cliente?.nome);
  const r50 = t.controle?.revisoes.some((r) => r.horas === 50);
  const f = [`${nome ? nome + ", " : ""}o ${t.modelo} fez ${s.marco ?? t.dias} dias com você — está tudo certo com ele?`];
  if (s.estado === "retorno" && s.conversa?.nota) f.unshift(`Retorno do problema: "${s.conversa.nota}" — já resolveu?`);
  if (s.estado === "orcar") return [
    `${nome ? nome + ", " : ""}vamos agendar a revisão de 50 h do ${t.modelo}? Quantas horas ele está marcando?`,
    "Combinar o dia e o local (vamos até a fazenda ou ele traz).",
    "Depois de combinar, abrir a OS de revisão no POS — é ela que tira o trator do radar.",
  ];
  if (!r50) f.push(t.dias >= 30 ? "Perguntar o horímetro: a revisão de 50 h ainda não foi feita aqui." : "Lembrar da revisão de 50 h (é cortesia da fábrica).");
  if (!t.controle) f.push("Ele não está no controle de revisões — conferir os dados e colocar.");
  if (!t.locais.length) f.push("Perguntar onde o trator está trabalhando (ainda não temos o ponto no mapa).");
  f.push("Precisa de algum implemento ou peça?");
  return f;
}

export default function RoteiroLigacao({ lista, desde, onAbrir: abrirFicha }: { lista: TratorVendido[]; desde: string | null; onAbrir: (t: TratorVendido, ctx?: CtxAtendimento) => void }) {
  const [contatos, setContatos] = useState<Contato[]>(() => lerGuardado<Contato[]>(`contatos:${desde || ""}`) ?? []);
  const [semTabela, setSemTabela] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>("acao");
  const [k, setK] = useState(0);
  /** atendimentos em andamento (radar_tratores_atendimentos) */
  const [atends, setAtends] = useState<AtendimentoRadar[]>([]);
  const [aviso, setAviso] = useState<{ id: number; txt: string } | null>(null);
  const [doc, setDoc] = useState<DocumentoVisualizavel | null>(null);

  const carregar = useCallback(async () => {
    try {
      const r = await fetchAuth(`/api/revisoes/vendidos/contatos${desde ? `?desde=${desde}` : ""}`);
      const j = await r.json().catch(() => ({}));
      if (j.ok) { setContatos(j.contatos || []); setSemTabela(!!j.semTabela); guardar(`contatos:${desde || ""}`, j.contatos || []); }
    } catch { /* sem rede: segue com o que tem */ }
  }, [desde]);
  const carregarAtends = useCallback(async () => {
    try {
      const r = await fetchAuth("/api/revisoes/vendidos/atendimentos");
      const j = await r.json().catch(() => ({}));
      if (j.ok) setAtends((j.atendimentos || []).filter((a: AtendimentoRadar) => !a.chave.startsWith("rev:")));
    } catch { /* sem rede */ }
  }, []);
  // lê fora do render (o fetch resolve depois; o setTimeout deixa isso explícito para o lint)
  useEffect(() => { const id = setTimeout(() => { void carregar(); void carregarAtends(); }, 0); return () => clearTimeout(id); }, [carregar, carregarAtends]);

  const hoje = hojeISO();
  const itens = useMemo(() => {
    const porChave = new Map<string, Contato[]>();
    contatos.forEach((c) => porChave.set(c.chave, [...(porChave.get(c.chave) || []), c]));
    return lista.map((t) => {
      const s = situacaoContato(t.marcos, porChave.get(t.chave) || [], hoje, t.revisao50, t.entrega.data);
      return { t, s, red: vermelho(t.entrega.dias, s) };
    });
  }, [lista, contatos, hoje]);

  const conta = (e: Estado[]) => itens.filter((x) => e.includes(x.s.estado)).length;
  const nGrupo: Record<Grupo, number> = { acao: 0, esperando: 0, resolvido: 0 };
  GRUPOS.forEach((g) => { nGrupo[g.id] = conta(g.estados); });
  const nFiltro = (id: Filtro): number => {
    if (id === "vermelho") return itens.filter((x) => x.red).length;
    const g = GRUPOS.find((x) => x.id === id);
    return g ? nGrupo[g.id] : conta([id as Estado]);
  };
  const grupo = grupoDe(filtro);

  const fila = useMemo(() => {
    if (filtro === "vermelho") return itens.filter((x) => x.red).sort((a, b) => b.t.entrega.dias - a.t.entrega.dias);
    const g = GRUPOS.find((x) => x.id === filtro);
    const quer: Estado[] = g ? g.estados : [filtro as Estado];
    const f = itens.filter((x) => quer.includes(x.s.estado));
    // precisa de ação: os que passaram de 90 dias primeiro; quem não atendeu vai para o fim
    if (grupo === "acao") return f.sort((a, b) => Number(b.s.estado !== "tentar") - Number(a.s.estado !== "tentar") || Number(b.red) - Number(a.red) || ordemDaFila(a, b));
    // esperando: o que volta antes primeiro
    if (grupo === "esperando") {
      const quando = (x: (typeof f)[number]) => x.s.retorno || x.s.previsao?.data50 || x.t.marcos[0]?.data || "9";
      return f.sort((a, b) => (quando(a) < quando(b) ? -1 : 1));
    }
    if (filtro === "feita") return f.sort((a, b) => (a.t.previsao300?.data300 || "9") < (b.t.previsao300?.data300 || "9") ? -1 : 1);
    return f.sort((a, b) => (a.t.dataVenda < b.t.dataVenda ? -1 : 1));
  }, [itens, filtro, grupo]);

  const i = fila.length ? Math.min(k, fila.length - 1) : 0;
  const atual = fila[i];
  // José, 28/10/2026: "quando a gente clicar aqui tem que formalizar o atendimento dentro do modal" — a
  // ficha recebe o que precisa para Iniciar atendimento → atendeu? → como foi, e grava por lá
  const aoGravar = (c: Contato, txt: string) => {
    setContatos((cs) => { const novo = [c, ...cs]; guardar(`contatos:${desde || ""}`, novo); return novo; });
    setAtends((as) => as.filter((a) => a.chave !== c.chave));
    setAviso((a) => ({ id: (a?.id ?? 0) + 1, txt }));
    // a lista encolhe sozinha (o trator sai da fila); "não atendeu" fica, então avança
    if (c.resultado === "nao_atendeu" && filtro !== "acao") setK((x) => x + 1);
  };
  const ctxDe = (t: TratorVendido, iniciar = false): CtxAtendimento | undefined => {
    const x = itens.find((y) => y.t.chave === t.chave);
    if (!x?.s.marco || semTabela) return undefined;
    return { s: x.s, aberto: atends.find((a) => a.chave === t.chave) ?? null, iniciar, onMudou: () => void carregarAtends(), onGravado: aoGravar };
  };
  const onAbrir = (t: TratorVendido, iniciar = false) => abrirFicha(t, ctxDe(t, iniciar));
  const ir = (d: number) => { setK((x) => (fila.length ? (Math.min(x, fila.length - 1) + d + fila.length) % fila.length : 0)); };
  const escolherFiltro = (f: Filtro) => { setFiltro(f); setK(0); };

  useEffect(() => { if (!aviso) return; const id = setTimeout(() => setAviso(null), 4000); return () => clearTimeout(id); }, [aviso]);

  const tel = atual?.t.cliente?.telefone?.replace(/\D/g, "");
  const cor = atual ? (atual.red ? VERMELHO : COR_ESTADO[atual.s.estado]) : "#64748b";

  return (
    <div className="rl">
      <style>{ESTILO_RL}</style>

      {semTabela && (
        <div className="rl-aviso"><i className="fa-solid fa-database" /> Para gravar as ligações falta rodar no banco o SQL <b>radar-tratores-contatos</b>. Até lá dá para ver a fila, mas o &quot;Liguei&quot; não salva.</div>
      )}

      {atends.length > 0 && (
        <div className="rl-andamento">
          <span className="rl-and-t"><i className="fa-solid fa-headset" /> Em atendimento agora <b>{atends.length}</b></span>
          {atends.map((a) => {
            const x = itens.find((y) => y.t.chave === a.chave);
            return (
              <button key={a.id} type="button" disabled={!x} onClick={() => x && onAbrir(x.t)} title="Abrir a ficha e continuar o atendimento">
                <span className="pulso" />
                <span className="tx"><b>{x?.t.cliente?.nome || "Trator fora da lista"}</b><small>{x ? `${x.t.modelo} · ` : ""}{primeiroNome(a.user_nome) || "alguém"} desde {new Date(a.iniciado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</small></span>
              </button>
            );
          })}
        </div>
      )}

      {/* Placar: 3 grupos + a linha de filtros do grupo escolhido */}
      <div className="rl-placar">
        <div className="rl-grupos">
          {GRUPOS.map((g) => (
            <button key={g.id} type="button" className={`rl-grupo ${grupo === g.id ? "on" : ""}`} style={{ ["--k" as string]: g.cor }} onClick={() => escolherFiltro(g.id)}>
              <span className="rl-grupo-ico"><i className={`fa-solid ${g.ico}`} /></span>
              <span className="rl-grupo-tx">
                <span className="rl-grupo-n"><Contador valor={nGrupo[g.id]} /></span>
                <b>{g.rotulo}</b>
                <small>{g.sub}</small>
              </span>
            </button>
          ))}
        </div>
        <div className="rl-subfiltros">
          {GRUPOS.find((g) => g.id === grupo)!.filtros.map((x) => {
            const q = nFiltro(x.id);
            return (
              <button key={x.id} type="button" className={`${filtro === x.id ? "on" : ""} ${x.id === "vermelho" && q ? "alerta" : ""}`} disabled={!q && filtro !== x.id} onClick={() => escolherFiltro(x.id)}>
                {x.rotulo} <span>{q}</span>
              </button>
            );
          })}
        </div>
      </div>

      {!atual ? (
        <div className="rl-vazio">
          <i className="fa-solid fa-mug-hot" />
          <b>{filtro === "acao" ? "Ninguém precisando de ação agora." : filtro === "vermelho" ? "Nenhum trator passou de 90 dias sem orçamento." : "Nada aqui."}</b>
          <span>{filtro === "acao" ? "Todos os tratores que fizeram 30, 60 ou 90 dias já foram atendidos. Quando outro completar ou chegar o dia de falar de novo, ele aparece aqui." : "Escolha outro filtro em cima."}</span>
        </div>
      ) : (
        <>
          {/* clicar em qualquer lugar do cartão abre a ficha (José, 28/10/2026); botões, campos e texto selecionado não */}
          <div className="rl-palco" key={atual.t.chave + filtro} style={{ ["--k" as string]: cor }} onClick={(e) => { if ((e.target as HTMLElement).closest("button, a, input, textarea, select, label, details") || window.getSelection()?.toString()) return; onAbrir(atual.t); }}>
            <button type="button" className="rl-foto" onClick={() => onAbrir(atual.t)} title="Abrir a ficha do trator (cliente, mapa, nota, revisões)"><FotoMaquina modelo={atual.t.modelo} chassi={atual.t.chassi} largura={260} altura={190} cor={cor} /><span className="rl-foto-dica"><i className="fa-solid fa-id-card" /> Abrir a ficha</span></button>
            <div className="rl-corpo">
              <span className="rl-quando">
                {atual.red ? `${atual.t.entrega.dias} dias com o cliente · sem orçamento da 50 h`
                  : atual.s.estado === "espera" ? `Falar de novo em ${dataBR(atual.s.retorno)}`
                  : atual.s.estado === "aguarda" ? `Ainda não deu as horas${atual.s.previsao ? ` · 50 h por volta de ${dataBR(atual.s.previsao.data50)}` : ""}`
                  : atual.s.estado === "justificado" ? `Sem a 50 h · ${atual.s.semRevisao?.motivo ? ROTULO_MOTIVO[atual.s.semRevisao.motivo] : "com motivo"}`
                  : atual.s.estado === "antes" ? `Faz 30 dias em ${diaMes(atual.t.marcos[0]?.data)}`
                  : atual.s.estado === "feita" ? "Revisão de 50 h feita"
                  : atual.s.estado === "orcado" ? `OS da 50 h aberta · ${atual.t.revisao50?.os || ""}`
                  : atual.s.estado === "orcar" ? `Conversou${atual.s.conversa ? ` em ${dataBR(atual.s.conversa.criado_em)}` : ""} · falta o orçamento da 50 h`
                  : atual.s.estado === "retorno" ? `Precisa retorno · ${atual.s.marco} dias`
                  : `Fez ${atual.s.marco} dias${atual.s.atraso >= 7 ? ` · há ${atual.s.atraso} dias sem ligar` : ""}`}
                {atual.s.tentativas > 0 && ` · ${atual.s.tentativas} tentativa${atual.s.tentativas > 1 ? "s" : ""} sem atender`}
              </span>
              <h3><button type="button" className="rl-nome" onClick={() => onAbrir(atual.t)} title="Abrir a ficha do trator">{atual.t.cliente?.nome || "Cliente não achado"}</button></h3>
              <div className="rl-sub">{atual.t.modelo} · {atual.t.cliente?.cidade || "—"} · vendido {diaMes(atual.t.dataVenda)}{atual.t.vendedor ? ` por ${atual.t.vendedor.split(" ")[0].toLowerCase()}` : ""}</div>
              <div className={`rl-entrega ${atual.t.entrega.origem}`}>
                {atual.t.entrega.origem === "mahindra"
                  ? <><i className="fa-solid fa-handshake-simple" /> Entrega técnica em {dataBR(atual.t.entrega.data)}{atual.t.certificado?.responsavel ? ` · ${primeiroNome(atual.t.certificado.responsavel)}` : ""} · {atual.t.entrega.dias} dias com o cliente</>
                  : <><i className="fa-solid fa-circle-exclamation" /> Sem entrega técnica no portal da Mahindra — contando da nota</>}
              </div>

              {(atual.s.estado === "orcado" || atual.s.estado === "feita") && atual.t.revisao50 && (
                <div className="rl-rev">
                  <div className="rl-rev-os">
                    <span><i className="fa-solid fa-screwdriver-wrench" /> Revisão de 50 h</span>
                    <b>{atual.t.revisao50.os || "registrada no controle de revisões"}</b>
                    <small>{atual.t.revisao50.feita ? `feita em ${dataBR(atual.t.revisao50.dataFeita)}` : atual.t.revisao50.status}</small>
                  </div>
                  {atual.t.previsao300 && (
                    <div className="rl-rev-300">
                      <span><i className="fa-solid fa-calendar-day" /> Próxima: revisão de 300 h</span>
                      <b>{dataBR(atual.t.previsao300.data300)}</b>
                      <small>
                        {atual.t.previsao300.diasFaltam >= 0 ? `daqui a ${atual.t.previsao300.diasFaltam} dias` : `passou há ${-atual.t.previsao300.diasFaltam} dias`}
                        {" · "}levou {atual.t.previsao300.diasAte50} dias até a 50 h (≈ {String(atual.t.previsao300.horasDia).replace(".", ",")} h por dia)
                      </small>
                    </div>
                  )}
                </div>
              )}

              {atual.s.semRevisao && (
                <div className="rl-rev">
                  <div className="rl-rev-os">
                    <span><i className="fa-solid fa-comment-slash" /> Por que não fez a 50 h</span>
                    <b>{atual.s.semRevisao.motivo ? ROTULO_MOTIVO[atual.s.semRevisao.motivo] : "—"}</b>
                    <small>{dataBR(atual.s.semRevisao.criado_em)}{atual.s.semRevisao.user_nome ? ` · ${atual.s.semRevisao.user_nome}` : ""}{atual.s.semRevisao.nota ? ` · ${atual.s.semRevisao.nota}` : ""}</small>
                  </div>
                  {atual.s.previsao && (
                    <div className="rl-rev-300 azul">
                      <span><i className="fa-solid fa-gauge" /> {String(atual.s.previsao.horimetro).replace(".", ",")} h em {dataBR(atual.s.previsao.leitura)} · ≈ {String(atual.s.previsao.horasDia).replace(".", ",")} h por dia</span>
                      <b>50 h em {dataBR(atual.s.previsao.data50)}</b>
                      <small>300 h por volta de {dataBR(atual.s.previsao.data300)} · volta para a fila {DIAS_ANTES_50} dias antes da 50 h</small>
                    </div>
                  )}
                </div>
              )}

              {["ligar", "tentar", "retorno", "orcar"].includes(atual.s.estado) && (
                <div className="rl-diga">
                  <span><i className="fa-solid fa-comment-dots" /> O que falar</span>
                  <ol>{oQueFalar(atual.t, atual.s).map((f, x) => <li key={x} style={{ animationDelay: `${120 + x * 90}ms` }}>{f}</li>)}</ol>
                </div>
              )}

              {atual.s.historico.length > 0 && (
                <div className="rl-hist">
                  <span><i className="fa-solid fa-clock-rotate-left" /> Ligações deste trator</span>
                  {atual.s.historico.slice(0, 4).map((c) => (
                    <div key={c.id} className={`rl-hist-l ${c.resultado}`}>
                      <b>{ROTULO_RESULTADO[c.resultado]}</b> · {c.marco} dias · {dataHora(c.criado_em)}{c.user_nome ? ` · ${c.user_nome}` : ""}
                      {c.nota && <em> — {c.nota}</em>}
                    </div>
                  ))}
                </div>
              )}

              {atual.s.marco && (() => {
                const aberto = atends.find((a) => a.chave === atual.t.chave);
                return (
                  <div className="rl-passo">
                    <span className="rl-passo-n"><i className="fa-solid fa-headset" /></span>
                    <div className="rl-passo-c">
                      <b>{aberto ? `Em atendimento com ${primeiroNome(aberto.user_nome) || "alguém"}` : ["orcado", "feita", "aguarda", "justificado"].includes(atual.s.estado) ? "Quer falar com o cliente de novo?" : `Fale com ${primeiroNome(atual.t.cliente?.nome) || "o cliente"}`}</b>
                      <div className="rl-acoes">
                        <button type="button" className="rl-btn ok grande" disabled={semTabela} onClick={() => onAbrir(atual.t, true)}><i className="fa-solid fa-headset" /> {aberto ? "Continuar o atendimento" : "Iniciar atendimento"}</button>
                        {atual.t.cliente?.whats && <a className="rl-btn zap grande" href={`https://wa.me/${atual.t.cliente.whats}`} target="_blank" rel="noreferrer"><i className="fa-brands fa-whatsapp" /> WhatsApp</a>}
                        {tel && <a className="rl-btn grande" href={`tel:${tel}`}><i className="fa-solid fa-phone" /> {atual.t.cliente?.telefone}</a>}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* atalhos da ficha, discretos */}
              <div className="rl-extras">
                <button type="button" onClick={() => onAbrir(atual.t)}><i className="fa-solid fa-id-card" /> Ficha e mapa</button>
                {(() => {
                  const pdf = pdfDoCertificado(atual.t.certificado?.documentos);
                  return pdf && <button type="button" onClick={() => setDoc({ titulo: `Certificado de garantia · ${atual.t.modelo} ${atual.t.chassi?.slice(-6) || ""}`, url: pdf.url, nome: `Certificado ${atual.t.chassi?.slice(-6) || ""}` })}><i className="fa-solid fa-file-pdf" /> Certificado de garantia</button>;
                })()}
                {atual.t.revisao50?.os && <a href={`/pos?id=${encodeURIComponent(atual.t.revisao50.os)}`} target="_blank" rel="noreferrer"><i className="fa-solid fa-screwdriver-wrench" /> Abrir a {atual.t.revisao50.os}</a>}
                {atual.s.estado === "orcar" && <a className="roxo" href="/pos" target="_blank" rel="noreferrer"><i className="fa-solid fa-plus" /> Abrir OS de revisão no POS</a>}
              </div>

            </div>
            {fila.length > 1 && <>
              <button type="button" className="rl-seta e" onClick={() => ir(-1)} aria-label="Anterior"><i className="fa-solid fa-chevron-left" /></button>
              <button type="button" className="rl-seta d" onClick={() => ir(1)} aria-label="Próximo"><i className="fa-solid fa-chevron-right" /></button>
            </>}
          </div>

          <div className="rl-fila">
            <span className="rl-cont">{i + 1} de {fila.length}</span>
            {fila.map((x, m) => (
              <button key={x.t.chave} type="button" className={`rl-mini ${m === i ? "on" : ""}`} style={{ ["--k" as string]: x.red ? VERMELHO : COR_ESTADO[x.s.estado] }} onClick={() => setK(m)} title={`${x.t.cliente?.nome || ""} · ${x.t.modelo}`}>
                {x.s.estado === "feita" ? <i className="fa-solid fa-check" /> : (x.t.cliente?.nome || "?").split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("")}
              </button>
            ))}
          </div>
        </>
      )}

      {doc && <VisualizadorDocumento key={doc.url} doc={doc} onClose={() => setDoc(null)} />}
      {aviso && <div key={aviso.id} className="rl-toast" role="status"><i className="fa-solid fa-circle-check" /> {aviso.txt}</div>}
    </div>
  );
}

/** Resumo simples: números coloridos + uma barra dividida (as partes `fora` não entram na barra). */
export function Resumo({ partes }: { partes: { n: number; rot: string; cor: string; fora?: boolean }[] }) {
  const naBarra = partes.filter((p) => !p.fora && p.n > 0);
  return (
    <div className="rl-resumo">
      <div className="rl-resumo-tx">
        {partes.map((p) => (
          <span key={p.rot} style={{ ["--k" as string]: p.cor }}><b><Contador valor={p.n} /></b> {p.rot}</span>
        ))}
      </div>
      {naBarra.length > 0 && (
        <div className="rl-resumo-barra">{naBarra.map((p) => <span key={p.rot} style={{ flex: p.n, background: p.cor }} title={`${p.n} ${p.rot}`} />)}</div>
      )}
    </div>
  );
}

export const ESTILO_RL = `
.rl-andamento { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 10px 12px; border-radius: 16px; border: 1px solid color-mix(in srgb, #16a34a 30%, var(--b, #e2e8f0)); background: color-mix(in srgb, #16a34a 5%, var(--s, #fefefe)) }
.rl-and-t { display: inline-flex; gap: 6px; align-items: center; font-size: 13.5px; color: #15803d; margin-right: 4px } .rl-and-t b { font-weight: 500; padding: 0 8px; border-radius: 99px; background: #16a34a; color: #fefefe; font-size: 12px }
.rl-andamento > button { display: inline-flex; gap: 8px; align-items: center; padding: 6px 12px 6px 10px; border-radius: 12px; border: 1px solid var(--b, #e2e8f0); background: var(--s, #fefefe); font: inherit; color: inherit; text-align: left; cursor: pointer; transition: border-color .15s, transform .15s }
.rl-andamento > button:hover:not(:disabled) { border-color: #16a34a; transform: translateY(-1px) }
.rl-andamento .tx { display: grid } .rl-andamento .tx b { font-weight: 500; font-size: 13px } .rl-andamento .tx small { font-size: 11.5px; color: var(--t2, #64748b) }
.rl-andamento .pulso { width: 9px; height: 9px; border-radius: 50%; background: #16a34a; animation: rlPulsoA 1.6s ease-in-out infinite }
@keyframes rlPulsoA { 50% { box-shadow: 0 0 0 5px color-mix(in srgb, #16a34a 25%, transparent) } }

.rl { display: grid; gap: 14px }
@keyframes rlEntra { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: none } }
.rl-aviso { padding: 10px 14px; border-radius: 12px; font-size: 13.5px; color: #92400e; background: color-mix(in srgb, #f59e0b 10%, var(--s)); border: 1px solid color-mix(in srgb, #f59e0b 35%, var(--b)) }
.rl-aviso b { font-weight: 500 }

/* placar */
.rl-placar { display: grid; gap: 12px; padding: 14px; border-radius: 18px; background: var(--s); border: 1px solid var(--b) }
.rl-grupos { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 10px }
.rl-grupo { display: flex; gap: 14px; align-items: center; padding: 14px 16px; border-radius: 16px; border: 1px solid var(--b); background: var(--s); color: var(--t); font: inherit; text-align: left; cursor: pointer; transition: border-color .2s, background .2s, transform .2s }
.rl-grupo:hover { transform: translateY(-2px) }
.rl-grupo.on { border-color: var(--k); background: color-mix(in srgb, var(--k) 7%, var(--s)) }
.rl-grupo-ico { width: 48px; height: 48px; flex: none; border-radius: 14px; display: grid; place-items: center; font-size: 19px; color: #fefefe; background: var(--k) }
.rl-grupo-tx { display: grid; gap: 1px; min-width: 0 }
.rl-grupo-n { font-size: 30px; font-weight: 500; line-height: 1; color: var(--k); font-variant-numeric: tabular-nums }
.rl-grupo-tx b { font-weight: 500; font-size: 15px }
.rl-grupo-tx small { font-size: 12px; color: var(--t2) }
.rl-subfiltros { display: flex; flex-wrap: wrap; gap: 6px }
.rl-quando-f { display: grid; gap: 6px; padding: 10px 12px; border-radius: 12px; background: color-mix(in srgb, #0891b2 6%, var(--s)); border: 1px solid color-mix(in srgb, #0891b2 22%, var(--b)) }
.rl-quando-f > span { font-size: 13.5px; color: var(--t) } .rl-quando-f > span i { color: #0891b2; margin-right: 4px }
.rl-quando-op { display: flex; flex-wrap: wrap; gap: 6px; align-items: center }
.rl-quando-op button { height: 34px; padding: 0 12px; border-radius: 99px; border: 1px solid var(--b); background: var(--s); color: var(--t); font: inherit; font-size: 13.5px; cursor: pointer }
.rl-quando-op button.on { background: #0891b2; border-color: #0891b2; color: #fefefe }
.rl-quando-op input { height: 34px; border-radius: 10px; border: 1px solid var(--b); padding: 0 8px; font: inherit; background: var(--s); color: var(--t) }
.rl-quando-f small { font-size: 12.5px; color: var(--t2) }
.rl-subfiltros button { display: inline-flex; gap: 6px; align-items: center; height: 34px; padding: 0 12px; border-radius: 99px; border: 1px solid var(--b); background: var(--s); color: var(--t); font: inherit; font-size: 13.5px; cursor: pointer }
.rl-subfiltros button span { font-size: 12px; padding: 0 7px; border-radius: 99px; background: var(--soft); color: var(--t2); font-variant-numeric: tabular-nums }
.rl-subfiltros button.on { border-color: var(--t); background: var(--t); color: var(--s) }
.rl-subfiltros button.on span { background: color-mix(in srgb, var(--s) 25%, transparent); color: var(--s) }
.rl-subfiltros button.alerta:not(.on) { border-color: #dc2626; color: #dc2626 }
.rl-subfiltros button:disabled { opacity: .4; cursor: default }
.rl-resumo { display: grid; gap: 8px }
.rl-resumo-tx { display: flex; flex-wrap: wrap; gap: 6px 22px; font-size: 14px; color: var(--t2) }
.rl-resumo-tx span { display: inline-flex; gap: 6px; align-items: baseline }
.rl-resumo-tx b { font-weight: 500; font-size: 20px; color: var(--k); font-variant-numeric: tabular-nums }
.rl-resumo-barra { display: flex; gap: 3px; height: 8px; border-radius: 99px; overflow: hidden }
.rl-resumo-barra span { min-width: 6px; border-radius: 99px; transition: flex .8s cubic-bezier(.16,1,.3,1) }
.rl-prog { display: grid; gap: 6px }
.rl-prog-tx { display: flex; justify-content: space-between; font-size: 14px; color: var(--t2) }
.rl-prog-tx b { font-weight: 500; color: var(--t); font-size: 18px }
.rl-prog-barra { height: 10px; border-radius: 99px; background: var(--soft); overflow: hidden }
.rl-prog-barra span { display: block; height: 100%; border-radius: 99px; background: linear-gradient(90deg, #db2777, #16a34a); transition: width .8s cubic-bezier(.16,1,.3,1) }
.rl-tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 10px }
.rl-tile { display: grid; grid-template-columns: auto 1fr; grid-template-rows: auto auto; column-gap: 10px; align-items: center; text-align: left; padding: 10px 12px; border-radius: 14px; border: 1px solid var(--b); background: var(--s); color: var(--t); font: inherit; cursor: pointer; transition: transform .2s, border-color .2s, background .2s }
.rl-tile:hover { transform: translateY(-2px) }
.rl-tile.on { border-color: var(--k); background: color-mix(in srgb, var(--k) 7%, var(--s)) }
.rl-tile-ico { grid-row: span 2; width: 40px; height: 40px; border-radius: 12px; display: grid; place-items: center; color: #fefefe; background: var(--k) }
.rl-tile.pulsa .rl-tile-ico { animation: rlPulsa 2s ease-in-out infinite }
.rl-tile.alerta { border-color: #dc2626; background: color-mix(in srgb, #dc2626 7%, var(--s)) }
@keyframes rlPulsa { 50% { box-shadow: 0 0 0 8px color-mix(in srgb, var(--k) 20%, transparent) } }
.rl-tile-n { font-size: 24px; font-weight: 500; line-height: 1; font-variant-numeric: tabular-nums; color: var(--k) }
.rl-tile-rot { grid-column: 2; font-size: 13.5px }
.rl-tile small { grid-column: 1 / -1; font-size: 11.5px; color: var(--t2); margin-top: 4px }

/* palco */
.rl-palco { position: relative; display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 26px; align-items: start; padding: 26px 64px; border-radius: 22px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--k) 9%, var(--s)), var(--s) 60%); border: 1px solid color-mix(in srgb, var(--k) 25%, var(--b)); animation: rlEntra .45s cubic-bezier(.16,1,.3,1) both }
.rl-palco { cursor: pointer }
.rl-palco input, .rl-palco textarea, .rl-palco select { cursor: auto }
.rl-foto { position: relative; display: block; padding: 0; border: 0; background: transparent; cursor: pointer; border-radius: 18px; overflow: hidden; box-shadow: 0 20px 40px -26px rgba(15,23,42,.7); margin-top: 6px; transition: transform .25s }
.rl-foto:hover { transform: translateY(-3px) }
.rl-foto-dica { position: absolute; left: 50%; bottom: 10px; transform: translateX(-50%); display: inline-flex; gap: 6px; align-items: center; padding: 4px 12px; border-radius: 99px; font-size: 12.5px; color: #fefefe; background: rgba(15,23,42,.72); opacity: 0; transition: opacity .2s; white-space: nowrap }
.rl-foto:hover .rl-foto-dica, .rl-foto:focus-visible .rl-foto-dica { opacity: 1 }
.rl-nome { padding: 0; border: 0; background: transparent; font: inherit; color: inherit; text-align: left; cursor: pointer }
.rl-nome:hover { color: var(--k); text-decoration: underline; text-underline-offset: 4px }
.rl-corpo { display: grid; gap: 8px; min-width: 0 }
.rl-quando { justify-self: start; font-size: 12.5px; padding: 3px 12px; border-radius: 99px; color: #fefefe; background: var(--k) }
.rl-corpo h3 { margin: 0; font-size: 24px; font-weight: 500; line-height: 1.2 }
.rl-sub { font-size: 14px; color: var(--t2) }
.rl-entrega { justify-self: start; font-size: 13px; padding: 3px 10px; border-radius: 99px; color: #0e7490; background: color-mix(in srgb, #0e7490 9%, var(--s)) }
.rl-entrega.nota { color: #b45309; background: color-mix(in srgb, #d97706 10%, var(--s)) }
.rl-entrega i { margin-right: 4px }
.rl-diga, .rl-hist, .rl-painel { padding: 12px 14px; border-radius: 14px; background: var(--s); border: 1px solid var(--b) }
.rl-diga > span, .rl-hist > span { font-size: 12.5px; color: var(--t2) }
.rl-diga i, .rl-hist > span i { color: var(--k); margin-right: 4px }
.rl-diga ol { margin: 8px 0 0; padding: 0; list-style: none; counter-reset: rl; display: grid; gap: 7px; font-size: 14.5px }
.rl-diga ol > li { counter-increment: rl; display: grid; grid-template-columns: 22px minmax(0, 1fr); gap: 8px; align-items: baseline }
.rl-diga ol > li::before { content: counter(rl); width: 20px; height: 20px; border-radius: 6px; display: grid; place-items: center; font-size: 11.5px; color: var(--k); background: color-mix(in srgb, var(--k) 12%, var(--s)); transform: translateY(-1px) }
.rl-diga li { animation: rlEntra .4s cubic-bezier(.16,1,.3,1) both }
.rl-hist { display: grid; gap: 4px }
.rl-hist-l { font-size: 13px; color: var(--t2); padding-left: 10px; border-left: 2px solid var(--b) }
.rl-hist-l b { font-weight: 500; color: var(--t) }
.rl-hist-l.problema b { color: #dc2626 } .rl-hist-l.nao_atendeu b { color: #d97706 } .rl-hist-l.tudo_certo b, .rl-hist-l.agendou_50h b { color: #16a34a }
.rl-acoes, .rl-decide { display: flex; flex-wrap: wrap; gap: 8px; align-items: center }
.rl-btn { display: inline-flex; align-items: center; gap: 7px; height: 40px; padding: 0 15px; border-radius: 12px; border: 1px solid var(--b); background: var(--s); color: var(--t); font: inherit; font-size: 14px; cursor: pointer; text-decoration: none; transition: box-shadow .2s, transform .2s }
.rl-btn:hover:not(:disabled) { box-shadow: 0 8px 18px -14px rgba(15,23,42,.6); transform: translateY(-1px) }
.rl-btn:disabled { opacity: .5; cursor: default }
.rl-btn.zap { background: #16a34a; border-color: #16a34a; color: #fefefe }
.rl-btn.grande { height: 46px; padding: 0 20px; font-size: 15px }
.rl-btn.ok { background: #2563eb; border-color: #2563eb; color: #fefefe }
.rl-btn.roxo { border-color: #7c3aed; color: #7c3aed }
.rl-btn.vermelho { border-color: #dc2626; color: #dc2626 }
.rl-passo { display: flex; gap: 12px; align-items: flex-start; padding: 12px 14px; border-radius: 14px; background: var(--s); border: 1px solid color-mix(in srgb, var(--k) 30%, var(--b)); animation: rlEntra .3s cubic-bezier(.16,1,.3,1) both }
.rl-passo-c { display: grid; gap: 10px; min-width: 0 }
.rl-passo-c > b { font-weight: 500; font-size: 15.5px }
.rl-passo-n { flex: none; width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; font-size: 14px; color: #fefefe; background: var(--k) }
.rl-passo-n.mini { display: inline-grid; width: 24px; height: 24px; font-size: 12.5px; margin-right: 6px; vertical-align: middle }
.rl-extras { display: flex; flex-wrap: wrap; gap: 4px 16px }
.rl-extras > button, .rl-extras > a { display: inline-flex; gap: 6px; align-items: center; padding: 4px 0; border: 0; background: transparent; font: inherit; font-size: 13.5px; color: var(--t2); text-decoration: none; cursor: pointer }
.rl-extras > button:hover, .rl-extras > a:hover { color: var(--k); text-decoration: underline; text-underline-offset: 3px }
.rl-extras .roxo { color: #7c3aed }
.rl-horim { display: flex; flex-wrap: wrap; gap: 12px; align-items: stretch }
.rl-horim label { display: grid; gap: 4px; font-size: 13px; color: var(--t2) }
.rl-horim input { width: 150px; height: 42px; border-radius: 10px; border: 1px solid var(--b); padding: 0 12px; font: inherit; font-size: 18px; background: var(--s); color: var(--t) }
.rl-horim-prev { display: grid; gap: 1px; padding: 8px 14px; border-radius: 12px; background: color-mix(in srgb, #0e7490 7%, var(--s)); border: 1px solid color-mix(in srgb, #0e7490 25%, var(--b)); animation: rlEntra .3s both }
.rl-horim-prev span, .rl-horim-prev small { font-size: 12.5px; color: var(--t2) }
.rl-horim-prev b { font-weight: 500; font-size: 18px; color: #0e7490 }
.rl-rev { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px }
.rl-rev > div { display: grid; gap: 2px; padding: 12px 14px; border-radius: 14px; background: var(--s); border: 1px solid var(--b); animation: rlEntra .4s cubic-bezier(.16,1,.3,1) both }
.rl-rev span { font-size: 12.5px; color: var(--t2) }
.rl-rev span i { margin-right: 4px; color: var(--k) }
.rl-rev b { font-weight: 500; font-size: 20px }
.rl-rev small { font-size: 12.5px; color: var(--t2) }
.rl-rev-300 { border-color: color-mix(in srgb, #16a34a 35%, var(--b)) !important; background: color-mix(in srgb, #16a34a 6%, var(--s)) !important }
.rl-rev-300 b { color: #16a34a; font-size: 26px }
.rl-rev-300.azul { border-color: color-mix(in srgb, #0e7490 35%, var(--b)) !important; background: color-mix(in srgb, #0e7490 6%, var(--s)) !important }
.rl-rev-300.azul b { color: #0e7490 }
.rl-link { border: 0; background: transparent; font: inherit; font-size: 13.5px; color: var(--t2); text-decoration: underline; cursor: pointer }
.rl-link:disabled { opacity: .5 }
.rl-painel { display: grid; gap: 10px; animation: rlEntra .3s cubic-bezier(.16,1,.3,1) both; border-color: color-mix(in srgb, #2563eb 30%, var(--b)) }
.rl-painel > b { font-weight: 500; font-size: 15px }
.rl-res { display: flex; flex-wrap: wrap; gap: 8px }
.rl-res button { display: inline-flex; gap: 7px; align-items: center; height: 40px; padding: 0 14px; border-radius: 12px; border: 1px solid color-mix(in srgb, var(--k) 30%, var(--b)); background: var(--s); color: var(--k); font: inherit; font-size: 14px; cursor: pointer; transition: background .15s, transform .15s }
.rl-res button:hover { transform: translateY(-1px) }
.rl-res button.on { background: var(--k); border-color: var(--k); color: #fefefe }
.rl-painel textarea { width: 100%; box-sizing: border-box; border-radius: 10px; border: 1px solid var(--b); padding: 8px 10px; font: inherit; font-size: 14px; resize: vertical; background: var(--s); color: var(--t) }
.rl-erro { font-size: 13px; color: #dc2626 }
.rl-seta { position: absolute; top: 120px; width: 42px; height: 42px; border-radius: 50%; border: 1px solid var(--b); background: var(--s); color: var(--t); cursor: pointer; font-size: 15px }
.rl-seta.e { left: 12px } .rl-seta.d { right: 12px }
.rl-seta:hover { color: var(--k); border-color: var(--k) }
.rl-fila { display: flex; flex-wrap: wrap; gap: 6px; align-items: center }
.rl-cont { font-size: 13px; color: var(--t2); margin-right: 6px }
.rl-mini { width: 34px; height: 34px; border-radius: 50%; border: 2px solid color-mix(in srgb, var(--k) 45%, var(--b)); background: var(--s); color: var(--k); font: inherit; font-size: 12px; cursor: pointer; transition: transform .2s }
.rl-mini.on { background: var(--k); color: #fefefe; transform: scale(1.15) }
.rl-vazio { display: grid; justify-items: center; gap: 6px; padding: 40px 20px; border-radius: 22px; background: var(--s); border: 1px dashed var(--b); text-align: center; color: var(--t2); animation: rlEntra .4s both }
.rl-vazio i { font-size: 30px; color: #16a34a }
.rl-vazio b { font-weight: 500; font-size: 17px; color: var(--t) }
.rl-toast { position: fixed; right: 24px; bottom: 24px; z-index: 9500; display: flex; gap: 8px; align-items: center; padding: 12px 16px; border-radius: 14px; background: #0f172a; color: #fefefe; font-size: 14px; box-shadow: 0 16px 34px -16px rgba(0,0,0,.6); animation: rlEntra .35s cubic-bezier(.16,1,.3,1) both }
.rl-toast i { color: #4ade80 }

@media (prefers-reduced-motion: reduce) { .rl *, .rl-palco { animation: none !important; transition: none !important } }
@media (max-width: 760px) {
  .rl-palco { grid-template-columns: 1fr; padding: 18px 16px 70px }
  .rl-seta { top: auto; bottom: 14px }
}
`;
