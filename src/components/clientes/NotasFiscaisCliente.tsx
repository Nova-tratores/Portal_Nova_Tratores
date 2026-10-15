'use client'
// Aba "Notas fiscais" da Pasta Clientes (José, 15/10/2026): TODAS as notas do cliente —
// saída (peças, serviço, máquina) e entrada — e as das máquinas dele (pelo chassi).
// GET /api/clientes/notas; PDF/XML por /api/clientes/notas/[id]/arquivo.
import { useEffect, useMemo, useState } from 'react'
import { authHeaders } from '@/lib/auth/client'
import type { DocumentoVisualizavel } from '@/components/comum/VisualizadorDocumento'

interface Nota {
  id: number; conta: string; tipo: 'entrada' | 'saida_produto' | 'saida_servico'; numero: string | null; serie: string | null
  data: string | null; parte: string | null; valor: number | null; cancelada: boolean; pdf: boolean; xml: boolean
  pedido: string | null; os: string | null; maquina: string | null; via: 'cliente' | 'maquina'; chassi: string | null; bloqueada: boolean
}

const TIPOS = {
  saida_produto: { rot: 'NF-e', sub: 'saída · peças/máquinas', cor: '#e8730c', bg: '#fff7ed' },
  saida_servico: { rot: 'NFS-e', sub: 'saída · serviço', cor: '#0369a1', bg: '#e0f2fe' },
  entrada: { rot: 'NF-e', sub: 'entrada · compra', cor: '#047857', bg: '#ecfdf5' },
} as const
type Filtro = 'todas' | 'saida' | 'entrada' | 'maquinas'

const brl = (v: number | null) => v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const data = (d: string | null) => d ? d.slice(0, 10).split('-').reverse().join('/') : '—'
const sem0 = (s: string | null) => String(s || '').replace(/^0+(?=\d)/, '')

export default function NotasFiscaisCliente({ doc, cod, onAbrir, onTotal }: {
  doc: string; cod?: number | null; onAbrir: (d: DocumentoVisualizavel) => void; onTotal?: (n: number) => void
}) {
  const [notas, setNotas] = useState<Nota[] | null>(null)
  const [erro, setErro] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('todas')
  const [baixando, setBaixando] = useState<number | null>(null)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const q = new URLSearchParams(); if (doc) q.set('doc', doc); if (cod) q.set('cod', String(cod))
        const r = await fetch(`/api/clientes/notas?${q}`, { headers: await authHeaders() })
        const j = await r.json().catch(() => ({}))
        if (!vivo) return
        if (!r.ok) { setErro(j.error || `Erro ${r.status}`); setNotas([]); onTotal?.(0); return }
        setNotas(j.notas || []); onTotal?.((j.notas || []).length)
      } catch { if (vivo) { setErro('Sem conexão.'); setNotas([]) } }
    })()
    return () => { vivo = false }
  }, [doc, cod, onTotal])

  const lista = useMemo(() => (notas || []).filter((n) =>
    filtro === 'todas' ? true : filtro === 'entrada' ? n.tipo === 'entrada' : filtro === 'saida' ? n.tipo !== 'entrada' : n.via === 'maquina' || !!n.maquina), [notas, filtro])
  const conta = (f: Filtro) => (notas || []).filter((n) => f === 'todas' ? true : f === 'entrada' ? n.tipo === 'entrada' : f === 'saida' ? n.tipo !== 'entrada' : n.via === 'maquina' || !!n.maquina).length

  const baixarXml = async (n: Nota) => {
    setBaixando(n.id)
    try {
      const r = await fetch(`/api/clientes/notas/${n.id}/arquivo?tipo=xml`, { headers: await authHeaders() })
      if (!r.ok) { const j = await r.json().catch(() => ({})); alert(j.erro || 'Não consegui baixar o XML.'); return }
      const url = URL.createObjectURL(await r.blob())
      const a = document.createElement('a'); a.href = url; a.download = `NF-${sem0(n.numero)}.xml`; a.click(); URL.revokeObjectURL(url)
    } finally { setBaixando(null) }
  }

  if (notas === null) return <div style={{ padding: 30, textAlign: 'center', color: 'var(--portal-text-muted)', fontSize: 13 }}><i className="fas fa-spinner fa-spin" /> Buscando as notas fiscais…</div>

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        {([['todas', 'Todas'], ['saida', 'Saída'], ['entrada', 'Entrada'], ['maquinas', 'Máquinas']] as const).map(([id, rot]) => {
          const on = filtro === id
          return (
            <button key={id} type="button" onClick={() => setFiltro(id)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 999, border: `1px solid ${on ? '#0891B2' : '#E5E7EB'}`, background: on ? '#ecfeff' : 'var(--portal-bg-card)', color: on ? '#0e7490' : 'var(--portal-text-secondary)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
              {rot} <span style={{ opacity: .7 }}>{conta(id)}</span>
            </button>
          )
        })}
      </div>
      {erro && <div style={{ marginBottom: 10, padding: '9px 12px', borderRadius: 9, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: 12.5 }}>{erro}</div>}
      {!lista.length ? (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--portal-text-muted)', fontSize: 13, border: '1px dashed var(--portal-border)', borderRadius: 12 }}>Nenhuma nota fiscal{filtro !== 'todas' ? ' com esse filtro' : ''}.</div>
      ) : (
        <div style={{ border: '1px solid var(--portal-border, #E5E7EB)', borderRadius: 12, overflow: 'hidden', background: 'var(--portal-bg-card)' }}>
          {lista.map((n, i) => {
            const t = TIPOS[n.tipo]
            const titulo = `${t.rot} ${sem0(n.numero)}`
            return (
              <div key={n.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderTop: i ? '1px solid var(--portal-border, #F1F5F9)' : 'none', opacity: n.cancelada ? .55 : 1 }}>
                <span style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, background: t.bg, color: t.cor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>
                  <i className={`fas ${n.tipo === 'entrada' ? 'fa-arrow-down' : n.tipo === 'saida_servico' ? 'fa-screwdriver-wrench' : 'fa-file-invoice'}`} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <b style={{ fontSize: 14, color: 'var(--portal-text)', fontVariantNumeric: 'tabular-nums' }}>{titulo}</b>
                    <span style={{ fontSize: 11, fontWeight: 700, color: t.cor }}>{t.sub}</span>
                    <span style={{ fontSize: 10.5, fontWeight: 700, padding: '1px 7px', borderRadius: 6, background: 'var(--portal-bg-secondary)', color: 'var(--portal-text-muted)' }}>{n.conta === 'CASTRO' ? 'Castro' : 'Nova'}</span>
                    {n.cancelada && <span style={{ fontSize: 10.5, fontWeight: 800, color: '#b91c1c' }}>CANCELADA</span>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--portal-text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {data(n.data)}
                    {n.tipo === 'entrada' && n.parte ? ` · ${n.parte}` : ''}
                    {n.os ? ` · OS ${n.os}` : ''}{n.pedido ? ` · pedido ${n.pedido}` : ''}
                    {n.via === 'maquina' ? ` · máquina ${n.chassi}` : n.maquina ? ` · ${n.maquina.split('|')[0].trim()}` : ''}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--portal-text)', fontVariantNumeric: 'tabular-nums' }}>{n.bloqueada ? <i className="fas fa-lock" title="Valor de compra: precisa da permissão de Recebimentos" style={{ color: '#94a3b8' }} /> : brl(n.valor)}</div>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 4 }}>
                    {!n.bloqueada && (
                      <button type="button" onClick={() => onAbrir({ titulo: `${titulo} · ${data(n.data)}`, nome: `NF-${sem0(n.numero)}`, url: `/api/clientes/notas/${n.id}/arquivo?tipo=pdf` })}
                        title="Ver o PDF da nota" style={{ border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', borderRadius: 7, padding: '3px 9px', fontSize: 11.5, fontWeight: 800, cursor: 'pointer' }}>
                        <i className="fas fa-file-pdf" /> PDF
                      </button>
                    )}
                    {!n.bloqueada && (
                      <button type="button" onClick={() => baixarXml(n)} disabled={baixando === n.id} title="Baixar o XML da nota"
                        style={{ border: '1px solid #e2e8f0', background: 'var(--portal-bg-secondary)', color: 'var(--portal-text-secondary)', borderRadius: 7, padding: '3px 9px', fontSize: 11.5, fontWeight: 800, cursor: 'pointer' }}>
                        <i className={`fas ${baixando === n.id ? 'fa-spinner fa-spin' : 'fa-code'}`} /> XML
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
