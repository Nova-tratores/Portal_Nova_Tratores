'use client'
// CENTRAL DE TRABALHO — vista FILA do Cronograma: a ordem de trabalho de uma
// pessoa e a previsão que sai dela (lib/trabalho/fila.ts).
//  - arrastar reordena (urgente fica sempre no topo); antes de salvar mostra
//    o que muda ("#49 passa do prazo");
//  - dias de trabalho e horas por dia editáveis na linha (acao 'editar');
//  - a própria pessoa e o admin mexem (admin escolhe de quem é a fila).
//  O PRAZO nunca muda aqui: previsão depois do prazo = aviso "vai atrasar".
import { useCallback, useEffect, useMemo, useState } from 'react'
import { GripVertical, AlertTriangle, CheckCircle2, RotateCcw, Save } from 'lucide-react'
import { authHeaders } from '@/lib/auth/client'
import type { Ticket } from '@/lib/tickets/constantes'
import StatusBadge from '@/components/tickets/StatusBadge'
import {
  ordenarFila, planejarFila, atrasoPrevisto, diasUteisEntre, HORAS_CONTINUO_PADRAO, type ItemFila, type Previsao,
} from '@/lib/trabalho/fila'

interface Dados {
  user: string
  eu: string
  hoje: string
  /** Só a própria pessoa e o admin reordenam/editam; quem pediu só vê. */
  podeOrdenar: boolean
  capacidade: number
  feriados: string[]
  tickets: (Ticket & { oculto?: boolean })[]
  quadros: Record<string, { id: string; nome: string; cor: string }>
  usuarios: Record<string, { id: string; nome: string }>
  posicao: Record<string, number>
  pessoas: { id: string; nome: string }[]
}

const br = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}`
const periodo = (p: Previsao) => (!p.fim ? `todo dia desde ${br(p.inicio)}` : p.inicio === p.fim ? br(p.inicio) : `${br(p.inicio)}–${br(p.fim)}`)
const COR_SEM_BLOCO = '#9ca3af'
const muted = 'var(--portal-text-muted,#888)'

export default function FilaTrabalho({ onAbrir, versao, userInicial }: { onAbrir: (id: string) => void; versao?: number; userInicial?: string | null }) {
  const [user, setUser] = useState<string | null>(userInicial || null)
  const [dados, setDados] = useState<Dados | null>(null)
  const [erro, setErro] = useState('')
  const [ordem, setOrdem] = useState<string[] | null>(null) // ordem editada (não salva)
  const [arr, setArr] = useState<string | null>(null)
  const [sobre, setSobre] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(async () => {
    setErro('')
    try {
      const res = await fetch('/api/trabalho/fila' + (user ? `?user=${user}` : ''), { headers: await authHeaders(), cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) { setErro(json.error || 'Falha ao carregar a fila'); return }
      setDados(json); setOrdem(null)
    } catch { setErro('Falha de conexão') }
  }, [user])
  useEffect(() => { carregar() }, [carregar, versao])

  const feriados = useMemo(() => new Set(dados?.feriados || []), [dados])
  // Ticket → item da fila (dias e horas/dia do payload; sem eles, do início ao prazo / dia cheio).
  const itens = useMemo(() => {
    const m = new Map<string, ItemFila & { t: Ticket & { oculto?: boolean } }>()
    for (const t of dados?.tickets || []) {
      const p = (t.payload || {}) as { dias?: number; horas_dia?: number; inicio?: string; urgente?: boolean }
      const dias = p.dias || (p.inicio && t.prazo && p.inicio <= t.prazo ? diasUteisEntre(p.inicio, t.prazo, feriados) : 1)
      // Sem prazo = contínuo (prazo indeterminado): ocupa as horas dele todo dia até concluir.
      const continuo = !t.prazo
      m.set(t.id, { id: t.id, numero: t.numero, prazo: t.prazo, urgente: p.urgente === true, dias, continuo, inicio: p.inicio,
        horasDia: p.horas_dia || (continuo ? HORAS_CONTINUO_PADRAO : dados!.capacidade), t })
    }
    return m
  }, [dados, feriados])

  const ordemSalva = useMemo(() => ordenarFila([...itens.values()], new Map(Object.entries(dados?.posicao || {}))).map((i) => i.id), [itens, dados])
  // Urgente fica sempre no topo, mesmo depois de arrastar.
  const aplicar = useCallback((ids: string[]) => {
    const lista = ids.map((id) => itens.get(id)!).filter(Boolean)
    return [...lista.filter((i) => i.urgente), ...lista.filter((i) => !i.urgente)]
  }, [itens])
  const fila = useMemo(() => aplicar(ordem || ordemSalva), [aplicar, ordem, ordemSalva])
  const previsao = useMemo(() => (dados ? planejarFila(fila, dados.hoje, feriados, dados.capacidade) : new Map<string, Previsao>()), [fila, dados, feriados])
  const previsaoSalva = useMemo(() => (dados ? planejarFila(aplicar(ordemSalva), dados.hoje, feriados, dados.capacidade) : new Map<string, Previsao>()), [aplicar, ordemSalva, dados, feriados])

  // O que muda se salvar a ordem nova (antes de confirmar).
  const efeitos = useMemo(() => {
    if (!ordem) return []
    return fila.flatMap((i) => {
      const a = previsaoSalva.get(i.id), b = previsao.get(i.id)
      if (!a || !b || a.fim === b.fim) return []
      const atrasoAntes = atrasoPrevisto(i.prazo, a), atrasoDepois = atrasoPrevisto(i.prazo, b)
      return [{ i, de: a.fim, para: b.fim, passa: atrasoDepois > 0 && atrasoAntes === 0, atrasoDepois }]
    })
  }, [ordem, fila, previsao, previsaoSalva])

  const soltar = (alvoId: string) => {
    const id = arr
    setArr(null); setSobre(null)
    if (!id || id === alvoId) return
    const atual = fila.map((i) => i.id).filter((x) => x !== id)
    atual.splice(atual.indexOf(alvoId), 0, id)
    setOrdem(atual)
  }
  const salvarOrdem = async () => {
    if (!dados || !ordem) return
    setSalvando(true); setErro('')
    try {
      const res = await fetch('/api/trabalho/fila', {
        method: 'PUT', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ user: dados.user, ordem: fila.map((i) => i.id) }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setErro(json.error || 'Não deu para salvar a ordem'); return }
      await carregar()
    } finally { setSalvando(false) }
  }
  const editar = async (id: string, campo: 'dias' | 'horas_dia', valor: number) => {
    setErro('')
    try {
      const res = await fetch(`/api/tickets/${id}/acoes`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ acao: 'editar', [campo]: valor }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) setErro(json.error === 'Nada para alterar' ? '' : json.error || 'Não deu para mudar')
    } catch { setErro('Falha de conexão') }
    carregar()
  }

  if (!dados) return erro ? <Aviso texto={erro} /> : <div style={{ padding: 40, textAlign: 'center', color: muted }}>Carregando a fila...</div>

  const comFim = fila.filter((i) => !i.continuo)
  const totalHoras = comFim.reduce((s, i) => s + (previsao.get(i.id)?.horas || 0), 0)
  const livreEm = comFim.length ? comFim.map((i) => previsao.get(i.id)?.fim || '').sort().pop() : null
  const horasContinuas = fila.filter((i) => i.continuo).reduce((s, i) => s + i.horasDia, 0)
  const vaoAtrasar = fila.filter((i) => atrasoPrevisto(i.prazo, previsao.get(i.id)) > 0).length
  const campo: React.CSSProperties = { width: 46, padding: '4px 6px', borderRadius: 6, border: '1px solid var(--portal-border,#e5e7eb)', background: 'var(--portal-bg,#fff)', color: 'var(--portal-text,#111)', fontSize: 13, textAlign: 'center' }

  return (
    <div style={{ marginTop: 16 }}>
      {/* Cabeçalho: de quem é a fila + resumo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
        {dados.pessoas.length > 1 ? (
          <select value={dados.user} onChange={(e) => setUser(e.target.value)} aria-label="De quem é a fila"
            style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--portal-border,#e5e7eb)', background: 'var(--portal-surface,#fff)', color: 'var(--portal-text,#111)', fontSize: 13.5, fontWeight: 700 }}>
            {dados.pessoas.map((p) => <option key={p.id} value={p.id}>{p.id === dados.eu ? `${p.nome} (eu)` : p.nome}</option>)}
          </select>
        ) : (
          <b style={{ fontSize: 14, color: 'var(--portal-text,#111)' }}>Minha fila</b>
        )}
        <span style={{ fontSize: 13, color: muted }}>
          {fila.length} ticket{fila.length === 1 ? '' : 's'} · {Math.round(totalHoras)} h de trabalho
          {livreEm && <> · termina o que tem prazo em <b>{br(livreEm)}</b></>}
          {horasContinuas > 0 && <> · {horasContinuas} h/dia em contínuos</>}
          {' · '}{dados.capacidade} h por dia
        </span>
        {!dados.podeOrdenar && <span style={{ fontSize: 12, color: muted }}>Só {dados.pessoas.find((x) => x.id === dados.user)?.nome?.split(' ')[0] || 'a pessoa'} e o admin mudam a ordem.</span>}
        {vaoAtrasar > 0 && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, fontWeight: 700, color: '#dc2626' }}>
            <AlertTriangle size={14} /> {vaoAtrasar} vai{vaoAtrasar > 1 ? 'o' : ''} passar do prazo
          </span>
        )}
      </div>

      {erro && <Aviso texto={erro} />}

      {/* O que muda antes de salvar */}
      {ordem && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', padding: '10px 12px', borderRadius: 10, marginBottom: 10, border: '1px solid rgba(217,119,6,.4)', background: 'rgba(217,119,6,.08)' }}>
          <div style={{ flex: 1, minWidth: 240, fontSize: 13, color: 'var(--portal-text,#111)' }}>
            <b>Ordem nova (ainda não salva).</b>{' '}
            {efeitos.length === 0 ? 'Nenhuma previsão muda.' : (
              <span>
                {efeitos.map((e) => (
                  <span key={e.i.id} style={{ display: 'inline-block', marginRight: 10, color: e.passa ? '#dc2626' : undefined, fontWeight: e.passa ? 700 : 400 }}>
                    #{e.i.numero}: {br(e.de)} → {br(e.para)}{e.passa ? ` (passa do prazo ${e.atrasoDepois}d)` : ''}
                  </span>
                ))}
              </span>
            )}
          </div>
          <span style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setOrdem(null)} style={btn()}><RotateCcw size={14} /> Desfazer</button>
            <button onClick={salvarOrdem} disabled={salvando} style={btn('#16a34a')}><Save size={14} /> {salvando ? 'Salvando...' : 'Salvar ordem'}</button>
          </span>
        </div>
      )}

      {fila.length === 0 ? (
        <div style={{ padding: '40px 20px', textAlign: 'center', borderRadius: 12, border: '1px dashed var(--portal-border,#ddd)', color: muted, fontSize: 14 }}>Fila vazia.</div>
      ) : (
        <div style={{ display: 'grid', gap: 6 }}>
          {fila.map((i, n) => {
            const t = i.t
            const p = previsao.get(i.id)
            const atraso = atrasoPrevisto(i.prazo, p)
            const q = t.quadro_id ? dados.quadros[t.quadro_id] : null
            return (
              <div key={i.id}
                draggable={dados.podeOrdenar && !i.urgente}
                onDragStart={() => setArr(i.id)} onDragEnd={() => { setArr(null); setSobre(null) }}
                onDragOver={(e) => { if (!arr || i.urgente || !dados.podeOrdenar) return; e.preventDefault(); if (sobre !== i.id) setSobre(i.id) }}
                onDrop={(e) => { e.preventDefault(); soltar(i.id) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '9px 12px', borderRadius: 10,
                  border: '1px solid var(--portal-border,#e5e7eb)', borderLeft: `4px solid ${q?.cor || COR_SEM_BLOCO}`,
                  borderTop: sobre === i.id ? '3px solid #dc2626' : undefined,
                  background: 'var(--portal-surface,#fff)', opacity: arr === i.id ? .5 : 1,
                }}>
                <span title={i.urgente ? 'Urgente: fica sempre no topo' : 'Arraste para mudar a ordem'} style={{ display: 'flex', alignItems: 'center', gap: 4, color: muted, cursor: i.urgente ? 'default' : 'grab', fontWeight: 800, fontSize: 13, width: 40 }}>
                  {!i.urgente && dados.podeOrdenar && <GripVertical size={14} />}{n + 1}.
                </span>
                <button onClick={() => { if (!t.oculto) onAbrir(t.id) }} style={{ cursor: t.oculto ? 'default' : 'pointer', flex: '1 1 240px', minWidth: 0, textAlign: 'left', border: 'none', background: 'transparent', padding: 0, color: 'var(--portal-text,#111)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 700, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                    {i.urgente && <span style={{ padding: '0 6px', borderRadius: 4, fontSize: 10, fontWeight: 800, color: '#fff', background: '#dc2626' }}>URGENTE</span>}
                    {t.oculto ? <i style={{ fontWeight: 600, color: muted }}>Outro compromisso</i> : <>#{t.numero} {t.titulo}</>}
                  </span>
                  <span style={{ fontSize: 12, color: muted }}>
                    {t.oculto ? 'horário ocupado' : <>
                    {q ? <span style={{ color: q.cor, fontWeight: 700 }}>{q.nome}</span> : <span style={{ color: '#b45309', fontWeight: 700 }}>sem bloco</span>}
                    {' · '}de {dados.usuarios[t.solicitante_id]?.nome || '—'}
                    </>}
                  </span>
                </button>
                <StatusBadge status={t.status} tamanho={11} />
                {i.continuo ? (
                  <span title="Prazo indeterminado: aparece todo dia até alguém concluir" style={{ width: 92, fontSize: 12, fontWeight: 700, color: '#0369a1' }}>∞ contínuo</span>
                ) : (
                <label title="Dias de trabalho" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: muted }}>
                  <input type="number" min={1} max={120} defaultValue={i.dias} disabled={!dados.podeOrdenar && (t.oculto || t.solicitante_id !== dados.eu)} key={`d${i.id}${i.dias}`} style={campo}
                    onBlur={(e) => { const v = Number(e.target.value); if (v && v !== i.dias) editar(i.id, 'dias', v) }} /> dia{i.dias > 1 ? 's' : ''}
                </label>
                )}
                <label title="Horas por dia neste ticket" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: muted }}>
                  × <input type="number" min={0.5} max={12} step={0.5} defaultValue={i.horasDia} disabled={!dados.podeOrdenar && (t.oculto || t.solicitante_id !== dados.eu)} key={`h${i.id}${i.horasDia}`} style={campo}
                    onBlur={(e) => { const v = Number(e.target.value); if (v && v !== i.horasDia) editar(i.id, 'horas_dia', v) }} /> h/dia
                </label>
                <span style={{ width: 110, fontSize: 12.5, color: 'var(--portal-text,#111)' }} title="Previsão pela fila">
                  <span style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: muted }}>PREVISÃO</span>
                  {p ? periodo(p) : '—'}
                </span>
                <span style={{ width: 80, fontSize: 12.5, color: 'var(--portal-text,#111)' }}>
                  <span style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: muted }}>PRAZO</span>
                  {t.prazo ? br(t.prazo) : 'indeterminado'}
                </span>
                <span style={{ width: 120, display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 700, color: atraso ? '#dc2626' : '#15803d' }}>
                  {!t.prazo ? <span style={{ color: '#0369a1', fontWeight: 600 }}>até concluir</span>
                    : atraso ? <><AlertTriangle size={14} /> passa {atraso} dia{atraso > 1 ? 's' : ''}</>
                    : <><CheckCircle2 size={14} /> no prazo</>}
                </span>
              </div>
            )
          })}
        </div>
      )}
      <p style={{ fontSize: 12, color: muted, marginTop: 10 }}>
        A previsão sai da ordem da fila: cada ticket usa as horas por dia dele, até {dados.capacidade} h no dia (pula sábado, domingo e feriado).
        O prazo não muda aqui — é a promessa para quem pediu.
      </p>
    </div>
  )
}

function Aviso({ texto }: { texto: string }) {
  return <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(220,38,38,.08)', color: '#dc2626', fontSize: 13, fontWeight: 600, marginBottom: 10 }}>{texto}</div>
}
function btn(cor?: string): React.CSSProperties {
  return { display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', border: cor ? 'none' : '1px solid var(--portal-border,#e5e7eb)', background: cor || 'var(--portal-surface,#fff)', color: cor ? '#fff' : 'var(--portal-text,#111)' }
}
