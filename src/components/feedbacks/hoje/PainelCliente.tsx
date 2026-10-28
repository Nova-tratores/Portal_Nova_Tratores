"use client";
// Painel do cliente na tela "Hoje": quem é, por que ligar agora (cada ponto explicado), todos os
// motivos e o CONCLUIR NUM LUGAR SÓ — um desfecho fecha todos os motivos que fizerem sentido, e a
// lista do que vai acontecer aparece antes de confirmar. Embaixo, as fichas que já existem
// (FichaCliente, FichaTrator, UltimoServico) para quem quiser os detalhes.
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { avaliar, precisaAlerta } from "@/lib/feedbacks/fila";
import { DESFECHOS_FALOU, planoDesfecho, fmtDia, type ClienteHoje, type DesfechoHoje, type ItemPlano } from "@/lib/feedbacks/hoje";
import type { FeedbackRegistro, Melhoria, NPS, StatusCliente } from "@/lib/feedbacks/types";
import FichaCliente, { COR_ACAO, ICO_ACAO, fmtTel } from "../fila/FichaCliente";
import FichaTrator from "../fila/FichaTrator";
import UltimoServico from "../fila/UltimoServico";
import { comoItemFila } from "../fila/useFilaRevisoes";
import type { Hoje, Pesquisa } from "./useHoje";
import { corMotivo, icoMotivo, Pontos } from "./kit";
import ModalMaquina from "../ModalMaquina";
import ResumoMaquina, { ESTILO_RM } from "./ResumoMaquina";
import { maquinasDosMotivos, nomeModelo, type MaquinaRef } from "@/lib/feedbacks/maquina-modal";
import { finalChassi } from "@/lib/feedbacks/previsao-revisao";
import FotoMaquina from "@/components/comum/FotoMaquina";
import MapaLocais, { type PontoMapa } from "@/components/comum/MapaLocais";
import { fetchAuth } from "@/lib/auth/client";
import type { AtendimentoRadar } from "@/lib/revisoes/contatos-radar";

const STATUS: { v: StatusCliente; rot: string; ico: string; cor: string }[] = [
  { v: "Satisfeito", rot: "Satisfeito", ico: "fa-face-smile", cor: "#16a34a" },
  { v: "Neutro", rot: "Neutro", ico: "fa-face-meh", cor: "#d97706" },
  { v: "Insatisfeito", rot: "Insatisfeito", ico: "fa-face-frown", cor: "#dc2626" },
];
const NPS_OPS: { v: NPS; cor: string }[] = [{ v: "Sim", cor: "#16a34a" }, { v: "Talvez", cor: "#d97706" }, { v: "Não", cor: "#dc2626" }];
const MELHORIAS: Melhoria[] = ["Prazo", "Atendimento", "Preço", "Qualidade Técnica"];
const MOTIVOS_RECUSA = ["Já fez em outro lugar", "Achou caro", "Máquina parada", "Vendeu a máquina", "Não precisa agora", "Vai fazer por conta"];
const corNota = (n: number) => (n >= 9 ? "#16a34a" : n >= 7 ? "#d97706" : "#dc2626");
const statusDaNota = (n: number): StatusCliente => (n >= 9 ? "Satisfeito" : n >= 7 ? "Neutro" : "Insatisfeito");
const somaDias = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString("sv-SE"); };

export type Passo = null | "falou" | "sem_resposta" | "whatsapp" | "numero_errado";
const PASSOS: { k: Exclude<Passo, null>; rot: string; ico: string; cor: string; ajuda: string }[] = [
  { k: "falou", rot: "Falou com o cliente", ico: "fa-phone-volume", cor: "#16a34a", ajuda: "Conta como foi" },
  { k: "sem_resposta", rot: "Não atendeu", ico: "fa-phone-slash", cor: "#d97706", ajuda: "Volta amanhã" },
  { k: "whatsapp", rot: "WhatsApp", ico: "fa-comment-dots", cor: "#16a34a", ajuda: "Abre com a mensagem pronta" },
  { k: "numero_errado", rot: "Número errado", ico: "fa-ban", cor: "#64748b", ajuda: "Corrigir o cadastro" },
];
const ICO_EFEITO: Record<ItemPlano["efeito"], string> = { fecha: "fa-circle-check", retorno: "fa-calendar-days", tentativa: "fa-phone-slash", mantem: "fa-circle-minus" };

/** `inicial`: abre o concluir já num passo (usado nas prévias). */
export interface ConcluirInicial { passo?: Passo; desfecho?: DesfechoHoje | null; nota?: number | null }

export default function PainelCliente({ c, hoje, onFeito, onFechar, inicial, modal = false }: { c: ClienteHoje; hoje: Hoje; onFeito?: () => void; onFechar?: () => void; inicial?: ConcluirInicial; modal?: boolean }) {
  const tags = c.tags.filter((t) => !["Cliente", "Fornecedor", "Funcionário"].includes(t)).slice(0, 4);
  const registros = c.motivos.filter((m) => m.registro).map((m) => m.registro!);
  const revisoes = c.motivos.filter((m) => m.revisao).map((m) => m.revisao!);
  const temUltimoServicoNaFicha = registros.some((r) => r.tipo === "rfm") || revisoes.length > 0;
  const [maq, setMaq] = useState<MaquinaRef | null>(null);
  // José, 26/10/2026: "quando a gente clicar no trator, mostra a localização no mapa"
  const [mapas, setMapas] = useState<Set<string>>(new Set());
  const alternarMapa = (k: string) => setMapas((m) => { const n = new Set(m); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const maquinas = useMemo(() => maquinasDosMotivos(c.motivos), [c.motivos]);
  // José, 26/10/2026: "você separa por máquinas" — cada máquina num cartão com os motivos dela;
  // o que não é de máquina (cliente sumiu, peças, cadastro…) fica em "Outros motivos".
  const porMaquina = useMemo(() => {
    const grupos: { chave: string; ref: MaquinaRef | null; itens: { m: ClienteHoje["motivos"][number]; i: number }[] }[] = [];
    c.motivos.forEach((m, i) => {
      const ref = maquinas[i];
      const chave = ref ? (ref.chassi ? ref.chassi.replace(/\s/g, "").toUpperCase().slice(-7) : `modelo:${(ref.modelo || "").toUpperCase()}`) : "outros";
      let g = grupos.find((x) => x.chave === chave);
      if (!g) { g = { chave, ref, itens: [] }; grupos.push(g); }
      g.itens.push({ m, i });
    });
    return grupos.sort((a, b) => (a.chave === "outros" ? 1 : 0) - (b.chave === "outros" ? 1 : 0));
  }, [c.motivos, maquinas]);
  const pseudo = useMemo(() => ({ id: hoje.exemplo ? -9999 : 0, tipo: "rfm", nome: c.nome, codigo_omie: c.codigo_omie, trator: null, tecnico: c.tecnicos[0] || null, ultimo_servico: null } as unknown as FeedbackRegistro), [c.nome, c.codigo_omie, c.tecnicos, hoje.exemplo]);

  return (
    <div className={`fbh-painel ${modal ? "modal" : ""}`} style={{ ["--k" as string]: COR_ACAO[c.acao] }}>
      <style>{ESTILO_RM}</style>
      {onFechar && <div className="fbh-fechar"><button type="button" className="fbn-acao cinza" onClick={onFechar}><i className="fa-solid fa-chevron-down" /> Fechar</button></div>}
      <div className="fbh-cab">
        <span className="fbn-ico" style={{ ["--c" as string]: c.urgente ? "#dc2626" : "var(--c)" }}><i className={`fa-solid ${c.urgente ? "fa-bolt" : "fa-user"}`} /></span>
        <div style={{ minWidth: 0, flex: 1, display: "grid", gap: 8 }}>
          <h2>{c.nome}</h2>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {c.telefone
              ? <a className="fbf-tel" href={`tel:${c.telefone.replace(/\D/g, "")}`} title="Ligar"><i className="fa-solid fa-phone" /> {fmtTel(c.telefone)}</a>
              : <span className="fbf-sem-tel"><i className="fa-solid fa-phone-slash" /> sem telefone no cadastro</span>}
            {c.email && <span className="fbn-contato"><i className="fa-regular fa-envelope" /> {c.email}</span>}
            {c.cidade && <span className="fbn-contato"><i className="fa-solid fa-location-dot" /> {c.cidade}</span>}
            <Pontos c={c} />
          </div>
          {(tags.length > 0 || c.emLigacaoCom) && (
            <div className="fbn-selos">
              {c.emLigacaoCom && <span className="fbn-pilula" style={{ ["--k" as string]: "#d97706" }}><i className="fa-solid fa-headset" /> Em ligação com {c.emLigacaoCom}</span>}
              {tags.map((t) => <span key={t} className="fbn-pilula"><i className="fa-solid fa-tag" /> {t}</span>)}
            </div>
          )}
        </div>
      </div>

      <div className="fbh-porque">
        <div className="t"><i className={`fa-solid ${ICO_ACAO[c.acao]}`} style={{ color: "var(--k)" }} /> {c.oQueFazer}</div>
        {c.explicacao.length > 0 ? (
          <>
            {c.explicacao.map((e, i) => <div key={i} className="l"><span>{e.rot}</span><span>{e.pts > 0 ? "+" : ""}{e.pts}</span></div>)}
            <div className="l tot"><span>Pontos de hoje (quanto maior, antes na fila{c.explicacao.reduce((s, e) => s + e.pts, 0) < 1 ? "; nunca abaixo de 1" : ""})</span><span>{c.pontos}</span></div>
          </>
        ) : <div className="l"><span>{c.aPartirDe ? `Hoje não pontua: volta para a fila em ${fmtDia(c.aPartirDe)}.` : "Hoje não pontua."}</span><span /></div>}
      </div>

      <div className="fbh-col-esq">
        <p className="fbf-sub" style={{ margin: 0 }}>Motivos deste cliente ({c.motivos.length}){porMaquina.some((g) => g.ref) ? ` · ${porMaquina.filter((g) => g.ref).length} máquina(s)` : ""}</p>
        {porMaquina.map((g) => {
          const tr = g.itens.map(({ m }) => m.revisao).find(Boolean);
          return (
            <div key={g.chave} className={`fbh-maq ${g.ref ? "" : "outros"}`}>
              {/* José, 26/10/2026: "tá muito confuso" — foto do catálogo + o modelo grande + uma linha curta;
                  o projeto do Omie fica em "Ver a máquina" */}
              <div className="fbh-maq-cab">
                {g.ref ? (
                <button type="button" className="alvo" onClick={() => alternarMapa(g.chave)} aria-expanded={mapas.has(g.chave)} title="Ver no mapa onde fica este trator">
                <FotoMaquina modelo={g.ref.modelo} chassi={g.ref.chassi} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="t grande">{nomeModelo(g.ref) || "Máquina sem modelo"}</div>
                  <div className="p">
                      {[
                        g.ref.chassi ? `chassi …${finalChassi(g.ref.chassi, 6)}` : "sem chassi",
                        tr?.trator.previsao.entrega ? `entregue em ${fmtDia(tr.trator.previsao.entrega)}` : "",
                        tr ? `~${Math.round(tr.trator.previsao.horimetroHoje).toLocaleString("pt-BR")} h hoje` : "",
                      ].filter(Boolean).join(" · ")}
                  </div>
                  <div className="dica"><i className="fa-solid fa-map-location-dot" /> {mapas.has(g.chave) ? "Esconder o mapa" : "Ver onde está no mapa"}</div>
                </div>
                </button>
                ) : (
                <>
                <span className="fbn-ico p" style={{ ["--c" as string]: "#64748b" }}><i className="fa-solid fa-user" /></span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="t">Outros motivos (não são de uma máquina)</div>
                </div>
                </>
                )}
                {g.ref && <button type="button" className="fbn-acao cinza" onClick={() => setMaq(g.ref)} title="Projeto, últimas revisões e últimos serviços desta máquina"><i className="fa-solid fa-magnifying-glass" /> Ver a máquina</button>}
              </div>
              {g.ref && mapas.has(g.chave) && <LocalDoTrator chassi={g.ref.chassi} cod={c.codigo_omie} exemplo={hoje.exemplo} />}
              {g.ref && <ResumoMaquina alvo={g.ref} exemplo={hoje.exemplo} />}
              <div className="fbh-motivos">
                {g.itens.map(({ m }) => (
                  <div key={m.id} className={`fbh-motivo ${m.pontos > 0 ? "" : "espera"}`} style={{ ["--k" as string]: corMotivo(m) }}>
                    <span className="fbn-ico"><i className={`fa-solid ${icoMotivo(m)}`} /></span>
                    <div style={{ minWidth: 0 }}>
                      <div className="s">{m.selo}{m.urgente && m.pontos > 0 && <span className="fbn-pilula" style={{ ["--k" as string]: "#dc2626", marginLeft: 6 }}>urgente</span>}</div>
                      <div className="p">{m.porque}{m.fonte === "oportunidade" ? " · robô de oportunidades" : m.fonte === "revisao" ? " · previsão de revisão" : ` · atendimento ${m.registro?.tipo === "crm" ? "pós-serviço" : "reativação"} ${(m.registro?.id ?? 0) < 0 ? "de exemplo" : `#${m.registro?.id}`}`}</div>
                    </div>
                    <span className="fbh-pts">{m.pontos > 0 ? `+${m.pontos}` : m.aPartirDe ? `a partir de ${fmtDia(m.aPartirDe)}` : "espera"}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="fbh-col-dir">
      <Concluir key={c.key} c={c} hoje={hoje} onFeito={onFeito} inicial={inicial} />

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {(() => { const mq = maquinas.find((x) => x?.chassi) ?? maquinas.find(Boolean); return mq ? <button type="button" className="fbn-acao cinza" onClick={() => setMaq(mq)}><i className="fa-solid fa-tractor" /> Ver a máquina</button> : null; })()}
        {!hoje.exemplo && hoje.podeCockpit && <Link className="fbn-acao cinza" href={`/feedbacks/atendimento/${encodeURIComponent(c.key)}`} target="_blank"><i className="fa-solid fa-headset" /> Abrir no cockpit</Link>}
      </div>

      </div>

      {/* José, 28/10/2026: "no lado direito fica o bloco de atendimento; isso aqui faz parte do histórico
          de atendimento desse cliente — separa e organiza". */}
      <section className="fbh-col-baixo fbh-hist">
        <div className="fbh-hist-cab">
          <span className="fbn-ico p" style={{ ["--c" as string]: "#64748b" }}><i className="fa-solid fa-clock-rotate-left" /></span>
          <div style={{ minWidth: 0, flex: 1 }}><b>Histórico de atendimento deste cliente</b><small>o que já foi feito antes · abra o que precisar</small></div>
          <button type="button" className="fbn-acao cinza" onClick={() => hoje.abrirHistorico(c)}><i className="fa-solid fa-list" /> Ver tudo</button>
        </div>
        {registros.map((r) => (
          <details key={`r${r.id}`} className="fbh-det fbh-hist-it">
            <summary>
              <span className="ic" style={{ ["--k" as string]: r.tipo === "crm" ? "#2563eb" : "#7c3aed" }}><i className="fa-solid fa-comments" /></span>
              <span className="tx"><b>{r.tipo === "crm" ? "Pós-serviço" : "Reativação"} {r.id < 0 ? "de exemplo" : `#${r.id}`}</b><small>{[r.servico, r.data_servico ? `serviço em ${fmtDia(r.data_servico)}` : "", r.data_contato ? `último contato ${fmtDia(r.data_contato)}` : "ainda sem contato"].filter(Boolean).join(" · ")}</small></span>
              <i className="fa-solid fa-chevron-down seta" />
            </summary>
            <FichaCliente item={avaliar(r)} tags={c.tags} onHistorico={() => hoje.abrirHistorico(c)} />
          </details>
        ))}
        {revisoes.map((it) => (
          <details key={`t${it.trator.id}`} className="fbh-det fbh-hist-it">
            <summary>
              <span className="ic" style={{ ["--k" as string]: "#0f766e" }}><i className="fa-solid fa-tractor" /></span>
              <span className="tx"><b>Revisões do {it.trator.modelo} · …{it.trator.chassi.slice(-7)}</b><small>leituras do horímetro e previsão da próxima revisão</small></span>
              <i className="fa-solid fa-chevron-down seta" />
            </summary>
            <FichaTrator it={it} fi={comoItemFila(it)} onHistorico={() => hoje.abrirHistorico(c)} />
          </details>
        ))}
        {!temUltimoServicoNaFicha && (
          <details className="fbh-det fbh-hist-it">
            <summary>
              <span className="ic" style={{ ["--k" as string]: "#2563eb" }}><i className="fa-solid fa-file-invoice" /></span>
              <span className="tx"><b>Último serviço do cliente</b><small>a última OS e as peças</small></span>
              <i className="fa-solid fa-chevron-down seta" />
            </summary>
            <UltimoServico r={pseudo} onHistorico={() => hoje.abrirHistorico(c)} />
          </details>
        )}
      </section>
      <ModalMaquina alvo={maq} exemplo={hoje.exemplo} onFechar={() => setMaq(null)} />
    </div>
  );
}

/** Mapa de onde fica o trator (GET /api/feedbacks/maquina/local). */
function LocalDoTrator({ chassi, cod, exemplo }: { chassi: string | null; cod: string | null; exemplo?: boolean }) {
  const [res, setRes] = useState<{ locais: PontoMapa[]; endereco: string | null } | null>(null);
  const [erro, setErro] = useState("");
  useEffect(() => {
    if (exemplo) return;
    let vivo = true;
    fetchAuth(`/api/feedbacks/maquina/local?chassi=${encodeURIComponent(chassi || "")}&cod=${encodeURIComponent(cod || "")}`)
      .then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok || !j.ok) throw new Error(j.erro || "não consegui ler a localização"); return j; })
      .then((j) => { if (vivo) setRes({ locais: j.locais || [], endereco: j.endereco || null }); })
      .catch((e) => { if (vivo) setErro(e instanceof Error ? e.message : String(e)); });
    return () => { vivo = false; };
  }, [chassi, cod, exemplo]);
  if (exemplo) return <div className="fbh-rm-vazio">Cliente de exemplo: sem mapa.</div>;
  if (erro) return <div className="fbh-rm-vazio" style={{ color: "#b91c1c" }}>{erro}</div>;
  if (!res) return <div className="fbh-rm-vazio"><i className="fa-solid fa-circle-notch fa-spin" /> Procurando onde fica…</div>;
  return <MapaLocais locais={res.locais} endereco={res.endereco} />;
}

function Concluir({ c, hoje, onFeito, inicial }: { c: ClienteHoje; hoje: Hoje; onFeito?: () => void; inicial?: ConcluirInicial }) {
  const [passo, setPasso] = useState<Passo>(inicial?.passo ?? null);
  const [desfecho, setDesfecho] = useState<DesfechoHoje | null>(inicial?.desfecho ?? null);
  const [pesq, setPesq] = useState<Pesquisa>(() => ({ nota: inicial?.nota ?? null, status_cliente: inicial?.nota != null ? statusDaNota(inicial.nota) : null, nps: null, melhoria: null, comentario: "" }));
  const [statusManual, setStatusManual] = useState(false);
  const [retorno, setRetorno] = useState(somaDias(7));
  const [servicoEm, setServicoEm] = useState("");
  const [motivoRecusa, setMotivoRecusa] = useState("");
  const [obs, setObs] = useState("");
  const [trocas, setTrocas] = useState<Set<string>>(new Set());
  const temPos = c.motivos.some((m) => m.registro?.tipo === "crm");
  const ocupado = hoje.ocupado === c.key;
  const temPesquisa = pesq.nota != null || !!pesq.status_cliente;

  // José, 28/10/2026: "aqui também, inicia o atendimento" — antes do "Como foi?" vem o Iniciar atendimento;
  // fica em andamento (radar_tratores_atendimentos, chave cli:<cliente>) até confirmar ou cancelar
  const chaveAt = `cli:${c.key}`;
  const [atend, setAtend] = useState<AtendimentoRadar | null>(null);
  const [iniciando, setIniciando] = useState(false);
  const [semTabAt, setSemTabAt] = useState(false);
  const [erroAt, setErroAt] = useState("");
  const apiAt = useCallback((corpo?: object) => fetchAuth("/api/revisoes/vendidos/atendimentos", corpo ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) } : undefined), []);
  useEffect(() => {
    if (hoje.exemplo) return;
    let vivo = true;
    const id = setTimeout(async () => {
      try {
        const j = await (await apiAt()).json().catch(() => ({}));
        if (vivo && j.ok) setAtend((j.atendimentos || []).find((a: AtendimentoRadar) => a.chave === chaveAt) ?? null);
      } catch { /* sem rede */ }
    }, 0);
    return () => { vivo = false; clearTimeout(id); };
  }, [apiAt, chaveAt, hoje.exemplo]);
  const local = (): AtendimentoRadar => ({ id: "", chave: chaveAt, marco: null, user_id: null, user_nome: null, iniciado_em: new Date().toISOString() });
  const iniciarAt = async () => {
    if (hoje.exemplo) { setAtend(local()); return; }
    setIniciando(true); setErroAt("");
    try {
      const r = await apiAt({ acao: "iniciar", chave: chaveAt });
      const j = await r.json().catch(() => ({}));
      if (j.semTabela) { setSemTabAt(true); setAtend(local()); return; }
      if (!r.ok || !j.ok) throw new Error(j.erro || "Não consegui iniciar.");
      setAtend(j.atendimento);
    } catch (e) { setErroAt(e instanceof Error ? e.message : String(e)); }
    finally { setIniciando(false); }
  };
  const fecharAt = async (acao: "encerrar" | "cancelar") => {
    if (atend?.id) await apiAt({ acao, id: atend.id }).catch(() => null);
    setAtend(null);
  };

  const efetivo: DesfechoHoje | null = passo === "falou" ? desfecho : passo;
  const plano = useMemo(() => (efetivo ? planoDesfecho(c, efetivo, temPesquisa) : []), [c, efetivo, temPesquisa]);
  const marcado = (it: ItemPlano) => (it.efeito === "fecha" ? it.padrao !== trocas.has(it.motivo.id) : it.efeito !== "mantem");
  const nFecha = plano.filter((it) => it.efeito === "fecha" && marcado(it)).length;
  const nAnota = plano.filter((it) => it.efeito === "retorno" || it.efeito === "tentativa").length;

  const falta = !efetivo ? "Escolha o que aconteceu."
    : efetivo === "retornar" && !retorno ? "Diga a data do retorno."
    : efetivo === "recusou" && !motivoRecusa.trim() ? "Diga o motivo da recusa."
    : efetivo === "so_pesquisa" && !temPesquisa ? "Marque a nota ou como o cliente ficou."
    : efetivo === "whatsapp" && !c.telefone ? "Sem telefone para o WhatsApp."
    : null;

  const escolherPasso = (p: Passo) => { setPasso((x) => (x === p ? null : p)); setDesfecho(null); setTrocas(new Set()); };
  const escolherDesfecho = (d: DesfechoHoje) => { setDesfecho((x) => (x === d ? null : d)); setTrocas(new Set()); };
  const alternar = (id: string) => setTrocas((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const confirmar = async () => {
    if (!efetivo || falta) return;
    const marcados = new Set(plano.filter((it) => it.efeito === "fecha" && marcado(it)).map((it) => it.motivo.id));
    const ok = await hoje.executar(c, { desfecho: efetivo, marcados, pesquisa: temPos ? pesq : null, retorno: efetivo === "retornar" ? retorno : null, servicoEm: servicoEm || null, motivoRecusa, obs });
    if (ok) { await fecharAt("encerrar"); onFeito?.(); }
  };

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {!atend ? (
        <div className="fbh-at-ini">
          <span className="ic"><i className="fa-solid fa-headset" /></span>
          <span className="tx"><b>{c.emLigacaoCom ? `Em ligação com ${c.emLigacaoCom} no cockpit` : "Pronto para falar com o cliente?"}</b><small>Inicie o atendimento: a equipe vê que você está com {c.nome.split(" ")[0]}. Depois é só dizer como foi.</small></span>
          <button type="button" className="fbn-acao cheio" disabled={iniciando} onClick={() => void iniciarAt()}>{iniciando ? <i className="fa-solid fa-circle-notch fa-spin" /> : <i className="fa-solid fa-headset" />} Iniciar atendimento</button>
          {erroAt && <span className="fbf-alerta">{erroAt}</span>}
        </div>
      ) : (
      <>
      <div className="fbh-at-and">
        <span className="pulso" /><b>Atendimento em andamento</b>
        <small>{semTabAt ? "sem registro de andamento (falta o SQL radar-tratores-atendimentos)" : hoje.exemplo ? "exemplo" : `desde ${new Date(atend.iniciado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}${atend.user_nome ? ` · ${atend.user_nome}` : ""}`}</small>
        <button type="button" className="fbh-at-cancelar" onClick={() => { escolherPasso(null); void fecharAt("cancelar"); }}>Cancelar o atendimento</button>
      </div>
      <p className="fbf-sub" style={{ margin: 0 }}>Como foi?</p>
      <div className="fbh-passos">
        {PASSOS.map((p) => (
          <button key={p.k} type="button" className={`fbh-passo ${passo === p.k ? "on" : ""}`} style={{ ["--k" as string]: p.cor }} disabled={ocupado || (p.k === "whatsapp" && !c.telefone)} onClick={() => escolherPasso(p.k)}>
            <i className={`fa-solid ${p.ico}`} /><span>{p.rot}</span><small>{p.ajuda}</small>
          </button>
        ))}
      </div>

      {passo === "falou" && (
        <div className="fbf-painel">
          {temPos && (
            <>
              <div>
                <div className="rot">Pós-serviço: de 0 a 10, que nota o cliente deu?</div>
                <div className="fbf-opcoes">
                  {Array.from({ length: 11 }, (_, n) => (
                    <button key={n} type="button" className={`fbf-op nota ${pesq.nota === n ? "on" : ""}`} style={{ ["--k" as string]: corNota(n) }}
                      onClick={() => setPesq((p) => { const nota = p.nota === n ? null : n; return { ...p, nota, status_cliente: statusManual ? p.status_cliente : nota == null ? null : statusDaNota(nota) }; })}>{n}</button>
                  ))}
                </div>
              </div>
              <div>
                <div className="rot">Como ficou?</div>
                <div className="fbf-opcoes">
                  {STATUS.map((s) => (
                    <button key={s.v} type="button" className={`fbf-op ${pesq.status_cliente === s.v ? "on" : ""}`} style={{ ["--k" as string]: s.cor }}
                      onClick={() => { setStatusManual(true); setPesq((p) => ({ ...p, status_cliente: p.status_cliente === s.v ? null : s.v })); }}><i className={`fa-regular ${s.ico}`} /> {s.rot}</button>
                  ))}
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))", gap: 12 }}>
                <div>
                  <div className="rot">Indicaria a Nova Tratores?</div>
                  <div className="fbf-opcoes">{NPS_OPS.map((o) => <button key={o.v} type="button" className={`fbf-op ${pesq.nps === o.v ? "on" : ""}`} style={{ ["--k" as string]: o.cor }} onClick={() => setPesq((p) => ({ ...p, nps: p.nps === o.v ? null : o.v }))}>{o.v}</button>)}</div>
                </div>
                <div>
                  <div className="rot">O que podemos melhorar?</div>
                  <div className="fbf-opcoes">{MELHORIAS.map((m) => <button key={m} type="button" className={`fbf-op ${pesq.melhoria === m ? "on" : ""}`} onClick={() => setPesq((p) => ({ ...p, melhoria: p.melhoria === m ? null : m }))}>{m}</button>)}</div>
                </div>
              </div>
              <div>
                <div className="rot">O que o cliente disse</div>
                <textarea value={pesq.comentario} onChange={(e) => setPesq((p) => ({ ...p, comentario: e.target.value }))} placeholder="Com as palavras do cliente" />
              </div>
              {precisaAlerta(pesq) && <div className="fbf-alerta"><i className="fa-solid fa-bell" /> Nota baixa ou insatisfeito: {hoje.simulando ? "gravando de verdade, o gerente do pós-vendas recebe um aviso." : "o gerente do pós-vendas recebe um aviso."}</div>}
            </>
          )}
          <div>
            <div className="rot">{temPos ? "E o resto da conversa?" : "Como terminou?"}</div>
            <div className="fbf-opcoes">
              {DESFECHOS_FALOU.filter((d) => d.k !== "so_pesquisa" || temPos).map((d) => (
                <button key={d.k} type="button" className={`fbf-op ${desfecho === d.k ? "on" : ""}`} style={{ ["--k" as string]: d.cor }} title={d.ajuda} onClick={() => escolherDesfecho(d.k)}>
                  <i className={`fa-solid ${d.ico}`} /> {d.rot}
                </button>
              ))}
            </div>
          </div>
          {desfecho === "servico_agendado" && (
            <div><div className="rot">Para quando? (opcional)</div><input type="date" value={servicoEm} min={somaDias(0)} onChange={(e) => setServicoEm(e.target.value)} /></div>
          )}
          {desfecho === "retornar" && (
            <div>
              <div className="rot">Quando falar de novo?</div>
              <div className="fbf-opcoes" style={{ marginBottom: 8 }}>
                {([["Amanhã", 1], ["Em 3 dias", 3], ["Em 1 semana", 7], ["Em 15 dias", 15], ["Em 1 mês", 30]] as const).map(([rot, n]) => (
                  <button key={n} type="button" className={`fbf-op ${retorno === somaDias(n) ? "on" : ""}`} onClick={() => setRetorno(somaDias(n))}>{rot}</button>
                ))}
              </div>
              <input type="date" value={retorno} min={somaDias(1)} onChange={(e) => setRetorno(e.target.value)} />
            </div>
          )}
          {desfecho === "recusou" && (
            <div>
              <div className="rot">Por que recusou?</div>
              <div className="fbf-opcoes" style={{ marginBottom: 8 }}>
                {MOTIVOS_RECUSA.map((m) => <button key={m} type="button" className={`fbf-op ${motivoRecusa === m ? "on" : ""}`} onClick={() => setMotivoRecusa(motivoRecusa === m ? "" : m)}>{m}</button>)}
              </div>
              <input type="text" value={motivoRecusa} onChange={(e) => setMotivoRecusa(e.target.value)} placeholder="Ou escreva o motivo" />
            </div>
          )}
          {desfecho && desfecho !== "so_pesquisa" && (
            <div><div className="rot">Observação (opcional)</div><input type="text" value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: técnico, peça, valor combinado" /></div>
          )}
        </div>
      )}

      {efetivo && plano.length > 0 && (
        <div className="fbh-plano">
          <div className="rot">O que vai acontecer com cada motivo{plano.some((it) => it.efeito === "fecha") ? " (marque o que também foi tratado)" : ""}:</div>
          {plano.map((it) => it.efeito === "fecha" ? (
            <label key={it.motivo.id}>
              <input type="checkbox" checked={marcado(it)} onChange={() => alternar(it.motivo.id)} />
              <span>{it.motivo.selo}<small>{marcado(it) ? it.frase.replace(" (marque se também tratou)", "") : "fica aberto"}</small></span>
            </label>
          ) : (
            <div key={it.motivo.id} className="it">
              <i className={`fa-solid ${ICO_EFEITO[it.efeito]}`} />
              <span>{it.motivo.selo}<small>{it.efeito === "retorno" && retorno ? `${it.frase}: ${fmtDia(retorno)}` : it.frase}</small></span>
            </div>
          ))}
        </div>
      )}

      {efetivo && (
        <div className="fbh-confirmar">
          <button type="button" className="fbn-acao cheio" disabled={ocupado || !!falta} onClick={() => void confirmar()}>
            {ocupado ? <><i className="fa-solid fa-circle-notch fa-spin" /> Gravando…</> : <><i className="fa-solid fa-check" /> Confirmar{nFecha ? ` · fecha ${nFecha}` : ""}{nAnota ? ` · anota ${nAnota}` : ""}</>}
          </button>
          <button type="button" className="fbn-acao" onClick={() => escolherPasso(null)}>Cancelar</button>
          {falta ? <span className="fbf-alerta" style={{ color: "var(--t2)" }}>{falta}</span>
            : <span className={`fbh-sim ${hoje.simulando ? "" : "real"}`}><i className={`fa-solid ${hoje.simulando ? "fa-flask" : "fa-database"}`} /> {hoje.simulando ? "simulação: nada é gravado" : "grava de verdade"}</span>}
        </div>
      )}
      </>
      )}
    </div>
  );
}
