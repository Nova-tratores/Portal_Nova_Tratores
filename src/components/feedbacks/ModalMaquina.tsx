"use client";
// Janela da MÁQUINA (José, 23/10/2026: "faz um modal, e explica de qual projeto você tá falando, deixa
// os últimos serviços ali e as últimas revisões"). Abre do motivo na tela Hoje (revisão, pós-serviço,
// robô) e do cartão da máquina no Histórico do cliente. Mesmo visual do ModalHistoricoCliente.
//   Cabeçalho: modelo, chassi completo, projeto(s) Omie (Nova/Castro), dono, entrega (anotada e a
//   corrigida), vendedor, cidade.
//   Previsão (quando a máquina está no controle de revisões): média h/dia, horímetro hoje, próxima
//   revisão e data, confiança e o gráfico horas × tempo (o mesmo da ficha do trator).
//   Últimas revisões: feitas (controle, cheque, envio), as que faltaram na sequência e a próxima.
//   Últimos serviços desta máquina: OS do POS/Omie que citam o chassi, com o que pediu/fez, técnico,
//   valor, o pedido de peças dentro e o pós-serviço do CRM.
// Dados: GET /api/feedbacks/maquina (guarda: módulo feedbacks). `exemplo` usa dados inventados.
// Esc fecha; no celular ocupa a tela.
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { fetchAuth } from "@/lib/auth/client";
import { useAuth } from "@/hooks/useAuth";
import { usePermissoes } from "@/hooks/usePermissoes";
import { linkNF, linkOS, linkPPV, linkPV, linkProjeto, type Acesso, type LinkDoc } from "@/lib/feedbacks/atendimento/links";
import type { EventoMaquina } from "@/lib/feedbacks/atendimento/maquina";
import { revisoesDaMaquina, servicosDaMaquina, rotuloMaquina, type LinhaRevisao, type MaquinaRef, type ProjetoRef } from "@/lib/feedbacks/maquina-modal";
import { fmtDataBR, fmtH, ROTULO_CONFIANCA, type TratorRevisao } from "@/lib/feedbacks/previsao-revisao";
import { ESTILO_HCX } from "./ModalHistoricoCliente";
import { ESTILO_FILA } from "./fila/estiloFila";
import { ESTILO_FBN } from "./estiloNovo";
import { COR_SITUACAO, Grafico, PilulaSituacao, fmtMedia, rotuloPrazo } from "./fila/FichaTrator";
import { historicoMaquinaExemplo } from "./hoje/exemplosMaquina";

export interface RespostaMaquina {
  historico: { chassi: string; projetos: ProjetoRef[]; eventos: EventoMaquina[]; horimetro_recente: { valor: number; data: string | null; origem: string } | null;
    maquina: { modelo?: string | null; dono_tratores?: string | null; cidade?: string | null; vendedor?: string | null; entrega?: string | null } | null; erros: Record<string, string> };
  revisao: TratorRevisao | null;
  avisos?: string[];
}

const fmtMoeda = (v: number | null | undefined) => (v == null ? "" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const nomeEmpresa = (e: string) => (/castro/i.test(e) ? "Castro" : /nova/i.test(e) ? "Nova" : e || "Omie");

// Cache por chassi: a ficha do cliente já lê a máquina para o resumo; a janela reaproveita.
const CACHE = new Map<string, RespostaMaquina>();

/** Lê GET /api/feedbacks/maquina (ou os dados de exemplo). Usado pela janela e pelo resumo na ficha. */
export function useDadosMaquina(alvo: MaquinaRef | null, exemplo = false) {
  const [dados, setDados] = useState<RespostaMaquina | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const chassi = alvo?.chassi || null;
  useEffect(() => {
    if (!alvo) return;
    let vivo = true;
    Promise.resolve().then(async () => {
      if (!vivo) return;
      setDados(null); setErro(null);
      if (exemplo) { setDados(historicoMaquinaExemplo(alvo)); return; }
      if (!chassi) { setErro("Este motivo não tem o chassi da máquina."); return; }
      const chave = `${chassi}|${alvo.projeto?.nome || ""}`;
      const guardado = CACHE.get(chave);
      if (guardado) { setDados(guardado); return; }
      setCarregando(true);
      try {
        const q = new URLSearchParams({ chassi });
        if (alvo.projeto) { q.set("projeto", alvo.projeto.nome); q.set("empresa", alvo.projeto.empresa); }
        const r = await fetchAuth(`/api/feedbacks/maquina?${q}`);
        const j = await r.json().catch(() => ({}));
        if (!vivo) return;
        if (!r.ok) setErro(j?.erro || `erro ${r.status}`);
        else { CACHE.set(chave, j as RespostaMaquina); setDados(j as RespostaMaquina); }
      } catch (e) { if (vivo) setErro((e as Error)?.message || "falha de rede"); } finally { if (vivo) setCarregando(false); }
    });
    return () => { vivo = false; };
  }, [alvo, chassi, exemplo]);
  return { dados, erro, carregando };
}

export default function ModalMaquina({ alvo, exemplo = false, onFechar }: { alvo: MaquinaRef | null; exemplo?: boolean; onFechar: () => void }) {
  const { userProfile } = useAuth();
  const { temAcesso } = usePermissoes(userProfile?.id);
  const acesso: Acesso = { pos: temAcesso("pos"), ppv: temAcesso("ppv") };
  const { dados, erro, carregando } = useDadosMaquina(alvo, exemplo);
  const chassi = alvo?.chassi || null;

  useEffect(() => {
    if (!alvo) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onFechar(); } };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [alvo, onFechar]);

  // a previsão que veio do motivo vale até a resposta trazer a sua
  const trator = dados?.revisao ?? alvo?.trator ?? null;
  const p = trator?.previsao ?? null;
  const eventos = useMemo(() => dados?.historico.eventos ?? [], [dados]);
  const revisoes = useMemo(() => revisoesDaMaquina(eventos, p), [eventos, p]);
  const servicos = useMemo(() => servicosDaMaquina(eventos), [eventos]);
  if (!alvo || typeof document === "undefined") return null;

  const m = dados?.historico.maquina;
  const modelo = trator?.modelo || m?.modelo || alvo.modelo || "Máquina";
  const projetos: ProjetoRef[] = dados?.historico.projetos?.length ? dados.historico.projetos : alvo.projeto ? [alvo.projeto] : trator?.projeto ? [trator.projeto] : [];
  const dono = trator?.cliente || m?.dono_tratores || null;
  const erros = dados ? Object.keys(dados.historico.erros || {}) : [];
  const entregaAnotada = p?.entregaAnotada ?? m?.entrega ?? null;

  return createPortal(
    <div className="hcx-fundo mqx-fundo" onClick={(e) => { e.stopPropagation(); onFechar(); }}>
      <style>{ESTILO_HCX + ESTILO_FBN + ESTILO_FILA + ESTILO_MQX}</style>
      <div className="hcx mqx" role="dialog" aria-modal="true" aria-label={`Máquina ${modelo}`} onClick={(e) => e.stopPropagation()}>
        <header className="hcx-cab">
          <span className="hcx-ico" style={{ ["--c" as string]: "#0f766e" }}><i className="fa-solid fa-tractor" /></span>
          <div className="hcx-min" style={{ flex: 1 }}>
            <div className="hcx-rot">Máquina{exemplo ? " · exemplo" : ""}</div>
            <h2 className="hcx-nome">{/^\d/.test(modelo) ? `Mahindra ${modelo}` : modelo}</h2>
            <div className="hcx-rot hcx-mono">{chassi ? `Chassi ${chassi}` : "sem chassi"}</div>
          </div>
          <button type="button" onClick={onFechar} className="hcx-x" aria-label="Fechar (Esc)"><i className="fa-solid fa-xmark" /></button>
        </header>

        <div className="hcx-corpo">
          <div className="hcx-linha">
            <div className="hcx-linha-d">
              {projetos.length === 0 ? <span><i className="fa-solid fa-diagram-project" /> sem projeto no Omie com este chassi</span>
                : projetos.map((pr) => {
                  const href = linkProjeto(pr);
                  return <span key={`${pr.nome}|${pr.empresa}`} className="hcx-tag"><i className="fa-solid fa-diagram-project" /> Projeto Omie ({nomeEmpresa(pr.empresa)}): {href ? <a className="hcx-a" href={href} target="_blank" rel="noopener noreferrer">{pr.nome}</a> : pr.nome}</span>;
                })}
            </div>
            <div className="hcx-dados">
              <div><div className="hcx-rot">Dono</div><div>{dono || "—"}</div></div>
              <div><div className="hcx-rot">Entrega</div><div>{fmtDataBR(entregaAnotada)}{p?.entregaAjustada ? <div className="hcx-rot">a conta usa {fmtDataBR(p.entrega)} (a 1ª leitura é de antes da data anotada)</div> : null}</div></div>
              <div><div className="hcx-rot">Vendedor</div><div>{trator?.vendedor || m?.vendedor || "—"}</div></div>
              <div><div className="hcx-rot">Cidade</div><div>{trator?.cidade || m?.cidade || "—"}</div></div>
              {dados?.historico.horimetro_recente && <div><div className="hcx-rot">Último horímetro lido</div><div>{fmtH(dados.historico.horimetro_recente.valor)} <span className="hcx-rot">· {fmtDataBR(dados.historico.horimetro_recente.data)} ({dados.historico.horimetro_recente.origem.toLowerCase()})</span></div></div>}
            </div>
          </div>

          {erros.length > 0 && <div className="hcx-aviso"><i className="fa-solid fa-triangle-exclamation" /> Parte não carregou ({erros.join(", ")}). O resto está abaixo.</div>}
          {erro && <div className="hcx-aviso"><i className="fa-solid fa-triangle-exclamation" /> {erro}</div>}

          {p ? (
            <section className="mqx-sec">
              <h3 className="mqx-t"><i className="fa-solid fa-gauge" /> Previsão da próxima revisão <span style={{ marginLeft: "auto", display: "inline-flex", gap: 6, flexWrap: "wrap" }}><PilulaSituacao p={p} /><span className="fbn-pilula" style={{ ["--k" as string]: p.mediaPadrao ? "#64748b" : "#0f766e" }}>{ROTULO_CONFIANCA[p.confianca]}</span></span></h3>
              <div className="fbr-prev">
                <div><small>Média de uso</small><b>{fmtMedia(p.mediaHDia)}</b><span>{p.mediaPadrao ? "padrão, sem leitura" : p.ritmoRecente != null ? `ritmo recente ${fmtMedia(p.ritmoRecente)}` : ""}</span></div>
                <div><small>Horímetro hoje</small><b>{fmtH(p.horimetroHoje)}</b><span>estimado</span></div>
                <div><small>Próxima revisão</small><b>{p.revisaoOferta.toLocaleString("pt-BR")} h</b><span>{p.ultimaRevisaoFeita != null ? `última feita: ${p.ultimaRevisaoFeita} h` : "nenhuma feita na loja"}</span></div>
                <div><small>Data prevista</small><b>{fmtDataBR(p.dataPrevista)}</b><span style={{ color: COR_SITUACAO[p.situacao] }}>{rotuloPrazo(p)}</span></div>
              </div>
              <p className="fbr-expl" style={{ margin: 0 }}>{p.explicacao}.</p>
              <div style={{ ["--c" as string]: "#0f766e", ["--t3" as string]: "#94a3b8" }}><Grafico p={p} /></div>
            </section>
          ) : !carregando && dados && (
            <div className="hcx-det"><i className="fa-solid fa-circle-info" /> Esta máquina não está no controle de revisões Mahindra (tabela de tratores): sem previsão de revisão.</div>
          )}

          <section className="mqx-sec">
            <h3 className="mqx-t"><i className="fa-solid fa-list-check" /> Últimas revisões</h3>
            {carregando && !dados ? <div className="hcx-rot"><i className="fa-solid fa-circle-notch fa-spin" /> Lendo…</div>
              : revisoes.length === 0 ? <div className="hcx-rot">Nenhuma revisão registrada para esta máquina.</div>
              : <ol className="hcx-tempo">{revisoes.slice(0, 12).map((r) => <PassoRevisao key={`${r.estado}-${r.rev}`} r={r} />)}</ol>}
          </section>

          <section className="mqx-sec">
            <h3 className="mqx-t"><i className="fa-solid fa-screwdriver-wrench" /> Últimos serviços desta máquina</h3>
            {carregando && !dados ? <div className="hcx-rot"><i className="fa-solid fa-circle-notch fa-spin" /> Lendo as OS…</div>
              : servicos.length === 0 ? <div className="hcx-rot">Nenhuma OS do POS ou do Omie cita este chassi.</div>
              : servicos.map(({ os, pecas, posServico }) => {
                const doc = os.ref.tipo === "os" ? linkOS(os.ref, acesso) : null;
                const nf = os.ref.tipo === "os" ? linkNF(os.ref.link_nf, os.ref.nf) : null;
                const totalPecas = pecas.reduce((s, x) => s + (x.valor || 0), 0);
                return (
                  <article key={os.id} className="hcx-linha">
                    <div className="hcx-linha-t">
                      <span className="hcx-min"><b><Doc doc={doc}>{os.titulo}</Doc></b></span>
                      <span className="hcx-valor">{fmtMoeda(os.valor)}</span>
                    </div>
                    <div className="hcx-linha-d">
                      <span><i className="fa-regular fa-calendar" /> {fmtDataBR(os.data)}</span>
                      {os.status && <span className="hcx-tag">{os.status}</span>}
                      {os.quem && <span><i className="fa-regular fa-user" /> {os.quem}</span>}
                      {os.horimetro != null && <span><i className="fa-solid fa-gauge" /> {fmtH(os.horimetro)}</span>}
                      {nf && <a className="hcx-a" href={nf.href} target="_blank" rel="noopener noreferrer" title={nf.titulo}><i className="fa-regular fa-file-lines" /> NF</a>}
                    </div>
                    {os.detalhe && <div className="hcx-det hcx-clamp" title={os.detalhe}>{os.detalhe}</div>}
                    {pecas.length > 0 && (
                      <div className="hcx-pecas">
                        <div className="hcx-pecas-t"><span><i className="fa-solid fa-gears" /> Peças deste serviço</span><span className="hcx-valor p">{fmtMoeda(totalPecas)}</span></div>
                        {pecas.map((x) => {
                          const d = x.ref.tipo === "ppv" ? linkPPV(x.ref.id, acesso) : x.ref.tipo === "pv" ? linkPV(x.ref) : null;
                          return <div key={x.id} className="hcx-linha-d"><Doc doc={d}>{x.titulo}</Doc>{x.status && <span className="hcx-tag">{x.status}</span>}<span style={{ marginLeft: "auto" }}>{fmtMoeda(x.valor)}</span></div>;
                        })}
                      </div>
                    )}
                    {posServico.map((a) => (
                      <div key={a.id} className="mqx-pos"><i className="fa-solid fa-comments" /> <span><b>Pós-serviço</b> {fmtDataBR(a.data)}{a.quem ? ` · ${a.quem}` : ""}{a.detalhe ? ` — “${a.detalhe}”` : ""}</span></div>
                    ))}
                  </article>
                );
              })}
          </section>
          {dados?.avisos?.map((a) => <div key={a} className="hcx-rot">{a}</div>)}
          <div className="hcx-rot">{rotuloMaquina({ chassi, modelo, projeto: projetos[0] ?? null })}</div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function PassoRevisao({ r }: { r: LinhaRevisao }) {
  const estado = r.estado === "feita" ? "feito" : r.estado === "faltou" ? "faltou" : r.estado === "atrasada" ? "atrasada" : "proxima";
  const titulo = r.estado === "feita" ? `Revisão ${r.rev.toLocaleString("pt-BR")} h` : r.estado === "faltou" ? `Revisão ${r.rev.toLocaleString("pt-BR")} h — faltou` : `Próxima: revisão ${r.rev.toLocaleString("pt-BR")} h${r.estado === "atrasada" ? " (atrasada)" : ""}`;
  const quando = r.data ? `${r.estado === "feita" ? "" : "prevista para "}${fmtDataBR(r.data)}` : r.estado === "feita" ? "sem data" : "";
  return (
    <li className={`hcx-passo ${estado}`}>
      <span className="hcx-ponto" aria-hidden><i className={`fa-solid ${estado === "feito" ? "fa-check" : estado === "atrasada" ? "fa-exclamation" : estado === "faltou" ? "fa-minus" : "fa-clock"}`} /></span>
      <div className="hcx-min">
        <div>{titulo}</div>
        <div className="hcx-rot">
          {[quando, r.horimetro != null ? fmtH(r.horimetro) : "", r.origem].filter(Boolean).join(" · ")}
          {r.link && <> · <a className="hcx-a" href={r.link.href} target="_blank" rel="noopener noreferrer">{r.link.rotulo}</a></>}
        </div>
      </div>
    </li>
  );
}

function Doc({ doc, children }: { doc: LinkDoc | null; children: React.ReactNode }) {
  if (!doc) return <>{children}</>;
  return <a className="hcx-a" href={doc.href} target="_blank" rel="noopener noreferrer" title={doc.titulo}>{children}</a>;
}

const ESTILO_MQX = `
.mqx-fundo { z-index: 10020 }
.mqx { max-width: 900px; --t3: var(--portal-text-muted, #94a3b8); --c: #0f766e }
.mqx-sec { display: grid; gap: 10px; min-width: 0 }
.mqx-t { margin: 0; font-size: 15px; font-weight: 500; display: flex; gap: 8px; align-items: center; flex-wrap: wrap } .mqx-t > i { color: #0f766e }
.hcx-passo.faltou .hcx-ponto { --k: #d97706 } .hcx-passo.faltou > div > div:first-child { color: #b45309 }
.mqx-pos { display: flex; gap: 8px; align-items: baseline; font-size: 13px; color: var(--t2); padding: 8px 10px; border-radius: 12px; background: var(--soft); border: 1px solid var(--b) } .mqx-pos > i { color: #dc2626 }
@media (max-width: 640px) { .mqx-fundo { padding: 0 } .mqx { max-height: 100vh; height: 100vh; border-radius: 0 } }
`;
