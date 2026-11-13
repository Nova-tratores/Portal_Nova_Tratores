'use client'
// Permissões v2 (Fase 4). Por usuário: por que cada pessoa tem ou não cada tela.
// Departamentos e pacotes: criar/editar com prévia de quem ganha e quem perde
// (components/admin/DepartamentosPacotes). Exceções por pessoa ficam na Administração.
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import SemPermissao from '@/components/SemPermissao'
import { authHeaders } from '@/lib/auth/client'
import DepartamentosPacotes from '@/components/admin/DepartamentosPacotes'
import { agruparPorCategoria, explicarOrigem, profundidade, type TelaMatriz } from '@/lib/permissoes/explicar'

interface Usuario { id: string; nome: string; ativo: boolean; avatar?: string | null; funcao?: string | null; categoria: string; admin: boolean; dev: boolean; conjuntos: string[]; extras: number; bloqueios: number }
interface Conjunto { id: string; nome: string; tipo: string; descricao: string | null; ativo: boolean; telas: { tela: string; nivel: string }[]; membros: number; membrosIds?: string[] }
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
  const { isAdmin, isDev, loading } = usePermissoes(userProfile?.id)
  const [aba, setAba] = useState<Aba>('conjuntos')
  const [dados, setDados] = useState<{ usuarios: Usuario[]; conjuntos: Conjunto[] } | null>(null)
  const [erro, setErro] = useState('')
  const [userId, setUserId] = useState('')
  const [matriz, setMatriz] = useState<{ telas: TelaMatriz[]; overrides: Override[] } | null>(null)
  const [busca, setBusca] = useState('')
  const [soComAcesso, setSoComAcesso] = useState(true)
  const [minimoExtras, setMinimoExtras] = useState(10)

  const carregar = useCallback(() => {
    ler<{ usuarios: Usuario[]; conjuntos: Conjunto[] }>('/api/admin/permissoes-v2').then(setDados).catch((e) => setErro(e.message))
  }, [])
  useEffect(() => { if (isAdmin) carregar() }, [isAdmin, carregar])

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
    <div style={{ padding: 'clamp(12px, 2vw, 24px)', color: 'var(--portal-text)', fontFamily: 'Inter' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Permissões</h1>
        <Link href="/admin" style={{ fontSize: 13 }}>← Administração</Link>
      </div>
      <p style={{ fontSize: 13, color: 'var(--portal-text-muted)', margin: '6px 0 16px' }}>
        Departamentos e pacotes se editam aqui. Exceções de uma pessoa (uma tela a mais ou a menos) ficam na janela dela, na Administração.
      </p>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {([['conjuntos', 'Departamentos e pacotes'], ['usuario', 'Por usuário'], ['revisao', 'Revisão de exceções']] as [Aba, string][]).map(([id, txt]) => (
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

      {dados && aba === 'conjuntos' && (
        <DepartamentosPacotes usuarios={dados.usuarios} conjuntos={dados.conjuntos} souDev={isDev} aoMudar={carregar} />
      )}

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
