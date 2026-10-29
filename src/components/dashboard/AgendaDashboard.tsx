"use client";
// Agenda no dashboard (José, 29/10/2026: "além das notícias 'O que mudou', coloca a agenda também").
// Mostra o que é DA PESSOA logada hoje e nos próximos 6 dias — reuniões, compromissos, sala, prazos de ticket e,
// para técnico, OS e Lousa — lido da mesma /api/agenda da tela /agenda. Clicar abre o item; "abrir agenda" vai à tela.
import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchAuth } from "@/lib/auth/client";
import type { ItemAgenda } from "@/lib/agenda/regras";

const FONTE_ICONE: Record<string, string> = {
  evento: "fa-regular fa-calendar", reuniao: "fa-solid fa-people-group", sala: "fa-solid fa-door-open",
  ticket: "fa-solid fa-ticket", os: "fa-solid fa-wrench", lousa: "fa-solid fa-chalkboard",
};
const MAX = 8;

const diaLocal = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
function nomeDia(dia: string, hoje: string): string {
  if (dia === hoje) return "Hoje";
  const amanha = new Date(`${hoje}T12:00:00`); amanha.setDate(amanha.getDate() + 1);
  if (dia === amanha.toLocaleDateString("en-CA")) return "Amanhã";
  const d = new Date(`${dia}T12:00:00`);
  const s = d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function AgendaDashboard() {
  const [itens, setItens] = useState<ItemAgenda[] | null>(null);
  const [hoje, setHoje] = useState("");

  useEffect(() => {
    let vivo = true;
    fetchAuth("/api/agenda?modo=coletiva")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!vivo || !j) return;
        const eu = String(j.eu || "");
        const agora = Date.now();
        const meus = ((j.itens || []) as ItemAgenda[])
          .filter((i) => i.pessoas?.includes(eu) && new Date(i.fim).getTime() > agora && i.respostas?.[eu] !== "nao")
          .sort((a, b) => a.inicio.localeCompare(b.inicio));
        setHoje(String(j.agora?.dia || diaLocal(new Date().toISOString())));
        setItens(meus);
      })
      .catch(() => { if (vivo) setItens([]); });
    return () => { vivo = false; };
  }, []);

  if (itens === null) return null; // carregando: não empurra o dashboard

  const visiveis = itens.slice(0, MAX);
  const porDia = new Map<string, ItemAgenda[]>();
  for (const i of visiveis) {
    const d = i.diaInteiro ? i.inicio.slice(0, 10) : diaLocal(i.inicio);
    const dia = d < hoje ? hoje : d; // evento de dia inteiro que começou antes e segue hoje
    (porDia.get(dia) ?? porDia.set(dia, []).get(dia)!).push(i);
  }

  return (
    <section className="ag-d" aria-label="Minha agenda">
      <style>{ESTILO}</style>
      <header className="ag-d-cab">
        <span className="ag-d-nome"><i className="fa-regular fa-calendar-days" /> Minha agenda</span>
        <span className="ag-d-sub">próximos 7 dias</span>
        <Link href="/agenda" className="ag-d-link">abrir agenda <i className="fa-solid fa-arrow-right" /></Link>
      </header>
      {!itens.length ? (
        <div className="ag-d-vazio">Nada marcado para você nos próximos dias.</div>
      ) : (
        <div className="ag-d-dias">
          {[...porDia].map(([dia, lista]) => (
            <div key={dia} className="ag-d-dia">
              <div className={`ag-d-dianome ${dia === hoje ? "hoje" : ""}`}>{nomeDia(dia, hoje)}</div>
              {lista.map((i) => (
                <Link key={i.id} href={i.link || `/agenda?evento=${encodeURIComponent(i.ref)}`} className="ag-d-item">
                  <span className="ag-d-hora">{i.diaInteiro ? "dia todo" : hora(i.inicio)}</span>
                  <span className="ag-d-ic" style={{ color: i.cor || "#1a73e8" }}><i className={FONTE_ICONE[i.fonte] || "fa-regular fa-calendar"} /></span>
                  <span className="ag-d-tit">{i.titulo}{i.local ? <em> · {i.local}</em> : null}</span>
                </Link>
              ))}
            </div>
          ))}
          {itens.length > MAX && <Link href="/agenda" className="ag-d-mais">+ {itens.length - MAX} na agenda</Link>}
        </div>
      )}
    </section>
  );
}

const ESTILO = `
.ag-d { background: var(--surface, #fff); border: 1px solid var(--border, #e2e8f0); border-radius: 16px; padding: 14px 18px; margin-bottom: 16px; animation: agd-in .3s ease both }
@keyframes agd-in { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }
.ag-d-cab { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; margin-bottom: 10px }
.ag-d-nome { font-size: 15px; color: var(--portal-text, #0f172a) }
.ag-d-nome i { color: #1a73e8; margin-right: 6px }
.ag-d-sub { font-size: 12.5px; color: var(--portal-text-muted, #64748b) }
.ag-d-link { margin-left: auto; font-size: 13px; color: #1a73e8; text-decoration: none }
.ag-d-link:hover { text-decoration: underline }
.ag-d-vazio { font-size: 13.5px; color: var(--portal-text-muted, #64748b); padding: 4px 0 2px }
.ag-d-dias { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 10px 22px }
.ag-d-dianome { font-size: 12px; text-transform: uppercase; letter-spacing: .6px; color: var(--portal-text-muted, #64748b); margin: 2px 0 4px }
.ag-d-dianome.hoje { color: #1a73e8 }
.ag-d-item { display: flex; align-items: center; gap: 9px; padding: 6px 8px; border-radius: 10px; text-decoration: none; color: var(--portal-text, #0f172a); font-size: 13.5px; transition: background .15s }
.ag-d-item:hover { background: color-mix(in srgb, #1a73e8 8%, transparent) }
.ag-d-hora { flex: 0 0 58px; font-variant-numeric: tabular-nums; color: var(--portal-text-secondary, #475569); font-size: 12.5px }
.ag-d-ic { flex: 0 0 16px; text-align: center; font-size: 12.5px }
.ag-d-tit { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.ag-d-tit em { font-style: normal; color: var(--portal-text-muted, #64748b) }
.ag-d-mais { font-size: 13px; color: #1a73e8; text-decoration: none; align-self: end; padding: 6px 8px }
@media (max-width: 720px) { .ag-d { padding: 12px 14px } .ag-d-dias { grid-template-columns: 1fr } }
`;
