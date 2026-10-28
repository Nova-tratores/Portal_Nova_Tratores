'use client';
// Papel do usuário num menu só (José, 21/10/2026: "o vendedor ou diretor tem que ficar nesse dropdown"):
// nível (Usuário · Admin · Dev — um só) + papéis extras que somam ao nível (Diretor · Vendedor).
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';

export type Nivel = 'usuario' | 'admin' | 'dev';
interface Props {
  nivel: Nivel; podeDev: boolean; bloqueado: boolean; motivoBloqueio?: string;
  diretor: boolean; vendedor: boolean; salvandoVendedor?: boolean;
  onNivel: (n: Nivel) => void; onDiretor: (v: boolean) => void; onVendedor: (v: boolean) => void;
}
const NIVEIS: { id: Nivel; rot: string; txt: string }[] = [
  { id: 'usuario', rot: 'Usuário', txt: 'vê só os módulos que você liberar' },
  { id: 'admin', rot: 'Admin', txt: 'acesso a tudo e à Administração' },
  { id: 'dev', rot: 'Dev', txt: 'Admin + ferramentas de desenvolvedor' },
];
const COR: Record<Nivel, { bg: string; fg: string; bd: string }> = {
  usuario: { bg: '#fefefe', fg: '#334155', bd: '#e2e8f0' },
  admin: { bg: '#fffbeb', fg: '#b45309', bd: '#fde68a' },
  dev: { bg: '#0f172a', fg: '#fefefe', bd: '#0f172a' },
};

export default function PapelMenu(p: Props) {
  const [aberto, setAberto] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const fechar = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest?.('.pm-pop') && e.target !== btn.current && !btn.current?.contains(e.target as Node)) setAberto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false); };
    const mover = () => setAberto(false);
    document.addEventListener('mousedown', fechar); document.addEventListener('keydown', esc); window.addEventListener('scroll', mover, true);
    return () => { document.removeEventListener('mousedown', fechar); document.removeEventListener('keydown', esc); window.removeEventListener('scroll', mover, true); };
  }, [aberto]);
  const abrir = () => {
    const r = btn.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 6, left: Math.min(r.left, window.innerWidth - 300) });
    setAberto((v) => !v);
  };
  const c = COR[p.nivel];
  const extras = [p.diretor && 'Diretor', p.vendedor && 'Vendedor'].filter(Boolean) as string[];
  return (
    <>
      <style>{ESTILO_PM}</style>
      <button ref={btn} type="button" className="pm-btn" onClick={abrir} style={{ background: c.bg, color: c.fg, borderColor: c.bd }} aria-expanded={aberto}>
        <span>{NIVEIS.find((n) => n.id === p.nivel)?.rot}</span>
        {extras.map((x) => <em key={x} className={x === 'Diretor' ? 'dir' : 'ven'}>{x}</em>)}
        <ChevronDown size={14} style={{ transition: 'transform .2s', transform: aberto ? 'rotate(180deg)' : 'none' }} />
      </button>
      {aberto && pos && typeof document !== 'undefined' && createPortal(
        <div className="pm-pop" style={{ top: pos.top, left: pos.left }}>
          <style>{ESTILO_PM}</style>
          <small className="pm-rot">Nível de acesso</small>
          {p.bloqueado && <p className="pm-aviso">{p.motivoBloqueio || 'Não dá para mudar o nível desta conta.'}</p>}
          {NIVEIS.filter((n) => n.id !== 'dev' || p.podeDev || p.nivel === 'dev').map((n) => (
            <button key={n.id} type="button" className={`pm-op ${p.nivel === n.id ? 'on' : ''}`} disabled={p.bloqueado} onClick={() => { p.onNivel(n.id); }}>
              <span className="pm-radio">{p.nivel === n.id && <i />}</span>
              <span className="pm-tx"><b>{n.rot}</b><small>{n.txt}</small></span>
            </button>
          ))}
          <div className="pm-sep" />
          <small className="pm-rot">Papéis extras</small>
          <button type="button" className="pm-op" onClick={() => p.onDiretor(!p.diretor)}>
            <span className={`pm-sw ${p.diretor ? 'on dir' : ''}`}><i /></span>
            <span className="pm-tx"><b>Diretor</b><small>autoriza o lançamento das comissões</small></span>
          </button>
          <button type="button" className="pm-op" disabled={p.salvandoVendedor} onClick={() => p.onVendedor(!p.vendedor)}>
            <span className={`pm-sw ${p.vendedor ? 'on ven' : ''}`}><i /></span>
            <span className="pm-tx"><b>Vendedor</b><small>entra no app NT Vendas com o mesmo login</small></span>
            {p.salvandoVendedor && <span className="pm-girando" />}
          </button>
        </div>, document.body)}
    </>
  );
}

const ESTILO_PM = `
@keyframes pmEntra { from { opacity: 0; transform: translateY(-6px) scale(.98) } }
@keyframes pmGira { to { transform: rotate(360deg) } }
.pm-btn { display: inline-flex; align-items: center; gap: 6px; border: 1px solid; border-radius: 999px; padding: 6px 10px 6px 14px; font-family: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer; transition: box-shadow .2s, transform .15s; max-width: 100% }
.pm-btn:hover { box-shadow: 0 4px 12px rgba(15,23,42,.10); transform: translateY(-1px) }
.pm-btn em { font-style: normal; font-size: 11px; font-weight: 600; border-radius: 99px; padding: 1px 7px } .pm-btn em.dir { background: #dcfce7; color: #166534 } .pm-btn em.ven { background: #fee2e2; color: #b91c1c }
.pm-pop { position: fixed; z-index: 100200; width: 290px; background: #fefefe; border: 1px solid #e2e8f0; border-radius: 16px; padding: 10px; box-shadow: 0 20px 50px rgba(15,23,42,.22); animation: pmEntra .18s both; font-family: inherit; color: #0f172a }
.pm-rot { display: block; font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: .5px; margin: 4px 8px 6px }
.pm-aviso { margin: 0 8px 6px; font-size: 12px; color: #92400e; background: #fffbeb; border-radius: 8px; padding: 6px 8px }
.pm-op { width: 100%; display: flex; align-items: center; gap: 10px; border: none; background: none; border-radius: 10px; padding: 8px; font-family: inherit; text-align: left; cursor: pointer; color: inherit; transition: background .15s }
.pm-op:hover:not(:disabled) { background: #f1f5f9 } .pm-op:disabled { opacity: .5; cursor: not-allowed } .pm-op.on { background: #f8fafc }
.pm-tx { display: grid; flex: 1 } .pm-tx b { font-size: 13.5px; font-weight: 500 } .pm-tx small { font-size: 12px; color: #64748b }
.pm-radio { width: 18px; height: 18px; border-radius: 50%; border: 2px solid #cbd5e1; display: grid; place-items: center; flex-shrink: 0 } .pm-op.on .pm-radio { border-color: #0f172a } .pm-radio i { width: 8px; height: 8px; border-radius: 50%; background: #0f172a }
.pm-sw { width: 34px; height: 20px; border-radius: 99px; background: #e2e8f0; position: relative; flex-shrink: 0; transition: background .2s } .pm-sw i { position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: #fefefe; box-shadow: 0 1px 3px rgba(15,23,42,.25); transition: transform .2s }
.pm-sw.on i { transform: translateX(14px) } .pm-sw.on.dir { background: #059669 } .pm-sw.on.ven { background: #dc2626 }
.pm-sep { height: 1px; background: #f1f5f9; margin: 6px 4px }
.pm-girando { width: 14px; height: 14px; border-radius: 50%; border: 2px solid #e2e8f0; border-top-color: #dc2626; animation: pmGira .7s linear infinite }
`;
