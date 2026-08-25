'use client'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import SemPermissao from '@/components/SemPermissao'
import { Search, Download, Loader2, CheckCircle2 } from 'lucide-react'

const fmt = (v: number | null | undefined) =>
  v === null || v === undefined ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

interface Maquina {
  codigo_produto: number
  conta_omie: string
  codigo: string
  descricao: string
  familia_nome: string
  marca: string
  estoque: number
  dias_em_estoque: number
  cmc_portal: number
  origem: 'estoque' | 'demonstracao'
  destinatario: string
  numero_remessa: string
  valor_remessa: number | null
  fornecedor: string
  custo_pago: number | null
  custo_acumulado: number | null
  custo_fabrica: number | null
  contatado: boolean
  observacao: string
  atualizado_em: string | null
  atualizado_por: string | null
}

const CONTAS = [
  { v: 'todas', label: 'Todas' },
  { v: 'nova', label: 'Nova' },
  { v: 'castro', label: 'Castro' },
]

export default function ConferenciaCustosPage() {
  const { userProfile } = useAuth()
  const { isAdmin, loading: permLoading } = usePermissoes(userProfile?.id)

  const [conta, setConta] = useState('todas')
  const [maquinas, setMaquinas] = useState<Maquina[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [soPendentes, setSoPendentes] = useState(false)
  const [origemF, setOrigemF] = useState<'todas' | 'estoque' | 'demonstracao'>('todas')
  const [salvandoKey, setSalvandoKey] = useState<string | null>(null)
  const [salvoKey, setSalvoKey] = useState<string | null>(null)

  const keyOf = (m: Maquina) => `${m.codigo_produto}|${m.conta_omie}`

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/conferencia-custos?conta=${conta}`)
      const j = await r.json()
      setMaquinas(j.maquinas || [])
    } finally {
      setLoading(false)
    }
  }, [conta])

  useEffect(() => { carregar() }, [carregar])

  // Atualiza um campo localmente (sem salvar ainda).
  const editar = (key: string, campo: keyof Maquina, valor: any) => {
    setMaquinas(prev => prev.map(m => (keyOf(m) === key ? { ...m, [campo]: valor } : m)))
  }

  // Salva uma linha no banco (chamado no blur / toggle).
  const salvar = async (m: Maquina) => {
    const key = keyOf(m)
    setSalvandoKey(key)
    setSalvoKey(null)
    try {
      await fetch('/api/conferencia-custos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codigo_produto: m.codigo_produto,
          conta_omie: m.conta_omie,
          codigo: m.codigo,
          descricao: m.descricao,
          cmc_portal: m.cmc_portal,
          fornecedor: m.fornecedor,
          custo_pago: m.custo_pago,
          custo_acumulado: m.custo_acumulado,
          custo_fabrica: m.custo_fabrica,
          contatado: m.contatado,
          observacao: m.observacao,
          atualizado_por: userProfile?.nome || null,
        }),
      })
      setSalvoKey(key)
      setTimeout(() => setSalvoKey(k => (k === key ? null : k)), 1500)
    } finally {
      setSalvandoKey(s => (s === key ? null : s))
    }
  }

  const filtradas = useMemo(() => {
    const t = busca.trim().toLowerCase()
    return maquinas.filter(m => {
      if (soPendentes && m.contatado) return false
      if (origemF !== 'todas' && m.origem !== origemF) return false
      if (!t) return true
      return (
        m.codigo.toLowerCase().includes(t) ||
        m.descricao.toLowerCase().includes(t) ||
        m.familia_nome.toLowerCase().includes(t) ||
        (m.fornecedor || '').toLowerCase().includes(t) ||
        (m.destinatario || '').toLowerCase().includes(t)
      )
    })
  }, [maquinas, busca, soPendentes, origemF])

  const totais = useMemo(() => {
    const custoPortal = filtradas.reduce((s, m) => s + (m.cmc_portal || 0) * (m.estoque || 1), 0)
    const custoPago = filtradas.reduce((s, m) => s + (m.custo_pago || 0), 0)
    const contatados = filtradas.filter(m => m.contatado).length
    const emDemo = filtradas.filter(m => m.origem === 'demonstracao').length
    return { custoPortal, custoPago, contatados, emDemo, total: filtradas.length }
  }, [filtradas])

  const exportarCSV = () => {
    const head = [
      'Código', 'Descrição', 'Família', 'Marca', 'Conta', 'Origem', 'Em demonstração p/', 'Nº remessa',
      'Estoque', 'Dias em estoque', 'Custo portal (CMC)', 'Fornecedor', 'Custo pago', 'Custo acumulado',
      'Custo fábrica', 'Contatado', 'Observação',
    ]
    const linhas = filtradas.map(m => [
      m.codigo, m.descricao, m.familia_nome, m.marca, m.conta_omie,
      m.origem === 'demonstracao' ? 'Demonstração' : 'Estoque', m.destinatario, m.numero_remessa,
      m.estoque, m.dias_em_estoque, m.cmc_portal, m.fornecedor, m.custo_pago ?? '', m.custo_acumulado ?? '',
      m.custo_fabrica ?? '', m.contatado ? 'Sim' : 'Não', (m.observacao || '').replace(/\n/g, ' '),
    ])
    const csv = [head, ...linhas]
      .map(l => l.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';'))
      .join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `conferencia-custos-maquinas-${conta}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (permLoading) return null
  if (!isAdmin) return <SemPermissao />

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1500, margin: '0 auto' }}>
      <div style={{ marginBottom: 4 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Conferência de custo das máquinas</h1>
        <p style={{ fontSize: 13, color: 'var(--portal-text-secondary,#737373)', margin: '4px 0 0' }}>
          Máquinas no pátio e em demonstração/consignação, com o custo atual do portal. Ligue para
          cada fornecedor e registre o custo pago, acumulado e o custo atual na fábrica — salva automaticamente.
        </p>
      </div>

      {/* Barra de filtros */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', margin: '18px 0 12px' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {CONTAS.map(c => (
            <button key={c.v} onClick={() => setConta(c.v)} style={{
              padding: '7px 14px', fontSize: 13, fontWeight: conta === c.v ? 700 : 500, cursor: 'pointer',
              border: '1px solid var(--portal-border,#e5e5e5)', borderRadius: 8,
              background: conta === c.v ? '#dc2626' : 'transparent',
              color: conta === c.v ? '#fff' : 'var(--portal-text,#171717)',
            }}>{c.label}</button>
          ))}
        </div>
        <div style={{ position: 'relative', flex: 1, minWidth: 220, maxWidth: 360 }}>
          <Search size={15} style={{ position: 'absolute', left: 10, top: 9, color: '#999' }} />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar código, descrição, família, fornecedor…"
            style={{ width: '100%', padding: '8px 10px 8px 32px', fontSize: 13, borderRadius: 8, border: '1px solid var(--portal-border,#e5e5e5)' }} />
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {([['todas', 'Todas'], ['estoque', 'No pátio'], ['demonstracao', 'Demonstração']] as const).map(([v, label]) => (
            <button key={v} onClick={() => setOrigemF(v)} style={{
              padding: '7px 12px', fontSize: 12.5, fontWeight: origemF === v ? 700 : 500, cursor: 'pointer',
              border: '1px solid var(--portal-border,#e5e5e5)', borderRadius: 8,
              background: origemF === v ? '#111827' : 'transparent',
              color: origemF === v ? '#fff' : 'var(--portal-text,#171717)',
            }}>{label}</button>
          ))}
        </div>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, cursor: 'pointer' }}>
          <input type="checkbox" checked={soPendentes} onChange={e => setSoPendentes(e.target.checked)} />
          Só não contatados
        </label>
        <button onClick={exportarCSV} style={{
          display: 'flex', gap: 6, alignItems: 'center', padding: '8px 14px', fontSize: 13, fontWeight: 600,
          border: '1px solid var(--portal-border,#e5e5e5)', borderRadius: 8, background: 'transparent', cursor: 'pointer',
        }}><Download size={15} /> Exportar CSV</button>
      </div>

      {/* Resumo */}
      <div style={{ display: 'flex', gap: 24, fontSize: 13, margin: '0 0 12px', color: 'var(--portal-text-secondary,#737373)' }}>
        <span><b style={{ color: 'var(--portal-text,#171717)' }}>{totais.total}</b> máquinas</span>
        <span>Custo portal (total): <b style={{ color: 'var(--portal-text,#171717)' }}>{fmt(totais.custoPortal)}</b></span>
        <span>Custo pago informado: <b style={{ color: 'var(--portal-text,#171717)' }}>{fmt(totais.custoPago)}</b></span>
        <span>Contatados: <b style={{ color: 'var(--portal-text,#171717)' }}>{totais.contatados}/{totais.total}</b></span>
        {totais.emDemo > 0 && <span>Em demonstração: <b style={{ color: '#dc2626' }}>{totais.emDemo}</b></span>}
      </div>

      {loading ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: 40, color: '#999' }}>
          <Loader2 size={18} className="animate-spin" /> Carregando estoque de máquinas…
        </div>
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid var(--portal-border,#e5e5e5)', borderRadius: 10 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr style={{ background: 'var(--portal-bg,#fafafa)', textAlign: 'left' }}>
                <Th>Código</Th>
                <Th>Descrição</Th>
                <Th>Família</Th>
                <Th>Origem</Th>
                <Th right>Dias estq.</Th>
                <Th right>Custo portal</Th>
                <Th>Fornecedor</Th>
                <Th right>Custo pago</Th>
                <Th right>Custo acum.</Th>
                <Th right>Custo fábrica</Th>
                <Th center>Contatado</Th>
                <Th>Obs.</Th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map(m => {
                const key = keyOf(m)
                return (
                  <tr key={key} style={{ borderTop: '1px solid var(--portal-border,#f0f0f0)', background: m.contatado ? 'rgba(34,197,94,0.05)' : 'transparent' }}>
                    <Td mono>{m.codigo}</Td>
                    <Td>
                      <span style={{ display: 'block', maxWidth: 260, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={m.descricao}>{m.descricao}</span>
                      {m.estoque > 1 && <span style={{ fontSize: 11, color: '#dc2626' }}>{m.estoque} un.</span>}
                    </Td>
                    <Td>{m.familia_nome}</Td>
                    <Td>
                      {m.origem === 'demonstracao' ? (
                        <span title={`Em demonstração${m.destinatario ? ' para ' + m.destinatario : ''}${m.numero_remessa ? ' · remessa ' + m.numero_remessa : ''}`}>
                          <span style={{ display: 'inline-block', padding: '1px 6px', borderRadius: 5, background: 'rgba(220,38,38,0.1)', color: '#dc2626', fontWeight: 700, fontSize: 11 }}>Demonstração</span>
                          {m.destinatario && <span style={{ display: 'block', fontSize: 11, color: '#999', maxWidth: 150, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.destinatario}</span>}
                        </span>
                      ) : (
                        <span style={{ display: 'inline-block', padding: '1px 6px', borderRadius: 5, background: 'rgba(107,114,128,0.12)', color: '#6b7280', fontWeight: 600, fontSize: 11 }}>No pátio</span>
                      )}
                    </Td>
                    <Td right>{m.dias_em_estoque}</Td>
                    <Td right mono>{fmt(m.cmc_portal)}</Td>
                    <Td>
                      <input value={m.fornecedor} onChange={e => editar(key, 'fornecedor', e.target.value)} onBlur={() => salvar(m)}
                        style={inpText} placeholder="—" />
                    </Td>
                    <Td right><NumInput value={m.custo_pago} onChange={v => editar(key, 'custo_pago', v)} onBlur={() => salvar(m)} /></Td>
                    <Td right><NumInput value={m.custo_acumulado} onChange={v => editar(key, 'custo_acumulado', v)} onBlur={() => salvar(m)} /></Td>
                    <Td right><NumInput value={m.custo_fabrica} onChange={v => editar(key, 'custo_fabrica', v)} onBlur={() => salvar(m)} /></Td>
                    <Td center>
                      <input type="checkbox" checked={m.contatado}
                        onChange={e => { editar(key, 'contatado', e.target.checked); setTimeout(() => salvar({ ...m, contatado: e.target.checked }), 0) }} />
                    </Td>
                    <Td>
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <input value={m.observacao} onChange={e => editar(key, 'observacao', e.target.value)} onBlur={() => salvar(m)}
                          style={{ ...inpText, width: 140 }} placeholder="—" />
                        {salvandoKey === key && <Loader2 size={13} className="animate-spin" style={{ color: '#999' }} />}
                        {salvoKey === key && <CheckCircle2 size={14} style={{ color: '#22c55e' }} />}
                      </div>
                    </Td>
                  </tr>
                )
              })}
              {filtradas.length === 0 && (
                <tr><td colSpan={12} style={{ padding: 30, textAlign: 'center', color: '#999' }}>Nenhuma máquina encontrada.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const inpText: React.CSSProperties = {
  width: 110, padding: '5px 7px', fontSize: 12.5, borderRadius: 6,
  border: '1px solid var(--portal-border,#e5e5e5)', background: 'transparent',
}

function NumInput({ value, onChange, onBlur }: { value: number | null; onChange: (v: any) => void; onBlur: () => void }) {
  return (
    <input type="number" step="0.01" value={value ?? ''} onChange={e => onChange(e.target.value === '' ? null : e.target.value)} onBlur={onBlur}
      style={{ ...inpText, width: 100, textAlign: 'right' }} placeholder="—" />
  )
}

function Th({ children, right, center }: { children: React.ReactNode; right?: boolean; center?: boolean }) {
  return <th style={{ padding: '10px 10px', fontWeight: 700, fontSize: 11.5, whiteSpace: 'nowrap', textAlign: right ? 'right' : center ? 'center' : 'left', color: 'var(--portal-text-secondary,#737373)' }}>{children}</th>
}
function Td({ children, right, center, mono }: { children: React.ReactNode; right?: boolean; center?: boolean; mono?: boolean }) {
  return <td style={{ padding: '6px 10px', textAlign: right ? 'right' : center ? 'center' : 'left', fontFamily: mono ? 'ui-monospace,monospace' : undefined, whiteSpace: right || center ? 'nowrap' : undefined }}>{children}</td>
}
