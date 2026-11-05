'use client'
// Opa → Departamentos (admin): cada território (pni_locais — os mesmos locais de Peças
// S/Estoque e Patrimônio) aponta para um departamento, e cada departamento tem um gestor.
// O gestor vira o Responsável do Opa e é o ÚNICO avisado (/api/opa/notificar).
// Local sem departamento cai no departamento padrão. Quem abre o Opa nunca vê o departamento.

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Building2, Check, Loader2, MapPin, Plus, Star, Trash2, UserRound } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useIsMobile } from '@/hooks/useIsMobile'
import { authHeaders } from '@/lib/auth/client'
import { OpaBarra, BTN_FAIXA } from '@/components/opa/pecas/comum'
import { agruparLocais } from '@/lib/opa-pecas/regras'
import { destinoDoLocal, type Departamento, type LigacaoLocal } from '@/lib/opa/departamentos'
import type { Local } from '@/lib/opa-pecas/tipos'

const VERMELHO = '#dc2626'

interface Dados {
  departamentos: Departamento[]
  ligacoes: LigacaoLocal[]
  locais: Local[]
  usuarios: { id: string; nome: string }[]
  podeEditar: boolean
}

export default function DepartamentosOpaPage() {
  const isMobile = useIsMobile()
  const { userProfile } = useAuth()
  const [dados, setDados] = useState<Dados | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)   // chave do que está salvando
  const [novoNome, setNovoNome] = useState('')
  const [novoGestor, setNovoGestor] = useState('')

  const carregar = useCallback(async () => {
    try {
      const r = await fetch('/api/opa/departamentos', { headers: await authHeaders() })
      const j = await r.json()
      if (!r.ok) { setErro(j.error || 'Não foi possível carregar.'); return }
      setDados(j); setErro(null)
    } catch { setErro('Sem conexão. Tente de novo.') }
  }, [])
  useEffect(() => { if (userProfile) carregar() }, [userProfile, carregar])

  const enviar = async (chave: string, corpo: Record<string, unknown>) => {
    setOcupado(chave); setErro(null)
    try {
      const r = await fetch('/api/opa/departamentos', {
        method: 'POST', headers: { ...(await authHeaders()), 'Content-Type': 'application/json' }, body: JSON.stringify(corpo),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setErro(j.error || 'Não foi possível salvar.'); return false }
      await carregar()
      return true
    } finally { setOcupado(null) }
  }

  const pode = !!dados?.podeEditar
  const deps = dados?.departamentos || []
  const padrao = deps.find((d) => d.padrao) || null
  const grupos = agruparLocais((dados?.locais || []).filter((l) => l.ativo))
  const depDoLocal = (localId: string) => dados?.ligacoes.find((l) => l.local_id === localId)?.departamento_id || ''
  const semGestor = deps.filter((d) => !d.gestor_id)

  const inp: React.CSSProperties = {
    height: 38, padding: '0 10px', borderRadius: 8, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-card)',
    color: 'var(--portal-text)', fontSize: 14, fontFamily: 'inherit', minWidth: 0,
  }
  const cartao: React.CSSProperties = { borderRadius: 12, background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', padding: isMobile ? 12 : 16 }
  const tituloSecao: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 800, color: 'var(--portal-text)', margin: '0 0 4px' }
  const ajuda: React.CSSProperties = { fontSize: 13, color: 'var(--portal-text-muted)', margin: '0 0 12px', lineHeight: 1.5 }

  return (
    <div style={{ padding: isMobile ? '12px 12px 24px' : '16px 20px 28px', width: '100%', boxSizing: 'border-box' }}>
      <OpaBarra acao={<Link href="/opa" style={{ ...BTN_FAIXA, padding: '0 12px' }}><ArrowLeft size={16} strokeWidth={2.5} /> Ocorrências</Link>} />

      <p style={{ ...ajuda, fontSize: 14, margin: '0 0 14px', maxWidth: 900 }}>
        Quem abre um Opa escolhe só <b>onde</b> o problema está. Aqui você diz de qual <b>departamento</b> é cada lugar e quem é o <b>gestor</b> de cada departamento.
        O gestor vira o Responsável do Opa e é o único avisado. Lugar sem departamento vai para o departamento marcado com <Star size={12} style={{ verticalAlign: -1 }} /> (padrão).
      </p>

      {erro && <div role="alert" style={{ padding: 10, borderRadius: 8, background: '#FEF2F2', color: '#991B1B', fontSize: 13.5, fontWeight: 600, marginBottom: 12 }}>{erro}</div>}
      {dados && !pode && <div style={{ padding: 10, borderRadius: 8, background: 'var(--portal-bg-secondary)', color: 'var(--portal-text-secondary)', fontSize: 13.5, marginBottom: 12 }}>Só um admin muda esta configuração. Você está vendo como está hoje.</div>}
      {dados && pode && (!padrao?.gestor_id || semGestor.length > 0) && (
        <div style={{ padding: 10, borderRadius: 8, background: '#FFFBEB', color: '#92400E', fontSize: 13.5, fontWeight: 600, marginBottom: 12 }}>
          {!padrao?.gestor_id
            ? 'O departamento padrão está sem gestor: enquanto isso, Opa de lugar sem departamento avisa todo mundo, como antes.'
            : `Sem gestor: ${semGestor.map((d) => d.nome).join(', ')} — os Opas desses departamentos vão para o gestor do padrão (${padrao.gestor_nome}).`}
        </div>
      )}

      {!dados && !erro && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 40, justifyContent: 'center', color: 'var(--portal-text-muted)' }}>
          <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Carregando…
        </div>
      )}

      {dados && (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1fr) minmax(0, 1fr)', gap: 14, alignItems: 'start' }}>
          {/* ── Departamentos e gestores ── */}
          <section style={cartao}>
            <h2 style={tituloSecao}><Building2 size={17} color={VERMELHO} /> Departamentos e gestores</h2>
            <p style={ajuda}>Trocar o gestor vale para os próximos Opas.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {deps.map((d) => (
                <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '8px 10px', borderRadius: 10, background: 'var(--portal-bg-secondary)' }}>
                  <button type="button" disabled={!pode || d.padrao || !!ocupado} onClick={() => enviar(`p-${d.id}`, { acao: 'padrao', id: d.id })}
                    title={d.padrao ? 'Departamento padrão: recebe os lugares sem departamento' : 'Tornar padrão'}
                    style={{ border: 'none', background: 'none', padding: 2, cursor: pode && !d.padrao ? 'pointer' : 'default', display: 'flex' }}>
                    <Star size={17} color={d.padrao ? '#F59E0B' : 'var(--portal-text-muted)'} fill={d.padrao ? '#F59E0B' : 'none'} />
                  </button>
                  <span style={{ fontWeight: 800, fontSize: 14, color: 'var(--portal-text)', minWidth: 110, flex: isMobile ? '1 1 60%' : '0 0 auto' }}>{d.nome}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 180 }}>
                    <UserRound size={14} color="var(--portal-text-muted)" />
                    {pode ? (
                      <select value={d.gestor_id || ''} disabled={!!ocupado} onChange={(e) => enviar(`g-${d.id}`, { acao: 'salvar_departamento', id: d.id, nome: d.nome, gestor_id: e.target.value || null })}
                        style={{ ...inp, flex: 1, borderColor: d.gestor_id ? 'var(--portal-border)' : '#F59E0B' }}>
                        <option value="">Sem gestor</option>
                        {d.gestor_id && !dados.usuarios.some((u) => u.id === d.gestor_id) && <option value={d.gestor_id}>{d.gestor_nome}</option>}
                        {dados.usuarios.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
                      </select>
                    ) : <span style={{ fontSize: 14, color: d.gestor_nome ? 'var(--portal-text)' : '#B45309' }}>{d.gestor_nome || 'Sem gestor'}</span>}
                  </div>
                  {ocupado === `g-${d.id}` && <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />}
                  {pode && !d.padrao && (
                    <button type="button" disabled={!!ocupado} title="Remover departamento (os lugares dele voltam para o padrão)"
                      onClick={() => { if (confirm(`Remover o departamento "${d.nome}"? Os lugares dele passam a ir para o padrão.`)) enviar(`r-${d.id}`, { acao: 'remover_departamento', id: d.id }) }}
                      style={{ border: 'none', background: 'none', cursor: 'pointer', color: VERMELHO, display: 'flex', padding: 4 }}>
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              ))}
              {pode && (
                <form onSubmit={async (e) => { e.preventDefault(); if (await enviar('novo', { acao: 'salvar_departamento', nome: novoNome, gestor_id: novoGestor || null })) { setNovoNome(''); setNovoGestor('') } }}
                  style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                  <input value={novoNome} onChange={(e) => setNovoNome(e.target.value.slice(0, 60))} placeholder="Novo departamento (ex.: Pós-Vendas)" style={{ ...inp, flex: '2 1 180px' }} />
                  <select value={novoGestor} onChange={(e) => setNovoGestor(e.target.value)} style={{ ...inp, flex: '1 1 150px' }}>
                    <option value="">Gestor (pode escolher depois)</option>
                    {dados.usuarios.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
                  </select>
                  <button type="submit" disabled={!novoNome.trim() || !!ocupado} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6, height: 38, padding: '0 14px', borderRadius: 8, border: 'none',
                    background: VERMELHO, color: '#fefefe', fontWeight: 800, fontSize: 13.5, fontFamily: 'inherit', cursor: 'pointer', opacity: !novoNome.trim() || ocupado ? 0.5 : 1,
                  }}>{ocupado === 'novo' ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={15} />} Incluir</button>
                </form>
              )}
            </div>
          </section>

          {/* ── Lugares → departamento ── */}
          <section style={cartao}>
            <h2 style={tituloSecao}><MapPin size={17} color={VERMELHO} /> De qual departamento é cada lugar</h2>
            <p style={ajuda}>Os mesmos lugares de Peças S/Estoque e Patrimônio. Lugar novo criado no Opa aparece aqui sem departamento.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {grupos.map((g) => (
                <div key={g.titulo}>
                  <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--portal-text-muted)', marginBottom: 6 }}>{g.titulo}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {g.itens.map(({ local: l, rotulo }) => {
                      const atual = depDoLocal(l.id)
                      const destino = destinoDoLocal(l.id, dados.ligacoes, deps)
                      return (
                        <div key={l.id} style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1fr) minmax(0, 1.2fr)', gap: 6, alignItems: 'center' }}>
                          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--portal-text)' }}>{g.titulo === rotulo ? rotulo : `${g.titulo} · ${rotulo}`}</span>
                          <div>
                            {pode ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <select value={atual} disabled={!!ocupado} onChange={(e) => enviar(`l-${l.id}`, { acao: 'ligar_local', local_id: l.id, departamento_id: e.target.value || null })}
                                  style={{ ...inp, flex: 1 }}>
                                  <option value="">{padrao ? `Sem departamento (vai para ${padrao.nome})` : 'Sem departamento'}</option>
                                  {deps.map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}
                                </select>
                                {ocupado === `l-${l.id}` ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : atual ? <Check size={15} color="#059669" /> : null}
                              </div>
                            ) : <span style={{ fontSize: 14 }}>{deps.find((d) => d.id === atual)?.nome || '—'}</span>}
                            <div style={{ fontSize: 12, color: destino.gestorNome ? 'var(--portal-text-muted)' : '#B45309', marginTop: 2 }}>
                              {destino.gestorNome ? `Avisa: ${destino.gestorNome}` : 'Ninguém configurado: avisa todo mundo'}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
