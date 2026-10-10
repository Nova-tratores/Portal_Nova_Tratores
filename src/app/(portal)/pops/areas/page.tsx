'use client'
// POPs — áreas e papéis (só admin do módulo): quem é DONO (cria/edita os POPs
// da área) e quem é APROVADOR (aprova a publicação) em cada área.
export const dynamic = 'force-dynamic'

import { useCallback, useEffect, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import UserSelect from '@/components/tickets/UserSelect'
import { COR_POPS, botao, botaoClaro, campo, cartao, chamar, chip, pagina, vazio, type AreasResp } from '@/components/pops/comum'

const PAPEIS = [
  { id: 'dono', label: 'Donos', ajuda: 'criam e editam os POPs da área' },
  { id: 'aprovador', label: 'Aprovadores', ajuda: 'aprovam a publicação (nunca a própria versão)' },
] as const

export default function Areas() {
  const { userProfile } = useAuth()
  const [d, setD] = useState<AreasResp | null>(null)
  const [erro, setErro] = useState('')
  const [nova, setNova] = useState({ sigla: '', nome: '' })
  const [incluindo, setIncluindo] = useState<string | null>(null) // `${area}:${papel}`

  const carregar = useCallback(async () => {
    try { const r = await chamar<AreasResp>('/api/pops/areas'); setD(r) } catch (e) { setErro((e as Error).message) }
  }, [])
  // carregar ao montar/trocar o filtro: o setState vem depois do fetch (padrão do portal, ver CentralNav)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (userProfile) carregar() }, [carregar, userProfile])

  const acao = async (corpo: Record<string, unknown>) => {
    setErro('')
    try { await chamar('/api/pops/areas', { json: corpo }); await carregar() } catch (e) { setErro((e as Error).message) }
  }

  if (!d) return <div style={pagina}><div style={vazio}>{erro || 'Carregando…'}</div></div>
  if (!d.eu.admin) return <div style={pagina}><div style={vazio}>Só o admin do módulo de POPs gerencia áreas e papéis.</div></div>

  return (
    <div style={pagina}>
      {erro && <div style={{ ...cartao, color: '#dc2626', marginBottom: 12 }}>{erro}</div>}
      <div style={{ display: 'grid', gap: 12 }}>
        {d.areas.map((a) => (
          <div key={a.id} style={{ ...cartao, opacity: a.ativo ? 1 : .6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <span style={{ fontFamily: 'ui-monospace,monospace', fontWeight: 900, color: COR_POPS }}>{a.sigla}</span>
              <strong style={{ flex: 1 }}>{a.nome}</strong>
              <button onClick={() => acao({ acao: 'ativar', area_id: a.id, ativo: !a.ativo })} style={botaoClaro()}>{a.ativo ? 'Desativar' : 'Ativar'}</button>
            </div>
            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))' }}>
              {PAPEIS.map((p) => {
                const k = `${a.id}:${p.id}`
                const pessoas = d.papeis.filter((x) => x.area_id === a.id && x.papel === p.id)
                return (
                  <div key={p.id}>
                    <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', color: 'var(--portal-text-secondary,#555)' }}>
                      {p.label} <span style={{ fontWeight: 500, textTransform: 'none' }}>— {p.ajuda}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6, alignItems: 'center' }}>
                      {pessoas.map((x) => (
                        <span key={x.user_id} style={chip('#0f766e', 'rgba(15,118,110,.12)')}>
                          {d.usuarios[x.user_id]?.nome || x.user_id}
                          <button aria-label="Tirar" onClick={() => acao({ acao: 'papel_remover', area_id: a.id, user_id: x.user_id, papel: p.id })}
                            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'inherit', display: 'flex', padding: 0 }}><X size={12} /></button>
                        </span>
                      ))}
                      {!pessoas.length && <span style={{ fontSize: 13, color: 'var(--portal-text-muted,#888)' }}>ninguém</span>}
                      {incluindo === k ? (
                        <div style={{ minWidth: 240 }}>
                          <UserSelect value="" barraBusca autoFocus excluir={pessoas.map((x) => x.user_id)}
                            onChange={(uid) => { setIncluindo(null); acao({ acao: 'papel_add', area_id: a.id, user_id: uid, papel: p.id }) }} />
                        </div>
                      ) : (
                        <button onClick={() => setIncluindo(k)} style={botaoClaro()}><Plus size={13} /> incluir</button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
        <div style={{ ...cartao, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <strong style={{ fontSize: 14 }}>Nova área:</strong>
          <input value={nova.sigla} onChange={(e) => setNova({ ...nova, sigla: e.target.value.toUpperCase().slice(0, 4) })} placeholder="Sigla (2–4 letras)" style={{ ...campo, width: 150 }} />
          <input value={nova.nome} onChange={(e) => setNova({ ...nova, nome: e.target.value })} placeholder="Nome" style={{ ...campo, width: 240 }} />
          <button disabled={!nova.sigla || !nova.nome} onClick={async () => { await acao({ acao: 'criar_area', ...nova }); setNova({ sigla: '', nome: '' }) }} style={botao(COR_POPS)}>
            <Plus size={14} /> Criar
          </button>
        </div>
      </div>
    </div>
  )
}
