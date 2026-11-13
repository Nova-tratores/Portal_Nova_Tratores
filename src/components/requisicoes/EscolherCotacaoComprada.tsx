'use client';
// "Qual cotação foi comprada?" — abre depois de anexar a nota quando a
// requisição tem 2+ cotações e ninguém marcou a comprada. Não trava nada:
// "Agora não" fecha e o cartão segue avisando. (12/11/2026)
import { useState } from 'react';
import { ShoppingCart, Star, X } from 'lucide-react';
import { cotacoesPreenchidas, type Cotacao } from '@/lib/requisicoes/cotacoes';

interface Props {
  cotacao: Cotacao;
  onEscolher: (numero: number) => Promise<void> | void;
  onFechar: () => void;
}

export default function EscolherCotacaoComprada({ cotacao, onEscolher, onFechar }: Props) {
  const [gravando, setGravando] = useState<number | null>(null);
  const lista = cotacoesPreenchidas(cotacao);
  const indicada = Number(cotacao?.indicada) || null;

  const escolher = async (n: number) => {
    setGravando(n);
    try { await onEscolher(n); } finally { setGravando(null); }
  };

  return (
    <div className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm flex items-stretch md:items-center justify-center md:p-4"
      onClick={(e) => { e.stopPropagation(); if (gravando === null) onFechar(); }}>
      <div className="bg-white w-full md:max-w-lg md:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-full md:max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-zinc-200 flex items-center gap-3 shrink-0">
          <ShoppingCart size={18} className="text-emerald-600" />
          <div className="flex-1">
            <div className="text-[15px] font-semibold text-black">Qual cotação foi comprada?</div>
            <div className="text-[13px] text-black">Fica registrado quem marcou. Pode ser diferente da indicada.</div>
          </div>
          <button onClick={onFechar} className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-zinc-100 text-black" title="Fechar"><X size={16} /></button>
        </div>

        <div className="p-4 space-y-2 overflow-y-auto">
          {lista.map(n => {
            const ehIndicada = indicada === n;
            return (
              <button key={n} type="button" disabled={gravando !== null} onClick={() => escolher(n)}
                className={`w-full text-left flex items-center gap-3 px-4 py-3 min-h-[56px] rounded-xl border transition-all disabled:opacity-60 ${ehIndicada ? 'border-amber-400 bg-amber-50/60' : 'border-zinc-200 hover:border-emerald-500 hover:bg-emerald-50/50'}`}>
                <div className="w-7 h-7 rounded-full bg-orange-600 text-white flex items-center justify-center text-[11px] font-bold shrink-0">{n}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-semibold text-black truncate">{cotacao[`fornecedor${n}`] || `Cotação ${n}`}</div>
                  {cotacao[`servico_material${n}`] && <div className="text-[12px] text-black truncate">{cotacao[`servico_material${n}`]}</div>}
                  {ehIndicada && <div className="text-[12px] text-amber-700 flex items-center gap-1"><Star size={11} fill="currentColor" /> indicada{cotacao.indicada_por ? ` por ${cotacao.indicada_por}` : ''}</div>}
                </div>
                <div className="text-[15px] font-bold text-black shrink-0">{cotacao[`valor${n}`] ? `R$ ${cotacao[`valor${n}`]}` : '—'}</div>
                {gravando === n && <span className="text-[12px] text-black">gravando…</span>}
              </button>
            );
          })}
        </div>

        <div className="px-5 py-3 border-t border-zinc-200 flex justify-end shrink-0">
          <button onClick={onFechar} disabled={gravando !== null}
            className="min-h-[44px] px-5 rounded-xl border border-zinc-200 text-[14px] text-black hover:bg-zinc-50 disabled:opacity-60">
            Agora não
          </button>
        </div>
      </div>
    </div>
  );
}
