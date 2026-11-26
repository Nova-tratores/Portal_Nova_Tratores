'use client'
// MODO AGORA (24/11/2026) — o item da vez, grande, com Começar · Pausar · Concluir.
// Item da vez = o que está com o cronômetro rodando; senão, o 1º da fila de hoje (ou da semana).
// Começar: põe "em andamento" (se estava aberto) e liga o cronômetro (/api/trabalho/agora).
// Concluir: para o cronômetro e marca "resolvido" — quem pediu confirma depois, como sempre.
// "Pular" só mostra o próximo, sem mudar a ordem da fila.
// Modo foco (melhorias 3.3): Começar abre a tela limpa (ModoFoco). Com o cronômetro aberto, a tela
// volta sozinha ao recarregar — a não ser que a pessoa tenha saído do foco nesta sessão do navegador.
import { useEffect, useState } from 'react'
import { Play, Pause, Check, SkipForward, Timer, Clock3, Maximize2 } from 'lucide-react'
import { authHeaders } from '@/lib/auth/client'
import SeloAtrasado, { SeloUrgente } from '@/components/tickets/SeloAtrasado'
import type { ItemResumo } from '@/lib/trabalho/fila-server'
import { COR } from './estiloFila'
import ModoFoco from './ModoFoco'

/** Saiu do foco desta sessão do cronômetro: não reabre sozinho ao recarregar. */
const CHAVE_SAIU = 'foco-saiu'
const saiuDe = () => { try { return sessionStorage.getItem(CHAVE_SAIU) || '' } catch { return '' } }
const marcarSaiu = (inicio: string) => { try { sessionStorage.setItem(CHAVE_SAIU, inicio) } catch { /* sem storage */ } }

export interface Agora { rodando: { ticket_id: string; inicio: string; antes?: number } | null; horas: Record<string, number>; semTabela?: boolean }

const br = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
const nf = (h: number) => String(Math.round(h * 10) / 10).replace('.', ',')
const relogio = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` }

/** Erro com o que o servidor mandou (o 409 do limite traz os pedidos em andamento). */
class ErroApi extends Error { constructor(msg: string, public status: number, public dados: Record<string, unknown>) { super(msg) } }
async function post(url: string, corpo: Record<string, unknown>) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) }, body: JSON.stringify(corpo) })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new ErroApi(j.error || 'Não deu certo', r.status, j)
}

export default function ModoAgora({ itens, agora, onMudou, onAbrir, compacto }: {
  /** A fila na ordem (hoje + semana + depois). */
  itens: ItemResumo[]
  agora: Agora | null
  onMudou: () => void
  onAbrir: (id: string) => void
  compacto?: boolean
}) {
  const [pulo, setPulo] = useState(0)
  const [agoraMs, setAgoraMs] = useState(() => Date.now())
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState('')
  // Limite de "fazendo" (melhorias 2.3): o servidor recusou com os pedidos em andamento → "Pausar qual?"
  const [pausarQual, setPausarQual] = useState<{ id: string; numero: number; titulo: string }[] | null>(null)
  const rodandoId = agora?.rodando?.ticket_id || null
  // Item da vez: o que está rodando; senão o 1º da fila (pulando os que a pessoa pulou).
  const base = rodandoId ? itens.find((i) => i.id === rodandoId) : undefined
  const livres = itens.filter((i) => i.id !== rodandoId)
  const item = base || livres[pulo % Math.max(1, livres.length)]
  const rodando = !!item && item.id === rodandoId
  // Modo foco: aberto por Começar; ao carregar, reabre se há sessão aberta (e a pessoa não saiu dela).
  const [foco, setFoco] = useState(false)
  // Sem cronômetro (falta o SQL): a tela de foco conta a partir do clique.
  const [focoLocal, setFocoLocal] = useState<string | null>(null)
  const inicioRodando = agora?.rodando?.inicio || ''
  useEffect(() => { if (inicioRodando && saiuDe() !== inicioRodando) setFoco(true) }, [inicioRodando])

  useEffect(() => {
    if (!rodando) return
    const t = setInterval(() => setAgoraMs(Date.now()), 1000)
    return () => clearInterval(t)
  }, [rodando])

  if (!item) return (
    <section className="mf-card mf-anim" style={{ padding: compacto ? '12px 16px' : '22px 22px' }}>
      <div className="mf-cab" style={{ marginBottom: 0 }}><span className="mf-ic" style={{ ['--c' as string]: '#059669' }}><Check size={18} /></span><h2>Fila vazia. Nada para agora.</h2></div>
    </section>
  )

  const fazer = async (passos: (() => Promise<void>)[]) => {
    setOcupado(true); setErro('')
    try { for (const p of passos) await p(); setPulo(0); setPausarQual(null); onMudou() }
    catch (e) {
      if (e instanceof ErroApi && e.status === 409 && Array.isArray(e.dados.emAndamento)) setPausarQual(e.dados.emAndamento as { id: string; numero: number; titulo: string }[])
      else setErro(e instanceof Error ? e.message : 'Não deu certo')
    } finally { setOcupado(false) }
  }
  const comecar = () => fazer([
    ...(item.status === 'aberto' ? [() => post(`/api/tickets/${item.id}/acoes`, { acao: 'status', para: 'em_andamento' })] : []),
    ...(agora?.semTabela ? [] : [() => post('/api/trabalho/agora', { acao: 'comecar', ticket_id: item.id })]),
    async () => { setFocoLocal(new Date().toISOString()); setFoco(true) },
  ])
  const sairDoFoco = () => { if (inicioRodando) marcarSaiu(inicioRodando); setFoco(false) }
  const pausar = () => fazer([() => post('/api/trabalho/agora', { acao: 'pausar' }), async () => setFoco(false)])
  const concluir = () => {
    if (!window.confirm(`Concluir "#${item.numero} ${item.titulo}"? Quem pediu vai confirmar.`)) return
    fazer([
      ...(rodando ? [() => post('/api/trabalho/agora', { acao: 'pausar' })] : []),
      () => post(`/api/tickets/${item.id}/acoes`, { acao: 'status', para: 'resolvido' }),
      async () => setFoco(false),
    ])
  }

  // horas reais já gastas (a API soma até o momento da carga, inclusive a sessão aberta)
  const gasto = agora?.horas[item.id] || 0
  const decorrido = rodando && agora?.rodando ? agoraMs - Date.parse(agora.rodando.inicio) : 0
  // Azul = pode começar · verde = está fazendo (regra de cores em estiloFila.ts)
  const cor = rodando ? COR.ok : COR.acao

  // Item do foco: o que está rodando (ou, sem cronômetro, o que acabou de começar).
  const itemFoco = rodando ? item : agora?.semTabela && focoLocal ? item : null
  return (
    <>
    {foco && itemFoco && (
      <ModoFoco item={itemFoco} inicio={rodando ? agora?.rodando?.inicio || null : focoLocal}
        gastoAntes={rodando ? agora?.rodando?.antes || 0 : 0} semCronometro={!!agora?.semTabela}
        ocupado={ocupado} onPausar={pausar} onConcluir={concluir} onSair={sairDoFoco} />
    )}
    <section className="mf-card mf-anim" aria-label="Agora" style={{ padding: compacto ? '12px 16px' : '20px 22px', borderColor: `color-mix(in srgb,${cor} 45%,var(--portal-border,#e2e8f0))`, borderWidth: 1.5 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <span className="mf-ic" style={{ ['--c' as string]: cor, width: compacto ? 40 : 52, height: compacto ? 40 : 52, borderRadius: 14 }}>{rodando ? <Timer size={compacto ? 18 : 24} /> : <Play size={compacto ? 18 : 24} />}</span>
        <span style={{ flex: '1 1 300px', minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 12.5, color: cor }}>{rodando ? 'Fazendo agora' : 'Agora é a vez de'}</span>
          <button className="mf-tit" style={{ fontSize: compacto ? 16 : 20, whiteSpace: 'normal' }} onClick={() => onAbrir(item.id)}>#{item.numero} {item.titulo}</button>
          <span className="mf-info" style={{ marginTop: 6 }}>
            <span>{item.pedidoPor ? `pedido de ${item.pedidoPor.split(' ')[0]}` : 'você mesmo'}</span>
            {item.quadro && <span style={{ ['--c' as string]: item.quadro.cor }}><i className="mf-dot" /> {item.quadro.nome}</span>}
            <span>{gasto > 0 ? `${nf(gasto)} h feitas de ${nf(item.horas)} h` : `${nf(item.horas)} h${item.horas > 4.5 ? ` · uns ${Math.ceil(item.horas / 4.5)} dias` : ''}`}</span>
          </span>
          <span style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            {item.atrasado && item.prazo ? <SeloAtrasado tamanho={12.5}>atrasado desde {br(item.prazo)}</SeloAtrasado>
              : item.prazo ? <span className="mf-quando"><Clock3 size={13} style={{ verticalAlign: -2 }} /> prazo {br(item.prazo)}</span> : null}
            {item.urgente && <SeloUrgente tamanho={12} />}
          </span>
        </span>
        {rodando && <span style={{ fontSize: compacto ? 20 : 28, fontWeight: 500, fontVariantNumeric: 'tabular-nums', color: cor }} aria-live="off">{relogio(decorrido)}</span>}
        <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {rodando && <button className="mf-btn" onClick={() => setFoco(true)} title="Tela limpa: só este pedido, o cronômetro e o checklist"><Maximize2 size={16} /> Foco</button>}
          {rodando
            ? <button className="mf-btn" disabled={ocupado} onClick={pausar}><Pause size={16} /> Pausar</button>
            : <button className="mf-btn cheio" style={{ ['--c' as string]: COR.acao }} disabled={ocupado} onClick={comecar}><Play size={16} /> Começar</button>}
          <button className="mf-btn cheio" style={{ ['--c' as string]: COR.ok }} disabled={ocupado} onClick={concluir}><Check size={16} /> Concluir</button>
          {!rodando && livres.length > 1 && <button className="mf-btn" disabled={ocupado} onClick={() => setPulo((p) => p + 1)} title="Ver o próximo da fila (não muda a ordem)"><SkipForward size={16} /> Pular</button>}
        </span>
      </div>
      {pausarQual && (
        <div className="mf-aviso" style={{ marginTop: 12, flexDirection: 'column', alignItems: 'stretch' }}>
          <span><b style={{ fontWeight: 500 }}>Você já tem {pausarQual.length} pedidos em andamento.</b> Pause um para começar o #{item.numero}:</span>
          {pausarQual.map((p) => (
            <span key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ flex: 1, minWidth: 0 }}>#{p.numero} {p.titulo}</span>
              <button className="mf-btn peq" disabled={ocupado} onClick={() => fazer([
                () => post(`/api/tickets/${p.id}/acoes`, { acao: 'status', para: 'aberto' }),
                ...(agora?.semTabela ? [] : [() => post('/api/trabalho/agora', { acao: 'pausar', ticket_id: p.id })]),
                ...(item.status === 'aberto' ? [() => post(`/api/tickets/${item.id}/acoes`, { acao: 'status', para: 'em_andamento' })] : []),
                ...(agora?.semTabela ? [] : [() => post('/api/trabalho/agora', { acao: 'comecar', ticket_id: item.id })]),
              ])}><Pause size={14} /> Pausar este e começar o #{item.numero}</button>
            </span>
          ))}
          <button className="mf-btn peq" style={{ alignSelf: 'flex-start' }} onClick={() => setPausarQual(null)}>Deixar como está</button>
        </div>
      )}
      {agora?.semTabela && <div style={{ marginTop: 8, fontSize: 12.5, color: 'var(--portal-text-muted,#64748b)' }}>Cronômetro desligado: falta rodar sql/fila-tempo.sql no Supabase. Começar e Concluir funcionam.</div>}
      {erro && <div style={{ marginTop: 8, fontSize: 13, color: 'var(--cor-atrasado-texto)' }}>{erro}</div>}
    </section>
    </>
  )
}
