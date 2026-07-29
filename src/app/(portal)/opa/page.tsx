'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import { useAuditLog } from '@/hooks/useAuditLog'
import { useIsMobile } from '@/hooks/useIsMobile'
import { supabase } from '@/lib/supabase'
import {
  Plus, X, Paperclip, Send, Trash2, ChevronDown, ChevronUp,
  AlertCircle, Clock, Check, CheckCircle2, Eye, User, Image as ImageIcon, Film,
} from 'lucide-react'

interface OpaAnexo {
  id: string
  opa_id: string
  nome_arquivo: string
  url: string
  tipo: string | null
  tamanho: number | null
}
interface OpaView { nome: string; quando: string }
interface Opa {
  id: string
  titulo: string
  descricao: string | null
  criado_por: string | null
  criado_por_nome: string | null
  origem: string
  status: string
  resolvido_por_nome: string | null
  resolvido_por_tipo: string | null
  resolvido_at: string | null
  responsavel: string | null
  solucao: string | null
  created_at: string
  anexos?: OpaAnexo[]
  views?: OpaView[]
}

type Aba = 'abertos' | 'concluidos'

export default function OpaPage() {
  const isMobile = useIsMobile()
  const { userProfile } = useAuth()
  const { isAdmin } = usePermissoes(userProfile?.id)
  const { log: auditLog } = useAuditLog()
  const [opas, setOpas] = useState<Opa[]>([])
  const [loading, setLoading] = useState(true)
  const [aba, setAba] = useState<Aba>('abertos')
  const [showModal, setShowModal] = useState(false)
  const [expandido, setExpandido] = useState<string | null>(null)
  const [resolvendo, setResolvendo] = useState<string | null>(null)

  // Responsável + solução (editáveis pelo criador do Opa)
  const [usuarios, setUsuarios] = useState<{ nome: string }[]>([])
  const [editRespId, setEditRespId] = useState<string | null>(null)   // opa em edição
  const [respTmp, setRespTmp] = useState('')
  const [solTmp, setSolTmp] = useState('')
  const [salvandoResp, setSalvandoResp] = useState(false)

  // Form
  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [arquivos, setArquivos] = useState<File[]>([])
  const [enviando, setEnviando] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const carregar = useCallback(async () => {
    const { data: lista } = await supabase
      .from('portal_opas')
      .select('*')
      .order('created_at', { ascending: false })
    if (!lista) { setLoading(false); return }

    const ids = lista.map(o => o.id)
    const { data: anexosData } = ids.length
      ? await supabase.from('portal_opas_anexos').select('*').in('opa_id', ids)
      : { data: [] }
    const { data: viewsData } = ids.length
      ? await supabase.from('portal_opas_views').select('opa_id, user_nome, visto_at').in('opa_id', ids)
      : { data: [] }

    const anexosMap: Record<string, OpaAnexo[]> = {}
    ;(anexosData || []).forEach((a: any) => {
      ;(anexosMap[a.opa_id] ||= []).push(a)
    })
    const viewsMap: Record<string, OpaView[]> = {}
    ;(viewsData || []).forEach((v: any) => {
      ;(viewsMap[v.opa_id] ||= []).push({ nome: v.user_nome || 'Usuário', quando: v.visto_at })
    })

    setOpas(lista.map(o => ({
      ...o,
      anexos: anexosMap[o.id] || [],
      views: (viewsMap[o.id] || []).sort((a, b) => new Date(a.quando).getTime() - new Date(b.quando).getTime()),
    })))
    setLoading(false)
  }, [])

  useEffect(() => { carregar() }, [carregar])

  // Lista de usuários pro seletor de responsável
  useEffect(() => {
    supabase.from('financeiro_usu').select('nome').eq('ativo', true).order('nome')
      .then(({ data }) => setUsuarios((data || []).filter((u: any) => u.nome)))
  }, [])

  // Realtime
  useEffect(() => {
    const ch = supabase.channel('opas_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'portal_opas' }, () => carregar())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [carregar])

  const registrarView = async (opa: Opa) => {
    if (!userProfile) return
    // Já registrado? evita escrita redundante
    if (opa.views?.some(v => v.nome === userProfile.nome)) return
    await supabase.from('portal_opas_views').upsert({
      opa_id: opa.id,
      user_id: userProfile.id,
      user_nome: userProfile.nome || 'Usuário',
      visto_at: new Date().toISOString(),
    }, { onConflict: 'opa_id,user_id' })
    carregar()
  }

  const toggleExpandido = (opa: Opa) => {
    if (expandido === opa.id) { setExpandido(null); return }
    setExpandido(opa.id)
    registrarView(opa)
  }

  const criarOpa = async () => {
    if (!titulo.trim() || !userProfile) return
    setEnviando(true)

    const { data: opa, error } = await supabase.from('portal_opas').insert({
      titulo: titulo.trim(),
      descricao: descricao.trim() || null,
      criado_por: userProfile.id,
      criado_por_nome: userProfile.nome || 'Usuário',
      origem: 'portal',
    }).select().single()

    if (error || !opa) { setEnviando(false); return }

    for (const file of arquivos) {
      const ext = file.name.split('.').pop()
      const path = `opas/${opa.id}/${Date.now()}_${file.name}`
      const { error: upErr } = await supabase.storage.from('anexos').upload(path, file)
      if (!upErr) {
        const { data: urlData } = supabase.storage.from('anexos').getPublicUrl(path)
        await supabase.from('portal_opas_anexos').insert({
          opa_id: opa.id,
          nome_arquivo: file.name,
          url: urlData.publicUrl,
          tipo: file.type || `application/${ext}`,
          tamanho: file.size,
        })
      }
    }

    auditLog({ sistema: 'opa', acao: 'criar', entidade: 'opa', entidade_id: opa.id, entidade_label: `Opa: ${titulo.trim()}` })

    // Notifica o sino de quem tem acesso ao Opa
    fetch('/api/opa/notificar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ opa_id: opa.id, titulo: titulo.trim(), descricao: descricao.trim() || null, criado_por_id: userProfile.id }),
    }).catch(() => {})

    setTitulo(''); setDescricao(''); setArquivos([]); setShowModal(false); setEnviando(false)
    carregar()
  }

  const resolver = async (opa: Opa) => {
    if (!userProfile) return
    setResolvendo(opa.id)
    await supabase.rpc('resolver_opa', {
      p_opa_id: opa.id, p_user_id: userProfile.id, p_user_nome: userProfile.nome || 'Usuário', p_user_tipo: 'portal',
    })
    auditLog({ sistema: 'opa', acao: 'resolver', entidade: 'opa', entidade_id: opa.id, entidade_label: `Opa: ${opa.titulo}` })
    setResolvendo(null)
    carregar()
  }

  const abrirEdicaoResp = (opa: Opa) => {
    setEditRespId(opa.id)
    setRespTmp(opa.responsavel || '')
    setSolTmp(opa.solucao || '')
  }

  const salvarResp = async (opa: Opa) => {
    setSalvandoResp(true)
    await supabase.from('portal_opas').update({
      responsavel: respTmp.trim() || null,
      solucao: solTmp.trim() || null,
    }).eq('id', opa.id)
    auditLog({ sistema: 'opa', acao: 'editar', entidade: 'opa', entidade_id: opa.id, entidade_label: `Opa: ${opa.titulo}` })
    setSalvandoResp(false)
    setEditRespId(null)
    carregar()
  }

  const excluirOpa = async (id: string) => {
    if (!confirm('Excluir este Opa?')) return
    await supabase.from('portal_opas').delete().eq('id', id)
    carregar()
  }

  const removerArquivo = (idx: number) => setArquivos(prev => prev.filter((_, i) => i !== idx))

  const formatBytes = (bytes: number | null) => {
    if (!bytes) return ''
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1048576).toFixed(1)} MB`
  }
  const fmtData = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  const abertos = opas.filter(o => o.status === 'aberto')
  const concluidos = opas.filter(o => o.status === 'resolvido')
  const lista = aba === 'abertos' ? abertos : concluidos

  const INP: React.CSSProperties = { width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #E4E4E7', fontSize: 14, boxSizing: 'border-box', background: '#FAFAFA', outline: 'none', color: '#18181B', fontFamily: 'Inter, sans-serif' }

  if (loading && opas.length === 0) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 80, color: '#9CA3AF', gap: 10 }}>
      <Clock size={16} style={{ animation: 'spin 1s linear infinite' }} />
      <span style={{ fontSize: 14 }}>Carregando Opas...</span>
    </div>
  )

  return (
    <div style={{ padding: isMobile ? '16px 12px' : '32px 40px', maxWidth: 900, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg, #ef4444, #dc2626)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <AlertCircle size={22} color="#fff" />
            </div>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--portal-text)', margin: 0 }}>Opa</h1>
          </div>
          <p style={{ fontSize: 14, color: 'var(--portal-text-secondary)', margin: 0 }}>Sinalize algo fora do lugar — todos veem até alguém resolver</p>
        </div>
        <button onClick={() => setShowModal(true)} style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px', borderRadius: 10,
          background: '#dc2626', color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer',
        }}>
          <Plus size={16} /> Novo Opa
        </button>
      </div>

      {/* Abas */}
      <div style={{ display: 'flex', gap: 4, background: 'var(--portal-bg-secondary)', borderRadius: 12, padding: 4, marginBottom: 20, width: 'fit-content' }}>
        {([
          { k: 'abertos' as Aba, label: 'Abertos', n: abertos.length },
          { k: 'concluidos' as Aba, label: 'Concluídos', n: concluidos.length },
        ]).map(t => (
          <button key={t.k} onClick={() => setAba(t.k)} style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 18px', borderRadius: 9, border: 'none',
            background: aba === t.k ? '#dc2626' : 'transparent', color: aba === t.k ? '#fff' : 'var(--portal-text-secondary)',
            fontSize: 14, fontWeight: 700, cursor: 'pointer', transition: 'all .15s',
          }}>
            {t.label}
            <span style={{
              fontSize: 11, fontWeight: 800, padding: '1px 8px', borderRadius: 8,
              background: aba === t.k ? 'rgba(255,255,255,0.25)' : 'var(--portal-bg-card)',
              color: aba === t.k ? '#fff' : 'var(--portal-text-muted)',
            }}>{t.n}</span>
          </button>
        ))}
      </div>

      {/* Lista */}
      {lista.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center', borderRadius: 16, background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)' }}>
          {aba === 'abertos'
            ? <CheckCircle2 size={40} color="#10B981" style={{ margin: '0 auto 16px', display: 'block' }} />
            : <AlertCircle size={40} color="#e5e5e5" style={{ margin: '0 auto 16px', display: 'block' }} />}
          <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--portal-text-muted)', margin: 0 }}>
            {aba === 'abertos' ? 'Nenhum Opa aberto — tudo em ordem!' : 'Nenhum Opa concluído ainda'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {lista.map(opa => {
            const isExpanded = expandido === opa.id
            const resolvido = opa.status === 'resolvido'
            return (
              <div key={opa.id} style={{
                borderRadius: 14, overflow: 'hidden', background: 'var(--portal-bg-card)',
                border: `1px solid ${resolvido ? '#A7F3D0' : '#FCA5A5'}`,
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              }}>
                <div style={{ height: 3, background: resolvido ? '#10B981' : '#dc2626' }} />
                <div onClick={() => toggleExpandido(opa)} style={{ padding: '18px 22px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                      <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--portal-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{opa.titulo}</span>
                      {resolvido
                        ? <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: '#D1FAE5', color: '#065F46', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4 }}><Check size={11} /> Resolvido</span>
                        : <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: '#FEE2E2', color: '#DC2626', flexShrink: 0 }}>Aberto</span>}
                      {opa.origem === 'mecanico' && (
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: '#FEF3C7', color: '#92400E', flexShrink: 0 }}>MECÂNICO</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, color: 'var(--portal-text-muted)', flexWrap: 'wrap' }}>
                      {/* Criador só para admin */}
                      {isAdmin && opa.criado_por_nome && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><User size={11} /> {opa.criado_por_nome}</span>
                      )}
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Clock size={11} /> {fmtData(opa.created_at)}</span>
                      {(opa.anexos?.length || 0) > 0 && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Paperclip size={11} /> {opa.anexos!.length}</span>
                      )}
                      <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Eye size={11} /> {opa.views?.length || 0}</span>
                      {opa.responsavel && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#dc2626', fontWeight: 600 }}><User size={11} /> {opa.responsavel}</span>
                      )}
                      {resolvido && opa.resolvido_por_nome && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#059669', fontWeight: 600 }}>
                          <CheckCircle2 size={11} /> por {opa.resolvido_por_nome}{opa.resolvido_por_tipo === 'tecnico' ? ' (técnico)' : ''}
                        </span>
                      )}
                    </div>
                  </div>
                  {isExpanded ? <ChevronUp size={18} color="#999" /> : <ChevronDown size={18} color="#999" />}
                </div>

                {isExpanded && (
                  <div style={{ padding: '0 22px 20px', borderTop: '1px solid var(--portal-border)' }}>
                    {opa.descricao && (
                      <div style={{ padding: '16px 0', fontSize: 14, lineHeight: 1.7, color: 'var(--portal-text-secondary)', whiteSpace: 'pre-wrap' }}>{opa.descricao}</div>
                    )}

                    {/* Anexos (fotos/vídeos) */}
                    {opa.anexos && opa.anexos.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: opa.descricao ? 0 : 16 }}>
                        {opa.anexos.map(a => {
                          const isVideo = a.tipo?.startsWith('video')
                          return (
                            <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer" style={{ display: 'block', width: 120, height: 120, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--portal-border)', position: 'relative', background: '#000' }}>
                              {isVideo
                                ? <video src={a.url} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                : <img src={a.url} alt={a.nome_arquivo} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                              <span style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.6)', borderRadius: 6, padding: 3, display: 'flex' }}>
                                {isVideo ? <Film size={12} color="#fff" /> : <ImageIcon size={12} color="#fff" />}
                              </span>
                            </a>
                          )
                        })}
                      </div>
                    )}

                    {/* Responsável + solução (o criador do Opa preenche) */}
                    {(() => {
                      const souCriador = !!userProfile && opa.criado_por === userProfile.id
                      const podeEditar = souCriador || isAdmin
                      const editando = editRespId === opa.id
                      const temAlgo = opa.responsavel || opa.solucao

                      if (editando) return (
                        <div style={{ marginTop: 16, padding: 16, borderRadius: 12, background: 'var(--portal-bg-secondary)', border: '1px solid var(--portal-border)' }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--portal-text-secondary)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}><User size={13} /> Responsável</div>
                          <input list={`usuarios-${opa.id}`} value={respTmp} onChange={e => setRespTmp(e.target.value)}
                            placeholder="Quem vai resolver?" style={{ ...INP, marginBottom: 12 }} />
                          <datalist id={`usuarios-${opa.id}`}>
                            {usuarios.map((u, i) => <option key={i} value={u.nome} />)}
                          </datalist>
                          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--portal-text-secondary)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}><CheckCircle2 size={13} /> Solução</div>
                          <textarea value={solTmp} onChange={e => setSolTmp(e.target.value)} rows={3}
                            placeholder="Descreva a solução..." style={{ ...INP, resize: 'vertical', lineHeight: 1.6 }} />
                          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                            <button disabled={salvandoResp} onClick={() => salvarResp(opa)} style={{
                              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, border: 'none',
                              background: '#dc2626', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: salvandoResp ? 0.6 : 1,
                            }}><Check size={14} /> {salvandoResp ? 'Salvando...' : 'Salvar'}</button>
                            <button onClick={() => setEditRespId(null)} style={{
                              padding: '8px 16px', borderRadius: 8, border: '1px solid var(--portal-border)',
                              background: 'var(--portal-bg-card)', color: 'var(--portal-text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                            }}>Cancelar</button>
                          </div>
                        </div>
                      )

                      if (temAlgo) return (
                        <div style={{ marginTop: 16, padding: 16, borderRadius: 12, background: 'var(--portal-bg-secondary)', border: '1px solid var(--portal-border)' }}>
                          {opa.responsavel && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--portal-text)', marginBottom: opa.solucao ? 12 : 0 }}>
                              <User size={15} style={{ color: '#dc2626', flexShrink: 0 }} />
                              <span style={{ fontWeight: 600 }}>Responsável:</span> {opa.responsavel}
                            </div>
                          )}
                          {opa.solucao && (
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: '#059669', marginBottom: 6 }}><CheckCircle2 size={14} /> Solução</div>
                              <div style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--portal-text-secondary)', whiteSpace: 'pre-wrap' }}>{opa.solucao}</div>
                            </div>
                          )}
                          {podeEditar && (
                            <button onClick={() => abrirEdicaoResp(opa)} style={{
                              marginTop: 12, padding: '6px 12px', borderRadius: 8, border: '1px solid var(--portal-border)',
                              background: 'var(--portal-bg-card)', color: 'var(--portal-text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                            }}>Editar responsável / solução</button>
                          )}
                        </div>
                      )

                      if (podeEditar) return (
                        <button onClick={() => abrirEdicaoResp(opa)} style={{
                          marginTop: 16, display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 8,
                          border: '1px dashed var(--portal-border)', background: 'var(--portal-bg-secondary)',
                          color: 'var(--portal-text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                        }}><User size={14} /> Indicar responsável e solução</button>
                      )
                      return null
                    })()}

                    {/* Quem visualizou */}
                    {opa.views && opa.views.length > 0 && (
                      <div style={{ marginTop: 16 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--portal-text-secondary)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Eye size={13} /> {opa.views.length} {opa.views.length > 1 ? 'pessoas viram' : 'pessoa viu'}
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {opa.views.map((v, i) => (
                            <span key={i} style={{ fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 8, background: 'var(--portal-bg-secondary)', color: 'var(--portal-text-secondary)' }}>
                              {v.nome.split(' ').slice(0, 2).join(' ')}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Ações */}
                    <div style={{ display: 'flex', gap: 8, marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--portal-border)' }}>
                      {!resolvido && (
                        <button disabled={resolvendo === opa.id} onClick={(e) => { e.stopPropagation(); resolver(opa) }} style={{
                          display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 8, border: 'none',
                          background: '#10B981', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                          opacity: resolvendo === opa.id ? 0.6 : 1,
                        }}>
                          <Check size={15} /> {resolvendo === opa.id ? 'Resolvendo...' : 'Marcar como Resolvido'}
                        </button>
                      )}
                      {resolvido && opa.resolvido_at && (
                        <span style={{ fontSize: 12, color: '#059669', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <CheckCircle2 size={14} /> Resolvido em {fmtData(opa.resolvido_at)}
                        </span>
                      )}
                      <div style={{ flex: 1 }} />
                      {isAdmin && (
                        <button onClick={(e) => { e.stopPropagation(); excluirOpa(opa.id) }} style={{
                          display: 'flex', alignItems: 'center', gap: 5, padding: '9px 14px', borderRadius: 8,
                          border: '1px solid #FECACA', background: 'var(--portal-bg-card)', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: '#DC2626',
                        }}>
                          <Trash2 size={13} /> Excluir
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Modal Novo Opa */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
          <div style={{ background: 'var(--portal-bg-card)', borderRadius: 16, padding: 32, width: '100%', maxWidth: 560, maxHeight: '90vh', overflow: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--portal-text)', margin: 0 }}>Novo Opa</h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'var(--portal-bg-secondary)', border: 'none', cursor: 'pointer', width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={16} color="#555" />
              </button>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--portal-text-secondary)', display: 'block', marginBottom: 6 }}>Título</label>
              <input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="O que está fora do lugar?" style={INP} />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--portal-text-secondary)', display: 'block', marginBottom: 6 }}>Descrição</label>
              <textarea value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Descreva a ocorrência (opcional)..." rows={5} style={{ ...INP, resize: 'vertical', lineHeight: 1.6 }} />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--portal-text-secondary)', display: 'block', marginBottom: 6 }}>Fotos / Vídeos</label>
              <input ref={fileRef} type="file" accept="image/*,video/*" multiple onChange={e => {
                const files = Array.from(e.target.files || [])
                setArquivos(prev => [...prev, ...files])
                if (fileRef.current) fileRef.current.value = ''
              }} style={{ display: 'none' }} />
              <button onClick={() => fileRef.current?.click()} style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '14px',
                borderRadius: 8, border: '2px dashed #D4D4D4', background: 'var(--portal-bg-secondary)',
                fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#737373', justifyContent: 'center',
              }}>
                <Paperclip size={16} /> Adicionar fotos ou vídeos
              </button>
              {arquivos.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                  {arquivos.map((f, i) => {
                    const isVideo = f.type.startsWith('video')
                    const url = URL.createObjectURL(f)
                    return (
                      <div key={i} style={{ position: 'relative', width: 84, height: 84, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--portal-border)', background: '#000' }}>
                        {isVideo ? <video src={url} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <img src={url} alt={f.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                        <button onClick={() => removerArquivo(i)} style={{ position: 'absolute', top: 3, right: 3, background: 'rgba(0,0,0,0.6)', border: 'none', cursor: 'pointer', width: 20, height: 20, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <X size={12} color="#fff" />
                        </button>
                        <span style={{ position: 'absolute', bottom: 0, left: 0, right: 0, fontSize: 9, color: '#fff', background: 'rgba(0,0,0,0.5)', padding: '1px 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{formatBytes(f.size)}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowModal(false)} style={{ flex: 1, padding: 12, borderRadius: 10, fontSize: 14, fontWeight: 700, background: 'var(--portal-bg-secondary)', color: 'var(--portal-text-secondary)', border: 'none', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={criarOpa} disabled={enviando || !titulo.trim()} style={{
                flex: 1, padding: 12, borderRadius: 10, fontSize: 14, fontWeight: 700,
                background: '#dc2626', color: '#fff', border: 'none', cursor: 'pointer',
                opacity: (enviando || !titulo.trim()) ? 0.5 : 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}>
                <Send size={16} /> {enviando ? 'Publicando...' : 'Publicar Opa'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
