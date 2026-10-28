'use client'
// Botão flutuante (só Dev): "Quem acessa esta página?" — abre um painel com
// quem tem e quem não tem acesso à rota atual, com nível e origem (v2) e o
// resultado de hoje (portal_permissoes). Diferença entre os dois = selo vermelho.
import { useCallback, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { KeyRound, X } from 'lucide-react'
import { authHeaders } from '@/lib/auth/client'

interface Usuario {
  id: string; nome: string; ativo: boolean; avatar_url: string | null; categoria: string
  admin: boolean; dev: boolean; hoje: boolean; v2: boolean | null
  detalhe: { tela: string; nivel: string; origens: string[] }[]
}
interface Resposta {
  caminho: string
  rota: { padrao: string; acesso: 'tela' | 'livre' | 'admin' | 'dev'; tela_id?: string; nome: string | null; alternativas?: string[]; alternativasNomes: string[]; nota?: string } | null
  fonte: 'v2' | 'hoje'
  migracaoFaltando: boolean
  usuarios: Usuario[]
}

const ACESSO_TXT = { livre: 'Qualquer usuário logado', admin: 'Só admin/dev', dev: 'Só dev' }

export default function QuemAcessa() {
  const pathname = usePathname()
  const [aberto, setAberto] = useState(false)
  const [dados, setDados] = useState<Resposta | null>(null)
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [mostrarSem, setMostrarSem] = useState(false)

  const carregar = useCallback(async () => {
    setCarregando(true); setErro('')
    try {
      const r = await fetch(`/api/permissoes/quem-acessa?rota=${encodeURIComponent(pathname)}`, { headers: await authHeaders() })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
      setDados(j)
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setCarregando(false)
    }
  }, [pathname])

  useEffect(() => { if (aberto) void carregar() }, [aberto, carregar])

  const com = dados?.usuarios.filter((u) => u.hoje || u.v2) ?? []
  const sem = dados?.usuarios.filter((u) => !u.hoje && !u.v2) ?? []
  const divergentes = dados?.usuarios.filter((u) => u.v2 !== null && u.v2 !== u.hoje).length ?? 0

  return (
    <>
      <button
        className="quem-acessa-btn"
        onClick={() => setAberto((a) => !a)}
        title="Quem acessa esta página? (só Dev)"
        style={{
          position: 'fixed', left: 16, bottom: 16, zIndex: 900, display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 10px', borderRadius: 999, border: '1px solid var(--portal-border)',
          background: 'var(--portal-bg-secondary)', color: 'var(--portal-text-secondary)',
          fontSize: 12, fontWeight: 600, fontFamily: 'Inter', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,.12)',
        }}
      >
        <KeyRound size={14} /> Quem acessa
        <span style={{ fontSize: 9, fontWeight: 800, background: '#111111', color: '#fefefe', padding: '1px 6px', borderRadius: 999 }}>DEV</span>
      </button>

      {aberto && (
        <aside
          style={{
            position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(440px, 100vw)', zIndex: 60000,
            background: 'var(--portal-bg)', color: 'var(--portal-text)', borderLeft: '1px solid var(--portal-border)',
            boxShadow: '-8px 0 24px rgba(0,0,0,.18)', display: 'flex', flexDirection: 'column', fontFamily: 'Inter',
          }}
        >
          <header style={{ padding: '14px 16px', borderBottom: '1px solid var(--portal-border)', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>Quem acessa esta página</div>
              <div style={{ fontSize: 12, color: 'var(--portal-text-muted)', wordBreak: 'break-all' }}>{pathname}</div>
            </div>
            <button onClick={() => setAberto(false)} aria-label="Fechar" style={{ background: 'none', border: 'none', color: 'var(--portal-text-secondary)', cursor: 'pointer' }}>
              <X size={18} />
            </button>
          </header>

          <div style={{ padding: 16, overflowY: 'auto', flex: 1 }}>
            {carregando && <p style={{ fontSize: 13 }}>Carregando…</p>}
            {erro && <p style={{ fontSize: 13, color: '#dc2626' }}>{erro}</p>}
            {dados && !carregando && (
              <>
                <section style={{ fontSize: 13, marginBottom: 14, padding: 10, borderRadius: 8, background: 'var(--portal-bg-secondary)' }}>
                  {!dados.rota && <div>Rota sem tela cadastrada no catálogo. Ninguém controla o acesso aqui ainda.</div>}
                  {dados.rota?.acesso === 'tela' && (
                    <>
                      <div><b>Tela:</b> {dados.rota.nome} <code style={{ fontSize: 11 }}>{dados.rota.tela_id}</code></div>
                      {dados.rota.alternativasNomes.length > 0 && <div><b>Também abre com:</b> {dados.rota.alternativasNomes.join(' · ')}</div>}
                    </>
                  )}
                  {dados.rota && dados.rota.acesso !== 'tela' && <div><b>{ACESSO_TXT[dados.rota.acesso]}</b></div>}
                  {dados.rota?.nota && <div style={{ color: 'var(--portal-text-muted)', marginTop: 4 }}>{dados.rota.nota}</div>}
                  <div style={{ marginTop: 6, color: 'var(--portal-text-muted)', fontSize: 12 }}>
                    {dados.fonte === 'v2'
                      ? 'Resultado das permissões novas (v2) ao lado do de hoje.'
                      : dados.migracaoFaltando
                        ? 'Permissões v2 ainda não aplicadas no banco: mostrando só a regra de hoje.'
                        : 'Mostrando a regra de hoje.'}
                  </div>
                  {divergentes > 0 && (
                    <div style={{ marginTop: 6, color: '#dc2626', fontWeight: 700 }}>{divergentes} pessoa(s) com resultado diferente entre hoje e v2</div>
                  )}
                </section>

                <h3 style={{ fontSize: 13, fontWeight: 700, margin: '0 0 8px' }}>Têm acesso ({com.length})</h3>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {com.map((u) => <LinhaUsuario key={u.id} u={u} />)}
                </ul>

                <button onClick={() => setMostrarSem((s) => !s)}
                  style={{ marginTop: 16, background: 'none', border: 'none', padding: 0, fontSize: 13, fontWeight: 700, color: 'var(--portal-text)', cursor: 'pointer' }}>
                  {mostrarSem ? '▾' : '▸'} Não têm acesso ({sem.length})
                </button>
                {mostrarSem && (
                  <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {sem.map((u) => <LinhaUsuario key={u.id} u={u} />)}
                  </ul>
                )}
              </>
            )}
          </div>
        </aside>
      )}
    </>
  )
}

function LinhaUsuario({ u }: { u: Usuario }) {
  const divergente = u.v2 !== null && u.v2 !== u.hoje
  const origens = [...new Set(u.detalhe.flatMap((d) => d.origens))]
  return (
    <li style={{
      padding: '8px 10px', borderRadius: 8, border: `1px solid ${divergente ? '#dc2626' : 'var(--portal-border)'}`,
      opacity: u.ativo ? 1 : 0.55, fontSize: 13,
    }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <b>{u.nome}</b>
        {u.categoria && <span style={{ fontSize: 11, color: 'var(--portal-text-muted)' }}>{u.categoria}</span>}
        {u.dev ? <Selo txt="DEV" /> : u.admin ? <Selo txt="ADMIN" /> : null}
        {!u.ativo && <Selo txt="INATIVO" />}
        {u.detalhe[0] && <Selo txt={u.detalhe.map((d) => d.nivel).sort().at(-1)!.toUpperCase()} />}
        {divergente && <span style={{ fontSize: 11, color: '#dc2626', fontWeight: 700 }}>hoje {u.hoje ? 'sim' : 'não'} · v2 {u.v2 ? 'sim' : 'não'}</span>}
      </div>
      {origens.length > 0 && (
        <div style={{ marginTop: 4, fontSize: 11, color: 'var(--portal-text-muted)' }}>{origens.join(' · ')}</div>
      )}
    </li>
  )
}

function Selo({ txt }: { txt: string }) {
  return <span style={{ fontSize: 9, fontWeight: 800, border: '1px solid var(--portal-border)', padding: '1px 6px', borderRadius: 999 }}>{txt}</span>
}
