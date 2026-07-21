'use client'
// Botao "?" do cabecalho do modulo DRE Financeiro + painel de ajuda da tela atual.
//
// Renderizado em app/(portal)/dre-financeiro/layout.js, ao lado do titulo. O texto
// vem de lib/dre-financeiro/ajuda.js, indexado pelo pathname; se a tela nao tiver
// entrada la (ex.: o link externo /visual-estoque/patio), o botao simplesmente NAO
// aparece.
//
// Estilos inline de proposito: o layout do modulo tambem usa inline (as telas por
// dentro e que usam Tailwind).

import { useEffect, useState } from 'react'
import { ajudaDaTela, NOTA_CONTA } from '@/lib/dre-financeiro/ajuda'

const VERDE = '#10B981'

export default function AjudaTela({ pathname }) {
  const [aberto, setAberto] = useState(false)
  const ajuda = ajudaDaTela(pathname)

  // Esc fecha (mesmo padrao dos modais das telas do modulo).
  useEffect(() => {
    if (!aberto) return
    const onKey = (e) => { if (e.key === 'Escape') setAberto(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [aberto])

  // Trocou de tela com o painel aberto? Fecha, senao mostraria ajuda da tela errada.
  useEffect(() => { setAberto(false) }, [pathname])

  if (!ajuda) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        aria-label={`Ajuda: o que é a tela ${ajuda.titulo}`}
        title={`O que é esta tela? — ${ajuda.titulo}`}
        style={{
          width: '20px', height: '20px', borderRadius: '50%', cursor: 'pointer',
          border: `1.5px solid ${VERDE}`, background: '#fff', color: VERDE,
          fontSize: '12px', fontWeight: 700, lineHeight: 1, padding: 0,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        ?
      </button>

      {aberto && (
        <div
          onClick={() => setAberto(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(15,23,42,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Ajuda da tela ${ajuda.titulo}`}
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff', borderRadius: '12px', width: '100%', maxWidth: '640px',
              maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
              cursor: 'default',
            }}
          >
            {/* Cabecalho do painel */}
            <div style={{
              display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
              gap: '12px', padding: '16px 18px 12px', borderBottom: '1px solid #e2e8f0',
              position: 'sticky', top: 0, background: '#fff', borderRadius: '12px 12px 0 0',
            }}>
              <div>
                <div style={{ fontSize: '17px', fontWeight: 700, color: '#1e293b' }}>
                  {ajuda.icon} {ajuda.titulo}
                </div>
                <div style={{ fontSize: '13px', color: '#475569', marginTop: '4px' }}>
                  {ajuda.resumo}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAberto(false)}
                aria-label="Fechar ajuda"
                style={{
                  border: 'none', background: 'transparent', cursor: 'pointer',
                  fontSize: '22px', lineHeight: 1, color: '#94a3b8', padding: '0 2px',
                }}
              >
                ×
              </button>
            </div>

            <div style={{ padding: '14px 18px 18px' }}>
              <Secao titulo="O que esta tela mostra">
                <p style={{ fontSize: '13px', color: '#334155', lineHeight: 1.6, margin: 0 }}>
                  {ajuda.oQueMostra}
                </p>
              </Secao>

              {ajuda.comoUsar?.length > 0 && (
                <Secao titulo="Como usar">
                  <ul style={{ margin: 0, paddingLeft: '18px' }}>
                    {ajuda.comoUsar.map((linha, i) => (
                      <li key={i} style={{ fontSize: '13px', color: '#334155', lineHeight: 1.6, marginBottom: '5px' }}>
                        {linha}
                      </li>
                    ))}
                  </ul>
                </Secao>
              )}

              {ajuda.termos?.length > 0 && (
                <Secao titulo="Termos desta tela">
                  <dl style={{ margin: 0 }}>
                    {ajuda.termos.map((termo) => (
                      <div key={termo.t} style={{ marginBottom: '6px' }}>
                        <dt style={{ display: 'inline', fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>
                          {termo.t}
                        </dt>
                        <dd style={{ display: 'inline', fontSize: '13px', color: '#475569', margin: 0 }}>
                          {' — '}{termo.d}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </Secao>
              )}

              <div style={{
                marginTop: '14px', padding: '9px 11px', borderRadius: '8px',
                background: '#ecfdf5', border: '1px solid #a7f3d0',
                fontSize: '12px', color: '#065f46',
              }}>
                {NOTA_CONTA}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// Titulo de secao + conteudo (mesmo espacamento nas tres secoes do painel).
function Secao({ titulo, children }) {
  return (
    <div style={{ marginTop: '12px' }}>
      <div style={{
        fontSize: '10px', fontWeight: 700, color: '#94a3b8',
        textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '6px',
      }}>
        {titulo}
      </div>
      {children}
    </div>
  )
}
