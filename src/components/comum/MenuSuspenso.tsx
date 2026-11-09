"use client";
// Menu suspenso de atalhos (José, 09/11/2026: "deixa isso um menu dropdown bonitinho" — no lugar do menu em círculo do POS).
// Botão em pílula; a lista abre embaixo, alinhada à direita. Esc / clique fora fecha; setas navegam.
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";

export interface ItemSuspenso {
  k: string; t: string; sub?: string; ic: string; cor: string;
  /** número de aviso (bolinha) */ n?: number;
  /** marcado (ex.: filtro ligado) */ on?: boolean;
  /** começa um grupo novo com este título */ grupo?: string;
  /** item de destaque no topo (ocupa a largura toda, colorido) */ destaque?: boolean;
  ir: () => void;
}

export default function MenuSuspenso({ itens, rotulo = "Atalhos", icone = "fa-bars-staggered", titulo, cor = "#0369a1" }: {
  itens: ItemSuspenso[]; rotulo?: string; icone?: string; titulo?: string; cor?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const lista = useRef<HTMLDivElement>(null);
  const avisos = itens.reduce((s, x) => s + (x.n || 0), 0);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false); };
    const esc = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") setAberto(false); };
    document.addEventListener("mousedown", fora);
    window.addEventListener("keydown", esc);
    setTimeout(() => lista.current?.querySelector<HTMLButtonElement>("button")?.focus(), 0);
    return () => { document.removeEventListener("mousedown", fora); window.removeEventListener("keydown", esc); };
  }, [aberto]);

  const navegar = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const bts = [...(lista.current?.querySelectorAll<HTMLButtonElement>("button") || [])];
    const i = bts.indexOf(document.activeElement as HTMLButtonElement);
    bts[(i + (e.key === "ArrowDown" ? 1 : -1) + bts.length) % bts.length]?.focus();
  };
  const ir = (f: () => void) => { setAberto(false); f(); };

  return (
    <div ref={caixa} className="ms-caixa" style={{ "--c": cor } as CSSProperties}>
      <style>{ESTILO_MS}</style>
      <button type="button" className={`ms-bt ${aberto ? "on" : ""}`} onClick={() => setAberto((a) => !a)}
        aria-haspopup="menu" aria-expanded={aberto} title={titulo || rotulo}>
        <i className={`fas ${icone}`} />
        <span className="ms-bt-t">{rotulo}</span>
        <i className="fas fa-chevron-down ms-seta" />
        {avisos > 0 && <span className="ms-aviso">{avisos}</span>}
      </button>
      {aberto && (
        <div ref={lista} className="ms-lista" role="menu" onKeyDown={navegar}>
          {itens.map((x, i) => (
            <div key={x.k}>
              {x.grupo && <div className={`ms-grupo ${i === 0 ? "pri" : ""}`}>{x.grupo}</div>}
              <button type="button" role="menuitem" className={`ms-i ${x.destaque ? "dest" : ""} ${x.on ? "on" : ""}`}
                style={{ "--ci": x.cor, animationDelay: `${i * 28}ms` } as CSSProperties} onClick={() => ir(x.ir)}>
                <span className="ms-ic"><i className={`fas ${x.ic}`} /></span>
                <span className="ms-tx"><b>{x.t}</b>{x.sub && <small>{x.sub}</small>}</span>
                {!!x.n && <em className="ms-n">{x.n}</em>}
                {x.on ? <i className="fas fa-check ms-ok" /> : <i className="fas fa-chevron-right ms-vai" />}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const ESTILO_MS = `
.ms-caixa { position: relative; }
.ms-bt { position: relative; height: 44px; display: inline-flex; align-items: center; gap: 9px; padding: 0 16px 0 15px; border-radius: 999px; border: 0;
  font: inherit; font-size: 14px; color: #fefefe; cursor: pointer; background: linear-gradient(135deg, color-mix(in srgb, var(--c) 60%, #38bdf8), var(--c));
  box-shadow: 0 6px 16px -6px color-mix(in srgb, var(--c) 70%, transparent); transition: transform .15s, box-shadow .2s; }
.ms-bt:hover, .ms-bt.on { transform: translateY(-1px); box-shadow: 0 10px 22px -8px color-mix(in srgb, var(--c) 80%, transparent); }
.ms-bt:focus-visible { outline: 3px solid #93c5fd; outline-offset: 2px; }
.ms-seta { font-size: 10px; opacity: .85; transition: transform .2s; }
.ms-bt.on .ms-seta { transform: rotate(180deg); }
.ms-aviso { position: absolute; top: -5px; right: -5px; min-width: 20px; height: 20px; padding: 0 5px; border-radius: 99px; display: grid; place-items: center;
  font-size: 11.5px; color: #fefefe; background: #f59e0b; box-shadow: 0 0 0 2px var(--portal-bg, #f8fafc); }
.ms-lista { position: absolute; right: 0; top: calc(100% + 8px); z-index: 9700; width: 320px; max-width: calc(100vw - 32px); padding: 6px;
  background: var(--surface, #fefefe); border: 1px solid var(--border, #e2e8f0); border-radius: 16px;
  box-shadow: 0 24px 50px -16px rgba(15,23,42,.35), 0 2px 6px rgba(15,23,42,.06); transform-origin: top right; animation: ms-abre .18s cubic-bezier(.2,.9,.3,1.15); }
@keyframes ms-abre { from { opacity: 0; transform: translateY(-6px) scale(.97); } }
.ms-grupo { font-size: 11.5px; color: var(--portal-text-muted, #94a3b8); padding: 10px 10px 4px; }
.ms-grupo.pri { padding-top: 4px; }
.ms-i { width: 100%; display: flex; align-items: center; gap: 11px; padding: 8px 10px; border: 0; border-radius: 11px; background: transparent; cursor: pointer;
  text-align: left; font: inherit; color: var(--portal-text, #0f172a); animation: ms-item .22s both; transition: background .12s; }
@keyframes ms-item { from { opacity: 0; transform: translateX(-4px); } }
.ms-i:hover, .ms-i:focus-visible { background: var(--portal-bg-secondary, #f1f5f9); outline: none; }
.ms-i.on { background: color-mix(in srgb, var(--ci) 8%, var(--surface, #fefefe)); }
.ms-ic { width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; flex-shrink: 0; font-size: 14px; color: var(--ci);
  background: color-mix(in srgb, var(--ci) 9%, var(--surface, #fefefe)); border: 1px solid color-mix(in srgb, var(--ci) 18%, transparent); transition: transform .15s; }
.ms-i:hover .ms-ic { transform: scale(1.06); }
.ms-tx { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.ms-tx b { font-weight: 500; font-size: 14px; }
.ms-tx small { font-size: 12px; color: var(--portal-text-muted, #64748b); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ms-vai { font-size: 10px; color: #cbd5e1; opacity: 0; transform: translateX(-3px); transition: opacity .15s, transform .15s; }
.ms-i:hover .ms-vai, .ms-i:focus-visible .ms-vai { opacity: 1; transform: none; }
.ms-ok { font-size: 12px; color: var(--ci); }
.ms-n { font-style: normal; font-size: 11px; padding: 1px 7px; border-radius: 99px; background: #f59e0b; color: #fefefe; }
.ms-i.dest { background: linear-gradient(135deg, color-mix(in srgb, var(--ci) 12%, var(--surface, #fefefe)), color-mix(in srgb, var(--ci) 4%, var(--surface, #fefefe)));
  border: 1px solid color-mix(in srgb, var(--ci) 20%, transparent); margin-bottom: 2px; }
.ms-i.dest .ms-ic { color: #fefefe; background: linear-gradient(135deg, color-mix(in srgb, var(--ci) 60%, #38bdf8), var(--ci)); border: 0; }
.ms-i.dest:hover { background: color-mix(in srgb, var(--ci) 14%, var(--surface, #fefefe)); }
@media (max-width: 640px) {
  .ms-bt-t { display: none; }
  .ms-bt { padding: 0 14px; }
  .ms-lista { position: fixed; left: 16px; right: 16px; top: auto; bottom: 16px; width: auto; max-width: none; transform-origin: bottom center; }
  .ms-i { padding: 10px; min-height: 48px; }
}
`;
