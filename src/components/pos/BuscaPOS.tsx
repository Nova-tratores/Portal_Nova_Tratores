"use client";
// Busca do cabeçalho do POS com HISTÓRICO (José, 21/10/2026: "deixando um histórico de pesquisados recentemente e
// a fase dela"). Clicou no campo vazio → as OS abertas pela busca e os textos pesquisados há pouco, cada OS com a
// fase de AGORA (vem da lista ao vivo, não do que foi guardado). Digitando → até 6 OS que batem, com a fase.
// O histórico fica no navegador de cada pessoa (localStorage), no máximo 8 itens.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { KanbanCard } from "@/lib/pos/types";
import { faseOS } from "@/lib/pos/relacao";
import { casaBusca } from "@/lib/texto";

type Recente = { tipo: "os"; id: string; em: number } | { tipo: "texto"; q: string; em: number };
const CHAVE = "pos-busca-recentes";
const EVENTO = "pos-busca-recentes-mudou";
const MAX = 8;

let cache: { cru: string | null; lista: Recente[] } = { cru: null, lista: [] };
function lerRecentes(): Recente[] {
  let cru: string | null = null;
  try { cru = localStorage.getItem(CHAVE); } catch { /* sem storage */ }
  if (cru === cache.cru) return cache.lista;
  let lista: Recente[] = [];
  try { lista = cru ? JSON.parse(cru) : []; } catch { lista = []; }
  cache = { cru, lista: Array.isArray(lista) ? lista : [] };
  return cache.lista;
}
const VAZIO: Recente[] = [];
function assinar(f: () => void) {
  window.addEventListener(EVENTO, f);
  window.addEventListener("storage", f);
  return () => { window.removeEventListener(EVENTO, f); window.removeEventListener("storage", f); };
}
function gravar(lista: Recente[]) {
  try { localStorage.setItem(CHAVE, JSON.stringify(lista.slice(0, MAX))); } catch { /* sem storage */ }
  window.dispatchEvent(new Event(EVENTO));
}
/** Guarda a OS no histórico (chamado também quando um cartão é aberto com a busca preenchida). */
export function registrarRecenteOS(id: string) {
  if (!id) return;
  gravar([{ tipo: "os", id, em: Date.now() }, ...lerRecentes().filter((r) => !(r.tipo === "os" && r.id === id))]);
}
function registrarTexto(q: string) {
  const t = q.trim();
  if (t.length < 2) return;
  gravar([{ tipo: "texto", q: t, em: Date.now() }, ...lerRecentes().filter((r) => !(r.tipo === "texto" && r.q.toLowerCase() === t.toLowerCase()))]);
}

const num = (id: string) => String(id || "").replace(/^OS-?/i, "");
const haQuanto = (ms: number) => {
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return "agora";
  if (m < 60) return `há ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? "ontem" : `há ${d} dias`;
};

export default function BuscaPOS({ searchTerm, onSearch, ordens, onAbrirOS }: {
  searchTerm: string; onSearch: (t: string) => void; ordens: KanbanCard[]; onAbrirOS?: (o: KanbanCard) => void;
}) {
  const recentes = useSyncExternalStore(assinar, lerRecentes, () => VAZIO);
  const [aberto, setAberto] = useState(false);
  const [sel, setSel] = useState(-1);
  const caixa = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLInputElement>(null);
  const [foco, setFoco] = useState(false);
  // atalho "/" põe o cursor na busca (quando não está digitando em outro campo)
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      e.preventDefault();
      campo.current?.focus();
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, []);
  const porId = useMemo(() => new Map(ordens.map((o) => [o.id, o])), [ordens]);

  const q = searchTerm.trim();
  const achadas = useMemo(() => (q ? ordens.filter((o) => casaBusca(q, o.cliente, o.id, o.ordemOmie, o.servSolicitado)).slice(0, 6) : []), [q, ordens]);
  const totalAchadas = useMemo(() => (q ? ordens.filter((o) => casaBusca(q, o.cliente, o.id, o.ordemOmie, o.servSolicitado)).length : 0), [q, ordens]);
  // recentes: OS que ainda existem na lista + textos
  const listaRecentes = recentes.filter((r) => r.tipo === "texto" || porId.has(r.id));
  const opcoes: ({ k: "os"; o: KanbanCard; em?: number } | { k: "texto"; q: string; em: number })[] = q
    ? achadas.map((o) => ({ k: "os" as const, o }))
    : listaRecentes.map((r) => (r.tipo === "os" ? { k: "os" as const, o: porId.get(r.id)!, em: r.em } : { k: "texto" as const, q: r.q, em: r.em }));

  const abrir = (o: KanbanCard) => {
    registrarRecenteOS(o.id);
    if (q) registrarTexto(q);
    setAberto(false);
    onAbrirOS?.(o);
  };
  const usarTexto = (t: string) => { onSearch(t); registrarTexto(t); setAberto(false); };

  return (
    <div className="search-box bp" ref={caixa} style={{ position: "relative" }}
      onBlur={(e) => { if (!caixa.current?.contains(e.relatedTarget as Node)) { setAberto(false); setFoco(false); if (q) registrarTexto(q); } }}>
      <style>{ESTILO_BP}</style>
      <span className="bp-lupa" aria-hidden><i className="fas fa-magnifying-glass" /></span>
      <input ref={campo} type="text" className="search-input" placeholder="Buscar cliente, nº da OS ou nº no Omie" value={searchTerm}
        onFocus={() => { setAberto(true); setFoco(true); setSel(-1); }}
        onChange={(e) => { onSearch(e.target.value); setAberto(true); setSel(-1); }}
        onKeyDown={(e) => {
          if (e.key === "Escape") { setAberto(false); (e.target as HTMLInputElement).blur(); return; }
          if (e.key === "ArrowDown") { e.preventDefault(); setAberto(true); setSel((s) => Math.min(opcoes.length - 1, s + 1)); return; }
          if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(-1, s - 1)); return; }
          if (e.key === "Enter") {
            const op = opcoes[sel];
            if (op) { if (op.k === "os") abrir(op.o); else usarTexto(op.q); }
            else { registrarTexto(searchTerm); setAberto(false); }
          }
        }} />
      {!searchTerm && !foco && <kbd className="bp-kbd" title="Aperte / para buscar">/</kbd>}
      {searchTerm && (
        <button type="button" className="bp-limpar" title="Limpar a busca" onClick={() => { onSearch(""); setAberto(true); }}><i className="fas fa-times" /></button>
      )}

      {aberto && (opcoes.length > 0 || q) && (
        <div className="bp-painel" role="listbox">
          <div className="bp-cab">
            <span className="bp-cab-t">
              <i className={`fas ${q ? "fa-list-check" : "fa-clock-rotate-left"}`} />
              {q ? <>{totalAchadas ? `${totalAchadas} OS encontrada${totalAchadas > 1 ? "s" : ""}` : "Nenhuma OS encontrada"}{totalAchadas > achadas.length && <small>mostrando {achadas.length} · o quadro mostra todas</small>}</>
                : <>Pesquisados recentemente</>}
            </span>
            {!q && listaRecentes.length > 0 && (
              <button type="button" tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={() => gravar([])}><i className="fas fa-trash-can" /> Limpar</button>
            )}
          </div>
          {opcoes.map((op, i) => {
            if (op.k === "texto") {
              return (
                <button key={`t-${op.q}`} type="button" tabIndex={-1} className={`bp-l ${sel === i ? "on" : ""}`} onMouseDown={(e) => e.preventDefault()} onClick={() => usarTexto(op.q)} onMouseEnter={() => setSel(i)}>
                  <span className="bp-ic txt"><i className="fas fa-clock-rotate-left" /></span>
                  <span className="bp-t"><b>{op.q}</b><small>pesquisa · {haQuanto(op.em)}</small></span>
                  <i className="fas fa-arrow-turn-up bp-seta" />
                </button>
              );
            }
            const o = op.o;
            const f = faseOS(o.status);
            return (
              <button key={`o-${o.id}`} type="button" tabIndex={-1} className={`bp-l ${sel === i ? "on" : ""}`} onMouseDown={(e) => e.preventDefault()} onClick={() => abrir(o)} onMouseEnter={() => setSel(i)}>
                <span className="bp-ic"><i className="fas fa-tractor" /></span>
                <span className="bp-t">
                  <b><em>OS {num(o.id)}</em>{o.cliente || "Sem cliente"}</b>
                  <small>{[o.tecnico, o.ordemOmie ? `Omie ${o.ordemOmie}` : "", op.em ? haQuanto(op.em) : ""].filter(Boolean).join(" · ")}</small>
                </span>
                <span className="bp-fase" style={{ background: f.bg, color: f.text }}>{f.label}</span>
              </button>
            );
          })}
          {!q && !opcoes.length && <div className="bp-vazio">Nada pesquisado ainda.</div>}
        </div>
      )}
    </div>
  );
}

const ESTILO_BP = `
/* campo: branco, borda fina, cantos 14, lupa azul; foco com anel azul clarinho (José, 21/10: "melhora o visual") */
.bp .search-input { height: 46px; padding: 0 40px 0 48px !important; background: var(--surface, #fefefe) !important; border: 1px solid var(--border, #e2e8f0) !important; border-radius: 14px !important; font-size: 15px; color: var(--portal-text, #0f172a); box-shadow: 0 1px 2px rgba(15,23,42,.04); transition: border-color .15s, box-shadow .2s }
.bp .search-input::placeholder { color: var(--portal-text-muted, #94a3b8) }
.bp .search-input:hover { border-color: #cbd5e1 !important }
.bp .search-input:focus { border-color: #38bdf8 !important; box-shadow: 0 0 0 4px rgba(14,165,233,.14); outline: none }
.bp-lupa { position: absolute; left: 8px; top: 50%; transform: translateY(-50%); width: 32px; height: 32px; border-radius: 10px; display: grid; place-items: center; font-size: 13.5px; color: #0369A1; background: color-mix(in srgb, #0369A1 9%, var(--surface, #fefefe)); pointer-events: none }
.bp-kbd { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); min-width: 22px; height: 22px; padding: 0 6px; border-radius: 6px; display: grid; place-items: center; font-family: inherit; font-size: 12px; color: var(--portal-text-muted, #64748b); background: var(--portal-bg-secondary, #f1f5f9); border: 1px solid var(--border, #e2e8f0); pointer-events: none }
.bp-limpar { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); width: 26px; height: 26px; border-radius: 50%; border: 0; background: var(--portal-bg-secondary, #eef2f6); color: var(--portal-text-muted, #64748b); font-size: 11px; cursor: pointer } .bp-limpar:hover { background: #fee2e2; color: #dc2626 }
.bp-painel { position: absolute; left: 0; right: 0; top: calc(100% + 8px); z-index: 1200; min-width: 440px; background: var(--surface, #fefefe); border: 1px solid var(--border, #e2e8f0); border-radius: 16px; box-shadow: 0 24px 50px -20px rgba(15,23,42,.35); padding: 8px; display: grid; gap: 2px; max-height: 70vh; overflow-y: auto; animation: bpEntra .15s both }
.bp-cab { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 4px 6px 8px 8px; margin-bottom: 2px; border-bottom: 1px solid var(--border, #f1f5f9) }
.bp-cab-t { display: inline-flex; align-items: center; gap: 8px; font-size: 13.5px; color: var(--portal-text, #0f172a) }
.bp-cab-t i { font-size: 12px; color: #0369A1 }
.bp-cab-t small { font-size: 12.5px; color: var(--portal-text-muted, #94a3b8); margin-left: 4px }
.bp-cab button { display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 10px; border-radius: 8px; border: 1px solid transparent; background: transparent; font-family: inherit; font-size: 12.5px; color: var(--portal-text-muted, #64748b); cursor: pointer }
.bp-cab button i { font-size: 11px } .bp-cab button:hover { color: #dc2626; background: #fef2f2; border-color: #fecaca }
.bp-l { display: grid; grid-template-columns: 36px minmax(0, 1fr) auto; gap: 11px; align-items: center; width: 100%; text-align: left; border: 0; background: transparent; border-radius: 11px; padding: 7px 8px; font-family: inherit; cursor: pointer; color: var(--portal-text, #0f172a) }
.bp-l.on { background: color-mix(in srgb, #0369A1 7%, transparent) }
.bp-ic { width: 36px; height: 36px; border-radius: 10px; display: grid; place-items: center; font-size: 14px; color: #0369A1; background: color-mix(in srgb, #0369A1 9%, var(--surface, #fefefe)); border: 1px solid color-mix(in srgb, #0369A1 16%, transparent) }
.bp-ic.txt { color: var(--portal-text-muted, #64748b); background: var(--portal-bg-secondary, #f1f5f9); border-color: transparent }
.bp-t { display: grid; min-width: 0; line-height: 1.3 }
.bp-t b { font-weight: 500; font-size: 14.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.bp-t b em { font-style: normal; font-size: 12px; margin-right: 8px; padding: 1px 7px; border-radius: 6px; background: var(--portal-bg-secondary, #eef2f6); color: var(--portal-text-secondary, #475569); font-variant-numeric: tabular-nums }
.bp-t small { font-size: 12.5px; color: var(--portal-text-muted, #64748b); overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.bp-fase { font-size: 12px; padding: 3px 10px; border-radius: 999px; white-space: nowrap; max-width: 190px; overflow: hidden; text-overflow: ellipsis }
.bp-seta { color: var(--portal-text-muted, #94a3b8); font-size: 12px; transform: rotate(-90deg) }
.bp-vazio { padding: 14px; text-align: center; font-size: 13px; color: var(--portal-text-muted, #94a3b8) }
@keyframes bpEntra { from { opacity: 0; transform: translateY(-4px) } }
`;
