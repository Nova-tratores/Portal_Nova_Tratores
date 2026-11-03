// Página PÚBLICA que o QR do recibo abre: confere se o recibo existe no portal e se não foi cancelado.
// Fora de (portal): sem login. Mostra só o necessário para conferir com o papel (CPF/CNPJ parcial).
import type { Metadata } from 'next'
import { buscarPorToken, dadosEmpresa } from '@/lib/recibos/server'
import { brl, numeroRecibo, rotuloDoc } from '@/lib/recibos/tipos'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Conferir recibo — Nova Tratores', robots: { index: false, follow: false } }

const docParcial = (d?: string | null) => {
  const s = String(d || '').replace(/\D/g, '')
  if (!s) return ''
  return `${rotuloDoc(s)} ${'•'.repeat(Math.max(0, s.length - 5))}${s.slice(-5, -2)}-${s.slice(-2)}`
}
const dataBR = (iso: string) => iso.split('-').reverse().join('/')

export default async function ConferirRecibo({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const r = await buscarPorToken(token)
  const emp = r ? await dadosEmpresa(r.empresa) : null
  const ok = !!r && !r.cancelado_em
  const cor = !r ? '#64748b' : ok ? '#15803d' : '#dc2626'
  const linha = (rot: string, val: string) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '10px 0', borderTop: '1px solid #e2e8f0' }}>
      <span style={{ color: '#64748b', fontSize: 13 }}>{rot}</span>
      <span style={{ color: '#0f172a', fontSize: 14, textAlign: 'right' }}>{val}</span>
    </div>
  )
  return (
    <main style={{ minHeight: '100vh', background: '#f1f5f9', display: 'grid', placeItems: 'center', padding: 16, fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ width: '100%', maxWidth: 440, background: '#fefefe', border: '1px solid #e2e8f0', borderRadius: 16, padding: '22px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <div style={{ width: 40, height: 40, borderRadius: 11, display: 'grid', placeItems: 'center', fontSize: 20, color: cor,
            background: `color-mix(in srgb, ${cor} 10%, #fefefe)`, border: `1px solid color-mix(in srgb, ${cor} 22%, transparent)` }}>
            {!r ? '?' : ok ? '✓' : '✕'}
          </div>
          <div>
            <div style={{ fontSize: 17, color: '#0f172a', fontWeight: 500 }}>
              {!r ? 'Recibo não encontrado' : ok ? 'Recibo verdadeiro' : 'Recibo cancelado'}
            </div>
            <div style={{ fontSize: 13, color: '#64748b' }}>
              {!r ? 'Este código não corresponde a nenhum recibo emitido.' : `Emitido pelo portal da ${emp?.razao_social || r.empresa}`}
            </div>
          </div>
        </div>
        {r && (
          <>
            {linha('Número', numeroRecibo(r.numero))}
            {linha('Valor', brl(r.valor))}
            {linha(r.tipo === 'recebemos' ? 'Pago por' : 'Recebido por', r.pessoa_nome)}
            {r.pessoa_doc && linha('Documento', docParcial(r.pessoa_doc))}
            {linha('Data do pagamento', dataBR(r.data_pagto))}
            {linha('Forma', r.forma)}
            {r.cancelado_em && linha('Cancelado em', new Date(r.cancelado_em).toLocaleDateString('pt-BR'))}
            <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 14, lineHeight: 1.5 }}>
              Confira se os dados acima são os mesmos do recibo em papel. Se algo estiver diferente, o recibo foi alterado.
            </p>
          </>
        )}
      </div>
    </main>
  )
}
