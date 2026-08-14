'use client'
// REVISÕES MAHINDRA (50h e 900h) — as duas revisões que a MAHINDRA PAGA à
// concessionária. Esta tela lista as realizadas (tratores."50h Data"/"900h
// Data" preenchidas) pro controle de cobrança, com filtros e exportação em
// Excel (xlsx) pronto pra enviar à fábrica.
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, FileSpreadsheet, Loader2, Search, Wrench } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import { authHeaders } from '@/lib/auth/client'
import SemPermissao from '@/components/SemPermissao'
import { extrairLinhas, filtrarLinhas, type TratorRow } from '@/lib/revisoes/mahindra'

export default function RevisoesMahindraPage() {
  const { userProfile } = useAuth()
  const { temAcesso, loading: pLoading } = usePermissoes(userProfile?.id)

  const [tratores, setTratores] = useState<TratorRow[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [tipo, setTipo] = useState<'todas' | '50h' | '900h'>('todas')
  const [de, setDe] = useState('') // yyyy-mm-dd (input date)
  const [ate, setAte] = useState('')
  const [q, setQ] = useState('')
  const [exportando, setExportando] = useState(false)

  // Só busca depois da permissão confirmada (não desce a tabela pra quem não
  // tem acesso); paginado em 1000 (teto do PostgREST — select cru trunca).
  const autorizado = !pLoading && !!userProfile && temAcesso('revisoes')
  useEffect(() => {
    if (!autorizado) return
    ;(async () => {
      try {
        const todos: TratorRow[] = []
        for (let de = 0; ; de += 1000) {
          const { data, error } = await supabase.from('tratores').select('*').range(de, de + 999)
          if (error) throw new Error(error.message)
          todos.push(...((data || []) as TratorRow[]))
          if (!data || data.length < 1000) break
        }
        setTratores(todos)
      } catch (e) {
        setErro(String(e instanceof Error ? e.message : e))
      } finally {
        setCarregando(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autorizado])

  const linhas = useMemo(() => extrairLinhas(tratores), [tratores])

  const filtradas = useMemo(
    () => filtrarLinhas(linhas, { tipo, de, ate, q }),
    [linhas, tipo, de, ate, q],
  )

  const tot50 = filtradas.filter(l => l.revisao === '50h').length
  const tot900 = filtradas.filter(l => l.revisao === '900h').length

  if (!pLoading && userProfile && !temAcesso('revisoes')) return <SemPermissao />

  const exportar = async () => {
    setExportando(true)
    setErro('')
    try {
      const params = new URLSearchParams()
      if (tipo !== 'todas') params.set('tipo', tipo)
      if (de) params.set('de', de)
      if (ate) params.set('ate', ate)
      if (q.trim()) params.set('q', q.trim())
      const r = await fetch(`/api/revisoes/mahindra/excel?${params}`, { headers: await authHeaders() })
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        throw new Error(j.error || 'Falha ao gerar o Excel.')
      }
      const blob = await r.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `revisoes-mahindra-${new Date().toISOString().slice(0, 10)}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setErro(String(e instanceof Error ? e.message : e))
    } finally {
      setExportando(false)
    }
  }

  const inp: React.CSSProperties = { padding: '8px 12px', borderRadius: 8, border: '1px solid var(--portal-border)', fontSize: 13, background: 'var(--portal-bg-card)', color: 'var(--portal-text)' }

  return (
    <div style={{ padding: '18px 22px', maxWidth: 1250, margin: '0 auto', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <Link href="/revisoes" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: 'var(--portal-text-muted)', textDecoration: 'none' }}>
          <ArrowLeft size={15} /> Revisões
        </Link>
        <h1 style={{ fontSize: 19, fontWeight: 800, color: 'var(--portal-text)', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Wrench size={18} color="#C41E2A" /> Revisões Mahindra — 50h e 900h
        </h1>
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--portal-text-secondary)', margin: '0 0 14px', lineHeight: 1.6 }}>
        As revisões de <strong>50h</strong> e <strong>900h</strong> são pagas pela Mahindra — esta lista mostra as realizadas
        (data registrada no controle de revisões) pra conferência e cobrança. Filtre o período e exporte o
        <strong> Excel</strong> pra enviar à fábrica.
      </p>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['todas', '50h', '900h'] as const).map(t => (
            <button key={t} onClick={() => setTipo(t)} style={{
              padding: '7px 14px', borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
              border: tipo === t ? '2px solid #C41E2A' : '1px solid var(--portal-border)',
              background: tipo === t ? '#fef2f2' : 'var(--portal-bg-card)',
              color: tipo === t ? '#C41E2A' : 'var(--portal-text-secondary)',
            }}>{t === 'todas' ? 'Todas' : `Revisão ${t}`}</button>
          ))}
        </div>
        <label style={{ fontSize: 12, color: 'var(--portal-text-muted)' }}>De <input type="date" value={de} onChange={e => setDe(e.target.value)} style={inp} /></label>
        <label style={{ fontSize: 12, color: 'var(--portal-text-muted)' }}>Até <input type="date" value={ate} onChange={e => setAte(e.target.value)} style={inp} /></label>
        <div style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--portal-text-muted)' }} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Chassi, cliente, modelo…" style={{ ...inp, paddingLeft: 30, minWidth: 220 }} />
        </div>
        <span style={{ fontSize: 12.5, color: 'var(--portal-text-secondary)', marginLeft: 'auto' }}>
          <strong>{filtradas.length}</strong> revisão(ões) · {tot50}× 50h · {tot900}× 900h
        </span>
        <button onClick={exportar} disabled={exportando || filtradas.length === 0} style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 8, border: 'none',
          background: exportando || filtradas.length === 0 ? '#9ca3af' : '#166534', color: '#fff', fontSize: 13, fontWeight: 700,
          cursor: exportando || filtradas.length === 0 ? 'default' : 'pointer',
        }}>
          <FileSpreadsheet size={15} /> {exportando ? 'Gerando…' : 'Exportar Excel'}
        </button>
      </div>

      {erro && <div style={{ fontSize: 12.5, color: '#dc2626', fontWeight: 600, marginBottom: 10 }}>{erro}</div>}

      {/* Tabela */}
      <div style={{ border: '1px solid var(--portal-border)', borderRadius: 10, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead>
            <tr style={{ background: 'var(--portal-bg-secondary)', textAlign: 'left' }}>
              <th style={{ padding: '8px 10px', width: 80 }}>Revisão</th>
              <th style={{ padding: '8px 10px', width: 90 }}>Data</th>
              <th style={{ padding: '8px 10px', width: 90 }}>Horímetro</th>
              <th style={{ padding: '8px 10px', width: 180 }}>Chassi</th>
              <th style={{ padding: '8px 10px', width: 110 }}>Modelo</th>
              <th style={{ padding: '8px 10px' }}>Cliente</th>
              <th style={{ padding: '8px 10px', width: 130 }}>Cidade</th>
              <th style={{ padding: '8px 10px', width: 95 }}>Entrega</th>
              <th style={{ padding: '8px 10px', width: 70 }}>Laudo</th>
            </tr>
          </thead>
          <tbody>
            {carregando && (
              <tr><td colSpan={9} style={{ padding: 18, textAlign: 'center', color: 'var(--portal-text-muted)' }}>
                <Loader2 size={15} className="animate-spin" style={{ verticalAlign: -3, marginRight: 6 }} /> Carregando…
              </td></tr>
            )}
            {!carregando && filtradas.length === 0 && (
              <tr><td colSpan={9} style={{ padding: 18, textAlign: 'center', color: 'var(--portal-text-muted)' }}>Nenhuma revisão no filtro.</td></tr>
            )}
            {!carregando && filtradas.map((l, i) => (
              <tr key={`${l.tratorId}-${l.revisao}-${i}`} style={{ borderTop: '1px solid var(--portal-border)' }}>
                <td style={{ padding: '7px 10px' }}>
                  <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 10px', borderRadius: 999, color: '#fff', background: l.revisao === '50h' ? '#0d9488' : '#7c3aed' }}>
                    {l.revisao}
                  </span>
                </td>
                <td style={{ padding: '7px 10px', whiteSpace: 'nowrap', fontWeight: 700, color: 'var(--portal-text)' }}>{l.data}</td>
                <td style={{ padding: '7px 10px', color: 'var(--portal-text-secondary)' }}>{l.horimetro || '—'}</td>
                <td style={{ padding: '7px 10px', fontFamily: 'monospace', fontSize: 11.5, color: 'var(--portal-text)' }}>{l.chassis || '—'}</td>
                <td style={{ padding: '7px 10px', color: 'var(--portal-text)' }}>{l.modelo || '—'}</td>
                <td style={{ padding: '7px 10px', color: 'var(--portal-text)' }}>{l.cliente || '—'}</td>
                <td style={{ padding: '7px 10px', color: 'var(--portal-text-secondary)' }}>{l.cidade || '—'}</td>
                <td style={{ padding: '7px 10px', color: 'var(--portal-text-secondary)', whiteSpace: 'nowrap' }}>{l.entrega || '—'}</td>
                <td style={{ padding: '7px 10px' }}>
                  {l.pdf
                    ? <a href={l.pdf} target="_blank" rel="noreferrer" style={{ color: '#0ea5e9', fontWeight: 700, fontSize: 12 }}>PDF</a>
                    : <span style={{ color: 'var(--portal-text-muted)' }}>—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
