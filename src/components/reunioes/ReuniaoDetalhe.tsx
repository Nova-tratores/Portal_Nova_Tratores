'use client'
// Uma reunião, três modos conforme a etapa:
//   Pauta (agendada/pauta_fechada) · Condução (em_andamento, mobile-first) ·
//   Ata (ata_rascunho/ata_publicada). Dados de GET /api/reunioes/[id].
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Play, Square, FileCheck2, Copy, Users, Lock, Globe, Repeat, AlertTriangle, ParkingCircle, Plus, Check, UserCheck, Ban, MessageSquarePlus } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useIsMobile } from '@/hooks/useIsMobile'
import TicketModal from '@/components/tickets/TicketModal'
import StatusBadge from '@/components/tickets/StatusBadge'
import type { TicketStatus } from '@/lib/tickets/constantes'
import { ETAPA_INFO, type ItemPauta, type ItemResultado, type ItemTipo, type SaidaPendencia } from '@/lib/reunioes/regras'
import type { ReuniaoUI } from './tipos'
import BlocoPendencias from './BlocoPendencias'
import PautaItens from './PautaItens'
import FormAcaoReuniao from './FormAcaoReuniao'
import { cartao, botao, botaoClaro, campo, chip, chamar, EtapaChip, diaDe, horaDe, brCurto, primeiroNome } from './comum'

const ROTULO_ACEITE: Record<string, { label: string; cor: string }> = { ok: { label: 'confirmada', cor: '#059669' }, pendente: { label: 'aguardando confirmação', cor: '#d97706' }, recusado: { label: 'recusada', cor: '#dc2626' } }

export default function ReuniaoDetalhe({ id }: { id: string }) {
  const router = useRouter()
  const { userProfile } = useAuth()
  const isMobile = useIsMobile()
  const [d, setD] = useState<ReuniaoUI | null>(null)
  const [eventos, setEventos] = useState<{ id: string; tipo: string; payload: Record<string, unknown>; created_at: string; autor_id: string | null }[]>([])
  const [erro, setErro] = useState('')
  const [erroLista, setErroLista] = useState<string[]>([])
  const [ocupado, setOcupado] = useState(false)
  const [ticketAberto, setTicketAberto] = useState<string | null>(null)
  const [acaoDe, setAcaoDe] = useState<ItemPauta | null | false>(false)
  const [adendo, setAdendo] = useState('')
  const [copiado, setCopiado] = useState(false)
  const [parking, setParking] = useState('')

  const carregar = useCallback(async () => {
    try {
      const [j, t] = await Promise.all([
        chamar<ReuniaoUI>(`/api/reunioes/${id}`),
        chamar<{ eventos: typeof eventos }>(`/api/tickets/${id}`).catch(() => ({ eventos: [] })),
      ])
      setD(j); setEventos(t.eventos || []); setErro('')
    } catch (e) { setErro(e instanceof Error ? e.message : 'Falha ao carregar') }
  }, [id])
  useEffect(() => { if (userProfile) carregar() }, [carregar, userProfile])
  useEffect(() => {
    const f = () => carregar()
    window.addEventListener('central-trabalho-mudou', f); window.addEventListener('focus', f)
    return () => { window.removeEventListener('central-trabalho-mudou', f); window.removeEventListener('focus', f) }
  }, [carregar])

  const nome = useCallback((uid: string) => d?.usuarios[uid]?.nome || '—', [d])
  const acao = async (body: Record<string, unknown>) => {
    setOcupado(true); setErro(''); setErroLista([])
    try { await chamar(`/api/reunioes/${id}/acoes`, { json: body }); await carregar() }
    catch (e) { const err = e as Error & { pendentes?: string[] }; setErro(err.message); setErroLista(err.pendentes || []); throw e }
    finally { setOcupado(false) }
  }
  const itemAcao = async (body: Record<string, unknown>) => {
    setErro('')
    try { await chamar(`/api/reunioes/${id}/itens`, { json: body }); await carregar() }
    catch (e) { setErro(e instanceof Error ? e.message : 'Falha'); throw e }
  }

  const modo = useMemo<'pauta' | 'conducao' | 'ata'>(() => {
    const e = d?.reuniao.reuniao_etapa
    if (e === 'em_andamento') return 'conducao'
    if (e === 'ata_rascunho' || e === 'ata_publicada') return 'ata'
    return 'pauta'
  }, [d])
  const adendos = useMemo(() => eventos.filter((e) => e.tipo === 'ata_adendo'), [eventos])

  if (erro && !d) return <div style={{ padding: 30, color: '#dc2626', fontWeight: 600 }}>{erro}</div>
  if (!d) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--portal-text-muted,#888)' }}>Carregando reunião…</div>

  const r = d.reuniao
  const etapa = r.reuniao_etapa as keyof typeof ETAPA_INFO
  const cancelada = etapa === 'cancelada'
  const publicada = etapa === 'ata_publicada'
  const corteFechado = d.etapa_efetiva !== 'agendada'
  const conduz = d.posso_conduzir
  const participo = !!d.meu_papel
  const msAteCorte = d.corte_em ? new Date(d.corte_em).getTime() - Date.now() : null
  const horasAteCorte = msAteCorte != null ? Math.max(0, Math.floor(msAteCorte / 3600000)) : null

  const cabecalho = (
    <div style={{ ...cartao, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--portal-text-muted,#999)' }}>Reunião #{r.numero}</span>
        <EtapaChip etapa={etapa} />
        {d.serie && <span style={chip('#4f46e5', 'rgba(79,70,229,.1)')}><Repeat size={11} /> {d.serie.nome}</span>}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--portal-text-muted,#999)' }}>{r.visibilidade === 'privado' ? <><Lock size={11} /> privada</> : <><Globe size={11} /> pública</>}</span>
        <span style={{ flex: 1 }} />
        {modo === 'pauta' && !cancelada && conduz && (
          <>
            <button onClick={() => { if (window.confirm('Cancelar esta reunião?')) acao({ acao: 'etapa', para: 'cancelada' }).catch(() => {}) }} disabled={ocupado} style={botaoClaro()}><Ban size={14} /> Cancelar</button>
            <button onClick={() => acao({ acao: 'etapa', para: 'em_andamento' }).catch(() => {})} disabled={ocupado} style={botao('#d97706')}><Play size={14} /> Iniciar reunião</button>
          </>
        )}
        {modo === 'conducao' && conduz && (
          <button onClick={() => acao({ acao: 'etapa', para: 'ata_rascunho' }).catch(() => {})} disabled={ocupado} style={botao('#7c3aed')}><Square size={14} /> Encerrar e fechar ata</button>
        )}
      </div>
      <h1 style={{ margin: 0, fontSize: isMobile ? 19 : 22, fontWeight: 800, color: 'var(--portal-text,#111)', lineHeight: 1.25 }}>{r.titulo}</h1>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', fontSize: 13, color: 'var(--portal-text-secondary,#555)' }}>
        <span><b>{diaDe(r.reuniao_inicio)}</b> às <b>{horaDe(r.reuniao_inicio)}</b> · {d.duracao_min} min</span>
        <span>Conduz: <b>{nome(d.condutor_id)}</b></span>
        <span>Secretário: <b>{d.secretario_id ? nome(d.secretario_id) : '—'}</b></span>
        <span title={d.presencas.map((p) => nome(p.usuario_id)).join(', ')}><Users size={13} style={{ verticalAlign: -2 }} /> {d.presencas.length} pessoas</span>
        {modo === 'pauta' && !cancelada && (horasAteCorte != null) && (
          corteFechado
            ? <span style={chip('#d97706', 'rgba(217,119,6,.12)')}>pauta fechada (corte {brCurto(d.corte_em?.slice(0, 10))} {horaDe(d.corte_em)})</span>
            : <span style={chip('#2563eb', 'rgba(37,99,235,.1)')}>corte em {horasAteCorte >= 24 ? `${Math.floor(horasAteCorte / 24)} d ${horasAteCorte % 24} h` : `${horasAteCorte} h`} ({brCurto(d.corte_em?.slice(0, 10))} {horaDe(d.corte_em)})</span>
        )}
        {d.meu_papel && <span style={chip('#059669', 'rgba(5,150,105,.1)')}>você: {d.meu_papel}</span>}
      </div>
      {d.aviso && <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#b45309' }}><AlertTriangle size={13} /> {d.aviso}</div>}
    </div>
  )

  const presencas = (modoConducao: boolean) => (
    <section style={cartao}>
      <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--portal-text,#111)', marginBottom: 8 }}><UserCheck size={15} style={{ verticalAlign: -3 }} /> Presenças</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {d.presencas.map((p) => {
          const pode = modoConducao && !publicada && (conduz || p.usuario_id === userProfile?.id)
          const cor = p.presente === true ? '#059669' : p.presente === false ? '#dc2626' : '#6b7280'
          return (
            <button key={p.usuario_id} disabled={!pode} onClick={() => acao({ acao: 'presenca', usuario_id: p.usuario_id, presente: p.presente === true ? false : true }).catch(() => {})}
              style={{ ...chip(cor, cor + '1f'), border: 'none', cursor: pode ? 'pointer' : 'default', padding: '6px 12px', fontSize: 13 }}>
              {p.presente === true ? <Check size={13} /> : p.presente === false ? <Ban size={13} /> : null} {primeiroNome(nome(p.usuario_id))}{p.papel !== 'participante' ? ` (${p.papel})` : ''}
            </button>
          )
        })}
      </div>
    </section>
  )

  const acoesDaReuniao = (
    <section style={cartao}>
      <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--portal-text,#111)', marginBottom: 8 }}>Ações nascidas aqui <span style={chip('#6b7280', 'rgba(107,114,128,.12)')}>{d.acoes.length}</span></div>
      {d.acoes.length === 0 && <div style={{ fontSize: 13, color: 'var(--portal-text-muted,#888)' }}>Nenhuma ação ainda.</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {d.acoes.map((a) => (
          <button key={a.id} onClick={() => setTicketAberto(a.id)} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', textAlign: 'left', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--portal-border,#e5e7eb)', background: 'var(--portal-surface,#fff)', cursor: 'pointer' }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--portal-text-muted,#999)' }}>#{a.numero}</span>
            <span style={{ flex: 1, minWidth: 140, fontSize: 13.5, fontWeight: 700, color: 'var(--portal-text,#111)' }}>{a.titulo}</span>
            <span style={{ fontSize: 12, color: 'var(--portal-text-muted,#888)' }}>{primeiroNome(nome(a.responsavel_id))} · até {brCurto(a.prazo)}</span>
            {a.aceite && ROTULO_ACEITE[a.aceite] && a.status !== 'cancelado' && <span style={chip(ROTULO_ACEITE[a.aceite].cor, ROTULO_ACEITE[a.aceite].cor + '1f')}>{ROTULO_ACEITE[a.aceite].label}</span>}
            <StatusBadge status={a.status as TicketStatus} />
          </button>
        ))}
      </div>
    </section>
  )

  const erroBox = (erro || erroLista.length > 0) && (
    <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(220,38,38,.08)', color: '#dc2626', fontSize: 13, fontWeight: 600 }}>
      {erro}{erroLista.length > 0 && <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontWeight: 500 }}>{erroLista.map((e, i) => <li key={i}>{e}</li>)}</ul>}
    </div>
  )

  const onTratar = async (ticketId: string, saida: SaidaPendencia, extra: Record<string, unknown>) => { await acao({ acao: 'tratar_pendencia', ticket_id: ticketId, saida, ...extra }) }
  const onResultado = async (itemId: string, res: { resultado: ItemResultado; decisao_texto?: string; decisao_motivo?: string }) => { await acao({ acao: 'item_resultado', item_id: itemId, ...res }) }
  const onIncluir = async (c: { pergunta: string; tipo: ItemTipo; tempo_min: number; parking?: boolean }) => { await itemAcao({ acao: 'incluir', ...c }) }
  const incluirParking = async () => {
    if (!parking.trim()) return
    await itemAcao({ acao: 'incluir', pergunta: parking.trim(), tipo: 'discutir', tempo_min: 5, parking: true }).catch(() => {})
    setParking('')
  }

  return (
    <div style={{ padding: isMobile ? '12px 10px 90px' : '18px 20px 40px', maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <button onClick={() => router.push('/reunioes')} style={{ display: 'flex', alignItems: 'center', gap: 6, border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--portal-text-muted,#888)', padding: 0, alignSelf: 'flex-start' }}><ArrowLeft size={15} /> Reuniões</button>
      {cabecalho}
      {erroBox}

      {/* ───────── MODO PAUTA ───────── */}
      {modo === 'pauta' && (
        <>
          <BlocoPendencias pend={d.pendencias} usuarios={d.usuarios} modoConducao={false} onAbrirTicket={setTicketAberto} />
          <PautaItens itens={d.itens} usuarios={d.usuarios} modo={cancelada ? 'leitura' : 'pauta'} podeEditar={!cancelada && (participo || conduz)} podeConduzir={conduz}
            duracaoMin={d.duracao_min} corteFechado={corteFechado}
            onIncluir={onIncluir} onReordenar={(ordem) => itemAcao({ acao: 'reordenar', ordem })} onRemover={(item_id) => itemAcao({ acao: 'remover', item_id })} onAbrirTicket={setTicketAberto} />
          {presencas(false)}
        </>
      )}

      {/* ───────── MODO CONDUÇÃO ───────── */}
      {modo === 'conducao' && (
        <>
          <BlocoPendencias pend={d.pendencias} usuarios={d.usuarios} modoConducao={conduz} onTratar={onTratar} onAbrirTicket={setTicketAberto} />
          <PautaItens itens={d.itens} usuarios={d.usuarios} modo="conducao" podeEditar={false} podeConduzir={conduz} duracaoMin={d.duracao_min} corteFechado
            onResultado={onResultado} onCriarAcao={(item) => setAcaoDe(item)} onAbrirTicket={setTicketAberto} />
          {acoesDaReuniao}
          {presencas(true)}
          {conduz && (
            <div style={{ position: isMobile ? 'fixed' : 'sticky', bottom: isMobile ? 0 : 8, left: 0, right: 0, zIndex: 50, padding: isMobile ? '10px 10px 12px' : 0, background: isMobile ? 'var(--portal-surface,#fff)' : 'transparent', borderTop: isMobile ? '1px solid var(--portal-border,#e5e7eb)' : 'none', boxShadow: isMobile ? '0 -6px 20px rgba(0,0,0,.08)' : 'none' }}>
              <div style={{ display: 'flex', gap: 8, maxWidth: 1100, margin: '0 auto' }}>
                <input value={parking} onChange={(e) => setParking(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') incluirParking() }} placeholder="Assunto fora da pauta → parking lot" style={{ ...campo, flex: 1 }} />
                <button onClick={incluirParking} disabled={!parking.trim()} style={{ ...botao('#6b7280', true), opacity: parking.trim() ? 1 : .5 }}><ParkingCircle size={16} /> Parking</button>
                <button onClick={() => setAcaoDe(null)} style={botao('#dc2626', true)}><Plus size={16} /> Ação</button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ───────── MODO ATA ───────── */}
      {modo === 'ata' && (
        <>
          {!publicada && (
            <section style={{ ...cartao, borderColor: 'rgba(124,58,237,.4)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <FileCheck2 size={16} color="#7c3aed" />
                <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--portal-text,#111)' }}>Rascunho da ata</span>
                <span style={{ fontSize: 12.5, color: 'var(--portal-text-muted,#888)', flex: 1 }}>Revise decisões, ações e presenças. Depois de publicada a ata não muda — só adendo.</span>
                {conduz && <button onClick={() => acao({ acao: 'publicar_ata' }).catch(() => {})} disabled={ocupado} style={botao('#059669')}><FileCheck2 size={14} /> Publicar ata</button>}
              </div>
            </section>
          )}
          {publicada && d.ata && (
            <section style={{ ...cartao, borderColor: 'rgba(5,150,105,.4)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                <FileCheck2 size={16} color="#059669" />
                <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--portal-text,#111)' }}>Ata publicada</span>
                <span style={{ fontSize: 12.5, color: 'var(--portal-text-muted,#888)' }}>por {nome(d.ata.publicada_por)} em {new Date(d.ata.publicada_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</span>
                <span style={{ flex: 1 }} />
                <button onClick={async () => { try { await navigator.clipboard.writeText(d.ata!.texto_whatsapp); setCopiado(true); setTimeout(() => setCopiado(false), 2000) } catch { /* sem clipboard */ } }} style={botao('#25D366')}><Copy size={14} /> {copiado ? 'Copiado!' : 'Copiar texto WhatsApp'}</button>
              </div>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 13.5, lineHeight: 1.5, padding: 12, borderRadius: 10, background: 'var(--portal-bg,#f9fafb)', color: 'var(--portal-text,#111)' }}>{d.ata.texto_whatsapp}</pre>
            </section>
          )}
          <PautaItens itens={d.itens} usuarios={d.usuarios} modo={publicada ? 'leitura' : 'conducao'} podeEditar={false} podeConduzir={conduz && !publicada} duracaoMin={d.duracao_min} corteFechado
            onResultado={publicada ? undefined : onResultado} onCriarAcao={publicada ? undefined : (item) => setAcaoDe(item)} onAbrirTicket={setTicketAberto} />
          {acoesDaReuniao}
          {presencas(!publicada)}
          <section style={cartao}>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--portal-text,#111)', marginBottom: 8 }}>Pendências tratadas nesta reunião</div>
            {eventos.filter((e) => e.tipo === 'pendencia_tratada').length === 0
              ? <div style={{ fontSize: 13, color: 'var(--portal-text-muted,#888)' }}>Nenhuma.</div>
              : <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--portal-text,#111)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {eventos.filter((e) => e.tipo === 'pendencia_tratada').map((e) => <li key={e.id}>#{String(e.payload.numero)} {String(e.payload.titulo || '')} — <b>{String(e.payload.saida).replace('_', ' ')}</b>{e.payload.para && e.payload.saida === 'novo_prazo' ? ` para ${brCurto(String(e.payload.para))}` : ''}</li>)}
                </ul>}
          </section>
          {publicada && (
            <section style={cartao}>
              <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--portal-text,#111)', marginBottom: 8 }}><MessageSquarePlus size={15} style={{ verticalAlign: -3 }} /> Adendos</div>
              {adendos.length === 0 && <div style={{ fontSize: 13, color: 'var(--portal-text-muted,#888)', marginBottom: 8 }}>Nenhum adendo. Correção depois da publicação entra aqui, nunca editando a ata.</div>}
              {adendos.map((e) => (
                <div key={e.id} style={{ padding: '8px 10px', borderRadius: 8, background: 'var(--portal-bg,#f9fafb)', marginBottom: 6, fontSize: 13 }}>
                  <div style={{ fontSize: 11.5, color: 'var(--portal-text-muted,#888)' }}>{e.autor_id ? nome(e.autor_id) : 'sistema'} · {new Date(e.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</div>
                  <div style={{ color: 'var(--portal-text,#111)', whiteSpace: 'pre-wrap' }}>{String(e.payload.texto || '')}</div>
                </div>
              ))}
              {conduz && (
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  <input value={adendo} onChange={(e) => setAdendo(e.target.value)} placeholder="Adicionar adendo…" style={{ ...campo, flex: 1 }} maxLength={4000} />
                  <button onClick={() => acao({ acao: 'adendo', texto: adendo }).then(() => setAdendo('')).catch(() => {})} disabled={!adendo.trim() || ocupado} style={{ ...botao('#7c3aed'), opacity: adendo.trim() ? 1 : .5 }}>Adicionar</button>
                </div>
              )}
            </section>
          )}
        </>
      )}

      {acaoDe !== false && (
        <FormAcaoReuniao tituloInicial={acaoDe?.decisao_texto || ''} categoriaInicial={r.categoria === 'Reunião' ? '' : r.categoria}
          descricaoInicial={acaoDe ? `Decidido em "${r.titulo}" — ${acaoDe.pergunta}\nDecisão: ${acaoDe.decisao_texto || ''}\nMotivo: ${acaoDe.decisao_motivo || ''}` : `Ação combinada em "${r.titulo}".`}
          onFechar={() => setAcaoDe(false)}
          onCriar={async (a) => { await acao({ acao: 'criar_acao', ...a, item_id: acaoDe ? acaoDe.id : undefined }); window.dispatchEvent(new Event('central-trabalho-mudou')) }} />
      )}
      {ticketAberto && <TicketModal id={ticketAberto} onFechar={() => setTicketAberto(null)} onMudou={() => carregar()} />}
    </div>
  )
}
