'use client'
// FAXINA DOS PARADOS (melhorias-central-de-trabalho.md · 1.2, 24/11/2026). Um pedido por vez,
// quatro ações grandes e atalhos de teclado para zerar 20 itens em menos de 3 minutos:
//   F  Fazer agora  → topo da fila de quem faz (só quem faz)
//   D  Nova data    → 1 = +1 semana · 2 = +2 semanas · 3 = +1 mês · 4 = escolher
//   V  Devolver     → a bola volta para quem pediu, com o motivo (só quem faz)
//   C  Cancelar     → com motivo (só quem pediu ou admin — regra dos status)
//   →  Pular
// Tudo pelas rotas de sempre, então cai na timeline do pedido.
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Zap, CalendarClock, Undo2, CircleX, SkipForward, Check, ArrowLeft } from 'lucide-react'
import { authHeaders } from '@/lib/auth/client'
import { ESTILO_FILA, COR } from './estiloFila'

interface Item { id: string; numero: number; titulo: string; prazo: string | null; status: string; responsavel_id: string; solicitante_id: string; responsavel: string; solicitante: string; parado: number; vencido: number }

const br = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
const hojeISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
const somaDias = (iso: string, n: number) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
/** Prazo não cai no fim de semana: sábado/domingo vão para a segunda. */
const diaUtil = (iso: string) => { const w = new Date(iso + 'T12:00:00Z').getUTCDay(); return w === 6 ? somaDias(iso, 2) : w === 0 ? somaDias(iso, 1) : iso }
const primeiro = (n: string) => n.split(' ')[0]

async function post(url: string, corpo: Record<string, unknown>) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) }, body: JSON.stringify(corpo) })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error || 'Não deu certo')
}

type Modo = null | 'data' | 'devolver' | 'cancelar'

export default function Faxina() {
  const [itens, setItens] = useState<Item[] | null>(null)
  const [eu, setEu] = useState('')
  const [admin, setAdmin] = useState(false)
  const [k, setK] = useState(0)
  const [feitos, setFeitos] = useState(0)
  const [modo, setModo] = useState<Modo>(null)
  const [texto, setTexto] = useState('')
  const [data, setData] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState('')
  const campo = useRef<HTMLInputElement>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const r = await fetch('/api/trabalho/faxina', { headers: await authHeaders(), cache: 'no-store' })
        const j = await r.json()
        if (!r.ok) { setErro(j.error || 'Falha ao carregar'); setItens([]); return }
        setItens(j.itens || []); setEu(j.eu); setAdmin(!!j.admin)
      } catch { setErro('Falha de conexão'); setItens([]) }
    })()
  }, [])

  const item = itens?.[k]
  const souQuemFaz = !!item && item.responsavel_id === eu
  const souQuemPediu = !!item && item.solicitante_id === eu
  const podeTopo = souQuemFaz
  const podeDevolver = souQuemFaz && !souQuemPediu
  const podeCancelar = souQuemPediu || admin

  const proximo = useCallback((fez: boolean) => {
    setModo(null); setTexto(''); setData(''); setErro('')
    if (fez) setFeitos((n) => n + 1)
    setK((x) => x + 1)
  }, [])

  const fazer = useCallback(async (passos: (() => Promise<void>)[]) => {
    setOcupado(true); setErro('')
    try { for (const p of passos) await p(); proximo(true) }
    catch (e) { setErro(e instanceof Error ? e.message : 'Não deu certo') } finally { setOcupado(false) }
  }, [proximo])

  const topo = useCallback(() => { if (item && podeTopo) void fazer([() => post('/api/trabalho/faxina', { acao: 'topo', ticket_id: item.id })]) }, [item, podeTopo, fazer])
  const novaData = useCallback((dia: string) => {
    if (!item || !dia) return
    void fazer([() => post(`/api/tickets/${item.id}/acoes`, { acao: 'editar', prazo: diaUtil(dia) })])
  }, [item, fazer])
  const devolver = useCallback(() => {
    if (!item || !texto.trim()) return
    void fazer([
      () => post(`/api/tickets/${item.id}/acoes`, { acao: 'comentar', texto: `Devolvido na faxina: ${texto.trim()}` }),
      () => post(`/api/tickets/${item.id}/acoes`, { acao: 'transferir', para: item.solicitante_id, motivo: texto.trim() }),
    ])
  }, [item, texto, fazer])
  const cancelar = useCallback(() => {
    if (!item || !texto.trim()) return
    void fazer([() => post(`/api/tickets/${item.id}/acoes`, { acao: 'status', para: 'cancelado', motivo: `Faxina: ${texto.trim()}` })])
  }, [item, texto, fazer])

  // Teclado: F / D / V / C / → (e 1–4 dentro de "Nova data"). Não atrapalha quem está digitando.
  useEffect(() => {
    const t = (e: KeyboardEvent) => {
      if (!item || ocupado) return
      const digitando = (e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA'
      if (e.key === 'Escape') { setModo(null); return }
      if (digitando) { if (e.key === 'Enter') { if (modo === 'devolver') devolver(); if (modo === 'cancelar') cancelar() } return }
      const tecla = e.key.toLowerCase()
      const hoje = hojeISO()
      if (modo === 'data' && ['1', '2', '3'].includes(tecla)) { novaData(somaDias(hoje, tecla === '1' ? 7 : tecla === '2' ? 14 : 30)); return }
      if (modo === 'data' && tecla === '4') { document.getElementById('fx-data')?.focus(); return }
      if (tecla === 'f' && podeTopo) topo()
      else if (tecla === 'd') setModo('data')
      else if (tecla === 'v' && podeDevolver) { setModo('devolver'); setTimeout(() => campo.current?.focus(), 0) }
      else if (tecla === 'c' && podeCancelar) { setModo('cancelar'); setTimeout(() => campo.current?.focus(), 0) }
      else if (e.key === 'ArrowRight') proximo(false)
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', t)
    return () => window.removeEventListener('keydown', t)
  }, [item, ocupado, modo, podeTopo, podeDevolver, podeCancelar, topo, novaData, devolver, cancelar, proximo])

  const total = itens?.length || 0
  const grande = (cor: string, cheio: boolean): React.CSSProperties => ({ ['--c' as string]: cor, minHeight: 64, fontSize: 15, flex: '1 1 180px', ...(cheio ? {} : {}) })

  return (
    <div className="mf" style={{ maxWidth: 900, margin: '0 auto' }}>
      <style>{ESTILO_FILA}</style>
      <div className="mf-topo">
        <Link href="/fila" className="mf-btn"><ArrowLeft size={15} /> Minha fila</Link>
        <div className="mf-titulo"><h1>Faxina dos parados</h1><span>Um de cada vez: decida e passe para o próximo. Atalhos: F · D · V · C · →</span></div>
      </div>

      {itens === null ? <div className="mf-ajuda">Carregando…</div> : total === 0 ? (
        <div className="mf-ajuda">Nada parado. Sua fila está em dia.</div>
      ) : !item ? (
        <div className="mf-card mf-anim" style={{ textAlign: 'center', padding: 32 }}>
          <span className="mf-ic" style={{ ['--c' as string]: COR.ok, margin: '0 auto 10px', width: 52, height: 52 }}><Check size={26} /></span>
          <h2 style={{ margin: '0 0 6px', fontWeight: 500 }}>Faxina feita</h2>
          <div style={{ color: 'var(--portal-text-secondary,#475569)' }}>Você resolveu {feitos} de {total}. {total - feitos > 0 && `${total - feitos} ficaram para depois.`}</div>
          <div style={{ marginTop: 14 }}><Link href="/fila" className="mf-btn cheio" style={{ ['--c' as string]: COR.acao }}>Voltar para a Minha fila</Link></div>
        </div>
      ) : (
        <>
          {/* progresso */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 13, color: 'var(--portal-text-secondary,#475569)', fontVariantNumeric: 'tabular-nums' }}>{k + 1} de {total}</span>
            <span className="mf-barra" style={{ flex: 1, ['--c' as string]: COR.acao }}><i style={{ width: `${(k / total) * 100}%` }} /></span>
          </div>

          <section className="mf-card mf-anim" key={item.id} style={{ padding: '22px 24px' }}>
            <div style={{ fontSize: 13, color: 'var(--portal-text-muted,#64748b)' }}>
              {souQuemFaz && souQuemPediu ? 'Você criou para você' : souQuemFaz ? `Você faz · pedido de ${primeiro(item.solicitante)}` : `Você pediu · com ${primeiro(item.responsavel)}`}
            </div>
            <Link href={`/tickets/${item.id}`} target="_blank" style={{ display: 'block', fontSize: 22, fontWeight: 500, color: 'var(--portal-text,#0f172a)', textDecoration: 'none', margin: '4px 0 10px' }}>#{item.numero} {item.titulo}</Link>
            <div className="mf-info" style={{ marginBottom: 18 }}>
              <span style={{ color: COR.atencao }}>parado há {item.parado} dias</span>
              {item.prazo && <span style={{ color: item.vencido ? 'var(--cor-atrasado-texto)' : undefined }}>prazo {br(item.prazo)}{item.vencido ? ` (vencido há ${item.vencido} dias)` : ''}</span>}
            </div>

            {modo === null && (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button className="mf-btn cheio" style={grande(COR.acao, true)} disabled={!podeTopo || ocupado} onClick={topo}
                  title={podeTopo ? 'Vai para o topo da sua fila' : 'Só quem faz pode pôr no topo da própria fila'}><Zap size={18} /> Fazer agora <kbd>F</kbd></button>
                <button className="mf-btn" style={grande(COR.info, false)} disabled={ocupado} onClick={() => setModo('data')}><CalendarClock size={18} /> Nova data <kbd>D</kbd></button>
                <button className="mf-btn" style={grande(COR.info, false)} disabled={!podeDevolver || ocupado} onClick={() => { setModo('devolver'); setTimeout(() => campo.current?.focus(), 0) }}
                  title={podeDevolver ? 'A bola volta para quem pediu, com o motivo' : 'Só quem faz pode devolver para quem pediu'}><Undo2 size={18} /> Devolver <kbd>V</kbd></button>
                <button className="mf-btn" style={grande(COR.ruim, false)} disabled={!podeCancelar || ocupado} onClick={() => { setModo('cancelar'); setTimeout(() => campo.current?.focus(), 0) }}
                  title={podeCancelar ? 'Cancelar com o motivo' : 'Só quem pediu pode cancelar — use Devolver'}><CircleX size={18} /> Cancelar <kbd>C</kbd></button>
              </div>
            )}

            {modo === 'data' && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                {[['+1 semana', 7, '1'], ['+2 semanas', 14, '2'], ['+1 mês', 30, '3']].map(([r, n, t]) => (
                  <button key={String(t)} className="mf-btn" style={{ minHeight: 52 }} disabled={ocupado} onClick={() => novaData(somaDias(hojeISO(), Number(n)))}>{r} <kbd>{t}</kbd></button>
                ))}
                <input id="fx-data" type="date" min={hojeISO()} value={data} onChange={(e) => setData(e.target.value)} className="mf-btn" style={{ minHeight: 52 }} aria-label="Escolher data (4)" />
                <button className="mf-btn cheio" style={{ ['--c' as string]: COR.acao, minHeight: 52 }} disabled={!data || ocupado} onClick={() => novaData(data)}>Usar esta data</button>
                <button className="mf-btn" style={{ minHeight: 52 }} onClick={() => setModo(null)}>Voltar <kbd>Esc</kbd></button>
              </div>
            )}

            {(modo === 'devolver' || modo === 'cancelar') && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <input ref={campo} value={texto} onChange={(e) => setTexto(e.target.value)} className="mf-btn" style={{ flex: '1 1 320px', minHeight: 52, fontWeight: 400 }}
                  placeholder={modo === 'devolver' ? `Por que volta para ${primeiro(item.solicitante)}? (Enter envia)` : 'Por que cancelar? (Enter envia)'} aria-label="Motivo" />
                <button className="mf-btn cheio" style={{ ['--c' as string]: modo === 'cancelar' ? COR.ruim : COR.acao, minHeight: 52 }} disabled={!texto.trim() || ocupado}
                  onClick={modo === 'devolver' ? devolver : cancelar}>{modo === 'devolver' ? 'Devolver' : 'Cancelar pedido'}</button>
                <button className="mf-btn" style={{ minHeight: 52 }} onClick={() => setModo(null)}>Voltar <kbd>Esc</kbd></button>
              </div>
            )}

            {erro && <div style={{ marginTop: 10, color: 'var(--cor-atrasado-texto)', fontSize: 13.5 }}>{erro}</div>}
          </section>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
            <button className="mf-btn" onClick={() => proximo(false)} disabled={ocupado}><SkipForward size={16} /> Pular <kbd>→</kbd></button>
          </div>
        </>
      )}
    </div>
  )
}
