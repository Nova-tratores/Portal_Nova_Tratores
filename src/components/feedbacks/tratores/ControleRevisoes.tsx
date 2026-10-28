"use client";
// Radar Tratores → Controle de Revisões (José, 28/10/2026: "você vai calcular de todos os tratores que
// temos na outra aba [o controle de revisões], com a previsão de quando vai chegar, e dar prioridade
// para os que já chegaram a previsão"). Antes as revisões caíam na fila do Hoje; agora ficam aqui e o
// Hoje cuida dos outros serviços. Previsão = lib/feedbacks/previsao-revisao (horímetro de cheques,
// OS e envios; sem leitura usa a média). Atendimento gravado em feedback_revisoes_contato pela mesma
// rota de antes (POST /api/feedbacks/crm/revisoes).
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { fetchAuth } from "@/lib/auth/client";
import FotoMaquina from "@/components/comum/FotoMaquina";
import ModalMaquina from "../ModalMaquina";
import { Contador } from "../hoje/kit";
import { ESTILO_RL, Resumo } from "./RoteiroLigacao";
import { guardar, lerGuardado } from "./cacheTela";

type Guardado = { tratores: TratorRevisao[]; contatos: Record<string, ContatoRevisao>; tabela: boolean };
import {
  fmtDataBR, fmtH, mensagemRevisao, montarFilaRevisoes, MOTIVOS_SEM_REVISAO,
  type ContatoRevisao, type ItemRevisao, type MotivoSemRevisao, type Situacao, type TratorRevisao,
} from "@/lib/feedbacks/previsao-revisao";
import type { MaquinaRef } from "@/lib/feedbacks/maquina-modal";
import type { AtendimentoRadar } from "@/lib/revisoes/contatos-radar";

type Filtro = "chegou" | "vence_30" | "parou" | "proxima" | "concluido" | "sem_entrega";
const FILTROS: { id: Filtro; rotulo: string; sub: string; cor: string; ico: string }[] = [
  { id: "chegou", rotulo: "Já chegou na revisão", sub: "passou da previsão", cor: "#dc2626", ico: "fa-circle-exclamation" },
  { id: "vence_30", rotulo: "Chega em 30 dias", sub: "ligar para agendar", cor: "#d97706", ico: "fa-calendar-day" },
  { id: "parou", rotulo: "Parou de fazer na loja", sub: "faz tempo sem leitura", cor: "#7c3aed", ico: "fa-person-walking-arrow-right" },
  { id: "proxima", rotulo: "Mais para frente", sub: "previsão depois de 30 dias", cor: "#0e7490", ico: "fa-hourglass-half" },
  { id: "concluido", rotulo: "Agendadas / não quer", sub: "já atendidas", cor: "#16a34a", ico: "fa-circle-check" },
  { id: "sem_entrega", rotulo: "Sem data de entrega", sub: "conferir no controle", cor: "#94a3b8", ico: "fa-circle-question" },
];
const SIT_FILTRO: Record<Situacao, Filtro> = { atrasada: "chegou", vence_30: "vence_30", parou: "parou", proxima: "proxima", sem_entrega: "sem_entrega" };
const filtroDe = (it: ItemRevisao): Filtro => (it.acao === "concluido" ? "concluido" : SIT_FILTRO[it.trator.previsao.situacao]);
const COR: Record<Filtro, string> = Object.fromEntries(FILTROS.map((f) => [f.id, f.cor])) as Record<Filtro, string>;
const hojeISO = () => new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);

export default function ControleRevisoes({ busca }: { busca: string }) {
  const [guardado] = useState(() => lerGuardado<Guardado>("controle"));
  const [tratores, setTratores] = useState<TratorRevisao[] | null>(guardado?.tratores ?? null);
  const [contatos, setContatos] = useState<Record<string, ContatoRevisao>>(guardado?.contatos ?? {});
  const [tabela, setTabela] = useState(guardado?.tabela ?? true);
  const [erro, setErro] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("chegou");
  /** janela da máquina aberta: id do trator + se já abre iniciando o atendimento */
  const [maq, setMaq] = useState<{ id: string; iniciar: boolean } | null>(null);
  /** atendimentos em andamento das revisões (radar_tratores_atendimentos, chave rev:<id>) */
  const [atends, setAtends] = useState<AtendimentoRadar[]>([]);
  const [agora, setAgora] = useState(() => Date.now());

  const carregar = useCallback(async (forcar = false) => {
    setErro("");
    try {
      const r = await fetchAuth(`/api/feedbacks/crm/revisoes${forcar ? "?forcar=1" : ""}`);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.erro || `erro ${r.status}`);
      setTratores(j.tratores || []); setContatos(j.contatos || {}); setTabela(j.tabelaContato !== false); setAgora(Date.now());
      guardar<Guardado>("controle", { tratores: j.tratores || [], contatos: j.contatos || {}, tabela: j.tabelaContato !== false });
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)); setTratores((t) => t ?? []); }
  }, []);
  const carregarAtends = useCallback(async () => {
    try {
      const r = await fetchAuth("/api/revisoes/vendidos/atendimentos");
      const j = await r.json().catch(() => ({}));
      if (j.ok) setAtends((j.atendimentos || []).filter((a: AtendimentoRadar) => a.chave.startsWith("rev:")));
    } catch { /* sem rede */ }
  }, []);
  useEffect(() => { const id = setTimeout(() => { void carregar(); void carregarAtends(); }, 0); return () => clearTimeout(id); }, [carregar, carregarAtends]);
  const atendDe = (id: string) => atends.find((a) => a.chave === `rev:${id}`) ?? null;

  const itens = useMemo(() => (tratores ? montarFilaRevisoes(tratores, contatos, agora) : []), [tratores, contatos, agora]);
  const n = useMemo(() => {
    const c = Object.fromEntries(FILTROS.map((f) => [f.id, 0])) as Record<Filtro, number>;
    itens.forEach((it) => { c[filtroDe(it)]++; });
    return c;
  }, [itens]);
  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const l = itens.filter((it) => filtroDe(it) === filtro && (!q || [it.trator.cliente, it.trator.cidade, it.trator.modelo, it.trator.chassi, it.trator.vendedor].some((x) => String(x || "").toLowerCase().includes(q))));
    // prioridade: quem já chegou primeiro (o mais atrasado no topo); o resto pela data prevista
    return l.sort((a, b) => (filtro === "chegou" ? (a.trator.previsao.dias ?? 0) - (b.trator.previsao.dias ?? 0) : (a.trator.previsao.dataPrevista || "9") < (b.trator.previsao.dataPrevista || "9") ? -1 : 1));
  }, [itens, filtro, busca]);

  /** `horas` = o cliente falou o horímetro: vira leitura e a previsão é recalculada. */
  const gravar = async (t: TratorRevisao, mudar: (c: ContatoRevisao) => ContatoRevisao, horas?: string) => {
    const atual = contatos[t.id] && (contatos[t.id].revisao == null || contatos[t.id].revisao === t.previsao.revisaoOferta) ? contatos[t.id] : { trator_id: t.id, revisao: null, status: "aberto" as const, tentativas: [], proximo_contato_em: null, motivo: null, data_agendada: null, concluido_em: null };
    const novo = mudar({ ...atual, revisao: t.previsao.revisaoOferta });
    const r = await fetchAuth("/api/feedbacks/crm/revisoes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(horas ? { ...novo, leitura: { horas } } : novo) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { if (j.migracaoFaltando) setTabela(false); throw new Error(j.erro || `erro ${r.status}`); }
    setContatos((p) => ({ ...p, [t.id]: { ...novo, ...j.contato } }));
    setAgora(Date.now());
    if (horas) await carregar(true);
  };

  const total = itens.length;
  const emDia = total - n.chegou - n.parou;

  return (
    <div className="cr">
      <style>{ESTILO_RL + ESTILO_CR}</style>
      {!tabela && <div className="rl-aviso"><i className="fa-solid fa-database" /> Para gravar o atendimento das revisões falta rodar no banco o SQL <b>feedbacks-rfm-revisoes</b>. Até lá dá para ver as previsões.</div>}
      {erro && <div className="fbn-erro">Erro: {erro}</div>}

      {atends.length > 0 && (
        <div className="rl-andamento">
          <span className="rl-and-t"><i className="fa-solid fa-headset" /> Em atendimento agora <b>{atends.length}</b></span>
          {atends.map((a) => {
            const x = itens.find((y) => `rev:${y.trator.id}` === a.chave);
            return (
              <button key={a.id} type="button" disabled={!x} onClick={() => x && setMaq({ id: x.trator.id, iniciar: false })} title="Abrir a máquina e continuar o atendimento">
                <span className="pulso" />
                <span className="tx"><b>{x?.trator.cliente || "Trator fora da lista"}</b><small>{x ? `revisão de ${fmtH(x.trator.previsao.revisaoOferta)} · ` : ""}{(a.user_nome || "alguém").split(" ")[0]} desde {new Date(a.iniciado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</small></span>
              </button>
            );
          })}
        </div>
      )}

      <div className="rl-placar">
        <Resumo partes={[
          { n: emDia, rot: "em dia", cor: "#16a34a" },
          { n: n.chegou + n.parou, rot: "com revisão vencida ou parados", cor: "#dc2626" },
        ]} />
        <div className="rl-tiles">
          {FILTROS.map((f) => (
            <button key={f.id} type="button" className={`rl-tile ${filtro === f.id ? "on" : ""} ${f.id === "chegou" && n.chegou ? "pulsa" : ""}`} style={{ ["--k" as string]: f.cor }} onClick={() => setFiltro(f.id)}>
              <span className="rl-tile-ico"><i className={`fa-solid ${f.ico}`} /></span>
              <span className="rl-tile-n"><Contador valor={n[f.id]} /></span>
              <span className="rl-tile-rot">{f.rotulo}</span>
              <small>{f.sub}</small>
            </button>
          ))}
        </div>
      </div>

      {tratores === null ? <div className="fbn-vazio"><i className="fa-solid fa-circle-notch fa-spin" /> Calculando a previsão de cada trator do controle de revisões…</div>
        : lista.length === 0 ? <div className="rl-vazio"><i className="fa-solid fa-mug-hot" /><b>Nada aqui.</b><span>Escolha outro quadro em cima.</span></div>
        : (
          <div className="cr-lista">
            {lista.map((it, i) => (
              <Linha key={it.trator.id} it={it} i={i} cor={COR[filtroDe(it)]} atend={atendDe(it.trator.id)}
                onMaquina={() => setMaq({ id: it.trator.id, iniciar: false })}
                onAtender={() => setMaq({ id: it.trator.id, iniciar: true })} />
            ))}
          </div>
        )}
      {(() => {
        const it = maq && itens.find((x) => x.trator.id === maq.id);
        if (!maq || !it) return null;
        const t = it.trator;
        const alvo: MaquinaRef = { chassi: t.chassi || null, modelo: t.modelo || null, projeto: t.projeto ?? null, trator: t };
        return <ModalMaquina alvo={alvo} onFechar={() => setMaq(null)}
          topo={<AtendimentoRevisao key={t.id} it={it} podeGravar={tabela} aberto={atendDe(t.id)} iniciar={maq.iniciar}
            onGravar={(m, horas) => gravar(t, m, horas)} onMudou={() => void carregarAtends()} />} />;
      })()}
    </div>
  );
}

function Linha({ it, i, cor, atend, onMaquina, onAtender }: {
  it: ItemRevisao; i: number; cor: string; atend: AtendimentoRadar | null;
  onMaquina: () => void; onAtender: () => void;
}) {
  const t = it.trator, p = t.previsao;
  const quando = p.dias == null ? "—" : p.dias < 0 ? `passou há ${-p.dias} dias` : p.dias === 0 ? "hoje" : `daqui a ${p.dias} dias`;
  return (
    <div className="cr-item" style={{ ["--k" as string]: cor, animationDelay: `${Math.min(i, 14) * 30}ms` }}>
      {/* José, 28/10/2026: a linha inteira abre a janela da máquina; o atendimento começa lá dentro */}
      <div className="cr-linha" role="button" tabIndex={0} onClick={onMaquina} onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onMaquina(); } }} title="Ver a máquina">
        <span className="cr-abre"><FotoMaquina modelo={t.modelo} chassi={t.chassi} largura={78} altura={56} cor={cor} /></span>
        <span className="cr-q">
          <span className="cr-cli">{t.cliente}</span>
          <span className="cr-meta"><i className="fa-solid fa-tractor" /> Mahindra {t.modelo}{t.chassi ? ` · …${t.chassi.slice(-6)}` : ""}{t.cidade ? ` · ${t.cidade}` : ""}</span>
          <span className="cr-faz">{it.oQueFazer}</span>
        </span>
        <span className="cr-rev">
          <b>{fmtH(p.revisaoOferta)}</b>
          <small>{p.dataPrevista ? fmtDataBR(p.dataPrevista) : "sem data"}</small>
        </span>
        <span className="cr-quando">
          <b>{quando}</b>
          <small>horímetro hoje ~{fmtH(Math.round(p.horimetroHoje))}</small>
        </span>
        <button type="button" className={`cr-reg ${atend ? "on" : ""}`} onClick={(e) => { e.stopPropagation(); onAtender(); }} title="Abrir a máquina e começar o atendimento">
          {atend ? <><span className="cr-pulso" /> Em atendimento{atend.user_nome ? ` · ${atend.user_nome.split(" ")[0]}` : ""}</> : <><i className="fa-solid fa-headset" /> Iniciar atendimento</>}
        </button>
      </div>
    </div>
  );
}

/** Atendimento da revisão DENTRO da janela da máquina (José, 28/10/2026: "e onde eu inicio o atendimento
 *  aqui"): Iniciar atendimento (fica em "Em atendimento agora", radar_tratores_atendimentos com chave
 *  rev:<id do trator>) → falar com o cliente → como foi (agendou / não atendeu / não vai fazer agora). */
function AtendimentoRevisao({ it, podeGravar, aberto, iniciar: iniciarJa, onGravar, onMudou }: {
  it: ItemRevisao; podeGravar: boolean; aberto: AtendimentoRadar | null; iniciar: boolean;
  onGravar: (m: (c: ContatoRevisao) => ContatoRevisao, horas?: string) => Promise<void>; onMudou: () => void;
}) {
  const t = it.trator, p = t.previsao;
  const chave = `rev:${t.id}`;
  const [atend, setAtend] = useState<AtendimentoRadar | null>(aberto);
  const [semTabela, setSemTabela] = useState(false);
  const [iniciando, setIniciando] = useState(false);
  const [feito, setFeito] = useState<string | null>(null);
  const [modo, setModo] = useState<null | "agendar" | "nao_quer">(null);
  const [data, setData] = useState("");
  const [motivo, setMotivo] = useState("");
  const [codigo, setCodigo] = useState<MotivoSemRevisao | null>(null);
  const [horas, setHoras] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const tel = (t.telefone || "").replace(/\D/g, "");
  const wpp = tel ? `https://wa.me/${tel.length <= 11 ? "55" : ""}${tel}?text=${encodeURIComponent(mensagemRevisao(t))}` : null;
  const agoraIso = () => new Date().toISOString();
  const api = (corpo: object) => fetchAuth("/api/revisoes/vendidos/atendimentos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });

  const iniciar = useCallback(async () => {
    setIniciando(true); setErro("");
    try {
      const r = await api({ acao: "iniciar", chave });
      const j = await r.json().catch(() => ({}));
      if (j.semTabela) { setSemTabela(true); setAtend({ id: "", chave, marco: null, user_id: null, user_nome: null, iniciado_em: new Date().toISOString() }); return; }
      if (!r.ok || !j.ok) throw new Error(j.erro || "Não consegui iniciar.");
      setAtend(j.atendimento); onMudou();
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)); }
    finally { setIniciando(false); }
  }, [chave, onMudou]);
  useEffect(() => {
    if (!iniciarJa || aberto) return;
    const id = setTimeout(() => { void iniciar(); }, 0);
    return () => clearTimeout(id);
  }, [iniciarJa, aberto, iniciar]);

  const encerrar = async (acao: "encerrar" | "cancelar") => {
    if (atend?.id) await api({ acao, id: atend.id }).catch(() => null);
    setAtend(null); onMudou();
  };
  const salvar = async (m: (c: ContatoRevisao) => ContatoRevisao, frase: string, horasLidas?: string) => {
    setSalvando(true); setErro("");
    try { await onGravar(m, horasLidas); await encerrar("encerrar"); setFeito(frase); setModo(null); }
    catch (e) { setErro(e instanceof Error ? e.message : String(e)); }
    finally { setSalvando(false); }
  };

  return (
    <section className={`cr-at ${atend && !feito ? "andando" : ""}`}>
      <div className="cr-at-topo">
        <span className="cr-at-ico"><i className="fa-solid fa-headset" /></span>
        <span className="cr-at-quem">
          <b>Atendimento da revisão de {fmtH(p.revisaoOferta)}</b>
          <small>{t.cliente}{t.telefone ? ` · ${t.telefone}` : " · sem telefone no cadastro"}</small>
        </span>
        <span className="rl-acoes">
          {wpp && <a className="rl-btn zap" href={wpp} target="_blank" rel="noreferrer"><i className="fa-brands fa-whatsapp" /> WhatsApp</a>}
          {tel && <a className="rl-btn" href={`tel:${tel}`}><i className="fa-solid fa-phone" /> Ligar</a>}
        </span>
      </div>
      {(it.contato.tentativas.length > 0 || it.contato.status !== "aberto") && !feito && (
        <div className="cr-nota">
          {it.contato.tentativas.length > 0 && <span><i className="fa-solid fa-phone-slash" /> {it.contato.tentativas.length} tentativa(s) sem atender · a última em {fmtDataBR(it.contato.tentativas[it.contato.tentativas.length - 1].data.slice(0, 10))}</span>}
          {it.contato.status !== "aberto" && <span><i className="fa-solid fa-circle-info" /> {it.oQueFazer}{it.contato.motivo ? ` — ${it.contato.motivo}` : ""}</span>}
        </div>
      )}

      {feito ? (
        <div className="cr-at-feito"><i className="fa-solid fa-circle-check" /> <span><b>Atendimento registrado</b> · {feito}</span></div>
      ) : !atend ? (
        <div className="cr-at-iniciar">
          <button type="button" className="rl-btn grande ok" disabled={iniciando || !podeGravar} onClick={() => void iniciar()}>
            {iniciando ? <i className="fa-solid fa-circle-notch fa-spin" /> : <i className="fa-solid fa-headset" />} Iniciar atendimento
          </button>
          <small>{podeGravar ? "A equipe vê que você está falando com o cliente. Depois é só dizer como foi." : "Falta rodar o SQL feedbacks-rfm-revisoes para gravar."}</small>
          {erro && <span className="rl-erro">{erro}</span>}
        </div>
      ) : (
        <div className="cr-at-and">
          <div className="cr-at-and-cab">
            <span className="cr-pulso" /><b>Atendimento em andamento</b>
            <small>{semTabela ? "sem registro de andamento (falta o SQL radar-tratores-atendimentos)" : `desde ${new Date(atend.iniciado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}${atend.user_nome ? ` · ${atend.user_nome}` : ""}`}</small>
            <button type="button" className="rl-link" onClick={() => void encerrar("cancelar")}>Cancelar o atendimento</button>
          </div>
          {it.contato.status !== "aberto" && modo === null && (
            <div className="rl-decide"><button type="button" className="rl-link" disabled={!podeGravar || salvando} onClick={() => salvar((c) => ({ ...c, status: "aberto", concluido_em: null, data_agendada: null, motivo: null }), "atendimento reaberto")}>Reabrir o atendimento desta revisão</button></div>
          )}
          {modo === null && (
            <div className="rl-decide cr-como">
              <small>Como foi?</small>
              <button type="button" className="rl-btn grande ok" disabled={!podeGravar} onClick={() => setModo("agendar")}><i className="fa-solid fa-calendar-check" /> Agendou a revisão</button>
              <button type="button" className="rl-btn grande" disabled={!podeGravar || salvando} onClick={() => salvar((c) => ({ ...c, tentativas: [...c.tentativas, { data: agoraIso(), canal: "telefone" }] }), "não atendeu, tentativa anotada")}>{salvando ? <i className="fa-solid fa-circle-notch fa-spin" /> : <i className="fa-solid fa-phone-slash" />} Não atendeu</button>
              <button type="button" className="rl-link" disabled={!podeGravar} onClick={() => setModo("nao_quer")}>Não vai fazer agora</button>
            </div>
          )}
          {modo === "agendar" && (
            <div className="rl-painel">
              <b>Para quando ficou a revisão de {fmtH(p.revisaoOferta)}?</b>
              <input type="date" className="cr-data" value={data} min={hojeISO()} onChange={(e) => setData(e.target.value)} />
              <div className="rl-decide">
                <button type="button" className="rl-btn grande ok" disabled={!data || salvando} onClick={() => salvar((c) => ({ ...c, status: "agendada", data_agendada: data, motivo: "Revisão agendada", concluido_em: agoraIso(), proximo_contato_em: null }), `revisão agendada para ${fmtDataBR(data)}`)}>
                  {salvando ? <i className="fa-solid fa-circle-notch fa-spin" /> : <i className="fa-solid fa-floppy-disk" />} Salvar o atendimento
                </button>
                <button type="button" className="rl-link" onClick={() => setModo(null)}>Voltar</button>
              </div>
            </div>
          )}
          {modo === "nao_quer" && (
            <div className="rl-painel">
              <b>Por que não vai fazer a revisão de {fmtH(p.revisaoOferta)} agora?</b>
              <div className="rl-res">
                {MOTIVOS_SEM_REVISAO.map((m) => (
                  <button key={m.id} type="button" className={codigo === m.id ? "on" : ""} style={{ ["--k" as string]: m.id === "sem_horas" ? "#0e7490" : "#64748b" }} onClick={() => setCodigo(m.id)}>
                    <i className={`fa-solid ${m.ico}`} /> {m.rotulo}
                  </button>
                ))}
              </div>
              {codigo && (
                <label className="cr-horim">
                  <span>Horímetro que o cliente falou{codigo === "sem_horas" ? "" : " (se ele souber)"}</span>
                  <input inputMode="decimal" autoFocus={codigo === "sem_horas"} value={horas} onChange={(e) => setHoras(e.target.value.replace(/[^\d,.]/g, ""))} placeholder={`Ex.: ${Math.round(p.horimetroHoje)}`} />
                  <small>{codigo === "sem_horas" ? "Obrigatório: a previsão é refeita com esta leitura." : "Se informar, a previsão passa a contar com ela."}</small>
                </label>
              )}
              <textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder={codigo === "outro" ? "Qual é o motivo? (obrigatório)" : "Anotação (opcional)"} />
              <div className="rl-decide">
                <button type="button" className="rl-btn grande ok"
                  disabled={!codigo || salvando || (codigo === "sem_horas" && !horas.trim()) || (codigo === "outro" && motivo.trim().length < 5)}
                  onClick={() => {
                    if (!codigo) return;
                    const rot = MOTIVOS_SEM_REVISAO.find((m) => m.id === codigo)!.rotulo;
                    const texto = [rot, horas.trim() ? `horímetro ${horas.trim()} h` : "", motivo.trim()].filter(Boolean).join(" · ");
                    // "ainda não deu as horas" não fecha: a leitura nova refaz a previsão e o trator volta quando chegar
                    void salvar((c) => codigo === "sem_horas"
                      ? { ...c, motivo: texto, motivo_codigo: codigo, tentativas: [...c.tentativas, { data: agoraIso(), canal: "telefone" }] }
                      : { ...c, status: "nao_quer", motivo: texto, motivo_codigo: codigo, concluido_em: agoraIso(), proximo_contato_em: null }, rot.toLowerCase(), horas.trim() || undefined);
                  }}>
                  {salvando ? <i className="fa-solid fa-circle-notch fa-spin" /> : <i className="fa-solid fa-floppy-disk" />} Salvar o atendimento
                </button>
                <button type="button" className="rl-link" onClick={() => setModo(null)}>Voltar</button>
              </div>
            </div>
          )}
          {erro && <div className="rl-erro">{erro}</div>}
        </div>
      )}
    </section>
  );
}

const ESTILO_CR = `
.cr-reg.on { background: color-mix(in srgb, #16a34a 10%, var(--s)); border-color: #16a34a; color: #15803d }
.cr-pulso { display: inline-block; width: 9px; height: 9px; border-radius: 50%; background: #16a34a; animation: rlPulsoA 1.6s ease-in-out infinite }
.cr-at { display: grid; gap: 12px; padding: 14px 16px; margin-bottom: 14px; border-radius: 16px; border: 1px solid color-mix(in srgb, #2563eb 30%, var(--b)); background: linear-gradient(135deg, color-mix(in srgb, #2563eb 6%, var(--s)), var(--s) 60%) }
.cr-at.andando { border-color: color-mix(in srgb, #16a34a 45%, var(--b)); background: linear-gradient(135deg, color-mix(in srgb, #16a34a 6%, var(--s)), var(--s) 60%) }
.cr-at-topo { display: flex; flex-wrap: wrap; gap: 12px; align-items: center }
.cr-at-ico { width: 42px; height: 42px; flex: none; border-radius: 12px; display: grid; place-items: center; font-size: 17px; color: #fefefe; background: linear-gradient(140deg, #60a5fa, #2563eb) }
.cr-at.andando .cr-at-ico { background: linear-gradient(140deg, #4ade80, #16a34a) }
.cr-at-quem { flex: 1 1 200px; display: grid; min-width: 0 } .cr-at-quem b { font-weight: 500; font-size: 16px } .cr-at-quem small { font-size: 13px; color: var(--t2) }
.cr-at-iniciar { display: flex; flex-wrap: wrap; gap: 8px 14px; align-items: center; padding-top: 12px; border-top: 1px dashed var(--b) }
.cr-at-iniciar small { font-size: 13px; color: var(--t2) }
.cr-at-and { display: grid; gap: 10px; padding-top: 12px; border-top: 1px dashed var(--b) }
.cr-at-and-cab { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center } .cr-at-and-cab b { font-weight: 500; color: #15803d } .cr-at-and-cab small { font-size: 12.5px; color: var(--t2) }
.cr-at-feito { display: flex; gap: 10px; align-items: center; padding: 12px 14px; border-radius: 12px; background: color-mix(in srgb, #16a34a 9%, var(--s)); color: #166534; font-size: 14px } .cr-at-feito i { font-size: 18px } .cr-at-feito b { font-weight: 500 }

.cr { display: grid; gap: 14px }
.cr-lista { display: grid; gap: 8px }
.cr-item { border-radius: 16px; background: var(--s); border: 1px solid var(--b); animation: rlEntra .4s cubic-bezier(.16,1,.3,1) both; transition: border-color .2s }
.cr-item.on, .cr-item:hover { border-color: color-mix(in srgb, var(--k) 45%, var(--b)) }
.cr-abre { cursor: zoom-in; border-radius: 10px; transition: transform .2s, color .2s }
span.cr-abre:not(.cr-meta):hover { transform: scale(1.04) }
.cr-meta.cr-abre { width: fit-content } .cr-meta.cr-abre i { font-size: 11px; margin-right: 3px; opacity: .7 }
.cr-meta.cr-abre:hover { color: #2563eb; text-decoration: underline; text-underline-offset: 3px }
.cr-linha { width: 100%; display: grid; grid-template-columns: auto minmax(0, 1fr) 120px 170px auto; gap: 14px; align-items: center; padding: 10px 14px; border: 0; background: transparent; font: inherit; color: var(--t); text-align: left; cursor: pointer }
.cr-q { display: grid; gap: 2px; min-width: 0 }
.cr-cli { font-size: 15px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.cr-meta { font-size: 12.5px; color: var(--t2) }
.cr-faz { font-size: 12.5px; color: var(--k) }
.cr-rev, .cr-quando { display: grid; gap: 1px; text-align: right }
.cr-rev b { font-size: 18px; font-weight: 500; color: var(--k); font-variant-numeric: tabular-nums }
.cr-quando b { font-size: 14px; font-weight: 500 }
.cr-rev small, .cr-quando small { font-size: 12px; color: var(--t2) }
.cr-seta { color: var(--t3); font-size: 12px }
.cr-reg { flex: none; display: inline-flex; gap: 6px; align-items: center; padding: 7px 12px; border-radius: 99px; border: 1px solid var(--b); background: var(--s); font: inherit; font-size: 13px; color: var(--t); cursor: pointer; transition: border-color .15s, color .15s, background .15s }
.cr-reg:hover { border-color: var(--k); color: var(--k) }
.cr-reg.on { background: var(--k); border-color: var(--k); color: #fff }
.cr-det { display: grid; gap: 10px; padding: 0 14px 14px; animation: rlEntra .3s both }
.cr-fatos { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px }
.cr-fato { display: grid; gap: 1px; padding: 9px 12px; border-radius: 12px; background: var(--soft) }
.cr-fato small { font-size: 11.5px; color: var(--t2) }
.cr-fato b { font-size: 17px; font-weight: 500; font-variant-numeric: tabular-nums; color: var(--t) }
.cr-fato em { font-style: normal; font-size: 12px; color: var(--t2) }
.cr-fato.forte { background: color-mix(in srgb, var(--k) 9%, var(--s)) } .cr-fato.forte b, .cr-fato.forte em { color: color-mix(in srgb, var(--k) 85%, #0f172a) }
.cr-nota { display: grid; gap: 3px; font-size: 13px; color: var(--t2) } .cr-nota i { color: var(--k); margin-right: 4px }
.cr-blocos { display: flex; flex-wrap: wrap; gap: 10px 28px }
.cr-bloco { display: grid; gap: 5px } .cr-bloco > small, .cr-como > small { font-size: 11.5px; color: var(--t2) }
.cr-como { padding-top: 10px; border-top: 1px dashed var(--b); align-items: center } .cr-como > small { width: 100% }
.cr-semtel { font-size: 13px; color: #b91c1c }
.cr-horim { display: grid; gap: 4px; font-size: 13px; color: var(--t2) }
.cr-horim input { width: 160px; height: 42px; border-radius: 10px; border: 1px solid var(--b); padding: 0 12px; font: inherit; font-size: 18px; background: var(--s); color: var(--t) }
.cr-horim small { font-size: 12px }
.cr-data { height: 42px; width: 200px; border-radius: 10px; border: 1px solid var(--b); padding: 0 10px; font: inherit; background: var(--s); color: var(--t) }
@media (max-width: 760px) {
  .cr-linha { grid-template-columns: auto minmax(0, 1fr) auto; }
  .cr-quando { display: none }
}
`;
