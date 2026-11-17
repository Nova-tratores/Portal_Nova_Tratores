'use client';
// Abas das Requisições guardadas num menu suspenso (José, 16/11/2026: "guardar isso em um menu dropdown?").
// O botão mostra a aba aberta (ícone, nome e contador); clicar abre a lista com todas.
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export type AbaReq = { id: string; label: string; icone: string; cor: string; conta?: number };

export default function MenuAbasReq({ abas, ativa, onTrocar }: { abas: AbaReq[]; ativa: string; onTrocar: (id: string) => void }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const atual = abas.find((a) => a.id === ativa) || abas[0];

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent | TouchEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false); };
    document.addEventListener('mousedown', fora);
    document.addEventListener('touchstart', fora);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', fora);
      document.removeEventListener('touchstart', fora);
      document.removeEventListener('keydown', esc);
    };
  }, [aberto]);

  if (!atual) return null;
  return (
    <div ref={ref} className="relative shrink-0">
      <button type="button" onClick={() => setAberto((v) => !v)} aria-haspopup="menu" aria-expanded={aberto}
        className="flex items-center gap-2 h-[40px] pl-1.5 pr-2.5 rounded-xl border bg-white hover:border-orange-300 transition-colors"
        style={{ borderColor: aberto ? atual.cor : 'var(--border, #e2e8f0)' }}>
        <span className="w-7 h-7 rounded-lg flex items-center justify-center text-white shrink-0 text-[13px]" style={{ background: atual.cor }}>
          <i className={`fa-solid ${atual.icone}`} />
        </span>
        <span className="text-[14px] font-medium text-zinc-900">{atual.label}</span>
        {atual.conta ? <span className="text-[12px] font-semibold text-white rounded-full px-2 py-0.5" style={{ background: atual.cor }}>{atual.conta}</span> : null}
        <ChevronDown size={16} className={`text-zinc-500 transition-transform ${aberto ? 'rotate-180' : ''}`} />
      </button>

      {aberto && (
        <div role="menu" className="absolute right-0 top-full mt-1.5 z-[60] w-[min(280px,calc(100vw-32px))] rounded-xl border border-zinc-200 bg-white shadow-xl p-1.5">
          {abas.map((a) => {
            const on = a.id === atual.id;
            return (
              <button key={a.id} type="button" role="menuitem" onClick={() => { onTrocar(a.id); setAberto(false); }}
                className={`w-full flex items-center gap-3 min-h-[44px] px-2 rounded-lg text-left transition-colors ${on ? 'bg-orange-50' : 'hover:bg-zinc-50'}`}>
                <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${a.cor}1A`, color: a.cor }}>
                  <i className={`fa-solid ${a.icone}`} />
                </span>
                <span className="flex-1 text-[14px] text-zinc-800">{a.label}</span>
                {a.conta ? <span className="text-[12px] text-zinc-500">{a.conta}</span> : null}
                {on && <Check size={15} className="text-orange-600" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
