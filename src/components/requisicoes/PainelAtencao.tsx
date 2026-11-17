'use client';
// "Precisa da sua atenção" — casos que se resolvem (paradas, sem nota, valor alto, sem fornecedor,
// duplicadas, a cobrar); clicar num caso filtra o quadro por aquelas requisições.
// Regras em lib/requisicoes/inteligencia.ts.
// 17/11/2026 (José: "ficou um espaço em branco e ruim de ler… que o usuário só vê se quiser"):
// virou um BOTÃO "Atenção (N)" na mesma linha do menu das abas; a lista só abre ao clicar,
// um caso por linha (número, nome, valor). Com filtro ligado, o botão mostra qual e um X para tirar.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { brl, itensAtencao, type ItemAtencao, type Req } from '@/lib/requisicoes/inteligencia';
import { statusCobranca, temCobranca } from '@/components/pos/CobrancaRequisicao';

export default function PainelAtencao({ requisicoes, filtroAtivo, onFiltrar }: {
  requisicoes: Req[];
  /** chave do caso que está filtrando o quadro agora */
  filtroAtivo: string | null;
  onFiltrar: (item: ItemAtencao | null) => void;
}) {
  const itens = useMemo(() => {
    // Filtro rápido "A cobrar do cliente": cobráveis ainda sem valor cobrado (José, 26/10/2026)
    const aCobrar = requisicoes.filter((r) => temCobranca(r as never) && statusCobranca(r as never) === 'a_cobrar');
    const cobrar: ItemAtencao = {
      chave: 'aCobrar', titulo: 'A cobrar do cliente', icone: 'fa-hand-holding-dollar', cor: '#EA580C',
      explicacao: 'Requisições de OS, Peças ou Serviço de Terceiros sem valor cobrado do cliente. Preencha o valor ou marque Não cobrar com o motivo.',
      ids: aCobrar.map((r) => Number(r.id)), valor: 0,
    };
    return [cobrar, ...itensAtencao(requisicoes, new Date())];
  }, [requisicoes]);
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const total = itens.reduce((s, i) => s + i.ids.length, 0);
  const ativo = itens.find((i) => i.chave === filtroAtivo) || null;

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

  const corBotao = ativo ? ativo.cor : total ? '#DC2626' : '#16A34A';

  return (
    <div ref={ref} className="relative flex items-center gap-1.5 min-w-0">
      <button type="button" onClick={() => setAberto((v) => !v)} aria-haspopup="menu" aria-expanded={aberto}
        title="O que está travado nas requisições"
        className="flex items-center gap-2 h-[40px] pl-1.5 pr-2.5 rounded-xl border-2 transition-colors min-w-0"
        style={{
          // com casos e sem filtro: o botão "grita" (fundo vermelho claro + bolinha piscando) para ninguém deixar passar
          borderColor: ativo ? corBotao : total ? '#FCA5A5' : 'var(--border, #e2e8f0)',
          background: ativo ? '#fff' : total ? '#FEF2F2' : '#fff',
        }}>
        <span className="relative w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-white" style={{ background: corBotao }}>
          <i className={`fa-solid ${ativo ? ativo.icone : total ? 'fa-triangle-exclamation' : 'fa-check'}`} />
          {!ativo && total > 0 && (
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75 animate-ping" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-red-600 border-2 border-white" />
            </span>
          )}
        </span>
        {ativo ? (
          <span className="text-[14px] text-zinc-900 truncate">Só: <b className="font-medium">{ativo.titulo}</b> ({ativo.ids.length})</span>
        ) : total ? (
          <>
            <span className="text-[14px] font-medium text-red-700 whitespace-nowrap"><span className="hidden 2xl:inline">Precisa de </span>atenção</span>
            <span className="text-[12px] font-semibold text-white rounded-full px-2 py-0.5 bg-red-600">{total}</span>
          </>
        ) : (
          <span className="text-[15px] font-medium text-green-700">Tudo em dia</span>
        )}
        <ChevronDown size={16} className={`text-zinc-500 shrink-0 transition-transform ${aberto ? 'rotate-180' : ''}`} />
      </button>
      {ativo && (
        <button type="button" onClick={() => onFiltrar(null)} title="Tirar o filtro"
          className="w-10 h-10 shrink-0 flex items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-600 hover:text-red-600 hover:border-red-300">
          <X size={16} />
        </button>
      )}

      {aberto && (
        <div role="menu" className="absolute left-0 top-full mt-1.5 z-[60] w-[min(400px,calc(100vw-32px))] rounded-xl border border-zinc-200 bg-white shadow-xl p-1.5">
          <div className="px-2 pt-1 pb-2 text-[12px] text-zinc-500">Clique num caso para ver só aquelas no quadro.</div>
          {itens.map((it) => {
            const vazio = it.ids.length === 0;
            const on = it.chave === filtroAtivo;
            return (
              <button key={it.chave} type="button" role="menuitem" disabled={vazio} title={it.explicacao}
                onClick={() => { onFiltrar(on ? null : it); setAberto(false); }}
                className={`w-full flex items-center gap-3 min-h-[48px] px-2 rounded-lg text-left transition-colors ${on ? 'bg-orange-50' : vazio ? 'opacity-45 cursor-default' : 'hover:bg-zinc-50'}`}>
                <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${it.cor}1A`, color: it.cor }}>
                  <i className={`fa-solid ${it.icone}`} />
                </span>
                <span className="w-9 text-right text-[16px] font-semibold shrink-0" style={{ color: vazio ? '#a1a1aa' : it.cor }}>{it.ids.length}</span>
                <span className="flex-1 min-w-0 text-[14px] text-zinc-800 leading-tight">{it.titulo}</span>
                {it.valor > 0 && <span className="text-[12.5px] text-zinc-500 shrink-0">{brl(it.valor)}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
