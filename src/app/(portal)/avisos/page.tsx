'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import { supabase } from '@/lib/supabase'
import { gateBtn, estiloSemPermissao } from '@/lib/permissoes/ui'
import {
  Plus, X, Paperclip, Send, Trash2, Eye, EyeOff,
  AlertTriangle, ChevronDown, ChevronUp, FileText,
  Download, CheckCircle2, Clock, Users, Megaphone
} from 'lucide-react'

interface ConfirmacaoInfo {
  nome: string
  quando: string
}

interface Aviso {
  id: string
  titulo: string
  conteudo: string
  prioridade: string
  criado_por: string
  criado_por_nome: string
  ativo: boolean
  created_at: string
  updated_at: string | null
  anexos?: Anexo[]
  lidos_count?: number
  lido_por_mim?: boolean
  confirmacoes?: ConfirmacaoInfo[]
}

interface Anexo {
  id: string
  aviso_id: string
  nome_arquivo: string
  url: string
  tipo: string | null
  tamanho: number | null
}

const PRIORIDADE_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  baixa: { label: 'Baixa', color: '#065F46', bg: '#D1FAE5', border: '#A7F3D0' },
  normal: { label: 'Normal', color: '#1E40AF', bg: '#DBEAFE', border: '#93C5FD' },
  alta: { label: 'Alta', color: '#92400E', bg: '#FEF3C7', border: '#FDE68A' },
  urgente: { label: 'Urgente', color: '#DC2626', bg: '#FEE2E2', border: '#FECACA' },
}

export default function AvisosPage() {
  const { userProfile } = useAuth()
  const { isAdmin, pode, loading: loadingPerm } = usePermissoes(userProfile?.id)
  const podeCriar = pode('avisos', 'criar')
  const podeStatus = pode('avisos', 'editar_status')
  const podeExcluir = pode('avisos', 'excluir')
  const [avisos, setAvisos] = useState<Aviso[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [expandido, setExpandido] = useState<string | null>(null)
  const [showInativos, setShowInativos] = useState(false)

  // Form
  const [titulo, setTitulo] = useState('')
  const [conteudo, setConteudo] = useState('')
  const [prioridade, setPrioridade] = useState('normal')
  const [arquivos, setArquivos] = useState<File[]>([])
  const [enviando, setEnviando] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const carregar = useCallback(async () => {
    if (!userProfile) return
    setLoading(true)

    const { data: avisosData } = await supabase
      .from('portal_avisos')
      .select('*')
      .order('created_at', { ascending: false })

    if (!avisosData) { setLoading(false); return }

    // Buscar anexos
    const ids = avisosData.map(a => a.id)
    const { data: anexosData } = ids.length > 0
      ? await supabase.from('portal_avisos_anexos').select('*').in('aviso_id', ids)
      : { data: [] }

    // Buscar confirmações do portal (users)
    const { data: lidosData } = ids.length > 0
      ? await supabase.from('portal_avisos_lidos').select('aviso_id, user_id, lido_at').in('aviso_id', ids)
      : { data: [] }

    // Buscar nomes dos usuários
    const userIds = [...new Set((lidosData || []).map((l: any) => l.user_id))]
    const { data: usersData } = userIds.length > 0
      ? await supabase.from('financeiro_usu').select('id, nome').in('id', userIds)
      : { data: [] }
    const userNomeMap: Record<string, string> = {}
    ;(usersData || []).forEach((u: any) => { userNomeMap[u.id] = u.nome })

    // Buscar confirmações dos mecânicos (avisos_gerais)
    const { data: mecConfData } = await supabase
      .from('avisos_gerais_confirmados')
      .select('aviso_id, tecnico_nome, confirmado_at')
      .order('confirmado_at', { ascending: true })

    // Mapear aviso do portal -> aviso_geral pelo titulo (criados juntos)
    const { data: avisosGeraisData } = await supabase
      .from('avisos_gerais')
      .select('id, titulo')
      .eq('ativo', true)
    const tituloToAvisoGeralId: Record<string, number[]> = {}
    ;(avisosGeraisData || []).forEach((ag: any) => {
      if (!tituloToAvisoGeralId[ag.titulo]) tituloToAvisoGeralId[ag.titulo] = []
      tituloToAvisoGeralId[ag.titulo].push(ag.id)
    })

    const anexosMap: Record<string, Anexo[]> = {}
    ;(anexosData || []).forEach((a: any) => {
      if (!anexosMap[a.aviso_id]) anexosMap[a.aviso_id] = []
      anexosMap[a.aviso_id].push(a)
    })

    const meusLidos = new Set<string>()
    ;(lidosData || []).forEach((l: any) => {
      if (l.user_id === userProfile.id) meusLidos.add(l.aviso_id)
    })

    // Montar confirmações por aviso
    const confirmMap: Record<string, ConfirmacaoInfo[]> = {}
    ;(lidosData || []).forEach((l: any) => {
      const nome = userNomeMap[l.user_id] || 'Usuário'
      if (!confirmMap[l.aviso_id]) confirmMap[l.aviso_id] = []
      confirmMap[l.aviso_id].push({ nome, quando: l.lido_at })
    })
    // Adicionar confirmações dos mecânicos
    const mecConfMap: Record<number, ConfirmacaoInfo[]> = {}
    ;(mecConfData || []).forEach((c: any) => {
      if (!mecConfMap[c.aviso_id]) mecConfMap[c.aviso_id] = []
      mecConfMap[c.aviso_id].push({ nome: c.tecnico_nome, quando: c.confirmado_at })
    })

    setAvisos(avisosData.map(a => {
      const confs = [...(confirmMap[a.id] || [])]
      // Encontrar avisos_gerais com mesmo titulo para puxar confirmações dos mecânicos
      const geralIds = tituloToAvisoGeralId[a.titulo] || []
      geralIds.forEach(gid => {
        ;(mecConfMap[gid] || []).forEach(mc => confs.push(mc))
      })
      confs.sort((x, y) => new Date(x.quando).getTime() - new Date(y.quando).getTime())
      return {
        ...a,
        anexos: anexosMap[a.id] || [],
        lidos_count: confs.length,
        lido_por_mim: meusLidos.has(a.id),
        confirmacoes: confs,
      }
    }))
    setLoading(false)
  }, [userProfile])

  useEffect(() => { carregar() }, [carregar])

  // Realtime
  useEffect(() => {
    const ch = supabase.channel('avisos_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'portal_avisos' }, () => carregar())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [carregar])

  const toggleExpandido = (id: string) => {
    setExpandido(expandido === id ? null : id)
  }

  const enviarAviso = async () => {
    if (!podeCriar) return
    if (!titulo.trim() || !conteudo.trim() || !userProfile) return
    setEnviando(true)

    // 1) Criar aviso
    const { data: aviso, error } = await supabase.from('portal_avisos').insert({
      titulo: titulo.trim(),
      conteudo: conteudo.trim(),
      prioridade,
      criado_por: userProfile.id,
      criado_por_nome: userProfile.nome || 'Admin',
    }).select().single()

    if (error || !aviso) { setEnviando(false); return }

    // 2) Upload de anexos
    for (const file of arquivos) {
      const ext = file.name.split('.').pop()
      const path = `avisos/${aviso.id}/${Date.now()}_${file.name}`
      const { error: upErr } = await supabase.storage.from('anexos').upload(path, file)
      if (!upErr) {
        const { data: urlData } = supabase.storage.from('anexos').getPublicUrl(path)
        await supabase.from('portal_avisos_anexos').insert({
          aviso_id: aviso.id,
          nome_arquivo: file.name,
          url: urlData.publicUrl,
          tipo: file.type || `application/${ext}`,
          tamanho: file.size,
        })
      }
    }

    // 3) Notificar todos os usuarios do portal
    const { data: usuarios } = await supabase.from('portal_permissoes').select('user_id')
    if (usuarios && usuarios.length > 0) {
      const uniqueUsers = [...new Set(usuarios.map((u: any) => u.user_id))]
      await supabase.from('portal_notificacoes').insert(
        uniqueUsers.filter(uid => uid !== userProfile.id).map(uid => ({
          user_id: uid,
          tipo: 'sistema',
          titulo: `Novo aviso: ${titulo.trim()}`,
          descricao: conteudo.trim().slice(0, 120),
          link: '/avisos',
        }))
      )
    }

    // 4) Inserir na avisos_gerais (app dos mecanicos)
    const { error: errAvisoGeral } = await supabase.from('avisos_gerais').insert({
      titulo: titulo.trim(),
      mensagem: conteudo.trim(),
      prioridade: prioridade === 'urgente' ? 'urgente' : 'normal',
      ativo: true,
      expira_em: null,
      criado_por: userProfile.nome || 'Admin',
    })

    // 5) Notificar mecanicos via mecanico_notificacoes (sininho + push)
    const { data: tecs } = await supabase.from('portal_permissoes')
      .select('mecanico_tecnico_nome')
      .not('mecanico_tecnico_nome', 'is', null)
    if (tecs && tecs.length > 0) {
      const nomes = [...new Set(tecs.map((t: any) => t.mecanico_tecnico_nome).filter(Boolean))]
      const { error: errNotifMec } = await supabase.from('mecanico_notificacoes').insert(
        nomes.map(nome => ({
          tecnico_nome: nome,
          tipo: 'aviso',
          titulo: `Aviso: ${titulo.trim()}`,
          descricao: conteudo.trim().slice(0, 200),
          link: '/',
          lida: false,
        }))
      )
    }

    // Reset
    setTitulo(''); setConteudo(''); setPrioridade('normal')
    setArquivos([]); setShowModal(false); setEnviando(false)
    carregar()
  }

  const toggleAtivo = async (aviso: Aviso) => {
    if (!podeStatus) return
    await supabase.from('portal_avisos').update({
      ativo: !aviso.ativo,
      updated_at: new Date().toISOString(),
    }).eq('id', aviso.id)
    carregar()
  }

  const excluirAviso = async (id: string) => {
    if (!podeExcluir) return
    if (!confirm('Tem certeza que deseja excluir este aviso?')) return
    await supabase.from('portal_avisos').delete().eq('id', id)
    carregar()
  }

  const removerArquivo = (idx: number) => {
    setArquivos(prev => prev.filter((_, i) => i !== idx))
  }

  const formatBytes = (bytes: number | null) => {
    if (!bytes) return ''
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1048576).toFixed(1)} MB`
  }

  const avisosFiltrados = showInativos ? avisos : avisos.filter(a => a.ativo)
  const naoLidos = avisos.filter(a => a.ativo && !a.lido_por_mim).length

  const INP: React.CSSProperties = { width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #E4E4E7', fontSize: 14, boxSizing: 'border-box', background: '#FAFAFA', outline: 'none', color: '#18181B', fontFamily: 'Inter, sans-serif' }

  if (loading && avisos.length === 0) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 80, color: '#9CA3AF', gap: 10 }}>
      <Clock size={16} style={{ animation: 'spin 1s linear infinite' }} />
      <span style={{ fontSize: 14 }}>Carregando avisos...</span>
    </div>
  )

  return (
    <div style={{ padding: '32px 40px', maxWidth: 900, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg, #dc2626, #b91c1c)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Megaphone size={22} color="#fff" />
            </div>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: '#111', margin: 0 }}>Avisos</h1>
            {naoLidos > 0 && (
              <span style={{ fontSize: 12, fontWeight: 700, background: '#DC2626', color: '#fff', padding: '3px 10px', borderRadius: 10 }}>
                {naoLidos} novo{naoLidos > 1 ? 's' : ''}
              </span>
            )}
          </div>
          <p style={{ fontSize: 14, color: '#737373', margin: 0 }}>Comunicados e avisos para toda a equipe</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {(podeCriar || podeStatus || podeExcluir) && (
            <>
              <button onClick={() => setShowInativos(!showInativos)} style={{
                display: 'flex', alignItems: 'center', gap: 5, padding: '9px 14px', borderRadius: 8,
                background: showInativos ? '#F0F0F0' : '#fff', border: '1px solid #E4E4E7',
                fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#555',
              }}>
                {showInativos ? <EyeOff size={14} /> : <Eye size={14} />}
                {showInativos ? 'Ocultar inativos' : 'Ver inativos'}
              </button>
              <button onClick={() => setShowModal(true)} {...gateBtn(podeCriar)} style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px', borderRadius: 10,
                background: '#111', color: '#fff', border: 'none',
                fontSize: 14, fontWeight: 700, cursor: 'pointer',
                ...estiloSemPermissao(podeCriar),
              }}>
                <Plus size={16} /> Novo Aviso
              </button>
            </>
          )}
        </div>
      </div>

      {/* Lista de Avisos */}
      {avisosFiltrados.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center', borderRadius: 16, background: '#fff', border: '1px solid #f0f0f0' }}>
          <Megaphone size={40} color="#e5e5e5" style={{ margin: '0 auto 16px', display: 'block' }} />
          <p style={{ fontSize: 16, fontWeight: 600, color: '#a3a3a3', margin: 0 }}>Nenhum aviso publicado</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {avisosFiltrados.map(aviso => {
            const prio = PRIORIDADE_CONFIG[aviso.prioridade] || PRIORIDADE_CONFIG.normal
            const isExpanded = expandido === aviso.id
            const isNovo = !aviso.lido_por_mim && aviso.ativo

            return (
              <div key={aviso.id} style={{
                borderRadius: 14, overflow: 'hidden', background: '#fff',
                border: `1px solid ${isNovo ? prio.border : '#f0f0f0'}`,
                boxShadow: isNovo ? `0 0 0 1px ${prio.border}` : '0 1px 3px rgba(0,0,0,0.04)',
                opacity: aviso.ativo ? 1 : 0.6,
              }}>
                {/* Barra de prioridade */}
                <div style={{ height: 3, background: isNovo ? prio.color : '#f0f0f0' }} />

                {/* Header do aviso */}
                <div
                  onClick={() => toggleExpandido(aviso.id)}
                  style={{ padding: '18px 22px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14 }}
                >
                  {/* Indicador novo */}
                  {isNovo && (
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: prio.color, flexShrink: 0 }} />
                  )}

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                      <span style={{ fontSize: 16, fontWeight: 700, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {aviso.titulo}
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: prio.bg, color: prio.color, flexShrink: 0 }}>
                        {prio.label}
                      </span>
                      {!aviso.ativo && (
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: '#F0F0F0', color: '#999' }}>Inativo</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, color: '#999' }}>
                      <span>{aviso.criado_por_nome}</span>
                      <span>{new Date(aviso.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                      {(aviso.anexos?.length || 0) > 0 && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                          <Paperclip size={11} /> {aviso.anexos!.length}
                        </span>
                      )}
                      <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                        <CheckCircle2 size={11} /> {aviso.lidos_count} confirmaram
                      </span>
                    </div>
                  </div>

                  {isExpanded ? <ChevronUp size={18} color="#999" /> : <ChevronDown size={18} color="#999" />}
                </div>

                {/* Conteudo expandido */}
                {isExpanded && (
                  <div style={{ padding: '0 22px 20px', borderTop: '1px solid #f5f5f5' }}>
                    <div style={{ padding: '16px 0', fontSize: 14, lineHeight: 1.7, color: '#333', whiteSpace: 'pre-wrap' }}>
                      {aviso.conteudo}
                    </div>

                    {/* Anexos */}
                    {aviso.anexos && aviso.anexos.length > 0 && (
                      <div style={{ marginTop: 8 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#555', marginBottom: 8 }}>Anexos</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {aviso.anexos.map(anexo => (
                            <a key={anexo.id} href={anexo.url} target="_blank" rel="noopener noreferrer"
                              style={{
                                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                                borderRadius: 8, background: '#FAFAFA', border: '1px solid #E8E8E8',
                                textDecoration: 'none', color: '#333', transition: 'background 0.15s',
                              }}
                              onMouseEnter={e => { e.currentTarget.style.background = '#F0F0F0' }}
                              onMouseLeave={e => { e.currentTarget.style.background = '#FAFAFA' }}
                            >
                              <FileText size={16} color="#dc2626" />
                              <span style={{ flex: 1, fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {anexo.nome_arquivo}
                              </span>
                              {anexo.tamanho && (
                                <span style={{ fontSize: 11, color: '#999' }}>{formatBytes(anexo.tamanho)}</span>
                              )}
                              <Download size={14} color="#999" />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Confirmações */}
                    {isAdmin && aviso.confirmacoes && aviso.confirmacoes.length > 0 && (
                      <div style={{ marginTop: 14 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#555', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <CheckCircle2 size={13} color="#10B981" />
                          {aviso.confirmacoes.length} pessoa{aviso.confirmacoes.length > 1 ? 's' : ''} confirmaram
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {aviso.confirmacoes.map((c, i) => (
                            <span key={i} style={{
                              fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 8,
                              background: '#D1FAE5', color: '#065F46', border: '1px solid #A7F3D0',
                              display: 'flex', alignItems: 'center', gap: 5,
                            }}>
                              <CheckCircle2 size={11} />
                              {c.nome.split(' ').slice(0, 2).join(' ')}
                              <span style={{ fontSize: 10, color: '#059669', fontWeight: 500 }}>
                                {new Date(c.quando).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {isAdmin && aviso.confirmacoes && aviso.confirmacoes.length === 0 && (
                      <div style={{ marginTop: 14, fontSize: 12, color: '#EF4444', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <AlertTriangle size={13} /> Ninguem confirmou ainda
                      </div>
                    )}

                    {/* Acoes admin */}
                    {(podeStatus || podeExcluir) && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 16, paddingTop: 14, borderTop: '1px solid #f5f5f5' }}>
                      <button onClick={(e) => { e.stopPropagation(); toggleAtivo(aviso) }} {...gateBtn(podeStatus)} style={{
                        display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px',
                        borderRadius: 6, border: '1px solid #E4E4E7', background: '#fff',
                        fontSize: 12, fontWeight: 600, cursor: 'pointer', color: '#555',
                        ...estiloSemPermissao(podeStatus),
                      }}>
                        {aviso.ativo ? <EyeOff size={13} /> : <Eye size={13} />}
                        {aviso.ativo ? 'Desativar' : 'Reativar'}
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); excluirAviso(aviso.id) }} {...gateBtn(podeExcluir)} style={{
                        display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px',
                        borderRadius: 6, border: '1px solid #FECACA', background: '#fff',
                        fontSize: 12, fontWeight: 600, cursor: 'pointer', color: '#DC2626',
                        ...estiloSemPermissao(podeExcluir),
                      }}>
                        <Trash2 size={13} /> Excluir
                      </button>
                    </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Modal Novo Aviso */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 32, width: '100%', maxWidth: 560, maxHeight: '90vh', overflow: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: '#111', margin: 0 }}>Novo Aviso</h2>
              <button onClick={() => setShowModal(false)} style={{ background: '#F0F0F0', border: 'none', cursor: 'pointer', width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={16} color="#555" />
              </button>
            </div>

            {/* Titulo */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: '#333', display: 'block', marginBottom: 6 }}>Titulo</label>
              <input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Titulo do aviso..." style={INP} />
            </div>

            {/* Conteudo */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: '#333', display: 'block', marginBottom: 6 }}>Conteudo</label>
              <textarea value={conteudo} onChange={e => setConteudo(e.target.value)} placeholder="Escreva o aviso aqui..."
                rows={6} style={{ ...INP, resize: 'vertical', lineHeight: 1.6 }} />
            </div>

            {/* Prioridade */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: '#333', display: 'block', marginBottom: 6 }}>Prioridade</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {Object.entries(PRIORIDADE_CONFIG).map(([key, cfg]) => (
                  <button key={key} onClick={() => setPrioridade(key)} style={{
                    flex: 1, padding: '9px 0', borderRadius: 8, fontSize: 13, fontWeight: 700,
                    border: `2px solid ${prioridade === key ? cfg.color : '#E4E4E7'}`,
                    background: prioridade === key ? cfg.bg : '#fff',
                    color: prioridade === key ? cfg.color : '#999',
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}>
                    {cfg.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Anexos */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: '#333', display: 'block', marginBottom: 6 }}>Anexos</label>
              <input ref={fileRef} type="file" multiple onChange={e => {
                const files = Array.from(e.target.files || [])
                setArquivos(prev => [...prev, ...files])
                if (fileRef.current) fileRef.current.value = ''
              }} style={{ display: 'none' }} />
              <button onClick={() => fileRef.current?.click()} style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '14px',
                borderRadius: 8, border: '2px dashed #D4D4D4', background: '#FAFAFA',
                fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#737373', justifyContent: 'center',
              }}>
                <Paperclip size={16} /> Adicionar arquivos
              </button>
              {arquivos.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
                  {arquivos.map((f, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 6, background: '#F5F5F5', border: '1px solid #E8E8E8' }}>
                      <FileText size={14} color="#dc2626" />
                      <span style={{ flex: 1, fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                      <span style={{ fontSize: 11, color: '#999' }}>{formatBytes(f.size)}</span>
                      <button onClick={() => removerArquivo(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex' }}>
                        <X size={14} color="#999" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Aviso */}
            <div style={{ background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 8, padding: '10px 14px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
              <AlertTriangle size={16} color="#D97706" />
              <span style={{ fontSize: 12, color: '#92400E', fontWeight: 500 }}>
                Este aviso sera enviado para <strong>todos os usuarios</strong> do portal e tambem para os <strong>mecanicos</strong> no app.
              </span>
            </div>

            {/* Botoes */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowModal(false)} style={{
                flex: 1, padding: 12, borderRadius: 10, fontSize: 14, fontWeight: 700,
                background: '#F0F0F0', color: '#555', border: 'none', cursor: 'pointer',
              }}>
                Cancelar
              </button>
              <button onClick={enviarAviso} disabled={enviando || !titulo.trim() || !conteudo.trim()} style={{
                flex: 1, padding: 12, borderRadius: 10, fontSize: 14, fontWeight: 700,
                background: '#111', color: '#fff', border: 'none', cursor: 'pointer',
                opacity: (enviando || !titulo.trim() || !conteudo.trim()) ? 0.5 : 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}>
                <Send size={16} /> {enviando ? 'Enviando...' : 'Publicar Aviso'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
