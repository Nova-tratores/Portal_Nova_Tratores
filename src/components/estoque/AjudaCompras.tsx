'use client';
// Botão "?" + modal de ajuda das telas do módulo de Sugestão de Compra.
//
// Mesmo desenho do AjudaTela do DRE Financeiro (modal centrado, Esc fecha, seções
// em caixa alta), mas em TS, na cor do módulo e com seções que aceitam tabela e
// nota. O texto vem de lib/estoque/sugestao-compra/ajuda.ts.
//
// Estilos inline como o resto do módulo. Cores neutras (#333/#666/#fff) para o
// modo escuro remapear sozinho.

import { useEffect, useState } from 'react';
import type { AjudaTela, AjudaSecao } from '@/lib/estoque/sugestao-compra/ajuda';

const TEAL = '#0f766e';

export default function AjudaCompras({ ajuda }: { ajuda: AjudaTela }) {
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [aberto]);

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        aria-label={`Ajuda: como funciona a tela ${ajuda.titulo}`}
        title={`Como funciona esta tela? — ${ajuda.titulo}`}
        style={{
          width: 22, height: 22, borderRadius: '50%', cursor: 'pointer',
          border: `1.5px solid ${TEAL}`, background: '#fefefe', color: TEAL,
          fontSize: 13, fontWeight: 700, lineHeight: 1, padding: 0,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}
      >
        ?
      </button>

      {aberto && (
        <div
          onClick={() => setAberto(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(15,23,42,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Ajuda da tela ${ajuda.titulo}`}
            onClick={(e) => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 760, maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 20px 50px rgba(0,0,0,.25)', cursor: 'default' }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '16px 20px 12px', borderBottom: '1px solid #eee', position: 'sticky', top: 0, background: '#fff', borderRadius: '12px 12px 0 0', zIndex: 1 }}>
              <div>
                <div style={{ fontSize: 17, fontWeight: 700, color: '#333' }}>Como funciona: {ajuda.titulo}</div>
                <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>{ajuda.resumo}</div>
              </div>
              <button type="button" onClick={() => setAberto(false)} aria-label="Fechar ajuda" style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 22, lineHeight: 1, color: '#888', padding: '0 2px' }}>×</button>
            </div>

            <div style={{ padding: '6px 20px 20px' }}>
              {ajuda.secoes.map((s) => <Secao key={s.titulo} secao={s} />)}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Secao({ secao }: { secao: AjudaSecao }) {
  const p: React.CSSProperties = { fontSize: 13, color: '#444', lineHeight: 1.6, margin: '0 0 8px' };
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: TEAL, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 6, paddingBottom: 4, borderBottom: `1px solid ${TEAL}33` }}>{secao.titulo}</div>
      {secao.paragrafos?.map((t, i) => <p key={i} style={p}>{t}</p>)}
      {secao.itens && secao.itens.length > 0 && (
        <ul style={{ margin: '0 0 8px', paddingLeft: 18 }}>
          {secao.itens.map((t, i) => <li key={i} style={{ ...p, marginBottom: 5 }}>{t}</li>)}
        </ul>
      )}
      {secao.tabela && (
        <div style={{ overflowX: 'auto', marginBottom: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {secao.tabela.cabecalho.map((h) => (
                  <th key={h} style={{ textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.5px', padding: '6px 8px', borderBottom: '1px solid #eee', background: '#fafafa' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {secao.tabela.linhas.map(([k, v]) => (
                <tr key={k}>
                  <td style={{ padding: '6px 8px', fontSize: 12.5, fontWeight: 700, color: '#333', borderBottom: '1px solid #f3f3f3', whiteSpace: 'nowrap', verticalAlign: 'top' }}>{k}</td>
                  <td style={{ padding: '6px 8px', fontSize: 12.5, color: '#444', lineHeight: 1.55, borderBottom: '1px solid #f3f3f3' }}>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {secao.nota && (
        <div style={{ marginTop: 6, padding: '8px 11px', borderRadius: 8, background: '#fffbeb', border: '1px solid #fde68a', fontSize: 12, color: '#92400e', lineHeight: 1.5 }}>{secao.nota}</div>
      )}
    </div>
  );
}
