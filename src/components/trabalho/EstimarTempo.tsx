'use client'
// ESTIMAR O TEMPO (24/11/2026) — "tenho dificuldade de dar tempos para os trabalhos".
// Manual fácil: escolhe um TAMANHO (ou digita as horas). Automático: o tamanho SUGERIDO vem
// marcado, com o motivo. Cada tamanho mostra QUANDO TERMINA, e em cima diz quando COMEÇA e
// quantos trabalhos estão na frente (pedido novo entra no FIM da fila de quem faz).
// Dois usos:
//  · ticket que existe (ticketId): grava dias × horas/dia pela /api/tickets/[id]/acoes (editar);
//    com aceitar=true, aceita o pedido antes.
//  · pedido que ainda vai ser criado (pedido={userId,titulo}): só ESCOLHE (onEscolher) — o
//    formulário de pedido manda as horas junto ao criar.
import { useEffect, useState } from 'react'
import { Sparkles, Check, X, Clock3 } from 'lucide-react'
import { authHeaders } from '@/lib/auth/client'
import { planoDeHoras } from '@/lib/trabalho/estimativa'
import { COR } from './estiloFila'

interface TamanhoComFim { id: string; rotulo: string; horas: number; dica: string; termina: string }
interface Resp { atual: number | null; capacidade: number; naFrente: number; comeca: string; sugestao: { horas: number; tamanho: { id: string }; motivo: string; termina: string } | null; tamanhos: TamanhoComFim[] }

const br = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
const nf = (h: number) => String(h).replace('.', ',')

async function post(url: string, corpo: Record<string, unknown>) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) }, body: JSON.stringify(corpo) })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error || 'Não deu certo')
}

export default function EstimarTempo({ ticketId, pedido, titulo, aceitar, onFechar, onSalvo, onEscolher }: {
  ticketId?: string
  /** Pedido ainda não criado: de quem é a fila e o título (a sugestão usa o título). */
  pedido?: { userId: string; titulo: string; categoria?: string }
  titulo: string
  aceitar?: boolean
  onFechar?: () => void
  onSalvo?: () => void
  /** Modo pedido: avisa as horas escolhidas (null = ainda não escolheu). */
  onEscolher?: (horas: number | null) => void
}) {
  const [d, setD] = useState<Resp | null>(null)
  const [horas, setHoras] = useState<number | null>(null)
  const [manual, setManual] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const modoPedido = !ticketId && !!pedido
  const chave = ticketId ? `ticket=${ticketId}` : pedido ? `user=${pedido.userId}&titulo=${encodeURIComponent(pedido.titulo)}${pedido.categoria ? `&categoria=${encodeURIComponent(pedido.categoria)}` : ''}` : ''

  useEffect(() => {
    if (!chave) return
    let vivo = true
    // No pedido o título muda enquanto a pessoa digita: espera ela parar um pouco.
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/trabalho/estimativa?${chave}`, { headers: await authHeaders(), cache: 'no-store' })
        const j = await r.json()
        if (!vivo) return
        if (!r.ok) { setErro(j.error || 'Não deu para calcular'); return }
        setD(j); setErro('')
        setHoras((h) => h ?? j.atual ?? j.sugestao?.horas ?? null)
      } catch { if (vivo) setErro('Falha de conexão') }
    }, modoPedido ? 600 : 0)
    return () => { vivo = false; clearTimeout(t) }
  }, [chave, modoPedido])

  const total = manual.trim() ? Number(manual.replace(',', '.')) : horas
  const valido = !!total && total >= 0.5 && total <= 600
  // Modo pedido: o formulário fica sabendo do tempo escolhido.
  useEffect(() => { if (modoPedido) onEscolher?.(valido ? total : null) }, [modoPedido, valido, total, onEscolher])
  const terminaDe = (h: number | null) => (h && d ? d.tamanhos.find((t) => t.horas === h)?.termina || (d.sugestao?.horas === h ? d.sugestao.termina : '') : '')

  const salvar = async () => {
    if (!valido || !d || !ticketId) return
    setSalvando(true); setErro('')
    try {
      if (aceitar) await post(`/api/tickets/${ticketId}/acoes`, { acao: 'aceite', decisao: 'confirmar' })
      const { dias, horasDia } = planoDeHoras(total!, d.capacidade)
      await post(`/api/tickets/${ticketId}/acoes`, { acao: 'editar', dias, horas_dia: horasDia })
      window.dispatchEvent(new Event('central-trabalho-mudou'))
      onSalvo?.()
    } catch (e) { setErro(e instanceof Error ? e.message : 'Não deu certo') } finally { setSalvando(false) }
  }

  return (
    <div className="mf-anim" style={{ marginTop: 8, padding: '12px 14px', borderRadius: 14, border: '1px solid color-mix(in srgb,#2563eb 30%,var(--portal-border,#e2e8f0))', background: 'color-mix(in srgb,#2563eb 4%,var(--portal-surface,#fefefe))' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <Clock3 size={16} color={COR.acao} />
        <span style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>{aceitar ? 'Aceitar e dizer quanto tempo leva' : 'Quanto tempo leva?'} {!modoPedido && <span style={{ color: 'var(--portal-text-muted,#64748b)', fontWeight: 400 }}>· {titulo}</span>}</span>
        {onFechar && <button onClick={onFechar} aria-label="Fechar" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--portal-text-muted,#64748b)', display: 'flex' }}><X size={16} /></button>}
      </div>

      {!d && !erro && <div className="mf-vazio">Calculando…</div>}
      {d && (
        <>
          {/* Quando começa: explica por que tamanhos pequenos podem terminar no mesmo dia */}
          {d.comeca && (
            <div style={{ fontSize: 13, color: 'var(--portal-text-secondary,#475569)', marginBottom: 6 }}>
              {d.naFrente > 0
                ? <>Entra no fim da fila{modoPedido ? ' dessa pessoa' : ''}: começa em <b style={{ fontWeight: 500 }}>{br(d.comeca)}</b>, depois de {d.naFrente} {d.naFrente === 1 ? 'trabalho' : 'trabalhos'}.</>
                : <>Fila livre: começa em <b style={{ fontWeight: 500 }}>{br(d.comeca)}</b>.</>}
            </div>
          )}
          {d.sugestao
            ? <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--portal-text-secondary,#475569)', marginBottom: 8, flexWrap: 'wrap' }}>
                <Sparkles size={14} color={COR.acao} /> Sugestão: <span style={{ color: COR.acao }}>{d.tamanhos.find((t) => t.id === d.sugestao!.tamanho.id)?.rotulo} · {nf(d.sugestao.horas)} h</span> — {d.sugestao.motivo}
              </div>
            : <div style={{ fontSize: 13, color: 'var(--portal-text-muted,#64748b)', marginBottom: 8 }}>Ainda não tenho histórico para sugerir. Escolha pelo tamanho; com o tempo, eu aprendo.</div>}
          <div role="radiogroup" aria-label="Tamanho do trabalho" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(118px,100%),1fr))', gap: 8 }}>
            {d.tamanhos.map((t) => {
              const on = !manual.trim() && horas === t.horas
              const sug = d.sugestao?.tamanho.id === t.id
              return (
                <button key={t.id} type="button" role="radio" aria-checked={on} onClick={() => { setHoras(t.horas); setManual('') }}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, padding: '9px 11px', borderRadius: 12, cursor: 'pointer', textAlign: 'left', font: 'inherit',
                    border: `1.5px ${sug && !on ? 'dashed' : 'solid'} ${on ? COR.acao : sug ? 'color-mix(in srgb,#2563eb 50%,transparent)' : 'var(--portal-border,#e2e8f0)'}`,
                    background: on ? 'color-mix(in srgb,#2563eb 10%,var(--portal-surface,#fefefe))' : 'var(--portal-surface,#fefefe)', color: 'var(--portal-text,#0f172a)' }}>
                  <span style={{ fontSize: 14, fontWeight: 500 }}>{t.rotulo}{sug && <span style={{ marginLeft: 6, fontSize: 11.5, color: COR.acao }}>sugerido</span>}</span>
                  <span style={{ fontSize: 12, color: 'var(--portal-text-muted,#64748b)' }}>{t.dica} · {nf(t.horas)} h</span>
                  {t.termina && <span style={{ fontSize: 12, color: 'var(--portal-text-secondary,#475569)' }}>termina {br(t.termina)}</span>}
                </button>
              )
            })}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--portal-text-secondary,#475569)' }}>
              ou digite: <input value={manual} onChange={(e) => setManual(e.target.value)} inputMode="decimal" placeholder="ex.: 6" aria-label="Horas (manual)"
                style={{ width: 70, height: 34, padding: '0 8px', borderRadius: 10, border: '1px solid var(--portal-border,#e2e8f0)', background: 'var(--portal-surface,#fefefe)', color: 'inherit' }} /> horas
            </label>
            <span style={{ flex: 1, fontSize: 13, color: 'var(--portal-text-secondary,#475569)' }}>
              {valido && !manual.trim() && terminaDe(total) && <>Previsão: termina <b style={{ fontWeight: 500, color: COR.acao }}>{br(terminaDe(total))}</b></>}
              {valido && manual.trim() && <>{nf(total!)} h = {planoDeHoras(total!, d.capacidade).dias} dia(s) de trabalho</>}
            </span>
            {!modoPedido && (
              <button type="button" className="mf-btn peq cheio" style={{ ['--c' as string]: COR.acao }} disabled={!valido || salvando} onClick={salvar}>
                <Check size={14} /> {salvando ? 'Salvando…' : aceitar ? 'Aceitar' : 'Salvar'}
              </button>
            )}
          </div>
        </>
      )}
      {erro && <div style={{ marginTop: 8, fontSize: 13, color: 'var(--cor-atrasado-texto)' }}>{erro}</div>}
    </div>
  )
}
