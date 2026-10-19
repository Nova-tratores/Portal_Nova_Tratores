'use client';
// Opção 2 · Caixa de entrada — lista de tarefas limpa. À esquerda as "pastas"
// (todos, quentes e os 4 tipos de conversa); cada linha diz quem, por quê, o que
// oferecer, a temperatura e tem Ligar / WhatsApp / Ficha.
import { useMemo, useState } from 'react';
import type { ClienteIV } from '@/lib/inteligencia-vendas/tipos';
import { textoNorm } from '@/lib/inteligencia-vendas/normalizar';
import { QUADRANTES, quadranteDe, type Quadrante } from '../vivo/kit';
import { Acoes, Avatar, BD, CARD, EstilosOport, MU, SUAVE, Temperatura, TX, reais, tipo, valorCliente } from './comum';

type Pasta = 'todos' | 'quentes' | Quadrante;

export default function CaixaEntrada({ clientes, onFicha }: { clientes: ClienteIV[]; onFicha: (c: ClienteIV) => void }) {
  const [pasta, setPasta] = useState<Pasta>('quentes');
  const [busca, setBusca] = useState('');
  const [ordem, setOrdem] = useState<'score' | 'valor'>('score');
  const conta = (p: Pasta) => clientes.filter((c) => (p === 'todos' ? true : p === 'quentes' ? c.score >= 50 : quadranteDe(c) === p)).length;
  const lista = useMemo(() => {
    const q = textoNorm(busca);
    return clientes
      .filter((c) => (pasta === 'todos' ? true : pasta === 'quentes' ? c.score >= 50 : quadranteDe(c) === pasta))
      .filter((c) => !q || textoNorm(`${c.nome} ${c.cidade} ${c.vendedor}`).includes(q))
      .sort((a, b) => (ordem === 'valor' ? valorCliente(b) - valorCliente(a) : b.score - a.score || valorCliente(b) - valorCliente(a)));
  }, [clientes, pasta, busca, ordem]);

  const pastas: { id: Pasta; nome: string; cor: string; icone: string }[] = [
    { id: 'quentes', nome: 'Quentes', cor: '#dc2626', icone: 'fa-fire' },
    { id: 'todos', nome: 'Todos', cor: '#0f172a', icone: 'fa-inbox' },
    ...QUADRANTES.map((q) => ({ id: q.id as Pasta, nome: q.nome, cor: q.cor, icone: 'fa-circle' })),
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 260px) minmax(0, 1fr)', gap: 0, minHeight: 'calc(100vh - 160px)', background: CARD }} className="cx-grade">
      <EstilosOport />
      <style>{`@media (max-width: 860px) { .cx-grade { grid-template-columns: 1fr !important } .cx-lado { position: static !important; border-right: 0 !important; border-bottom: 1px solid ${BD} } .cx-linha { grid-template-columns: 44px minmax(0, 1fr) !important } .cx-extra { display: none !important } }`}</style>
      <aside className="cx-lado" style={{ borderRight: `1px solid ${BD}`, padding: 18, position: 'sticky', top: 0, alignSelf: 'start' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: MU, letterSpacing: .8, textTransform: 'uppercase', margin: '4px 8px 10px' }}>Oportunidades</div>
        {pastas.map((p) => {
          const on = pasta === p.id;
          return (
            <button key={p.id} type="button" onClick={() => setPasta(p.id)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px', marginBottom: 2, border: 0, borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit', fontSize: 15.5, fontWeight: on ? 800 : 600, textAlign: 'left', background: on ? SUAVE : 'transparent', color: TX, transition: 'background .15s' }}>
              <i className={`fas ${p.icone}`} style={{ color: p.cor, fontSize: p.icone === 'fa-circle' ? 9 : 15, width: 18, textAlign: 'center' }} />
              <span style={{ flex: 1 }}>{p.nome}</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: on ? p.cor : MU }}>{conta(p.id)}</span>
            </button>
          );
        })}
        <div style={{ fontSize: 13, color: MU, lineHeight: 1.5, margin: '18px 8px 0' }}>
          {pasta === 'quentes' ? 'Score 50 ou mais: mais de um motivo para ligar.' : pasta === 'todos' ? 'Todos os clientes com algum motivo para ligar.' : QUADRANTES.find((q) => q.id === pasta)?.frase}
        </div>
      </aside>

      <section style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '14px 20px', borderBottom: `1px solid ${BD}`, flexWrap: 'wrap', position: 'sticky', top: 0, background: CARD, zIndex: 2 }}>
          <div style={{ position: 'relative', flex: '1 1 260px', maxWidth: 480 }}>
            <i className="fas fa-magnifying-glass" style={{ position: 'absolute', left: 14, top: 13, color: MU, fontSize: 14 }} />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cliente, cidade ou vendedor"
              style={{ width: '100%', height: 42, borderRadius: 12, border: `1px solid ${BD}`, background: SUAVE, padding: '0 14px 0 38px', fontSize: 15, color: TX, outline: 'none', fontFamily: 'inherit' }} />
          </div>
          <span style={{ fontSize: 15, color: MU }}><b style={{ color: TX }}>{lista.length}</b> clientes</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, background: SUAVE, padding: 4, borderRadius: 12 }}>
            {(['score', 'valor'] as const).map((o) => (
              <button key={o} type="button" onClick={() => setOrdem(o)} style={{ border: 0, borderRadius: 9, padding: '7px 12px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', background: ordem === o ? CARD : 'transparent', color: TX, boxShadow: ordem === o ? '0 1px 3px rgba(15,23,42,.12)' : 'none' }}>
                {o === 'score' ? 'Mais quente' : 'Maior valor'}
              </button>
            ))}
          </div>
        </div>

        <div key={pasta + ordem}>
          {lista.slice(0, 80).map((c, i) => {
            const q = tipo(c);
            const o = c.oportunidades[0];
            return (
              <div key={c.chave} onClick={() => onFicha(c)} className="op-entra op-item cx-linha"
                style={{ animationDelay: `${Math.min(i, 14) * 30}ms`, display: 'grid', gridTemplateColumns: '44px minmax(180px, 1.1fr) minmax(220px, 2fr) 110px 110px 140px', gap: 16, alignItems: 'center', padding: '14px 20px', borderBottom: `1px solid ${BD}`, cursor: 'pointer', background: CARD }}>
                <Avatar nome={c.nome} cor={q.cor} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: TX, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.nome}</div>
                  <div style={{ fontSize: 13.5, color: MU, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.cidade.replace(/\s*\(..\)$/, '')}{c.vendedor ? ` · ${c.vendedor}` : ''}</div>
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 15, color: TX, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o?.titulo}</div>
                  <div style={{ fontSize: 14, color: q.cor, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o?.oferecer}</div>
                </div>
                <div className="cx-extra"><Temperatura score={c.score} /></div>
                <div className="cx-extra" style={{ fontSize: 14.5, fontWeight: 700, color: TX, textAlign: 'right' }} title="Peças 12 meses + propostas abertas + máquinas">{reais(valorCliente(c))}</div>
                <div className="cx-extra" style={{ display: 'flex', justifyContent: 'flex-end' }}><Acoes c={c} onFicha={() => onFicha(c)} compacto /></div>
              </div>
            );
          })}
          {lista.length === 0 && <div style={{ padding: 60, textAlign: 'center', color: MU, fontSize: 16 }}>Nenhum cliente aqui.</div>}
        </div>
      </section>
    </div>
  );
}
