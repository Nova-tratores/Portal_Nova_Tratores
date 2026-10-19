'use client';
// PÁGINA DE TESTE (José, 19/10/2026). A tela de verdade só muda depois que ele escolher.
//   Ficha do cliente: Opção 1 = como está na tela real; 2 e 3 = lista executiva com a ficha
//   em painel lateral ou em abas (ele preferiu a 3).
//   Notícias + Plano Safra juntos (pedido de 19/10), em 3 visuais com fotos: A Portal ·
//   B Revista · C Jornal. ?aba=noticias e ?aba=plano-safra (links antigos do sino) abrem a A.
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Oportunidades from '@/components/inteligencia-vendas/Oportunidades';
import BoletimOpcoes from '@/components/inteligencia-vendas/BoletimOpcoes';

type Aba = 'hoje' | 'lateral' | 'abas' | 'portal' | 'revista' | 'jornal';
const OPCOES: { id: Aba; nome: string; grupo: 'ficha' | 'boletim' }[] = [
  { id: 'hoje', nome: 'Ficha 1 · Tela real', grupo: 'ficha' },
  { id: 'lateral', nome: 'Ficha 2 · Lateral', grupo: 'ficha' },
  { id: 'abas', nome: 'Ficha 3 · Abas', grupo: 'ficha' },
  { id: 'portal', nome: 'Notícias A · Portal', grupo: 'boletim' },
  { id: 'revista', nome: 'Notícias B · Revista', grupo: 'boletim' },
  { id: 'jornal', nome: 'Notícias C · Jornal', grupo: 'boletim' },
];
const APELIDOS: Record<string, Aba> = { noticias: 'portal', 'plano-safra': 'portal' };

function Teste() {
  const sp = useSearchParams();
  const [op, setOp] = useState<Aba>('abas');
  useEffect(() => {
    let v: string | null = sp?.get('aba') ?? null;
    try { if (!v) v = localStorage.getItem('iv-teste-topo'); } catch { /* sem storage */ }
    if (v && APELIDOS[v]) v = APELIDOS[v];
    // eslint-disable-next-line react-hooks/set-state-in-effect -- abre a aba do link ou a última vista
    if (v && OPCOES.some((o) => o.id === v)) setOp(v as Aba);
  }, [sp]);
  const escolher = (v: Aba) => { setOp(v); try { localStorage.setItem('iv-teste-topo', v); } catch { /* ok */ } };
  const atual = OPCOES.find((o) => o.id === op)!;
  return (
    <div style={{ width: '100%' }}>
      <div role="tablist" style={{ display: 'flex', alignItems: 'flex-end', gap: 3, padding: '10px clamp(12px, 2vw, 28px) 0', background: 'linear-gradient(135deg, #F87171, #991B1B)', overflowX: 'auto' }}>
        {OPCOES.map((o, i) => {
          const on = op === o.id;
          return (
            <button key={o.id} type="button" role="tab" aria-selected={on} onClick={() => escolher(o.id)}
              style={{ padding: '11px 18px', border: 0, borderRadius: '11px 11px 0 0', fontFamily: 'inherit', fontSize: 15, fontWeight: on ? 700 : 500, color: '#111111', background: on ? '#fefefe' : 'rgba(255,255,255,0.30)', boxShadow: on ? '0 -2px 6px rgba(0,0,0,0.15)' : 'none', cursor: 'pointer', whiteSpace: 'nowrap', marginLeft: o.grupo === 'boletim' && OPCOES[i - 1]?.grupo === 'ficha' ? 18 : 0 }}>
              <i className={`fas ${o.grupo === 'ficha' ? 'fa-id-card' : 'fa-newspaper'}`} style={{ marginRight: 7, color: on ? '#dc2626' : '#111111' }} />{o.nome}
            </button>
          );
        })}
        <span style={{ marginLeft: 'auto', alignSelf: 'center', marginBottom: 8, background: '#fde047', color: '#111111', borderRadius: 8, padding: '3px 10px', fontSize: 12.5, fontWeight: 900, whiteSpace: 'nowrap' }}>PÁGINA DE TESTE</span>
      </div>
      {atual.grupo === 'boletim'
        ? <BoletimOpcoes key={op} layout={op as 'portal' | 'revista' | 'jornal'} />
        : <Oportunidades key={op} topo="C" ficha={op === 'hoje' ? undefined : (op as 'lateral' | 'abas')} />}
    </div>
  );
}

export default function TestePage() {
  return <Suspense fallback={null}><Teste /></Suspense>;
}
