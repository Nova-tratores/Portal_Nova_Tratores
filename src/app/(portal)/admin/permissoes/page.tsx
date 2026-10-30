'use client'
// Permissões v2 — consulta (Fase 4, 1ª parte). Explica por que cada pessoa tem ou não
// cada tela. Não edita nada: quem concede acesso ainda é a tela Administração.
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import SemPermissao from '@/components/SemPermissao'
import { authHeaders } from '@/lib/auth/client'
import { agruparPorCategoria, explicarOrigem, profundidade, type TelaMatriz } from '@/lib/permissoes/explicar'

interface Usuario { id: string; nome: string; ativo: boolean; categoria: string; admin: boolean; dev: boolean; conjuntos: string[]; extras: number; bloqueios: number }
interface Conjunto { id: string; nome: string; tipo: string; descricao: string | null; ativo: boolean; telas: { tela: string; nivel: string }[]; membros: number }
interface Override { tela_id: string; nivel: string; tipo: string; expira_em: string | null; motivo: string }
type Aba = 'usuario' | 'conjuntos' | 'revisao'

const CAIXA = { border: '1px solid var(--portal-border)', borderRadius: 8, background: 'var(--portal-bg-secondary)' }
const CAMPO = { padding: '8px 10px', borderRadius: 8, border: '1px solid var(--portal-border)', background: 'var(--portal-bg)', color: 'var(--portal-text)', fontSize: 14 }

async function ler<T>(url: string): Promise<T> {
  const r = await fetch(url, { headers: await authHeaders(), cache: 'no-store' })
  const j = await r.json()
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
  return j
}

export default function PermissoesV2Page() {
  const { userProfile } = useAuth()
  const { isAdmin, loading } = usePermissoes(userProfile?.id)
  const [aba, setAba] = useState<Aba>('usuario')
  const [dados, setDados] = useState<{ usuarios: Usuario[]; conjuntos: Conjunto[] } | null>(null)
  const [erro, setErro] = useState('')
  const [userId, setUserId] = useState('')
  const [matriz, setMatriz] = useState<{ telas: TelaMatriz[]; overrides: Override[] } | null>(null)
  const [busca, setBusca] = useState('')
  const [soComAcesso, setSoComAcesso] = useState(true)
  const [minimoExtras, setMinimoExtras] = useState(10)

  useEffect(() => {
    if (!isAdmin) return
    ler<{ usuarios: Usuario[]; conjuntos: Conjunto[] }>('/api/admin/permissoes-v2').then(setDados).catch((e) => setErro(e.message))
  }, [isAdmin])

  const abrirUsuario = useCallback((id: string) => {
    setUserId(id); setMatriz(null); setAba('usuario')
    if (id) ler<{ telas: TelaMatriz[]; overrides: Override[] }>(`/api/admin/permissoes-v2?user=${id}`).then(setMatriz).catch((e) => setErro(e.message))
  }, [])

  const grupos = useMemo(() => {
    if (!matriz) return []
    const q = busca.trim().toLowerCase()
    return agruparPorCategoria(matriz.telas.filter((t) =>
      (!soComAcesso || t.nivel) && (!q || t.id.toLowerCase().includes(q) || t.nome.toLowerCase().includes(q))))
  }, [matriz, busca, soComAcesso])

  if (!loading && userProfile && !isAdmin) return <SemPermissao />

  const pessoa = dados?.usuarios.find((u) => u.id === userId)
  const revisao = (dados?.usuarios ?? []).filter((u) => u.extras >= minimoExtras).sort((a, b) => b.extras - a.extras)

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto', color: 'var(--portal-text)', fontFamily: 'Inter' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Permissões: por que cada pessoa tem cada tela</h1>
        <Link href="/admin" style={{ fontSize: 13 }}>← Administração</Link>
      </div>
      <p style={{ fontSize: 13, color: 'var(--portal-text-muted)', margin: '6px 0 16px' }}>
        Só consulta. Para dar ou tirar acesso, continue usando a Administração: a mudança aparece aqui em seguida.
      </p>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {([['usuario', 'Por usuário'], ['conjuntos', 'Conjuntos'], ['revisao', 'Revisão de extras']] as [Aba, string][]).map(([id, txt]) => (
          <button key={id} onClick={() => setAba(id)} style={{ ...CAMPO, cursor: 'pointer', fontWeight: 600, background: aba === id ? 'var(--portal-text)' : 'var(--portal-bg)', color: aba === id ? 'var(--portal-bg)' : 'var(--portal-text)' }}>{txt}</button>
        ))}
      </div>

      {erro && <p style={{ color: '#dc2626', fontSize: 14 }}>{erro}</p>}
      {!dados && !erro && <p style={{ fontSize: 14 }}>Carregando…</p>}

      {dados && aba === 'usuario' && (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <select value={userId} onChange={(e) => abrirUsuario(e.target.value)} style={{ ...CAMPO, minWidth: 260 }}>
              <option value="">Escolha uma pessoa…</option>
              {dados.usuarios.map((u) => <option key={u.id} value={u.id}>{u.nome}{u.ativo ? '' : ' (inativa)'}</option>)}
            </select>
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar tela" style={CAMPO} />
            <label style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={soComAcesso} onChange={(e) => setSoComAcesso(e.target.checked)} /> Só as que a pessoa tem
            </label>
          </div>

          {pessoa && (
            <p style={{ fontSize: 13, margin: '12px 0' }}>
              <b>{pessoa.nome}</b>{pessoa.dev ? ' · Dev' : pessoa.admin ? ' · Admin' : ''}
              {' · '}Departamento: {pessoa.conjuntos.join(', ') || 'nenhum'}
              {' · '}{pessoa.extras} extra(s){pessoa.bloqueios ? ` · ${pessoa.bloqueios} bloqueio(s)` : ''}
            </p>
          )}
          {userId && !matriz && !erro && <p style={{ fontSize: 14 }}>Carregando…</p>}

          {grupos.map((g) => (
            <section key={g.categoria} style={{ ...CAIXA, marginBottom: 12, padding: 12 }}>
              <h2 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 8px' }}>{g.categoria}</h2>
              {g.telas.map((t) => (
                <div key={t.id} style={{ padding: `5px 0 5px ${profundidade(t.id) * 16}px`, borderTop: '1px solid var(--portal-border)', fontSize: 13, opacity: t.nivel ? 1 : 0.55 }}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
                    <span>{t.nome}</span>
                    <code style={{ fontSize: 11, color: 'var(--portal-text-muted)' }}>{t.id}</code>
                    <b style={{ fontSize: 11 }}>{t.nivel ? t.nivel.toUpperCase() : 'SEM ACESSO'}</b>
                    {t.explicita && <span style={{ fontSize: 11, color: 'var(--portal-text-muted)' }}>só marcando</span>}
                    {t.so_dev && <span style={{ fontSize: 11, color: 'var(--portal-text-muted)' }}>só Dev concede</span>}
                  </div>
                  {t.origens.map((o) => <div key={o} style={{ fontSize: 12, color: 'var(--portal-text-muted)' }}>{explicarOrigem(o).texto}</div>)}
                </div>
              ))}
            </section>
          ))}
          {matriz && grupos.length === 0 && <p style={{ fontSize: 14 }}>Nenhuma tela com esse filtro.</p>}
        </>
      )}

      {dados && aba === 'conjuntos' && dados.conjuntos.map((c) => (
        <section key={c.id} style={{ ...CAIXA, marginBottom: 12, padding: 12 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>{c.nome} <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--portal-text-muted)' }}>{c.tipo} · {c.membros} pessoa(s) · {c.telas.length} tela(s)</span></h2>
          {c.descricao && <p style={{ fontSize: 12, color: 'var(--portal-text-muted)', margin: '4px 0' }}>{c.descricao}</p>}
          <p style={{ fontSize: 13, margin: '6px 0 0' }}>{c.telas.map((t) => `${t.tela} (${t.nivel})`).join(' · ') || 'Nenhuma tela.'}</p>
        </section>
      ))}

      {dados && aba === 'revisao' && (
        <>
          <label style={{ fontSize: 13, display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
            Pessoas com pelo menos
            <input type="number" min={0} value={minimoExtras} onChange={(e) => setMinimoExtras(Number(e.target.value) || 0)} style={{ ...CAMPO, width: 80 }} />
            extras
          </label>
          {revisao.map((u) => (
            <button key={u.id} onClick={() => abrirUsuario(u.id)} style={{ ...CAIXA, display: 'flex', justifyContent: 'space-between', gap: 12, width: '100%', padding: '10px 12px', marginBottom: 6, cursor: 'pointer', color: 'var(--portal-text)', fontSize: 14, textAlign: 'left', opacity: u.ativo ? 1 : 0.55 }}>
              <span>{u.nome}{u.ativo ? '' : ' (inativa)'}{u.dev ? ' · Dev' : u.admin ? ' · Admin' : ''}</span>
              <b>{u.extras} extra(s)</b>
            </button>
          ))}
          {revisao.length === 0 && <p style={{ fontSize: 14 }}>Ninguém com tantos extras.</p>}
        </>
      )}
    </div>
  )
}
