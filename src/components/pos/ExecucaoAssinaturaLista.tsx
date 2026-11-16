"use client";
// "Execução e assinatura" da OS como LISTA DE SITUAÇÃO (José, 16/11/2026, opção A de /pos/teste-execucao:
// "quando é uma revisão, fica mt mt mt poluído"). O bloco fica recolhido como um dropdown; se falta algo
// (assinatura, cheque, revisão anterior sem cheque) aparece uma bolinha piscando no título.
// Cada linha diz a situação numa frase e tem um botão; ao abrir a linha aparece o bloco completo de sempre
// (AssinaturaClienteBloco, ChequeRevisaoBloco, RevisoesAnteriores, RadarTratorOS) — a lógica continua lá.
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { authHeaders } from "@/lib/auth/client";
import AssinaturaClienteBloco from "./AssinaturaClienteBloco";
import ChequeRevisaoBloco, { RevisoesAnteriores } from "./ChequeRevisaoBloco";
import RadarTratorOS from "./RadarTratorOS";

interface Resumo {
  ass?: { assinado: boolean; quando: string; nome: string; mensagem: string };
  cheque?: { horas: number; pagina: number | null; assinado: boolean; link: string } | { erro: string };
  semCheque?: number[];
  enviadas?: number[];
  trator?: { modelo: string; dias: number; ligacoes: number };
}

const quando = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).replace(", ", " às ") : "";

export default function ExecucaoAssinaturaLista({ osId, podeEditar, revisao, datasResumo, datasEditor, rodape }: {
  osId: string;
  podeEditar: boolean;
  revisao: boolean;
  /** "Serviço feito em 10/11" + "Começou às 08:00 · técnico X" */
  datasResumo: { titulo: string; sub: string };
  datasEditor: ReactNode;
  /** Checklists, Resserviço, Comissão — botõezinhos no fim que abrem o bloco */
  rodape: { k: string; rotulo: string; icone: string; conteudo: ReactNode }[];
}) {
  const [aberto, setAberto] = useState(false);
  const [linha, setLinha] = useState<string | null>(null);
  const [extra, setExtra] = useState<string | null>(null);
  const [r, setR] = useState<Resumo>({});

  const carregar = useCallback(async () => {
    const h = await authHeaders();
    const pega = (u: string) => fetch(u, { headers: h }).then(async (x) => ({ ok: x.ok, j: await x.json().catch(() => ({})) })).catch(() => null);
    const base = `/api/pos/ordens/${encodeURIComponent(osId)}`;
    const [a, c, ant, rad] = await Promise.all([
      pega(`${base}/assinatura`),
      revisao ? pega(`${base}/cheque`) : null,
      revisao ? pega(`${base}/cheque?anteriores=1`) : null,
      revisao ? pega(`/api/revisoes/vendidos/da-os?os=${encodeURIComponent(osId)}`) : null,
    ]);
    const novo: Resumo = {};
    if (a?.ok && a.j.assinatura) novo.ass = { assinado: !!a.j.assinatura.assinado_em, quando: quando(a.j.assinatura.assinado_em), nome: a.j.assinatura.assinado_nome || "", mensagem: a.j.mensagemWhatsApp || "" };
    if (c) novo.cheque = c.ok && c.j.cheque
      ? { horas: c.j.cheque.horas, pagina: c.j.cheque.pagina, assinado: !!c.j.cheque.assinado_em, link: c.j.linkCheque }
      : { erro: c.j?.error || "não consegui carregar o cheque" };
    if (ant?.ok && Array.isArray(ant.j.anteriores)) {
      novo.semCheque = ant.j.anteriores.filter((x: { situacao: string }) => x.situacao === "feita_sem_cheque").map((x: { horas: number }) => x.horas);
      novo.enviadas = ant.j.anteriores.filter((x: { situacao: string }) => x.situacao === "enviada").map((x: { horas: number }) => x.horas);
    }
    if (rad?.ok && rad.j.ok && rad.j.trator) novo.trator = { modelo: rad.j.trator.modelo, dias: rad.j.trator.entrega?.dias ?? rad.j.trator.dias, ligacoes: (rad.j.contatos || []).length };
    setR(novo);
  }, [osId, revisao]);
  useEffect(() => { carregar(); }, [carregar]);

  // abrir/fechar uma linha relê o resumo (o que mudou lá dentro aparece na frase)
  const alt = (k: string) => { setLinha((x) => (x === k ? null : k)); if (linha) carregar(); };

  const ch = r.cheque && "horas" in r.cheque ? r.cheque : null;
  const chErro = r.cheque && "erro" in r.cheque ? r.cheque.erro : "";
  const falta = (r.ass && !r.ass.assinado) || !!chErro || (r.semCheque?.length ?? 0) > 0;
  const waTexto = r.ass?.mensagem ? `https://wa.me/?text=${encodeURIComponent(r.ass.mensagem)}` : "";

  return (
    <div className="os-card os-aba os-aba-servicos eal">
      <style>{CSS}</style>
      <button type="button" className="eal-topo" onClick={() => { setAberto((v) => !v); if (aberto) carregar(); }} aria-expanded={aberto}>
        <i className="fas fa-calendar-check eal-topo-ic" />
        <span className="eal-topo-t">Execução e assinatura</span>
        {falta && <span className="eal-bolinha" title="Falta alguma coisa aqui" />}
        <i className={`fas fa-chevron-${aberto ? "up" : "down"} eal-topo-seta`} />
      </button>

      {aberto && (
        <div className="eal-lista">
          <Linha k="datas" aberta={linha === "datas"} onAlt={alt} ic="fa-calendar-day" cor="#0369A1" titulo={datasResumo.titulo} sub={datasResumo.sub}
            acao={podeEditar ? <button type="button" className="eal-b leve" onClick={() => alt("datas")}><i className="fas fa-pen" /> Alterar</button> : null}>
            {datasEditor}
          </Linha>

          <Linha k="ass" aberta={linha === "ass"} onAlt={alt} ic="fa-signature" cor={!r.ass ? "#64748b" : r.ass.assinado ? "#047857" : "#B45309"}
            titulo={!r.ass ? "Assinatura do cliente" : r.ass.assinado ? "Cliente assinou" : "Falta o cliente assinar"}
            sub={!r.ass ? "carregando…" : r.ass.assinado ? [r.ass.nome, r.ass.quando].filter(Boolean).join(" · ") : revisao ? "Um link só serve para a OS e para o cheque" : "Mande o link pelo WhatsApp"}
            acao={r.ass && !r.ass.assinado && waTexto
              ? <a className="eal-b wa" href={waTexto} target="_blank" rel="noreferrer"><i className="fab fa-whatsapp" /> Pedir</a>
              : r.ass?.assinado ? <button type="button" className="eal-b leve" onClick={() => alt("ass")}>Ver</button> : null}>
            <AssinaturaClienteBloco osId={osId} podeEditar={podeEditar} />
          </Linha>

          {revisao && (
            <Linha k="cheque" aberta={linha === "cheque"} onAlt={alt} ic="fa-file-signature" cor={chErro ? "#B91C1C" : ch?.assinado ? "#047857" : "#64748b"}
              titulo={chErro ? "Cheque da revisão com problema" : !ch ? "Cheque da revisão" : ch.assinado ? `Cheque das ${ch.horas} h pronto para a Mahindra` : `Cheque das ${ch.horas} h espera a assinatura`}
              sub={chErro || (ch ? `Página ${ch.pagina ?? "—"} do talão · a assinatura entra sozinha` : "carregando…")}
              acao={ch?.link ? <a className="eal-b leve" href={ch.link} target="_blank" rel="noreferrer"><i className="fas fa-file-pdf" /> Abrir</a> : null}>
              <ChequeRevisaoBloco osId={osId} podeEditar={podeEditar} soCheque />
            </Linha>
          )}

          {revisao && ch && r.semCheque && (r.semCheque.length > 0 || (r.enviadas?.length ?? 0) > 0) && (
            <Linha k="ant" aberta={linha === "ant"} onAlt={alt} ic="fa-clock-rotate-left" cor={r.semCheque.length ? "#B91C1C" : "#047857"}
              titulo={r.semCheque.length === 0 ? "Revisões anteriores com cheque" : r.semCheque.length === 1 ? `A revisão de ${r.semCheque[0]} h ficou sem cheque` : `${r.semCheque.length} revisões ficaram sem cheque (${r.semCheque.join(", ")} h)`}
              sub={r.enviadas?.length ? `${r.enviadas.map((h) => `${h} h`).join(", ")} já ${r.enviadas.length === 1 ? "foi enviada" : "foram enviadas"}` : "Nenhuma enviada ainda"}
              acao={r.semCheque.length && podeEditar ? <button type="button" className="eal-b alerta" onClick={() => alt("ant")}>Gerar cheque</button> : null}>
              <RevisoesAnteriores osId={osId} podeEditar={podeEditar} horasAtual={ch.horas} aoMudar={carregar} />
            </Linha>
          )}

          {revisao && r.trator && (
            <Linha k="radar" aberta={linha === "radar"} onAlt={alt} ic="fa-tractor" cor="#0369A1"
              titulo={`Trator com o cliente há ${r.trator.dias} dias`}
              sub={`${r.trator.modelo} · ${r.trator.ligacoes ? `${r.trator.ligacoes} ${r.trator.ligacoes === 1 ? "ligação" : "ligações"}` : "nenhuma ligação"}`}>
              <RadarTratorOS osId={osId} />
            </Linha>
          )}

          {rodape.length > 0 && (
            <div className="eal-peq">
              {rodape.map((x) => (
                <button key={x.k} type="button" className={extra === x.k ? "on" : ""} onClick={() => setExtra((e) => (e === x.k ? null : x.k))}>
                  <i className={`fas ${x.icone}`} /> {x.rotulo}
                </button>
              ))}
            </div>
          )}
          {rodape.map((x) => <div key={x.k} style={{ display: extra === x.k ? "block" : "none" }}>{x.conteudo}</div>)}
        </div>
      )}
    </div>
  );
}

function Linha({ k, aberta, onAlt, ic, cor, titulo, sub, acao, children }: {
  k: string; aberta: boolean; onAlt: (k: string) => void; ic: string; cor: string; titulo: string; sub: string; acao?: ReactNode; children?: ReactNode;
}) {
  return (
    <div className={`eal-l${aberta ? " aberta" : ""}`}>
      <div className="eal-cab">
        <button type="button" className="eal-clique" onClick={() => onAlt(k)}>
          <span className="eal-ic" style={{ color: cor, background: `color-mix(in srgb, ${cor} 11%, var(--surface, #fff))` }}><i className={`fas ${ic}`} /></span>
          <span className="eal-txt"><span>{titulo}</span><small>{sub}</small></span>
        </button>
        {acao}
        <button type="button" className="eal-seta" onClick={() => onAlt(k)} aria-label={aberta ? "Fechar" : "Ver detalhes"}><i className={`fas fa-chevron-${aberta ? "up" : "down"}`} /></button>
      </div>
      {aberta && <div className="eal-det">{children}</div>}
    </div>
  );
}

const CSS = `
.eal { padding: 0 !important; overflow: visible }
.eal-topo { display: flex; align-items: center; gap: 10px; width: 100%; padding: 16px 18px; border: 0; background: transparent; font: inherit; cursor: pointer; text-align: left; color: var(--portal-text, #0f172a); border-radius: inherit }
.eal-topo:hover { background: color-mix(in srgb, #0369A1 4%, transparent) }
.eal-topo-ic { color: #0369A1; font-size: 14px }
.eal-topo-t { font-size: 15.5px }
.eal-topo-seta { margin-left: auto; color: #94a3b8; font-size: 13px }
.eal-bolinha { width: 10px; height: 10px; border-radius: 50%; background: #F59E0B; box-shadow: 0 0 0 0 rgba(245,158,11,.6); animation: ealPisca 1.4s ease-out infinite }
@keyframes ealPisca { 0% { box-shadow: 0 0 0 0 rgba(245,158,11,.6); opacity: 1 } 70% { box-shadow: 0 0 0 8px rgba(245,158,11,0); opacity: .55 } 100% { box-shadow: 0 0 0 0 rgba(245,158,11,0); opacity: 1 } }
@media (prefers-reduced-motion: reduce) { .eal-bolinha { animation: none } }
.eal-lista { display: grid; gap: 8px; padding: 0 18px 18px }
.eal-l { border: 1px solid var(--border, #edf0f4); border-radius: 13px; background: var(--surface, #fff) }
.eal-l.aberta { box-shadow: 0 6px 18px -12px rgba(15,23,42,.25) }
.eal-cab { display: flex; align-items: center; gap: 10px; padding: 10px 10px 10px 12px }
.eal-clique { display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0; border: 0; background: transparent; padding: 0; font: inherit; cursor: pointer; text-align: left }
.eal-ic { width: 36px; height: 36px; border-radius: 10px; display: grid; place-items: center; font-size: 14px; flex-shrink: 0 }
.eal-txt { display: grid; min-width: 0; line-height: 1.3 }
.eal-txt > span { font-size: 14.5px; color: var(--portal-text, #0f172a) }
.eal-txt small { font-size: 12.5px; color: var(--portal-text-muted, #64748b) }
.eal-seta { border: 0; background: transparent; color: #94a3b8; width: 28px; height: 28px; border-radius: 8px; cursor: pointer; flex-shrink: 0 } .eal-seta:hover { background: var(--portal-bg-secondary, #f1f5f9) }
.eal-det { padding: 2px 12px 12px }
.eal-det > div { margin-bottom: 0 !important }
.eal-b { display: inline-flex; align-items: center; gap: 7px; height: 34px; padding: 0 13px; border-radius: 9px; border: 1px solid #0369A1; background: #0369A1; color: #fff !important; font: inherit; font-size: 13px; cursor: pointer; white-space: nowrap; text-decoration: none !important; flex-shrink: 0 }
.eal-b.leve { background: var(--surface, #fff); color: var(--portal-text-secondary, #334155) !important; border-color: var(--border, #dfe3ea) } .eal-b.leve:hover { background: var(--portal-bg-secondary, #f8fafc) }
.eal-b.wa { background: #16a34a; border-color: #16a34a }
.eal-b.alerta { background: var(--surface, #fff); color: #B91C1C !important; border-color: #fecaca } .eal-b.alerta:hover { background: #fef2f2 }
.eal-peq { display: flex; gap: 8px; flex-wrap: wrap; padding-top: 12px; margin-top: 4px; border-top: 1px solid var(--border, #f1f5f9) }
.eal-peq button { display: inline-flex; align-items: center; gap: 7px; height: 32px; padding: 0 12px; border-radius: 999px; border: 1px solid var(--border, #e2e8f0); background: var(--portal-bg-secondary, #f8fafc); font: inherit; font-size: 13px; color: var(--portal-text-secondary, #475569); cursor: pointer }
.eal-peq button i { font-size: 12px; color: #64748b }
.eal-peq button.on { border-color: #0369A1; color: #0369A1; background: color-mix(in srgb, #0369A1 8%, var(--surface, #fff)) } .eal-peq button.on i { color: #0369A1 }
@media (max-width: 768px) {
  .eal-topo { padding: 14px }
  .eal-lista { padding: 0 12px 14px }
  .eal-cab { flex-wrap: wrap }
  .eal-clique { flex-basis: calc(100% - 40px) }
  .eal-seta { order: 1 }
  .eal-cab > .eal-b { order: 2; margin-left: 48px }
  .eal-det { padding: 2px 8px 10px }
}
`;
