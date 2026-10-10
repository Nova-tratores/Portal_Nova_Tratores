'use client'
// POPs — EXECUÇÃO no celular: um passo por tela, barra de progresso, cada resposta
// salva assim que é dada (e reenviada se a rede cair), retoma no 1º pendente,
// resumo antes de encerrar. A versão é a EXATA da execução (não a vigente).
export const dynamic = 'force-dynamic'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { AlertTriangle, ArrowLeft, Check, ChevronLeft, ChevronRight, CloudOff, ListChecks } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { pendentes, respostaValida, foraDaFaixa, type Resposta } from '@/lib/pops/regras'
import { enfileirar, ehFalhaDeRede, lerFila, tirarDaFila } from '@/lib/pops/fila-respostas'
import RespostaPasso, { type PassoExec, type RespostaLocal } from '@/components/pops/execucao/RespostaPasso'
import { midiaEhVideo, ICONE_PASSO } from '@/components/pops/PassoPreview'
import { COR_POPS, chamar } from '@/components/pops/comum'

interface Dados {
  ticket: { id: string; numero: number; status: string; titulo: string; prazo: string | null }
  execucao: { ref_externa: string | null; data_referencia: string | null }
  pop: { id: string; codigo: string; titulo: string }
  versao: { numero: number; objetivo: string; materiais: string }
  passos: PassoExec[]
  respostas: { passo_id: string; valor: Record<string, unknown>; fotos: string[]; fora_faixa: boolean }[]
  fotos_url: Record<string, string>
  versao_vigente_diferente: boolean
  pode: { responder: boolean; encerrar: boolean }
}

const tela: React.CSSProperties = { maxWidth: 640, margin: '0 auto', padding: '12px 14px 120px', minHeight: 'calc(100vh - 64px)' }

export default function Executar() {
  const { ticketId } = useParams<{ ticketId: string }>()
  const { userProfile } = useAuth()
  const [d, setD] = useState<Dados | null>(null)
  const [erro, setErro] = useState('')
  const [resp, setResp] = useState<Record<string, RespostaLocal>>({})
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [idx, setIdx] = useState<number | 'resumo' | 'fim'>(0)
  const [naFila, setNaFila] = useState(0)
  const [aviso, setAviso] = useState('')
  const [encerrando, setEncerrando] = useState(false)

  const enviar = useCallback(async (passoId: string, valor: Record<string, unknown>, fotos: string[]) => {
    await chamar(`/api/pops/execucoes/${ticketId}`, { json: { acao: 'responder', passo_id: passoId, valor, fotos } })
    tirarDaFila(ticketId, passoId)
  }, [ticketId])

  // Reenvia o que ficou na fila (abrir a tela / voltar a conexão).
  // Uma reenviada por vez ('online' pode disparar junto com a abertura da tela).
  const drenando = useRef<Promise<void> | null>(null)
  const drenar = useCallback(async () => {
    if (drenando.current) return drenando.current
    drenando.current = (async () => {
      for (const r of lerFila(ticketId)) {
        try { await enviar(r.passo_id, r.valor, r.fotos) } catch (e) { if (ehFalhaDeRede(e)) break; tirarDaFila(ticketId, r.passo_id) }
      }
      setNaFila(lerFila(ticketId).length)
    })()
    try { await drenando.current } finally { drenando.current = null }
  }, [ticketId, enviar])

  const carregar = useCallback(async (posicionar: boolean) => {
    try {
      await drenar()
      const r = await chamar<Dados>(`/api/pops/execucoes/${ticketId}`)
      const mapa: Record<string, RespostaLocal> = {}
      for (const x of r.respostas) mapa[x.passo_id] = { valor: x.valor, fotos: x.fotos }
      for (const x of lerFila(ticketId)) mapa[x.passo_id] = { valor: x.valor, fotos: x.fotos } // o local manda até subir
      setD(r); setResp(mapa); setUrls((u) => ({ ...r.fotos_url, ...u }))
      if (posicionar) {
        const encerrada = !r.pode.responder
        const primeiro = r.passos.findIndex((p) => p.tipo !== 'instrucao' && p.obrigatorio && !respostaValida(p, mapa[p.id]))
        // Nova (nada respondido): começa do passo 1 — inclusive a instrução. Retomando: 1º pendente.
        const comecou = Object.keys(mapa).length > 0
        setIdx(encerrada ? 'resumo' : !comecou ? 0 : primeiro >= 0 ? primeiro : 'resumo')
      }
    } catch (e) { setErro((e as Error).message) }
  }, [ticketId, drenar])
  useEffect(() => { if (userProfile) carregar(true) }, [carregar, userProfile])
  useEffect(() => {
    const on = () => drenar()
    window.addEventListener('online', on)
    return () => window.removeEventListener('online', on)
  }, [drenar])

  const passos = useMemo(() => d?.passos || [], [d])
  const falta = useMemo(() => pendentes(passos, Object.entries(resp).map(([passo_id, r]) => ({ passo_id, ...r })) as Resposta[]), [passos, resp])
  const respondidos = passos.filter((p) => p.tipo !== 'instrucao' && respostaValida(p, resp[p.id])).length
  const comResposta = passos.filter((p) => p.tipo !== 'instrucao').length

  const avancar = (de: number) => setIdx(de + 1 < passos.length ? de + 1 : 'resumo')

  const onSalvar = async (i: number, valor: Record<string, unknown>, fotos: string[], seguir: boolean): Promise<boolean> => {
    const p = passos[i]
    const vazio = p.tipo !== 'foto' && !Object.keys(valor).length
    const igual = JSON.stringify(resp[p.id] || null) === JSON.stringify({ valor, fotos })
    if (p.tipo === 'instrucao' || vazio || igual) { if (seguir) avancar(i); return true }
    setResp((m) => ({ ...m, [p.id]: { valor, fotos } }))   // otimista: a tela não espera a rede
    setAviso('')
    try {
      await enviar(p.id, valor, fotos)
    } catch (e) {
      if (ehFalhaDeRede(e)) {
        enfileirar(ticketId, { passo_id: p.id, valor, fotos })
        setNaFila(lerFila(ticketId).length)
      } else {
        setAviso((e as Error).message)
        await carregar(false)   // volta ao que o servidor tem
        return false
      }
    }
    if (seguir) avancar(i)
    return true
  }

  const encerrar = async () => {
    setEncerrando(true); setAviso('')
    try {
      await drenar()
      if (lerFila(ticketId).length) throw new Error('Ainda há respostas sem enviar — confira a internet.')
      await chamar(`/api/pops/execucoes/${ticketId}`, { json: { acao: 'encerrar' } })
      setIdx('fim')
    } catch (e) { setAviso((e as Error).message) } finally { setEncerrando(false) }
  }

  if (erro) return <div style={tela}><div style={{ color: '#dc2626', fontWeight: 700 }}>{erro}</div></div>
  if (!d) return <div style={tela}>Carregando…</div>

  const bloqueado = !d.pode.responder
  const progresso = comResposta ? Math.round((respondidos / comResposta) * 100) : 100

  const cabecalho = (
    <div style={{ position: 'sticky', top: 64, zIndex: 5, background: 'var(--portal-bg,#f6f7f9)', padding: '8px 0 10px', marginBottom: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Link href={`/pops/${d.pop.id}`} aria-label="Voltar" style={{ color: 'var(--portal-text,#111)', display: 'flex' }}><ArrowLeft size={20} /></Link>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: COR_POPS }}>{d.pop.codigo} v{d.versao.numero} · execução #{d.ticket.numero}</div>
          <div style={{ fontSize: 15, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.pop.titulo}</div>
          {d.execucao.ref_externa && <div style={{ fontSize: 12, color: 'var(--portal-text-muted,#888)' }}>Ref.: {d.execucao.ref_externa}</div>}
        </div>
        <button onClick={() => setIdx('resumo')} aria-label="Resumo" style={{ border: 'none', background: 'transparent', color: COR_POPS, display: 'flex', cursor: 'pointer' }}><ListChecks size={22} /></button>
      </div>
      <div style={{ height: 8, borderRadius: 99, background: 'var(--portal-border,#e5e7eb)', marginTop: 8, overflow: 'hidden' }}>
        <div style={{ width: `${progresso}%`, height: '100%', background: COR_POPS, transition: 'width .3s' }} />
      </div>
      <div style={{ fontSize: 12, marginTop: 4, color: 'var(--portal-text-muted,#888)', display: 'flex', gap: 10 }}>
        <span>{respondidos} de {comResposta} respondidos</span>
        {naFila > 0 && <span style={{ color: '#b45309', fontWeight: 800 }}><CloudOff size={12} style={{ verticalAlign: -1 }} /> {naFila} aguardando internet</span>}
      </div>
      {d.versao_vigente_diferente && (
        <div style={{ fontSize: 12, color: '#4f46e5', marginTop: 4 }}>Este POP ganhou versão nova depois que a execução começou — ela continua na v{d.versao.numero}.</div>
      )}
    </div>
  )

  if (idx === 'fim') {
    return (
      <div style={{ ...tela, textAlign: 'center', paddingTop: 60 }}>
        <div style={{ width: 84, height: 84, borderRadius: '50%', background: '#059669', color: '#fefefe', margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Check size={48} /></div>
        <h1 style={{ fontSize: 24, margin: '0 0 8px' }}>Execução concluída</h1>
        <p style={{ color: 'var(--portal-text-secondary,#555)' }}>Quem pediu foi avisado para conferir. Obrigado!</p>
        <Link href="/pops/minhas" style={{ display: 'inline-block', marginTop: 16, color: COR_POPS, fontWeight: 800 }}>Minhas execuções</Link>
      </div>
    )
  }

  if (idx === 'resumo') {
    return (
      <div style={tela}>
        {cabecalho}
        <h2 style={{ fontSize: 18, margin: '4px 0 10px' }}>{bloqueado ? 'Respostas' : 'Resumo antes de encerrar'}</h2>
        <div style={{ display: 'grid', gap: 6 }}>
          {passos.map((p, i) => {
            const r = resp[p.id]
            const ok = respostaValida(p, r)
            const alerta = p.tipo === 'numero' && typeof r?.valor.numero === 'number' && foraDaFaixa(p.config, r.valor.numero)
            const pendente = falta.some((x) => x.id === p.id)
            const mostra = !r ? '' : p.tipo === 'check' ? (r.valor.sim ? 'Sim' : 'Não') : p.tipo === 'numero' ? `${String(r.valor.numero).replace('.', ',')}${p.config.unidade ? ' ' + p.config.unidade : ''}`
              : p.tipo === 'foto' ? `${r.fotos.length} foto(s)` : String(r.valor.texto ?? r.valor.opcao ?? r.valor.nome ?? '')
            return (
              <button key={p.id} onClick={() => setIdx(i)} style={{
                display: 'flex', gap: 10, alignItems: 'center', textAlign: 'left', padding: '12px', borderRadius: 12, cursor: 'pointer',
                border: `2px solid ${pendente ? '#fca5a5' : alerta ? '#fcd34d' : 'var(--portal-border,#e5e7eb)'}`, background: 'var(--portal-surface,#fff)', color: 'var(--portal-text,#111)',
              }}>
                <span style={{ width: 26, height: 26, borderRadius: '50%', flex: '0 0 26px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 13,
                  background: p.tipo === 'instrucao' ? 'var(--portal-border,#e5e7eb)' : ok ? '#059669' : pendente ? '#dc2626' : '#9ca3af', color: '#fefefe' }}>
                  {ok && p.tipo !== 'instrucao' ? <Check size={15} /> : i + 1}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontWeight: 700 }}>{p.titulo}</span>
                  {mostra && <span style={{ fontSize: 13, color: alerta ? '#b45309' : 'var(--portal-text-secondary,#555)' }}>{alerta && '⚠ '}{mostra}</span>}
                  {pendente && <span style={{ fontSize: 13, color: '#dc2626', fontWeight: 700 }}>falta responder</span>}
                </span>
              </button>
            )
          })}
        </div>
        {aviso && <div style={{ marginTop: 12, color: '#dc2626', fontWeight: 700 }}>{aviso}</div>}
        {d.pode.encerrar && (
          <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, padding: 14, background: 'var(--portal-bg,#f6f7f9)', borderTop: '1px solid var(--portal-border,#e5e7eb)' }}>
            <div style={{ maxWidth: 640, margin: '0 auto' }}>
              <button onClick={encerrar} disabled={!!falta.length || encerrando} style={{
                width: '100%', minHeight: 58, borderRadius: 14, border: 'none', fontSize: 18, fontWeight: 900, cursor: 'pointer',
                background: falta.length ? '#9ca3af' : '#059669', color: '#fefefe',
              }}>
                {encerrando ? 'Encerrando…' : falta.length ? `Faltam ${falta.length} passo(s) obrigatório(s)` : 'Encerrar execução'}
              </button>
            </div>
          </div>
        )}
        {bloqueado && <p style={{ marginTop: 14, fontSize: 14, color: 'var(--portal-text-muted,#888)' }}>Execução {d.ticket.status === 'resolvido' ? 'concluída — aguardando a conferência de quem pediu' : d.ticket.status}. Só leitura.</p>}
      </div>
    )
  }

  const i = idx
  const p = passos[i]
  if (!p) return <div style={tela}>{cabecalho}Nenhum passo.</div>
  const video = midiaEhVideo(p.midia_url)
  return (
    <div style={tela}>
      {cabecalho}
      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--portal-text-muted,#888)', display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ color: COR_POPS, display: 'flex' }}>{ICONE_PASSO[p.tipo]}</span> Passo {i + 1} de {passos.length}
        {p.tipo !== 'instrucao' && (p.obrigatorio ? <span style={{ color: '#b91c1c' }}>· obrigatório</span> : <span>· opcional</span>)}
      </div>
      <h1 style={{ fontSize: 23, lineHeight: 1.25, margin: '6px 0 8px' }}>{p.titulo}</h1>
      {p.ajuda && <p style={{ fontSize: 16, color: 'var(--portal-text-secondary,#555)', margin: '0 0 12px', whiteSpace: 'pre-wrap' }}>{p.ajuda}</p>}
      {p.midia_url && (video
        ? <video src={p.midia_url} controls playsInline style={{ width: '100%', borderRadius: 12, marginBottom: 12 }} />
        // eslint-disable-next-line @next/next/no-img-element
        : <img src={p.midia_url} alt="" style={{ width: '100%', maxHeight: 320, objectFit: 'contain', borderRadius: 12, marginBottom: 12, background: '#fff' }} />)}
      {resp[p.id] && p.tipo === 'numero' && typeof resp[p.id].valor.numero === 'number' && foraDaFaixa(p.config, resp[p.id].valor.numero as number) && (
        <div style={{ marginBottom: 10, color: '#b45309', fontWeight: 800 }}><AlertTriangle size={15} style={{ verticalAlign: -2 }} /> Valor salvo está fora da faixa.</div>
      )}

      <RespostaPasso key={p.id} passo={p} resposta={resp[p.id]} urls={urls} ticketId={ticketId}
        meuNome={userProfile?.nome || ''} bloqueado={bloqueado}
        onUrlLocal={(path, url) => setUrls((u) => ({ ...u, [path]: url }))}
        onSalvar={(valor, fotos, seguir) => onSalvar(i, valor, fotos, seguir)} />
      {aviso && <div style={{ marginTop: 12, color: '#dc2626', fontWeight: 700 }}>{aviso}</div>}

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 18 }}>
        <button disabled={i === 0} onClick={() => setIdx(i - 1)} style={navBtn(i === 0)}><ChevronLeft size={18} /> Anterior</button>
        <button onClick={() => avancar(i)} style={navBtn(false)}>{i + 1 < passos.length ? 'Pular' : 'Resumo'} <ChevronRight size={18} /></button>
      </div>
    </div>
  )
}

const navBtn = (off: boolean): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', gap: 4, padding: '10px 14px', borderRadius: 10, fontSize: 15, fontWeight: 700,
  border: '1px solid var(--portal-border,#e5e7eb)', background: 'var(--portal-surface,#fff)', color: 'var(--portal-text,#111)',
  opacity: off ? .4 : 1, cursor: off ? 'default' : 'pointer',
})
