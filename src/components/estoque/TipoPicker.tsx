'use client';
// Seletor de Tipos para a aba "Estoque por Tipo": escolhe quais Tipos aparecem no
// gráfico/tabela/mini. Lista com busca + valor atual de cada Tipo (pra enxergar os
// zerados) + atalhos Top 8 / Todos / Limpar. Popover fecha ao clicar fora.

import { useEffect, useRef, useState } from 'react';

export interface TipoOpt { nome: string; cor: string; valor: number }

const fmtRS0 = (v: number) => 'R$ ' + Math.round(v).toLocaleString('pt-BR');

export default function TipoPicker({ tipos, selecionados, onChange }: {
  tipos: TipoOpt[];                       // já ordenados por valor desc
  selecionados: Set<string>;              // nomes selecionados
  onChange: (next: Set<string>) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false); };
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, [aberto]);

  const toggle = (nome: string) => {
    const n = new Set(selecionados);
    if (n.has(nome)) n.delete(nome); else n.add(nome);
    onChange(n);
  };
  const q = busca.trim().toLowerCase();
  const lista = q ? tipos.filter((t) => t.nome.toLowerCase().includes(q)) : tipos;

  return (
    <div ref={ref} style={{ position: 'relative', paddingBottom: 9 }}>
      <button type="button" onClick={() => setAberto((a) => !a)}
        style={{ border: '1px solid #ddd', borderRadius: 8, padding: '8px 13px', fontSize: '.78rem', fontWeight: 700, cursor: 'pointer', background: '#fff', color: '#333', display: 'flex', alignItems: 'center', gap: 6 }}>
        Tipos ({selecionados.size}) <span style={{ color: '#999', fontWeight: 400 }}>▾</span>
      </button>
      {aberto && (
        <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 50, marginTop: 4, width: 300, maxHeight: 380, display: 'flex', flexDirection: 'column', background: '#fff', border: '1px solid #ddd', borderRadius: 10, boxShadow: '0 10px 30px rgba(0,0,0,.16)' }}>
          <div style={{ padding: 8, borderBottom: '1px solid #eee' }}>
            <input autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar Tipo…"
              style={{ width: '100%', border: '1px solid #ddd', borderRadius: 6, padding: '6px 8px', fontSize: '.8rem', boxSizing: 'border-box' }} />
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <button type="button" onClick={() => onChange(new Set(tipos.slice(0, 8).map((t) => t.nome)))}
                style={btnMini}>Top 8</button>
              <button type="button" onClick={() => onChange(new Set(tipos.map((t) => t.nome)))} style={btnMini}>Todos</button>
              <button type="button" onClick={() => onChange(new Set())} style={btnMini}>Limpar</button>
            </div>
          </div>
          <div style={{ overflow: 'auto', padding: '4px 0' }}>
            {lista.length === 0 && <div style={{ padding: '10px 12px', color: '#999', fontSize: '.8rem' }}>Nenhum Tipo.</div>}
            {lista.map((t) => {
              const on = selecionados.has(t.nome);
              return (
                <label key={t.nome} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 12px', cursor: 'pointer', fontSize: '.8rem' }}>
                  <input type="checkbox" checked={on} onChange={() => toggle(t.nome)} />
                  <span style={{ width: 9, height: 9, borderRadius: 2, background: t.cor, flex: '0 0 auto' }} />
                  <span style={{ flex: 1, color: '#333', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.nome}</span>
                  <span style={{ color: t.valor === 0 ? '#dc2626' : '#888', fontSize: '.72rem', whiteSpace: 'nowrap' }}>{t.valor === 0 ? 'zerado' : fmtRS0(t.valor)}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

const btnMini: React.CSSProperties = { flex: 1, border: '1px solid #ddd', borderRadius: 6, padding: '5px 6px', fontSize: '.72rem', fontWeight: 700, cursor: 'pointer', background: '#fafafa', color: '#555' };
