"use client";
// "Minha semana" no dashboard (José, 29/10/2026): segunda a sexta, cada coisa numa FAIXA colorida como na agenda,
// e os detalhes só ao passar o mouse (José: "só umas faixas que nem na agenda e quando passar o mouse em cima
// mostra as informações"). Entra o que é da pessoa — reuniões, compromissos, sala, OS/Lousa do técnico
// (/api/agenda) — e os tickets que ela faz no dia do prazo (/api/trabalho/cronograma-geral), com ✓ para
// finalizar no próprio balão. Dia que passou fica apagado. Atrasados e sem data: só um número com link.
// Liga/desliga pela caixinha "Mostrar minha semana na dashboard" da /agenda (localStorage 'agenda-na-dashboard').
// Clicar abre ALI MESMO (José, 29/10/2026): ticket na janela do ticket, reunião na janela da reunião, o resto
// numa janela de detalhes com o botão para a tela completa.
import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";

// carregam só no clique: o dashboard não fica mais pesado
const TicketModal = dynamic(() => import("@/components/tickets/TicketModal"), { ssr: false });
const ReuniaoDetalhe = dynamic(() => import("@/components/reunioes/ReuniaoDetalhe"), { ssr: false });
// "+" de cada dia: o mesmo formulário da agenda (tipo Reunião cria em Reuniões) — José, 29/10/2026
const NovoCompromisso = dynamic(() => import("@/components/agenda/NovoCompromisso"), { ssr: false });
import { fetchAuth } from "@/lib/auth/client";
import type { ItemAgenda } from "@/lib/agenda/regras";

const FONTE: Record<string, { icone: string; nome: string; cor: string }> = {
  evento: { icone: "fa-regular fa-calendar", nome: "Compromisso", cor: "#1a73e8" },
  reuniao: { icone: "fa-solid fa-people-group", nome: "Reunião", cor: "#7c3aed" },
  sala: { icone: "fa-solid fa-door-open", nome: "Sala de reunião", cor: "#0b8043" },
  os: { icone: "fa-solid fa-wrench", nome: "Ordem de serviço", cor: "#e8710a" },
  lousa: { icone: "fa-solid fa-chalkboard", nome: "Lousa", cor: "#795548" },
};
const COR_TICKET = "#8e24aa";
const FECHADOS = new Set(["resolvido", "fechado", "cancelado"]);

interface TicketSemana { id: string; numero: number; titulo: string; prazo: string | null; status: string; tipo: string; responsavel_id: string; solicitante_id: string }

const diaLocal = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
const somaDias = (dia: string, n: number) => { const d = new Date(`${dia}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
/** segunda-feira da semana do dia (sábado e domingo já mostram a semana seguinte) */
const segundaDe = (dia: string) => { const dow = new Date(`${dia}T12:00:00Z`).getUTCDay(); return somaDias(dia, dow === 0 ? 1 : dow === 6 ? 2 : 1 - dow); };
const NOMES = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"];
const ddmm = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;

const CHAVE_NA_DASHBOARD = "agenda-na-dashboard";
function lerNaDashboard(): boolean {
  try { return localStorage.getItem(CHAVE_NA_DASHBOARD) !== "nao"; } catch { return true; }
}
function assinarNaDashboard(f: () => void) {
  window.addEventListener(CHAVE_NA_DASHBOARD, f);
  window.addEventListener("storage", f);
  return () => { window.removeEventListener(CHAVE_NA_DASHBOARD, f); window.removeEventListener("storage", f); };
}

interface Dados { hoje: string; seg: string; itens: ItemAgenda[]; tickets: TicketSemana[]; nomes: Record<string, string> }

async function carregarSemana(): Promise<Dados> {
  const hoje = diaLocal(new Date().toISOString());
  const seg = segundaDe(hoje);
  const [ag, tk] = await Promise.all([
    fetchAuth(`/api/agenda?modo=coletiva&de=${seg}&ate=${somaDias(seg, 4)}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    fetchAuth("/api/trabalho/cronograma-geral").then((r) => (r.ok ? r.json() : null)).catch(() => null), // sem módulo: sem tickets
  ]);
  const eu = String(ag?.eu || tk?.eu || "");
  const itens = ((ag?.itens || []) as ItemAgenda[])
    // os tickets vêm da lista própria (todos os meus, com e sem prazo) — fora daqui para não repetir
    .filter((i) => i.fonte !== "ticket" && i.pessoas?.includes(eu) && i.respostas?.[eu] !== "nao")
    .sort((a, b) => a.inicio.localeCompare(b.inicio));
  const tickets = ((tk?.tickets || []) as TicketSemana[])
    .filter((t) => t.responsavel_id === eu && t.tipo === "generico" && !FECHADOS.has(t.status));
  const nomes: Record<string, string> = {};
  for (const [id, u] of Object.entries((tk?.usuarios || {}) as Record<string, { nome?: string }>)) nomes[id] = u?.nome || "";
  return { hoje: String(ag?.agora?.dia || hoje), seg, itens, tickets, nomes };
}

type Aberto = { tipo: "ticket"; id: string } | { tipo: "reuniao"; id: string } | { tipo: "item"; item: ItemAgenda } | { tipo: "novo"; dia: string } | null;

type Faixa =
  | { k: "ag"; id: string; item: ItemAgenda }
  | { k: "tk"; id: string; ticket: TicketSemana };

export default function AgendaDashboard() {
  const [dados, setDados] = useState<Dados | null>(null);
  const [finalizando, setFinalizando] = useState<Set<string>>(new Set());
  const [aberto, setAberto] = useState<Aberto>(null);
  const recarregar = () => { carregarSemana().then(setDados).catch(() => {}); };
  const naDashboard = useSyncExternalStore(assinarNaDashboard, lerNaDashboard, () => true);

  useEffect(() => {
    let vivo = true;
    carregarSemana()
      .then((d) => { if (vivo) setDados(d); })
      .catch(() => { if (vivo) { const h = diaLocal(new Date().toISOString()); setDados({ hoje: h, seg: segundaDe(h), itens: [], tickets: [], nomes: {} }); } });
    return () => { vivo = false; };
  }, []);

  const finalizar = async (t: TicketSemana) => {
    if (!confirm(`Finalizar o ticket #${t.numero} "${t.titulo}"?\nEle vai para Resolvido e quem pediu confirma.`)) return;
    setFinalizando((s) => new Set(s).add(t.id));
    const r = await fetchAuth(`/api/tickets/${t.id}/acoes`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: "status", para: "resolvido" }),
    }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setFinalizando((s) => { const n = new Set(s); n.delete(t.id); return n; });
    if (!r || !r.ok) { alert(j.error || "Não deu para finalizar. Abra o ticket e tente por lá."); return; }
    setDados((d) => (d ? { ...d, tickets: d.tickets.filter((x) => x.id !== t.id) } : d));
  };

  if (!naDashboard || !dados) return null; // desligado na /agenda, ou carregando (não empurra o dashboard)

  const { hoje, seg, itens, tickets, nomes } = dados;
  const dias = Array.from({ length: 5 }, (_, i) => somaDias(seg, i));
  const porDia = new Map<string, Faixa[]>(dias.map((d) => [d, []]));
  for (const i of itens) {
    const ini = i.diaInteiro ? i.inicio.slice(0, 10) : diaLocal(i.inicio);
    porDia.get(ini < seg ? seg : ini)?.push({ k: "ag", id: i.id, item: i });
  }
  let atrasados = 0, semData = 0;
  for (const t of tickets) {
    const p = (t.prazo || "").slice(0, 10);
    if (!p) semData++;
    else if (p < hoje) atrasados++;
    if (p && porDia.has(p)) porDia.get(p)!.push({ k: "tk", id: `tk:${t.id}`, ticket: t });
  }

  const balao = (f: Faixa, passou: boolean) => {
    if (f.k === "tk") {
      const t = f.ticket;
      const venc = passou;
      return (
        <div key={f.id} className={`ms-fx tk ${venc ? "venc" : ""}`} style={{ ["--c" as string]: venc ? "#d93025" : COR_TICKET }} tabIndex={0}
          role="button" onClick={() => setAberto({ tipo: "ticket", id: t.id })} onKeyDown={(e) => { if (e.key === "Enter") setAberto({ tipo: "ticket", id: t.id }); }}>
          <span className="ms-fx-txt">#{t.numero} {t.titulo}</span>
          <div className="ms-pop" role="tooltip">
            <div className="ms-pop-tipo" style={{ color: venc ? "#d93025" : COR_TICKET }}><i className="fa-solid fa-ticket" /> Ticket{venc ? " · atrasado" : ""}</div>
            <div className="ms-pop-tit">#{t.numero} {t.titulo}</div>
            <div className="ms-pop-lin">Prazo {t.prazo ? ddmm(t.prazo.slice(0, 10)) : "—"} · {t.status.replace(/_/g, " ")}</div>
            {nomes[t.solicitante_id] && <div className="ms-pop-lin">Pedido por {nomes[t.solicitante_id]}</div>}
            <div className="ms-pop-acoes">
              <button type="button" className="ms-ok" disabled={finalizando.has(t.id)} onClick={(e) => { e.stopPropagation(); void finalizar(t); }}>
                <i className={finalizando.has(t.id) ? "fas fa-spinner fa-spin" : "fa-solid fa-check"} /> Finalizar
              </button>
              <span className="ms-pop-link">clique para abrir</span>
            </div>
          </div>
        </div>
      );
    }
    const i = f.item;
    const fo = FONTE[i.fonte] || FONTE.evento;
    const cor = i.cor || fo.cor;
    const quando = i.diaInteiro ? "dia todo" : `${hora(i.inicio)}–${hora(i.fim)}`;
    return (
      <div key={f.id} className="ms-fx" style={{ ["--c" as string]: cor }} role="button" tabIndex={0}
        onClick={() => setAberto(i.fonte === "reuniao" ? { tipo: "reuniao", id: i.ref } : { tipo: "item", item: i })}
        onKeyDown={(e) => { if (e.key === "Enter") setAberto(i.fonte === "reuniao" ? { tipo: "reuniao", id: i.ref } : { tipo: "item", item: i }); }}>
        <span className="ms-fx-txt">{i.diaInteiro ? "" : `${hora(i.inicio)} `}{i.titulo}</span>
        <span className="ms-pop" role="tooltip">
          <span className="ms-pop-tipo" style={{ color: cor }}><i className={fo.icone} /> {fo.nome}</span>
          <span className="ms-pop-tit">{i.titulo}</span>
          <span className="ms-pop-lin">{quando}{i.local ? ` · ${i.local}` : ""}</span>
          {(i.detalhes || []).slice(0, 3).map(([k, v]) => <span key={k} className="ms-pop-lin">{k}: {v}</span>)}
        </span>
      </div>
    );
  };

  return (
    <section className="ms" aria-label="Minha semana">
      <style>{ESTILO}</style>
      <header className="ms-cab">
        <span className="ms-nome"><i className="fa-regular fa-calendar-days" /> Minha semana</span>
        <span className="ms-sub">{ddmm(dias[0])} a {ddmm(dias[4])}</span>
        {atrasados > 0 && <Link href="/cronograma" className="ms-cont atr">{atrasados} atrasado{atrasados > 1 ? "s" : ""}</Link>}
        {semData > 0 && <Link href="/cronograma" className="ms-cont">{semData} sem data</Link>}
        <Link href="/agenda" className="ms-link">abrir agenda <i className="fa-solid fa-arrow-right" /></Link>
      </header>
      {aberto?.tipo === "ticket" && <TicketModal id={aberto.id} onFechar={() => { setAberto(null); recarregar(); }} onMudou={recarregar} zIndex={1200} />}
      {aberto?.tipo === "reuniao" && (
        <Janela titulo="Reunião" onFechar={() => { setAberto(null); recarregar(); }} largura={1100}>
          <ReuniaoDetalhe id={aberto.id} />
        </Janela>
      )}
      {aberto?.tipo === "item" && <DetalheItem item={aberto.item} onFechar={() => setAberto(null)} />}
      {aberto?.tipo === "novo" && <NovoCompromisso dia={aberto.dia} onFechar={() => setAberto(null)} onSalvo={recarregar} />}
      <div className="ms-semana">
        {dias.map((dia, k) => {
          const passou = dia < hoje;
          const lista = porDia.get(dia) || [];
          return (
            <div key={dia} className={`ms-dia ${dia === hoje ? "hoje" : ""} ${passou ? "passou" : ""}`}>
              <div className="ms-dianome">{NOMES[k]} <span>{ddmm(dia)}</span>
                {!passou && (
                  <button type="button" className="ms-mais" onClick={() => setAberto({ tipo: "novo", dia })}
                    title={`Novo compromisso em ${NOMES[k].toLowerCase()} ${ddmm(dia)}`} aria-label={`Novo compromisso em ${ddmm(dia)}`}>
                    <i className="fa-solid fa-plus" />
                  </button>
                )}
              </div>
              <div className="ms-faixas">{lista.map((f) => balao(f, passou))}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Janela({ titulo, onFechar, largura = 520, children }: { titulo: string; onFechar: () => void; largura?: number; children: React.ReactNode }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape" && !document.querySelector("[data-janela-interna]")) onFechar(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onFechar]);
  return (
    <div className="ms-jan-fundo" onClick={onFechar}>
      <div className="ms-jan" style={{ maxWidth: largura }} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={titulo}>
        <button type="button" className="ms-jan-x" onClick={onFechar} aria-label="Fechar"><i className="fa-solid fa-xmark" /></button>
        {children}
      </div>
    </div>
  );
}

/** Compromisso, sala, OS e Lousa: os detalhes ali mesmo + botão para a tela completa. */
function DetalheItem({ item: i, onFechar }: { item: ItemAgenda; onFechar: () => void }) {
  const fo = FONTE[i.fonte] || FONTE.evento;
  const cor = i.cor || fo.cor;
  const dia = new Date(i.inicio).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "2-digit", month: "2-digit" });
  const destino = i.link || `/agenda?evento=${encodeURIComponent(i.ref)}`;
  const rotuloDestino = i.fonte === "os" ? "Abrir a OS no POS" : i.fonte === "lousa" ? "Abrir a Lousa" : i.fonte === "sala" ? "Abrir a agenda da sala" : "Abrir na agenda";
  return (
    <Janela titulo={i.titulo} onFechar={onFechar}>
      <div className="ms-det-tipo" style={{ color: cor }}><i className={fo.icone} /> {fo.nome}</div>
      <h3 className="ms-det-tit">{i.titulo}</h3>
      <div className="ms-det-lin"><i className="fa-regular fa-clock" /> {dia} · {i.diaInteiro ? "dia todo" : `${hora(i.inicio)}–${hora(i.fim)}`}</div>
      {i.local && <div className="ms-det-lin"><i className="fa-solid fa-location-dot" /> {i.local}</div>}
      {i.descricao && <p className="ms-det-desc">{i.descricao}</p>}
      {(i.detalhes || []).length > 0 && (
        <dl className="ms-det-dl">{(i.detalhes || []).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      )}
      <div className="ms-det-acoes">
        <Link href={destino} className="ms-det-btn">{rotuloDestino} <i className="fa-solid fa-arrow-right" /></Link>
        <button type="button" className="ms-det-fechar" onClick={onFechar}>Fechar</button>
      </div>
    </Janela>
  );
}

const ESTILO = `
.ms { background: var(--surface, #fff); border: 1px solid var(--border, #e2e8f0); border-radius: 16px; padding: 12px 16px 14px; margin-bottom: 16px }
.ms-cab { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; margin-bottom: 10px }
.ms-nome { font-size: 15px; color: var(--portal-text, #0f172a) }
.ms-nome i { color: #1a73e8; margin-right: 6px }
.ms-sub { font-size: 12.5px; color: var(--portal-text-muted, #64748b) }
.ms-cont { font-size: 12px; padding: 1px 9px; border-radius: 999px; text-decoration: none; color: var(--portal-text-secondary, #475569); background: color-mix(in srgb, var(--portal-text-muted, #64748b) 12%, transparent) }
.ms-cont.atr { color: #d93025; background: color-mix(in srgb, #d93025 12%, transparent) }
.ms-link { margin-left: auto; font-size: 13px; color: #1a73e8; text-decoration: none }
.ms-link:hover { text-decoration: underline }
.ms-semana { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 6px }
.ms-dia { min-width: 0; padding: 4px 2px }
.ms-dianome { font-size: 12px; color: var(--portal-text-secondary, #475569); margin: 0 2px 6px; padding-bottom: 4px; border-bottom: 1px solid var(--border, #e2e8f0) }
.ms-dianome span { color: var(--portal-text-muted, #94a3b8) }
.ms-dianome { display: flex; align-items: center; gap: 5px }
.ms-mais { margin-left: auto; width: 20px; height: 20px; border-radius: 999px; border: none; background: transparent; color: var(--portal-text-muted, #94a3b8); font-size: 11px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; padding: 0; transition: background .15s, color .15s }
.ms-mais:hover { background: #1a73e8; color: #fff }
.ms-dia.hoje .ms-dianome { color: #1a73e8; border-bottom-color: #1a73e8 }
.ms-dia.hoje .ms-dianome span { color: #1a73e8 }
.ms-dia.passou .ms-dianome { color: var(--portal-text-muted, #94a3b8) }
.ms-dia.passou .ms-fx:not(.tk) { opacity: .45 }
.ms-faixas { display: flex; flex-direction: column; gap: 3px; min-height: 22px }
.ms-fx { position: relative; display: block; min-width: 0; padding: 2px 8px; border-radius: 6px; background: var(--c); color: #fff; font-size: 12px; line-height: 18px; text-decoration: none; cursor: pointer; outline: none }
.ms-fx-txt { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.ms-fx:hover, .ms-fx:focus-within { filter: brightness(1.06) }
.ms-pop { position: absolute; z-index: 60; top: calc(100% + 6px); left: 0; width: 260px; display: none; flex-direction: column; gap: 3px; padding: 10px 12px; border-radius: 12px; background: var(--surface, #fff); color: var(--portal-text, #0f172a); border: 1px solid var(--border, #e2e8f0); box-shadow: 0 14px 34px -12px rgba(15,23,42,.45); font-size: 12.5px; line-height: 1.4; white-space: normal; cursor: default }
.ms-pop::before { content: ""; position: absolute; left: 0; right: 0; top: -8px; height: 8px }
.ms-fx:hover .ms-pop, .ms-fx:focus-within .ms-pop { display: flex }
.ms-dia:nth-child(n+4) .ms-pop { left: auto; right: 0 }
.ms-pop-tipo { font-size: 11.5px }
.ms-pop-tit { font-size: 13.5px; color: var(--portal-text, #0f172a) }
.ms-pop-lin { color: var(--portal-text-secondary, #475569) }
.ms-pop-acoes { display: flex; align-items: center; gap: 10px; margin-top: 6px }
.ms-ok { border: 1px solid #0b8043; background: transparent; color: #0b8043; border-radius: 999px; padding: 3px 12px; font-size: 12.5px; cursor: pointer }
.ms-ok:hover:not(:disabled) { background: #0b8043; color: #fff }
.ms-pop-link { color: #1a73e8; text-decoration: none; font-size: 12.5px }
.ms-jan-fundo { position: fixed; inset: 0; z-index: 1100; background: rgba(15,23,42,.45); display: flex; align-items: flex-start; justify-content: center; padding: 5vh 16px; overflow-y: auto }
.ms-jan { position: relative; width: 100%; background: var(--surface, #fff); color: var(--portal-text, #0f172a); border-radius: 18px; padding: 20px 22px; box-shadow: 0 24px 60px rgba(15,23,42,.35) }
.ms-jan-x { position: absolute; top: 10px; right: 12px; border: none; background: transparent; color: var(--portal-text-muted, #64748b); font-size: 18px; cursor: pointer; z-index: 2 }
.ms-det-tipo { font-size: 12.5px }
.ms-det-tit { font-size: 18px; margin: 4px 30px 10px 0; font-weight: 500 }
.ms-det-lin { font-size: 13.5px; color: var(--portal-text-secondary, #475569); margin-bottom: 4px }
.ms-det-lin i { width: 16px; color: var(--portal-text-muted, #94a3b8) }
.ms-det-desc { font-size: 13.5px; white-space: pre-wrap; margin: 10px 0 }
.ms-det-dl { display: grid; gap: 4px; margin: 10px 0 0; font-size: 13px }
.ms-det-dl div { display: flex; gap: 8px }
.ms-det-dl dt { color: var(--portal-text-muted, #64748b); min-width: 110px }
.ms-det-dl dd { margin: 0 }
.ms-det-acoes { display: flex; justify-content: space-between; align-items: center; margin-top: 18px; gap: 10px }
.ms-det-btn { font-size: 13.5px; color: #fff; background: #1a73e8; padding: 7px 14px; border-radius: 10px; text-decoration: none }
.ms-det-fechar { border: none; background: transparent; color: var(--portal-text-muted, #64748b); cursor: pointer; font-size: 13.5px }
@media (max-width: 760px) { .ms-semana { grid-template-columns: 1fr } .ms-dia.passou { display: none } .ms-pop { width: min(260px, 80vw) } .ms-dia:nth-child(n+4) .ms-pop { left: 0; right: auto } }
`;
