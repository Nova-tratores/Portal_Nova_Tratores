'use client';
// PÁGINA DE TESTE (José, 19/10/2026: "pode remover tudo que está em testes e me dê algo mais
// dinâmico, interativo e animado"). Ele escolheu a B (Jornada); Radar e Fila ficaram no código, fora da página.
// A tela de verdade só muda depois que ele escolher.
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ProspeccaoFila, ProspeccaoRadar } from '@/components/inteligencia-vendas/ProspeccaoViva';
import ProspeccaoPagina from '@/components/inteligencia-vendas/ProspeccaoPagina';

type Aba = 'radar' | 'jornada' | 'fila';
const OPCOES: { id: Aba; nome: string; icone: string }[] = [
  { id: 'jornada', nome: 'Prospecção · Jornada com o Tratorilson', icone: 'fa-person-chalkboard' },
];

function Teste() {
  const sp = useSearchParams();
  const [op, setOp] = useState<Aba>('jornada');
  useEffect(() => {
    let v: string | null = sp?.get('aba') ?? null;
    try { if (!v) v = localStorage.getItem('iv-teste-prosp'); } catch { /* sem storage */ }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- abre a aba do link ou a última vista
    if (v && OPCOES.some((o) => o.id === v)) setOp(v as Aba);
  }, [sp]);
  const escolher = (v: Aba) => { setOp(v); try { localStorage.setItem('iv-teste-prosp', v); } catch { /* ok */ } };
  return (
    <div style={{ width: '100%' }}>
      <div role="tablist" style={{ display: 'flex', alignItems: 'flex-end', gap: 3, padding: '10px clamp(12px, 2vw, 28px) 0', background: 'linear-gradient(135deg, #F87171, #991B1B)', overflowX: 'auto' }}>
        {OPCOES.map((o) => {
          const on = op === o.id;
          return (
            <button key={o.id} type="button" role="tab" aria-selected={on} onClick={() => escolher(o.id)}
              style={{ padding: '11px 18px', border: 0, borderRadius: '11px 11px 0 0', fontFamily: 'inherit', fontSize: 15, fontWeight: on ? 700 : 500, color: '#111111', background: on ? '#fefefe' : 'rgba(255,255,255,0.30)', boxShadow: on ? '0 -2px 6px rgba(0,0,0,0.15)' : 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              <i className={`fas ${o.icone}`} style={{ marginRight: 7, color: on ? '#dc2626' : '#111111' }} />{o.nome}
            </button>
          );
        })}
        <span style={{ marginLeft: 'auto', alignSelf: 'center', marginBottom: 8, background: '#fde047', color: '#111111', borderRadius: 8, padding: '3px 10px', fontSize: 12.5, fontWeight: 900, whiteSpace: 'nowrap' }}>PÁGINA DE TESTE · PROSPECÇÃO</span>
      </div>
      {op === 'radar' && <ProspeccaoRadar />}
      {op === 'jornada' && <ProspeccaoPagina />}
      {op === 'fila' && <ProspeccaoFila />}
    </div>
  );
}

export default function TestePage() {
  return <Suspense fallback={null}><Teste /></Suspense>;
}
