"use client";
// Menu em CÍRCULO no centro da tela, fundo desfocado (mesmo jeito do "Atalhos" da Janela Mecânicos).
// José, 21/10/2026: "coloca no POS esse tipo de menu … deixa os botões circulares".
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";

export interface ItemRadial { k: string; t: string; sub?: string; ic: string; cor: string; n?: number; on?: boolean; ir: () => void }

export default function MenuRadial({ itens, centro, titulo, icone = "fa-circle-nodes", corGatilho = "linear-gradient(135deg, #0ea5e9, #0369a1)" }: {
  itens: ItemRadial[];
  centro?: { t: string; sub?: string; ic: string; ir: () => void };
  /** tooltip do botão redondo */
  titulo: string;
  icone?: string;
  corGatilho?: string;
}) {
  const [aberto, setAberto] = useState(false);
  useEffect(() => {
    if (!aberto) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setAberto(false); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [aberto]);
  const avisos = itens.reduce((s, x) => s + (x.n || 0), 0);
  const R = 190;
  const ir = (f: () => void) => { setAberto(false); f(); };
  return (
    <>
      <style>{ESTILO_RD}</style>
      <button type="button" className={`rd-bt ${aberto ? "on" : ""}`} onClick={() => setAberto(true)} title={titulo} aria-label={titulo}
        style={{ "--g": corGatilho } as CSSProperties}>
        <i className={`fas ${icone}`} />
        {avisos > 0 && <span className="rd-n">{avisos}</span>}
      </button>
      {aberto && typeof document !== "undefined" && createPortal(
        <div className="rd-fundo" role="dialog" aria-modal="true" aria-label={titulo} onClick={() => setAberto(false)}>
          <div className="rd-roda" onClick={(e) => e.stopPropagation()}>
            <span className="rd-aro" aria-hidden />
            {itens.map((x, i) => {
              const a = (-90 + (i * 360) / itens.length) * (Math.PI / 180);
              return (
                <button key={x.k} type="button" className={`rd-i ${x.on ? "on" : ""}`}
                  style={{ "--c": x.cor, "--x": `${Math.cos(a) * R}px`, "--y": `${Math.sin(a) * R}px`, animationDelay: `${60 + i * 45}ms` } as CSSProperties}
                  onClick={() => ir(x.ir)}>
                  <span className="rd-i-ic"><i className={`fas ${x.ic}`} />{!!x.n && <em>{x.n}</em>}</span>
                  <b>{x.t}</b>{x.sub && <small>{x.sub}</small>}
                </button>
              );
            })}
            {centro && (
              <button type="button" className="rd-centro" onClick={() => ir(centro.ir)}>
                <span><i className={`fas ${centro.ic}`} /></span>
                <b>{centro.t}</b>{centro.sub && <small>{centro.sub}</small>}
              </button>
            )}
          </div>
          <button type="button" className="rd-x" onClick={() => setAberto(false)} aria-label="fechar">×</button>
        </div>,
        document.body,
      )}
    </>
  );
}

/** Botão redondo simples, no mesmo tamanho do gatilho do menu (ex.: o "+" da Nova ordem). */
export function BotaoRedondo({ icone, titulo, onClick, cor = "#0369A1", children, ...resto }: {
  icone: string; titulo: string; onClick: () => void; cor?: string; children?: ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <>
      <style>{ESTILO_RD}</style>
      <button type="button" {...resto} className="rd-bt rd-mais" onClick={onClick} title={titulo} aria-label={titulo}
        style={{ "--g": cor, ...(resto.style || {}) } as CSSProperties}>
        <i className={`fas ${icone}`} />{children}
      </button>
    </>
  );
}

const ESTILO_RD = `
.rd-bt { position: relative; width: 44px; height: 44px; flex: none; border-radius: 50%; border: 0; display: grid; place-items: center; font-size: 17px; color: #fefefe; background: var(--g); cursor: pointer; box-shadow: 0 6px 16px -6px rgba(3,105,161,.6); transition: transform .15s, box-shadow .2s }
.rd-bt:hover, .rd-bt.on { transform: translateY(-1px) scale(1.04); box-shadow: 0 10px 22px -8px rgba(3,105,161,.75) }
.rd-bt:focus-visible { outline: 3px solid #93c5fd; outline-offset: 2px }
.rd-mais { font-size: 19px }
.rd-n { position: absolute; top: -5px; right: -5px; min-width: 20px; height: 20px; padding: 0 5px; border-radius: 99px; display: grid; place-items: center; font-size: 11.5px; font-weight: 600; color: #fefefe; background: #f59e0b; box-shadow: 0 0 0 2px var(--portal-bg, #f8fafc) }
.rd-fundo { position: fixed; inset: 0; z-index: 9800; display: grid; place-items: center; background: rgba(15,23,42,.38); backdrop-filter: blur(9px); -webkit-backdrop-filter: blur(9px); animation: rdFundo .25s both }
.rd-roda { position: relative; width: 520px; height: 520px; max-width: 96vw; max-height: 96vw }
.rd-aro { position: absolute; inset: 70px; border-radius: 50%; border: 1.5px dashed rgba(255,255,255,.35); animation: rdGira 40s linear infinite }
.rd-i { position: absolute; left: 50%; top: 50%; width: 132px; display: grid; justify-items: center; gap: 2px; border: 0; background: transparent; font-family: inherit; color: #fefefe; cursor: pointer; transform: translate(calc(-50% + var(--x)), calc(-50% + var(--y))); animation: rdSai .45s cubic-bezier(.2,.9,.3,1.25) both }
.rd-i-ic { position: relative; width: 74px; height: 74px; border-radius: 50%; display: grid; place-items: center; font-size: 26px; color: var(--c); background: #fefefe; box-shadow: 0 12px 30px -10px rgba(0,0,0,.45); transition: transform .2s, background .2s, color .2s }
.rd-i:hover .rd-i-ic, .rd-i:focus-visible .rd-i-ic { transform: scale(1.1); background: var(--c); color: #fefefe }
.rd-i.on .rd-i-ic { box-shadow: 0 0 0 4px var(--c), 0 12px 30px -10px rgba(0,0,0,.45) }
.rd-i-ic em { position: absolute; top: -4px; right: -4px; min-width: 24px; height: 24px; padding: 0 6px; border-radius: 99px; display: grid; place-items: center; font-style: normal; font-size: 12.5px; font-weight: 600; color: #fefefe; background: #f59e0b; box-shadow: 0 0 0 3px #fefefe }
.rd-i b { margin-top: 6px; font-size: 15px; font-weight: 600; text-shadow: 0 1px 6px rgba(0,0,0,.4) } .rd-i small { font-size: 12px; opacity: .9; text-align: center; text-shadow: 0 1px 6px rgba(0,0,0,.4) }
.rd-centro { position: absolute; left: 50%; top: 50%; width: 170px; height: 170px; transform: translate(-50%, -50%); border-radius: 50%; border: 0; display: grid; place-content: center; justify-items: center; gap: 2px; font-family: inherit; color: #fefefe; cursor: pointer; background: radial-gradient(circle at 30% 25%, #38bdf8, #0369a1 70%); box-shadow: 0 0 0 10px rgba(255,255,255,.12), 0 20px 50px -12px rgba(3,105,161,.8); animation: rdCentro .4s cubic-bezier(.2,.9,.3,1.25) both; transition: transform .2s }
.rd-centro:hover { transform: translate(-50%, -50%) scale(1.05) }
.rd-centro span { font-size: 38px; animation: rdFlutua 3s ease-in-out infinite } .rd-centro b { font-size: 17px; font-weight: 600 } .rd-centro small { font-size: 12.5px; opacity: .9 }
.rd-x { position: fixed; top: 22px; right: 26px; width: 46px; height: 46px; border-radius: 50%; border: 1px solid rgba(255,255,255,.4); background: rgba(255,255,255,.12); color: #fefefe; font-size: 26px; line-height: 1; cursor: pointer }
@keyframes rdFundo { from { opacity: 0 } }
@keyframes rdSai { from { opacity: 0; transform: translate(-50%, -50%) scale(.3) } }
@keyframes rdCentro { from { opacity: 0; transform: translate(-50%, -50%) scale(.5) } }
@keyframes rdGira { to { transform: rotate(360deg) } }
@keyframes rdFlutua { 50% { transform: translateY(-4px) } }
@media (max-width: 600px) { .rd-roda { transform: scale(.72) } }
`;
