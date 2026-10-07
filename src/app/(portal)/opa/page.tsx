'use client'
// Opa — Ocorrências: qualquer um sinaliza algo fora do lugar (título, descrição,
// fotos/vídeos); fica aberto para todos até alguém marcar como resolvido
// (1º vence, RPC resolver_opa). Opa sobre um veículo da frota abre/fecha a
// pendência do carro pelo motor da frota (sql/opa-vinculo-veiculo.sql).
// A aba "Peças" do mesmo módulo fica em /opa/pecas.

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Car, Check, CheckCircle2, ChevronDown, ChevronUp, Clock, Eye, Film, Image as ImageIcon,
  Paperclip, Plus, Send, Trash2, User, X,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import { useAuditLog } from '@/hooks/useAuditLog'
import { useIsMobile } from '@/hooks/useIsMobile'
import { supabase } from '@/lib/supabase'
import { authHeaders } from '@/lib/auth/client'
import { BotaoPrincipal, OpaBarra } from '@/components/opa/pecas/comum'

const VERMELHO = '#dc2626'

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
  status: 'aberto' | 'resolvido'
  resolvido_por_nome: string | null
  resolvido_por_tipo: string | null
  resolvido_at: string | null
  responsavel: string | null
  solucao: string | null
  // vínculo com a frota (migração opa-vinculo-veiculo; ausente = Opa geral)
  vinculo_tipo?: string | null
  vinculo_ref?: string | null
  created_at: string
  anexos: OpaAnexo[]
  views: OpaView[]
}

interface Veiculo { placa: string; modelo: string | null }

type Aba = 'abertos' | 'concluidos'

const fmtData = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

function fmtBytes(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

// dispara o motor de pendências da frota: a pendência do Opa nasce/fecha NA HORA
async function dispararSyncFrota() {
  try {
    await fetch('/api/frota/pendencias/sync', { method: 'POST', headers: await authHeaders() })
  } catch { /* best-effort: o sync roda de novo quando a tela da frota abrir */ }
}

function useEstilos() {
  const isMobile = useIsMobile()
  const inp: React.CSSProperties = {
    width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--portal-border)', fontSize: isMobile ? 16 : 14,
    boxSizing: 'border-box', background: 'var(--portal-bg-card)', outline: 'none', color: 'var(--portal-text)', fontFamily: 'inherit',
  }
  const rotulo: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: 'var(--portal-text-secondary)', display: 'block', marginBottom: 6 }
  return { isMobile, inp, rotulo }
}

export default function OpaPage() {
  const { isMobile } = useEstilos()
  const { userProfile } = useAuth()
  const { isAdmin } = usePermissoes(userProfile?.id)
  const { log: auditLog } = useAuditLog()
  const [opas, setOpas] = useState<Opa[]>([])
  const [carregando, setCarregando] = useState(true)
  const [aba, setAba] = useState<Aba>('abertos')
  const [novo, setNovo] = useState(false)
  const [expandido, setExpandido] = useState<string | null>(null)
  const [usuarios, setUsuarios] = useState<string[]>([])

  const carregar = useCallback(async () => {
    const { data: lista } = await supabase.from('portal_opas').select('*').order('created_at', { ascending: false })
    if (!lista) { setCarregando(false); return }
    const ids = lista.map((o) => o.id as string)
    const [{ data: anexos }, { data: views }] = ids.length
      ? await Promise.all([
        supabase.from('portal_opas_anexos').select('*').in('opa_id', ids),
        supabase.from('portal_opas_views').select('opa_id, user_nome, visto_at').in('opa_id', ids),
      ])
      : [{ data: [] }, { data: [] }]

    const anexosPor: Record<string, OpaAnexo[]> = {}
    for (const a of (anexos || []) as OpaAnexo[]) (anexosPor[a.opa_id] ||= []).push(a)
    const viewsPor: Record<string, OpaView[]> = {}
    for (const v of (views || []) as { opa_id: string; user_nome: string | null; visto_at: string }[]) {
      (viewsPor[v.opa_id] ||= []).push({ nome: v.user_nome || 'Usuário', quando: v.visto_at })
    }
    setOpas((lista as Omit<Opa, 'anexos' | 'views'>[]).map((o) => ({
      ...o,
      anexos: anexosPor[o.id] || [],
      views: (viewsPor[o.id] || []).sort((a, b) => a.quando.localeCompare(b.quando)),
    })))
    setCarregando(false)
  }, [])

  useEffect(() => { Promise.resolve().then(carregar) }, [carregar])

  // usuários para o seletor de responsável
  useEffect(() => {
    supabase.from('financeiro_usu').select('nome').eq('ativo', true).order('nome')
      .then(({ data }) => setUsuarios(((data || []) as { nome: string | null }[]).map((u) => u.nome).filter((n): n is string => !!n)))
  }, [])

  // realtime: cards atualizam sozinhos ao criar/resolver
  useEffect(() => {
    const canal = supabase.channel('opas_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'portal_opas' }, () => carregar())
      .subscribe()
    return () => { supabase.removeChannel(canal) }
  }, [carregar])

  const registrarView = async (opa: Opa) => {
    if (!userProfile || opa.views.some((v) => v.nome === userProfile.nome)) return
    await supabase.from('portal_opas_views').upsert({
      opa_id: opa.id, user_id: userProfile.id, user_nome: userProfile.nome || 'Usuário', visto_at: new Date().toISOString(),
    }, { onConflict: 'opa_id,user_id' })
    carregar()
  }

  const alternar = (opa: Opa) => {
    if (expandido === opa.id) { setExpandido(null); return }
    setExpandido(opa.id)
    registrarView(opa)
  }

  const abertos = opas.filter((o) => o.status === 'aberto')
  const concluidos = opas.filter((o) => o.status === 'resolvido')
  const lista = aba === 'abertos' ? abertos : concluidos

  return (
    <div style={{ padding: isMobile ? '12px 12px 24px' : '16px 20px 28px', width: '100%', boxSizing: 'border-box' }}>
      <OpaBarra acao={<BotaoPrincipal cor={VERMELHO} onClick={() => setNovo(true)}><Plus size={16} /> Novo Opa</BotaoPrincipal>} />

      <div role="tablist" style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
        {([['abertos', 'Abertos', abertos.length], ['concluidos', 'Concluídos', concluidos.length]] as const).map(([k, rotulo, n]) => (
          <button key={k} role="tab" aria-selected={aba === k} type="button" onClick={() => setAba(k)} style={{
            display: 'flex', alignItems: 'center', gap: 7, padding: '7px 14px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
            border: `1.5px solid ${aba === k ? VERMELHO : 'var(--portal-border)'}`, fontSize: 13.5, fontWeight: 700,
            background: aba === k ? '#FEF2F2' : 'var(--portal-bg-card)', color: aba === k ? '#991B1B' : 'var(--portal-text-secondary)',
          }}>
            {rotulo} <span style={{ fontSize: 11.5, fontWeight: 800, opacity: 0.8 }}>{n}</span>
          </button>
        ))}
      </div>

      {carregando && opas.length === 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60, color: 'var(--portal-text-muted)', gap: 10 }}>
          <Clock size={16} style={{ animation: 'spin 1s linear infinite' }} /> Carregando…
        </div>
      ) : lista.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', borderRadius: 12, background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', color: 'var(--portal-text-muted)', fontWeight: 600 }}>
          {aba === 'abertos' ? <><CheckCircle2 size={28} color="#10B981" style={{ display: 'block', margin: '0 auto 8px' }} />Nenhum Opa aberto — tudo em ordem!</> : 'Nenhum Opa concluído ainda'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {lista.map((opa) => (
            <CartaoOpa key={opa.id} opa={opa} aberto={expandido === opa.id} onAlternar={() => alternar(opa)}
              isAdmin={isAdmin} usuarioId={userProfile?.id} usuarioNome={userProfile?.nome} usuarios={usuarios}
              onMudou={carregar} auditLog={auditLog} />
          ))}
        </div>
      )}

      {novo && userProfile && (
        <NovoOpa usuarioId={userProfile.id} usuarioNome={userProfile.nome || 'Usuário'} onFechar={() => setNovo(false)}
          onCriado={(id, titulo) => { auditLog({ sistema: 'opa', acao: 'criar', entidade: 'opa', entidade_id: id, entidade_label: `Opa: ${titulo}` }); setNovo(false); carregar() }} />
      )}
    </div>
  )
}

// ── Cartão de um Opa ────────────────────────────────────────────────

type AuditLog = ReturnType<typeof useAuditLog>['log']

function CartaoOpa({ opa, aberto, onAlternar, isAdmin, usuarioId, usuarioNome, usuarios, onMudou, auditLog }: {
  opa: Opa
  aberto: boolean
  onAlternar: () => void
  isAdmin: boolean
  usuarioId?: string
  usuarioNome?: string
  usuarios: string[]
  onMudou: () => void
  auditLog: AuditLog
}) {
  const { isMobile, inp, rotulo } = useEstilos()
  const [resolvendo, setResolvendo] = useState(false)
  const [editando, setEditando] = useState(false)
  const [resp, setResp] = useState('')
  const [sol, setSol] = useState('')
  const [salvando, setSalvando] = useState(false)
  const resolvido = opa.status === 'resolvido'
  const podeEditar = isAdmin || (!!usuarioId && opa.criado_por === usuarioId)

  const resolver = async () => {
    if (!usuarioId) return
    setResolvendo(true)
    await supabase.rpc('resolver_opa', { p_opa_id: opa.id, p_user_id: usuarioId, p_user_nome: usuarioNome || 'Usuário', p_user_tipo: 'portal' })
    auditLog({ sistema: 'opa', acao: 'resolver', entidade: 'opa', entidade_id: opa.id, entidade_label: `Opa: ${opa.titulo}` })
    if (opa.vinculo_tipo === 'veiculo') dispararSyncFrota()   // pendência do carro fecha na hora
    setResolvendo(false)
    onMudou()
  }

  const abrirEdicao = () => { setResp(opa.responsavel || ''); setSol(opa.solucao || ''); setEditando(true) }

  const salvarEdicao = async () => {
    setSalvando(true)
    await supabase.from('portal_opas').update({ responsavel: resp.trim() || null, solucao: sol.trim() || null }).eq('id', opa.id)
    auditLog({ sistema: 'opa', acao: 'editar', entidade: 'opa', entidade_id: opa.id, entidade_label: `Opa: ${opa.titulo}` })
    setSalvando(false)
    setEditando(false)
    onMudou()
  }

  const excluir = async () => {
    if (!confirm('Excluir este Opa?')) return
    await supabase.from('portal_opas').delete().eq('id', opa.id)
    onMudou()
  }

  const meta: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4 }
  const btnSec: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: '1px solid var(--portal-border)',
    background: 'var(--portal-bg-card)', color: 'var(--portal-text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
  }

  return (
    <div style={{ borderRadius: 12, overflow: 'hidden', background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', borderLeft: `4px solid ${resolvido ? '#10B981' : VERMELHO}` }}>
      <button type="button" onClick={onAlternar} aria-expanded={aberto} style={{
        width: '100%', textAlign: 'left', padding: isMobile ? '12px 12px' : '13px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
        background: 'none', border: 'none', fontFamily: 'inherit', color: 'inherit',
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--portal-text)', marginRight: 2 }}>{opa.titulo}</span>
            {opa.origem === 'mecanico' && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: '#FEF3C7', color: '#92400E' }}>MECÂNICO</span>}
            {opa.vinculo_tipo === 'veiculo' && opa.vinculo_ref && (
              <span title="Vinculado a um veículo da frota — vira pendência no carro" style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: '#DBEAFE', color: '#1E40AF', ...meta }}>
                <Car size={11} /> {opa.vinculo_ref}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: 'var(--portal-text-muted)', flexWrap: 'wrap', marginTop: 3 }}>
            {isAdmin && opa.criado_por_nome && <span style={meta}><User size={11} /> {opa.criado_por_nome}</span>}
            <span style={meta}><Clock size={11} /> {fmtData(opa.created_at)}</span>
            {opa.anexos.length > 0 && <span style={meta}><Paperclip size={11} /> {opa.anexos.length}</span>}
            <span style={meta}><Eye size={11} /> {opa.views.length}</span>
            {opa.responsavel && <span style={{ ...meta, color: VERMELHO, fontWeight: 600 }}><User size={11} /> {opa.responsavel}</span>}
            {resolvido && opa.resolvido_por_nome && (
              <span style={{ ...meta, color: '#059669', fontWeight: 600 }}>
                <CheckCircle2 size={11} /> {opa.resolvido_por_nome}{opa.resolvido_por_tipo === 'tecnico' ? ' (técnico)' : ''}
              </span>
            )}
          </div>
        </div>
        {aberto ? <ChevronUp size={18} color="#999" /> : <ChevronDown size={18} color="#999" />}
      </button>

      {aberto && (
        <div style={{ padding: isMobile ? '0 12px 14px' : '0 16px 16px', borderTop: '1px solid var(--portal-border)' }}>
          {opa.descricao && <p style={{ margin: '12px 0 0', fontSize: 14, lineHeight: 1.65, color: 'var(--portal-text-secondary)', whiteSpace: 'pre-wrap' }}>{opa.descricao}</p>}

          {opa.anexos.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? 90 : 110}px, 1fr))`, gap: 8, marginTop: 12 }}>
              {opa.anexos.map((a) => {
                const video = a.tipo?.startsWith('video')
                return (
                  <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer" style={{ display: 'block', aspectRatio: '1', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--portal-border)', position: 'relative', background: '#000' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {video ? <video src={a.url} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <img src={a.url} alt={a.nome_arquivo} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                    <span style={{ position: 'absolute', top: 5, right: 5, background: 'rgba(0,0,0,0.6)', borderRadius: 5, padding: 3, display: 'flex' }}>
                      {video ? <Film size={12} color="#fff" /> : <ImageIcon size={12} color="#fff" />}
                    </span>
                  </a>
                )
              })}
            </div>
          )}

          {/* Responsável + solução (criador ou admin) */}
          {editando ? (
            <div style={{ marginTop: 12, padding: 12, borderRadius: 10, background: 'var(--portal-bg-secondary)' }}>
              <label style={rotulo}>Responsável</label>
              <input list={`usuarios-${opa.id}`} value={resp} onChange={(e) => setResp(e.target.value)} placeholder="Quem vai resolver?" style={{ ...inp, marginBottom: 10 }} />
              <datalist id={`usuarios-${opa.id}`}>{usuarios.map((u) => <option key={u} value={u} />)}</datalist>
              <label style={rotulo}>Solução</label>
              <textarea value={sol} onChange={(e) => setSol(e.target.value)} rows={3} placeholder="Descreva a solução…" style={{ ...inp, resize: 'vertical', lineHeight: 1.6 }} />
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button type="button" disabled={salvando} onClick={salvarEdicao} style={{ ...btnSec, background: VERMELHO, color: '#fff', border: 'none', opacity: salvando ? 0.6 : 1 }}>
                  <Check size={14} /> {salvando ? 'Salvando…' : 'Salvar'}
                </button>
                <button type="button" onClick={() => setEditando(false)} style={btnSec}>Cancelar</button>
              </div>
            </div>
          ) : (opa.responsavel || opa.solucao) ? (
            <div style={{ marginTop: 12, padding: 12, borderRadius: 10, background: 'var(--portal-bg-secondary)', fontSize: 14, color: 'var(--portal-text)' }}>
              {opa.responsavel && <div style={{ marginBottom: opa.solucao ? 8 : 0 }}><b>Responsável:</b> {opa.responsavel}</div>}
              {opa.solucao && <div style={{ whiteSpace: 'pre-wrap', color: 'var(--portal-text-secondary)' }}><b style={{ color: '#059669' }}>Solução:</b> {opa.solucao}</div>}
            </div>
          ) : null}

          {opa.views.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center', marginTop: 12, fontSize: 12, color: 'var(--portal-text-muted)' }}>
              <Eye size={12} /> Viram:
              {opa.views.map((v) => (
                <span key={v.nome + v.quando} style={{ fontWeight: 600, padding: '2px 8px', borderRadius: 6, background: 'var(--portal-bg-secondary)', color: 'var(--portal-text-secondary)' }}>
                  {v.nome.split(' ').slice(0, 2).join(' ')}
                </span>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--portal-border)' }}>
            {!resolvido && (
              <button type="button" disabled={resolvendo} onClick={resolver} style={{ ...btnSec, background: '#10B981', color: '#fff', border: 'none', fontWeight: 700, opacity: resolvendo ? 0.6 : 1 }}>
                <Check size={15} /> {resolvendo ? 'Resolvendo…' : 'Marcar como resolvido'}
              </button>
            )}
            {resolvido && opa.resolvido_at && <span style={{ fontSize: 12, color: '#059669', fontWeight: 600, ...meta }}><CheckCircle2 size={14} /> Resolvido em {fmtData(opa.resolvido_at)}</span>}
            {podeEditar && !editando && (
              <button type="button" onClick={abrirEdicao} style={btnSec}><User size={14} /> {opa.responsavel || opa.solucao ? 'Editar responsável/solução' : 'Responsável e solução'}</button>
            )}
            {isAdmin && (
              <button type="button" onClick={excluir} style={{ ...btnSec, marginLeft: 'auto', color: VERMELHO, borderColor: '#FECACA' }}><Trash2 size={13} /> Excluir</button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Novo Opa ────────────────────────────────────────────────────────

function NovoOpa({ usuarioId, usuarioNome, onFechar, onCriado }: {
  usuarioId: string
  usuarioNome: string
  onFechar: () => void
  onCriado: (id: string, titulo: string) => void
}) {
  const { isMobile, inp, rotulo } = useEstilos()
  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [arquivos, setArquivos] = useState<File[]>([])
  const [vincTipo, setVincTipo] = useState<'' | 'veiculo'>('')
  const [placa, setPlaca] = useState('')
  const [veiculos, setVeiculos] = useState<Veiculo[]>([])
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const arqRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (vincTipo !== 'veiculo' || veiculos.length > 0) return
    supabase.from('frota_veiculos').select('placa, modelo, ativo, tipo_registro').order('placa').then(({ data }) => {
      const lista = (data || []) as { placa: string | null; modelo: string | null; ativo: boolean | null; tipo_registro: string | null }[]
      setVeiculos(lista.filter((v) => v.placa && v.tipo_registro === 'veiculo' && v.ativo !== false)
        .map((v) => ({ placa: String(v.placa).toUpperCase(), modelo: v.modelo })))
    })
  }, [vincTipo, veiculos.length])

  const publicar = async () => {
    const t = titulo.trim()
    if (!t) return
    setEnviando(true)
    setErro(null)
    const comVinculo = vincTipo === 'veiculo' && !!placa
    const registro: Record<string, unknown> = {
      titulo: t, descricao: descricao.trim() || null, criado_por: usuarioId, criado_por_nome: usuarioNome, origem: 'portal',
      ...(comVinculo ? { vinculo_tipo: 'veiculo', vinculo_ref: placa } : {}),
    }
    let { data: opa, error } = await supabase.from('portal_opas').insert(registro).select().single()
    // banco sem as colunas de vínculo (migração não rodou)? cria sem elas
    if (error && /vinculo/i.test(error.message || '')) {
      delete registro.vinculo_tipo
      delete registro.vinculo_ref
      ;({ data: opa, error } = await supabase.from('portal_opas').insert(registro).select().single())
    }
    if (error || !opa) { setErro('Não foi possível publicar. Confira a conexão e tente de novo.'); setEnviando(false); return }

    for (const file of arquivos) {
      const path = `opas/${opa.id}/${Date.now()}_${file.name}`
      const { error: upErr } = await supabase.storage.from('anexos').upload(path, file)
      if (upErr) continue
      const { data: url } = supabase.storage.from('anexos').getPublicUrl(path)
      await supabase.from('portal_opas_anexos').insert({
        opa_id: opa.id, nome_arquivo: file.name, url: url.publicUrl, tipo: file.type || `application/${file.name.split('.').pop()}`, tamanho: file.size,
      })
    }

    // sino de quem tem acesso ao Opa
    fetch('/api/opa/notificar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ opa_id: opa.id, titulo: t, descricao: descricao.trim() || null, criado_por_id: usuarioId }),
    }).catch(() => {})
    // vínculo com veículo: a pendência nasce agora (depois dos anexos, para a foto ir junto)
    if (comVinculo && opa.vinculo_tipo === 'veiculo') dispararSyncFrota()

    setEnviando(false)
    onCriado(opa.id, t)
  }

  return (
    <div onClick={onFechar} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: isMobile ? 'stretch' : 'center', justifyContent: 'center', zIndex: 10000 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--portal-bg-card)', borderRadius: isMobile ? 0 : 14, width: '100%', maxWidth: isMobile ? '100%' : 540, maxHeight: isMobile ? '100%' : '90vh', overflow: 'auto', boxSizing: 'border-box' }}>
        <div style={{ position: 'sticky', top: 0, display: 'flex', alignItems: 'center', padding: '12px 16px', background: 'var(--portal-bg-card)', borderBottom: '1px solid var(--portal-border)' }}>
          <span style={{ flex: 1, fontSize: 15, fontWeight: 800, color: 'var(--portal-text)' }}>Novo Opa</span>
          <button type="button" aria-label="Fechar" onClick={onFechar} style={{ width: 34, height: 34, borderRadius: 8, border: 'none', background: 'var(--portal-bg-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--portal-text)' }}><X size={17} /></button>
        </div>
        <div style={{ padding: isMobile ? 16 : 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {erro && <div role="alert" style={{ padding: 10, borderRadius: 8, background: '#FEF2F2', color: '#991B1B', fontSize: 13.5, fontWeight: 600 }}>{erro}</div>}
          <div>
            <label style={rotulo}>O que está fora do lugar?</label>
            <input autoFocus value={titulo} onChange={(e) => setTitulo(e.target.value)} style={inp} />
          </div>
          <div>
            <label style={rotulo}>Descrição <span style={{ fontWeight: 500 }}>(opcional)</span></label>
            <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={4} style={{ ...inp, resize: 'vertical', lineHeight: 1.6 }} />
          </div>
          <div>
            <label style={rotulo}>Sobre o quê? <span style={{ fontWeight: 500 }}>(opcional)</span></label>
            <div style={{ display: 'flex', gap: 8, flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
              <select value={vincTipo} onChange={(e) => { setVincTipo(e.target.value as '' | 'veiculo'); if (e.target.value !== 'veiculo') setPlaca('') }} style={{ ...inp, flex: vincTipo === 'veiculo' && !isMobile ? '0 0 45%' : 1 }}>
                <option value="">Geral (sem vínculo)</option>
                <option value="veiculo">Veículo da frota</option>
              </select>
              {vincTipo === 'veiculo' && (
                <select value={placa} onChange={(e) => setPlaca(e.target.value)} style={{ ...inp, flex: 1 }}>
                  <option value="">{veiculos.length ? 'Escolha o veículo…' : 'Carregando…'}</option>
                  {veiculos.map((v) => <option key={v.placa} value={v.placa}>{v.placa}{v.modelo ? ` — ${v.modelo}` : ''}</option>)}
                </select>
              )}
            </div>
            {vincTipo === 'veiculo' && placa && (
              <p style={{ fontSize: 12, color: '#1E40AF', margin: '6px 0 0', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Car size={13} /> Abre uma pendência no {placa} (Frota → Pendências) até este Opa ser resolvido.
              </p>
            )}
          </div>
          <div>
            <label style={rotulo}>Fotos ou vídeos</label>
            <input ref={arqRef} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => { setArquivos((a) => [...a, ...Array.from(e.target.files || [])]); e.target.value = '' }} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: 8 }}>
              {arquivos.map((f, i) => <MiniaturaArquivo key={`${f.name}-${i}`} arquivo={f} onRemover={() => setArquivos((a) => a.filter((_, j) => j !== i))} />)}
              <button type="button" onClick={() => arqRef.current?.click()} style={{ aspectRatio: '1', borderRadius: 8, border: '2px dashed var(--portal-border)', background: 'var(--portal-bg-secondary)', color: 'var(--portal-text-secondary)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: 12, fontWeight: 700, fontFamily: 'inherit' }}>
                <Paperclip size={18} /> Adicionar
              </button>
            </div>
          </div>
          <button type="button" onClick={publicar} disabled={enviando || !titulo.trim()} style={{
            padding: 13, borderRadius: 10, fontSize: 15, fontWeight: 800, background: VERMELHO, color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
            opacity: enviando || !titulo.trim() ? 0.5 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
            <Send size={16} /> {enviando ? 'Publicando…' : 'Publicar Opa'}
          </button>
        </div>
      </div>
    </div>
  )
}

function MiniaturaArquivo({ arquivo, onRemover }: { arquivo: File; onRemover: () => void }) {
  const [url] = useState(() => URL.createObjectURL(arquivo))
  useEffect(() => () => URL.revokeObjectURL(url), [url])
  const video = arquivo.type.startsWith('video')
  return (
    <div style={{ position: 'relative', aspectRatio: '1', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--portal-border)', background: '#000' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {video ? <video src={url} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <img src={url} alt={arquivo.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
      <button type="button" aria-label="Remover" onClick={onRemover} style={{ position: 'absolute', top: 3, right: 3, background: 'rgba(0,0,0,0.6)', border: 'none', cursor: 'pointer', width: 22, height: 22, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <X size={12} color="#fff" />
      </button>
      <span style={{ position: 'absolute', bottom: 0, left: 0, right: 0, fontSize: 9, color: '#fff', background: 'rgba(0,0,0,0.5)', padding: '1px 4px' }}>{fmtBytes(arquivo.size)}</span>
    </div>
  )
}

