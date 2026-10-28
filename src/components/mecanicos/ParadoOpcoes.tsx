'use client'
// Opções do bloco "Dinheiro parado" — página de teste (José, 19/10/2026: "agora limpa a página de
// teste e vamos fazer versões para esse aqui"). Mesmos dados do Painel (base.pendencias); nada aqui
// muda o Painel. Garantia preenchida fica fora (espera a montadora), como no bloco atual.
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { authHeaders } from '@/lib/auth/client'
import VisualizadorDocumento, { type DocumentoVisualizavel } from '@/components/comum/VisualizadorDocumento'
import { resumoPendencias, FAIXAS_IDADE, type Pendencia, type TipoPendencia } from '@/lib/mecanicos/pendencias'
import { grupoDe } from '@/lib/mecanicos/painel'
import { brl, Numero } from './ui'
import { ListaParadas } from './DinheiroParado'

const MUDO = 'var(--portal-text-muted, #64748b)'
const COR_TIPO: Record<TipoPendencia, string> = { preenchida: '#d97706', atrasada: '#dc2626' }
const NOME_TIPO: Record<TipoPendencia, string> = { preenchida: 'Feito e não faturado', atrasada: 'Passou da data sem preencher' }
const COR_IDADE = ['#16a34a', '#eab308', '#f97316', '#dc2626']
const faixaDe = (dias: number) => Math.max(0, FAIXAS_IDADE.findIndex(([, a, b]) => dias >= a && dias <= b))
const br = (d: string) => (d && d.length >= 10 ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(2, 4)}` : d)
const iniciais = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase()

type Filtro = { tipo: TipoPendencia | 'todos'; tecnico?: string; idade?: number }

/** Mesmo preparo do bloco atual: técnico pelo grupo e garantia preenchida separada. */
export function useParadas(pendencias: Pendencia[]) {
  return useMemo(() => {
    const todas = pendencias.map((p) => ({ ...p, tecnicos: [...new Set(p.tecnicos.map(grupoDe))] }))
    const lista = todas.filter((p) => !(p.garantia && p.tipo === 'preenchida'))
    const garantias = todas.filter((p) => p.garantia && p.tipo === 'preenchida')
    return { lista, garantias, r: resumoPendencias(lista), garantiaTotal: garantias.reduce((s, p) => s + p.total, 0) }
  }, [pendencias])
}

function Cabeca({ total, qtd, garantias, garantiaTotal, onTodas }: { total: number; qtd: number; garantias: number; garantiaTotal: number; onTodas: () => void }) {
  return (
    <div className="pa-cab">
      <div>
        <small><i className="fas fa-hourglass-half" /> Dinheiro parado · agora</small>
        <h3><b><Numero valor={total} formato={brl} /></b> em {qtd} OS ainda não faturadas</h3>
        {garantias > 0 && <span className="pa-gar"><i className="fas fa-shield-heart" /> fora daqui: {garantias} garantia(s) esperando a montadora ({brl(garantiaTotal)})</span>}
      </div>
      <button type="button" className="pa-btn" onClick={onTodas}>ver todas <i className="fas fa-chevron-right" /></button>
    </div>
  )
}

// ============================================================================
/** E1 — Placar + fila: os números grandes em cima e as OS em ordem de prioridade (valor × tempo parado). */
export function ParadoFila({ pendencias }: { pendencias: Pendencia[] }) {
  const { lista, garantias, r, garantiaTotal } = useParadas(pendencias)
  const [ver, setVer] = useState<Filtro | null>(null)
  const [tipo, setTipo] = useState<TipoPendencia | 'todos'>('todos')
  const fila = useMemo(() => lista.filter((p) => tipo === 'todos' || p.tipo === tipo).map((p) => ({ p, prio: p.total * (1 + p.dias / 15) })).sort((a, b) => b.prio - a.prio).slice(0, 8), [lista, tipo])
  const velha = lista.reduce((m, p) => Math.max(m, p.dias), 0)
  const maxP = Math.max(1, ...fila.map((x) => x.p.total))
  if (!lista.length) return <Vazio />
  return (
    <div className="pa-caixa">
      <Cabeca total={r.total.total} qtd={r.total.qtd} garantias={garantias.length} garantiaTotal={garantiaTotal} onTodas={() => setVer({ tipo: 'todos' })} />
      <div className="pa-placar">
        {([['preenchida', 'fa-file-circle-check'], ['atrasada', 'fa-calendar-xmark']] as const).map(([t, ic], i) => (
          <button key={t} type="button" className={`pa-pl ${tipo === t ? 'on' : ''}`} style={{ '--c': COR_TIPO[t], animationDelay: `${i * 80}ms` } as React.CSSProperties} onClick={() => setTipo(tipo === t ? 'todos' : t)}>
            <i className={`fas ${ic}`} /><small>{NOME_TIPO[t]}</small><b><Numero valor={r[t].total} formato={brl} /></b><span>{r[t].qtd} OS</span>
          </button>
        ))}
        <div className="pa-pl" style={{ '--c': '#7c3aed', animationDelay: '160ms' } as React.CSSProperties}><i className="fas fa-clock-rotate-left" /><small>Mais antiga parada</small><b>{velha} dias</b><span>média {Math.round(lista.reduce((s, p) => s + p.dias, 0) / lista.length)} dias</span></div>
        <div className="pa-pl" style={{ '--c': '#0369a1', animationDelay: '240ms' } as React.CSSProperties}><i className="fas fa-scale-balanced" /><small>Valor médio por OS</small><b>{brl(r.total.total / Math.max(1, r.total.qtd))}</b><span>MO + km + peças</span></div>
      </div>
      <div className="pa-fila-tit"><b><i className="fas fa-list-ol" /> Cobrar primeiro</b><small>ordem = valor × tempo parado{tipo !== 'todos' ? ` · só "${NOME_TIPO[tipo]}"` : ''}</small></div>
      <div className="pa-fila">
        {fila.map(({ p }, i) => (
          <a key={p.os} href={`/pos?id=${encodeURIComponent(p.os)}`} target="_blank" rel="noreferrer" className="pa-fl" style={{ '--c': COR_TIPO[p.tipo], animationDelay: `${300 + i * 60}ms` } as React.CSSProperties}>
            <span className="pa-fl-n">{i + 1}</span>
            <span className="pa-fl-d" style={{ color: COR_IDADE[faixaDe(p.dias)] }}><b>{p.dias}</b><small>dias</small></span>
            <div className="pa-fl-t"><b>{p.os} <em>{p.status}</em></b><small>{p.cliente || '—'} · {p.tecnicos.join(' + ') || 'sem técnico'}</small></div>
            <div className="pa-fl-b"><i style={{ width: `${(p.total / maxP) * 100}%` }} /></div>
            <strong>{brl(p.total)}</strong>
          </a>
        ))}
      </div>
      {ver && <ListaParadas lista={lista} filtro={ver} onFechar={() => setVer(null)} />}
    </div>
  )
}

// ============================================================================
/** E1 em outros estilos (José: "gostei da opção 1, mas pode melhorar, muda o estilo dos cards, ou me dê
 *  outra opção sem card"). cheio = cards novos pintados; linha = sem card (faixa de números + tabela);
 *  anel = sem card (anel feito × atrasado + ranking em barras). */
export function ParadoFilaEstilo({ pendencias, estilo }: { pendencias: Pendencia[]; estilo: 'cheio' | 'linha' | 'anel' }) {
  const { lista, garantias, r, garantiaTotal } = useParadas(pendencias)
  const [ver, setVer] = useState<Filtro | null>(null)
  const [aberta, setAberta] = useState<Pendencia | null>(null)
  const [tipo, setTipo] = useState<TipoPendencia | 'todos'>('todos')
  const fila = useMemo(() => lista.filter((p) => tipo === 'todos' || p.tipo === tipo).map((p) => ({ p, prio: p.total * (1 + p.dias / 15) })).sort((a, b) => b.prio - a.prio).slice(0, 8), [lista, tipo])
  const velha = lista.reduce((m, p) => Math.max(m, p.dias), 0)
  const media = lista.length ? Math.round(lista.reduce((s, p) => s + p.dias, 0) / lista.length) : 0
  const maxP = Math.max(1, ...fila.map((x) => x.p.total))
  const ticket = r.total.total / Math.max(1, r.total.qtd)
  if (!lista.length) return <Vazio />
  const nums = [
    { k: 'preenchida' as const, ic: 'fa-file-circle-check', rot: NOME_TIPO.preenchida, v: <Numero valor={r.preenchida.total} formato={brl} />, sub: `${r.preenchida.qtd} OS`, cor: COR_TIPO.preenchida },
    { k: 'atrasada' as const, ic: 'fa-calendar-xmark', rot: NOME_TIPO.atrasada, v: <Numero valor={r.atrasada.total} formato={brl} />, sub: `${r.atrasada.qtd} OS`, cor: COR_TIPO.atrasada },
    { k: null, ic: 'fa-clock-rotate-left', rot: 'Mais antiga parada', v: <>{velha} dias</>, sub: `média ${media} dias`, cor: '#7c3aed' },
    { k: null, ic: 'fa-scale-balanced', rot: 'Valor médio por OS', v: <>{brl(ticket)}</>, sub: 'MO + km + peças', cor: '#0369a1' },
  ]
  const clicar = (k: TipoPendencia | null) => { if (k) setTipo(tipo === k ? 'todos' : k) }
  const titFila = <div className="pa-fila-tit"><b><i className="fas fa-list-ol" /> Cobrar primeiro</b><small>ordem = valor × tempo parado{tipo !== 'todos' ? ` · só "${NOME_TIPO[tipo]}"` : ''}{tipo !== 'todos' && <button type="button" className="pa-limpa" onClick={() => setTipo('todos')}>mostrar todas</button>}</small></div>
  const pctFeito = r.total.total ? r.preenchida.total / r.total.total : 0
  return (
    <div className={`pa-caixa pa-${estilo}`}>
      <Cabeca total={r.total.total} qtd={r.total.qtd} garantias={garantias.length} garantiaTotal={garantiaTotal} onTodas={() => setVer({ tipo: 'todos' })} />

      {estilo === 'cheio' && (
        <div className="pc-placar">
          {nums.map((n, i) => (
            <button key={n.rot} type="button" disabled={!n.k} className={`pc-n ${n.k && tipo === n.k ? 'on' : ''} ${tipo !== 'todos' && n.k && tipo !== n.k ? 'apaga' : ''}`} style={{ '--c': n.cor, animationDelay: `${i * 90}ms` } as React.CSSProperties} onClick={() => clicar(n.k)}>
              <i className={`fas ${n.ic} pc-marca`} />
              <small><i className={`fas ${n.ic} pc-ic`} />{n.rot}</small>
              <b>{n.v}</b>
              <span>{n.sub}{n.k && <em>{tipo === n.k ? '✓ filtrando' : 'clique para filtrar'}</em>}</span>
            </button>
          ))}
        </div>
      )}
      {estilo === 'linha' && (
        <div className="pl-faixa">
          {nums.map((n, i) => (
            <button key={n.rot} type="button" disabled={!n.k} className={`pl-n ${n.k && tipo === n.k ? 'on' : ''}`} style={{ '--c': n.cor, animationDelay: `${i * 90}ms` } as React.CSSProperties} onClick={() => clicar(n.k)}>
              <small>{n.rot}</small><b>{n.v}</b><span>{n.sub}</span>
            </button>
          ))}
        </div>
      )}
      {estilo === 'anel' && (
        <div className="pn-topo">
          <div className="pn-anel" style={{ '--p': `${pctFeito * 100}` } as React.CSSProperties}>
            <svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="50" className="pn-fundo" /><circle cx="60" cy="60" r="50" className="pn-atras" /><circle cx="60" cy="60" r="50" className="pn-feito" style={{ strokeDasharray: `${pctFeito * 314} 314` }} /></svg>
            <div><b>{Math.round(pctFeito * 100)}%</b><small>já foi feito</small></div>
          </div>
          <div className="pn-lista">
            {nums.map((n, i) => (
              <button key={n.rot} type="button" disabled={!n.k} className={`pn-l ${n.k && tipo === n.k ? 'on' : ''}`} style={{ '--c': n.cor, animationDelay: `${i * 90}ms` } as React.CSSProperties} onClick={() => clicar(n.k)}>
                <i className={`fas ${n.ic}`} /><span>{n.rot}</span><b>{n.v}</b><small>{n.sub}</small>
              </button>
            ))}
          </div>
        </div>
      )}

      {titFila}
      {estilo === 'cheio' && (
        <div className="pc-fila">
          {fila.map(({ p }, i) => (
            <button type="button" key={p.os} onClick={() => setAberta(p)} className="pc-fl" style={{ '--c': COR_TIPO[p.tipo], '--w': `${(p.total / maxP) * 100}%`, animationDelay: `${300 + i * 60}ms` } as React.CSSProperties}>
              <span className="pc-fl-n">{i + 1}</span>
              <div className="pc-fl-t"><b>{p.os}</b><small>{p.cliente || '—'} · {p.tecnicos.join(' + ') || 'sem técnico'}</small><i className="pc-fl-bar"><u /></i></div>
              <em className="pc-fl-s">{p.status}</em>
              <span className="pc-fl-d" style={{ '--d': COR_IDADE[faixaDe(p.dias)] } as React.CSSProperties}><i className="fas fa-hourglass-half" /> {p.dias} dias</span>
              <strong>{brl(p.total)}</strong>
            </button>
          ))}
        </div>
      )}
      {estilo === 'linha' && (
        <div className="pl-tab">
          <div className="pl-tr pl-th"><span>#</span><span>Parada há</span><span>OS</span><span>Cliente</span><span>Técnico</span><span>Situação</span><span>Valor</span></div>
          {fila.map(({ p }, i) => (
            <div key={p.os} className="pl-tr" style={{ '--c': COR_TIPO[p.tipo], animationDelay: `${300 + i * 50}ms` } as React.CSSProperties} onClick={() => setAberta(p)} role="link">
              <span className="pl-pos">{i + 1}</span>
              <span><em className="pl-dias" style={{ color: COR_IDADE[faixaDe(p.dias)] }}>{p.dias} dias</em></span>
              <span><b>{p.os}</b></span>
              <span className="pl-cut">{p.cliente || '—'}</span>
              <span className="pl-cut">{p.tecnicos.join(' + ') || 'sem técnico'}</span>
              <span className="pl-cut"><i className="pl-ponto" />{p.status}</span>
              <span className="pl-val"><b>{brl(p.total)}</b><i style={{ width: `${(p.total / maxP) * 100}%` }} /></span>
            </div>
          ))}
        </div>
      )}
      {estilo === 'anel' && (
        <div className="pn-fila">
          {fila.map(({ p }, i) => (
            <div key={p.os} className="pn-fl" style={{ animationDelay: `${300 + i * 60}ms` }} onClick={() => setAberta(p)} role="link">
              <span className="pn-fl-n">{i + 1}</span>
              <div className="pn-fl-barra">
                <i style={{ width: `${Math.max(18, (p.total / maxP) * 100)}%`, background: `linear-gradient(90deg, ${COR_TIPO[p.tipo]}, color-mix(in srgb, ${COR_TIPO[p.tipo]} 65%, #fefefe))`, animationDelay: `${300 + i * 60}ms` }}>
                  <b>{p.os}</b><small>{p.cliente || '—'}</small>
                </i>
                <strong>{brl(p.total)}</strong>
              </div>
              <span className="pn-fl-d" style={{ color: COR_IDADE[faixaDe(p.dias)] }}><b>{p.dias}</b> dias</span>
            </div>
          ))}
          <div className="pa-leg"><span><i style={{ background: COR_TIPO.preenchida }} /> feito e não faturado</span><span><i style={{ background: COR_TIPO.atrasada }} /> passou da data sem preencher</span><span>barra = valor · clique abre a OS</span></div>
        </div>
      )}
      {ver && <ListaParadas lista={lista} filtro={ver} onFechar={() => setVer(null)} />}
      {aberta && <JanelaOSParada key={aberta.os} p={aberta} onFechar={() => setAberta(null)} />}
    </div>
  )
}

// ============================================================================
/** Janela da OS parada (José: "quando clicar na ordem, já abre o modal ali mesmo com as peças se tiver"). */
type DetOS = {
  os: Record<string, unknown>
  ppvs: { id: string; status: string; desconto: number; itens: { cod: string; descricao: string; qtd: number; preco: number; total: number }[]; total: number }[]
}
export function JanelaOSParada({ p, onFechar, faturadaEm }: { p: Pendencia; onFechar: () => void; faturadaEm?: string }) {
  const [det, setDet] = useState<DetOS | null>(null)
  const [erro, setErro] = useState('')
  const [doc, setDoc] = useState<DocumentoVisualizavel | null>(null)
  useEffect(() => {
    let ativo = true
    ;(async () => {
      try {
        const r = await fetch(`/api/mecanicos/parado/${encodeURIComponent(p.os)}`, { headers: await authHeaders(), cache: 'no-store' })
        const j = await r.json()
        if (!ativo) return
        if (!r.ok) setErro(j.error || `Erro ${r.status}`); else setDet(j)
      } catch (e) { if (ativo) setErro(e instanceof Error ? e.message : 'Falha') }
    })()
    return () => { ativo = false }
  }, [p.os])
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !doc) onFechar() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onFechar, doc])
  if (typeof document === 'undefined') return null
  const o = det?.os || {}
  const s = (k: string) => String(o[k] ?? '').trim()
  const n = (k: string) => { const v = parseFloat(String(o[k] ?? '').replace(',', '.')); return Number.isFinite(v) ? v : 0 }
  const cor = COR_TIPO[p.tipo]
  const totPecas = det ? det.ppvs.reduce((a, x) => a + x.total, 0) : p.pecas
  const valores: [string, string, number, string | null][] = [
    ['Mão de obra', 'fa-clock', p.maoDeObra, det && n('Qtd_HR') ? `${n('Qtd_HR')} h × ${brl(n('Valor_HR') || p.maoDeObra / n('Qtd_HR'))}` : null],
    ['Deslocamento', 'fa-road', p.deslocamento, det && n('Qtd_KM') ? `${n('Qtd_KM')} km` : null],
    ['Peças', 'fa-gears', totPecas, det ? `${det.ppvs.reduce((a, x) => a + x.itens.length, 0)} itens` : null],
  ]
  return createPortal(
    <div className="pj-fundo" onClick={onFechar}>
      <style>{ESTILO_PA}</style>
      <div className="pj" style={{ '--c': cor } as React.CSSProperties} onClick={(e) => e.stopPropagation()}>
        <div className="pj-cab">
          {faturadaEm ? <div className="pj-dias" style={{ background: '#047857' }}><i className="fas fa-circle-check" style={{ fontSize: 22 }} /><small>faturada</small></div>
            : <div className="pj-dias" style={{ background: COR_IDADE[faixaDe(p.dias)] }}><b>{p.dias}</b><small>dias parada</small></div>}
          <div style={{ flex: 1, minWidth: 0 }}>
            <small className="pj-tipo" style={faturadaEm ? { color: '#047857' } : undefined}>{faturadaEm ? `Faturada em ${br(faturadaEm)}` : NOME_TIPO[p.tipo]}{p.garantia ? ' · garantia' : ''}</small>
            <h3>{p.os} <em>{p.status}</em></h3>
            <span>{p.cliente || '—'}{s('Cidade_Cliente') && ` · ${s('Cidade_Cliente')}`} · {p.tecnicos.join(' + ') || 'sem técnico'}</span>
          </div>
          <strong>{brl(p.total)}</strong>
          <button type="button" className="pj-x" onClick={onFechar} title="Fechar (Esc)"><i className="fas fa-xmark" /></button>
        </div>
        <div className="pj-corpo">
          <div className="pj-vals">
            {valores.map(([r, ic, v, sub], i) => (
              <div key={r} style={{ animationDelay: `${i * 70}ms` }}><small><i className={`fas ${ic}`} /> {r}</small><b>{brl(v)}</b>{sub && <span>{sub}</span>}</div>
            ))}
          </div>
          {!det && !erro && <div className="pj-carr"><i className="fas fa-circle-notch fa-spin" /> carregando a OS…</div>}
          {erro && <div className="pj-erro">{erro}</div>}
          {det && <>
            <div className="pj-info">
              {s('Tipo_Servico') && <span><small>Tipo</small>{s('Tipo_Servico')}{s('Revisao') && ` · ${s('Revisao')}`}</span>}
              {s('Projeto') && <span><small>Máquina</small>{s('Projeto')}</span>}
              {s('Data') && <span><small>Aberta em</small>{br(s('Data').slice(0, 10))}</span>}
              {p.dataRef && <span><small>{p.tipo === 'preenchida' ? 'Relatório / execução' : 'Último dia previsto'}</small>{br(p.dataRef)}</span>}
              {s('Ordem_Omie') && <span><small>Nº no Omie</small>{s('Ordem_Omie').replace(/^0+(?=\d)/, '')}</span>}
            </div>
            {(s('Serv_Solicitado') || s('Serv_Realizado')) && (
              <div className="pj-txt">
                {s('Serv_Solicitado') && <div><small>Serviço solicitado</small><p>{s('Serv_Solicitado')}</p></div>}
                {s('Serv_Realizado') && <div><small>Serviço realizado</small><p>{s('Serv_Realizado')}</p></div>}
              </div>
            )}
            <div className="pj-pecas">
              <b><i className="fas fa-gears" /> Peças {det.ppvs.length ? `(${det.ppvs.map((x) => x.id).join(', ')})` : ''}</b>
              {!det.ppvs.length && <small className="pj-nada">Nenhum pedido de peças vinculado a esta OS.</small>}
              {det.ppvs.map((x) => (
                <div key={x.id} className="pj-ppv">
                  <div className="pj-ppv-cab"><span>{x.id}</span>{x.status && <em>{x.status}</em>}{x.desconto > 0 && <em>desconto {x.desconto}%</em>}<b>{brl(x.total)}</b><button type="button" className="pj-ppv-pdf" onClick={() => setDoc({ titulo: `Pedido ${x.id} · ${p.cliente || ''}`, url: `/api/ppv/pdf?id=${encodeURIComponent(x.id)}`, nome: x.id })} title="ver o pedido em PDF"><i className="fas fa-file-pdf" /> PDF</button></div>
                  {x.itens.length ? (
                    <div className="pj-itens">
                      {x.itens.map((it, i) => (
                        <div key={it.cod} className="pj-it" style={{ animationDelay: `${i * 30}ms` }}><code>{it.cod}</code><span>{it.descricao || '—'}</span><small>{it.qtd} × {brl(it.preco)}</small><b>{brl(it.total)}</b></div>
                      ))}
                    </div>
                  ) : <small className="pj-nada">sem itens lançados</small>}
                </div>
              ))}
            </div>
          </>}
        </div>
        <div className="pj-rodape">
          <button type="button" onClick={() => setDoc({ titulo: `${p.os} · ${p.cliente || ''}`, url: `/api/pos/ordens/${encodeURIComponent(p.os)}/print`, nome: p.os })}><i className="fas fa-file-pdf" /> Ver a OS (PDF)</button>
          <a href={`/pos?id=${encodeURIComponent(p.os)}`} target="_blank" rel="noreferrer"><i className="fas fa-arrow-up-right-from-square" /> Abrir no POS</a>
        </div>
      </div>
      {doc && <div className="pj-doc" onClick={(e) => e.stopPropagation()}><VisualizadorDocumento key={doc.url} doc={doc} onClose={() => setDoc(null)} /></div>}
    </div>,
    (document.fullscreenElement as HTMLElement | null) || document.body,
  )
}

// ============================================================================
/** E2 — Esteira por idade: quatro colunas (até 7 dias → mais de 30) com uma ficha por OS; quanto mais à
 *  direita, mais velho. Ficha maior = OS de maior valor. */
export function ParadoEsteira({ pendencias }: { pendencias: Pendencia[] }) {
  const { lista, garantias, r, garantiaTotal } = useParadas(pendencias)
  const [ver, setVer] = useState<Filtro | null>(null)
  const [foco, setFoco] = useState<Pendencia | null>(null)
  const cols = FAIXAS_IDADE.map(([rot], k) => ({ rot, k, itens: lista.filter((p) => faixaDe(p.dias) === k).sort((a, b) => b.total - a.total) }))
  const maxV = Math.max(1, ...lista.map((p) => p.total))
  if (!lista.length) return <Vazio />
  return (
    <div className="pa-caixa">
      <Cabeca total={r.total.total} qtd={r.total.qtd} garantias={garantias.length} garantiaTotal={garantiaTotal} onTodas={() => setVer({ tipo: 'todos' })} />
      <div className="pa-leg"><span><i style={{ background: COR_TIPO.preenchida }} /> feito e não faturado</span><span><i style={{ background: COR_TIPO.atrasada }} /> passou da data sem preencher</span><span>ficha maior = OS de mais valor · clique abre a OS</span></div>
      <div className="pa-est">
        {cols.map((c) => {
          const tot = c.itens.reduce((s, p) => s + p.total, 0)
          return (
            <div key={c.rot} className="pa-est-col" style={{ '--c': COR_IDADE[c.k], animationDelay: `${c.k * 100}ms` } as React.CSSProperties}>
              <button type="button" className="pa-est-cab" onClick={() => setVer({ tipo: 'todos', idade: c.k })}>
                <small>{c.rot}</small><b>{brl(tot)}</b><span>{c.itens.length} OS</span>
              </button>
              <div className="pa-est-fichas">
                {c.itens.map((p, i) => {
                  const t = 0.35 + 0.65 * Math.sqrt(p.total / maxV)
                  return (
                    <a key={p.os} href={`/pos?id=${encodeURIComponent(p.os)}`} target="_blank" rel="noreferrer" className="pa-ficha" onMouseEnter={() => setFoco(p)} onMouseLeave={() => setFoco(null)}
                      style={{ '--t': COR_TIPO[p.tipo], minHeight: `${Math.round(26 + t * 34)}px`, animationDelay: `${c.k * 100 + i * 35}ms` } as React.CSSProperties}>
                      <b>{p.os}</b><span>{brl(p.total)}</span><small>{p.dias} d</small>
                    </a>
                  )
                })}
                {!c.itens.length && <small className="pa-nada">nada</small>}
              </div>
            </div>
          )
        })}
      </div>
      <div className="pa-dica">
        {foco ? <><b style={{ color: COR_TIPO[foco.tipo] }}>{foco.os}</b> · {foco.cliente || '—'} · {foco.tecnicos.join(' + ') || 'sem técnico'} · {foco.status} · <b>{brl(foco.total)}</b> (MO {brl(foco.maoDeObra)} · km {brl(foco.deslocamento)} · peças {brl(foco.pecas)}) · parada há {foco.dias} dias</>
          : <><i className="fas fa-hand-pointer" /> Passe o mouse numa ficha para ver a OS. Clique no título da coluna para a lista daquela idade.</>}
      </div>
      {ver && <ListaParadas lista={lista} filtro={ver} onFechar={() => setVer(null)} />}
    </div>
  )
}

// ============================================================================
/** E3 — Mapa técnico × idade: cada linha um técnico, cada coluna uma idade; a cor mostra onde está o
 *  dinheiro mais parado. Clique na célula abre as OS dela. */
export function ParadoMapa({ pendencias }: { pendencias: Pendencia[] }) {
  const { lista, garantias, r, garantiaTotal } = useParadas(pendencias)
  const [ver, setVer] = useState<Filtro | null>(null)
  const linhas = Object.entries(r.porTecnico).sort((a, b) => b[1].total - a[1].total).map(([t]) => {
    const minhas = lista.filter((p) => (p.tecnicos.length ? p.tecnicos : ['Sem técnico']).includes(t))
    const cel = FAIXAS_IDADE.map((_, k) => {
      const l = minhas.filter((p) => faixaDe(p.dias) === k)
      return { qtd: l.length, total: l.reduce((s, p) => s + p.total / Math.max(1, p.tecnicos.length), 0) }
    })
    return { t, cel, total: cel.reduce((s, c) => s + c.total, 0), qtd: minhas.length }
  })
  const max = Math.max(1, ...linhas.flatMap((l) => l.cel.map((c) => c.total)))
  const totCol = FAIXAS_IDADE.map((_, k) => linhas.reduce((s, l) => s + l.cel[k].total, 0))
  if (!lista.length) return <Vazio />
  return (
    <div className="pa-caixa">
      <Cabeca total={r.total.total} qtd={r.total.qtd} garantias={garantias.length} garantiaTotal={garantiaTotal} onTodas={() => setVer({ tipo: 'todos' })} />
      <div className="pa-mapa" style={{ gridTemplateColumns: `minmax(130px, 1.2fr) repeat(${FAIXAS_IDADE.length}, 1fr) minmax(110px, 1fr)` }}>
        <span className="pa-mt" />
        {FAIXAS_IDADE.map(([rot], k) => <span key={rot} className="pa-mt" style={{ color: COR_IDADE[k] }}>{rot}</span>)}
        <span className="pa-mt">Total</span>
        {linhas.map((l, i) => (
          <div key={l.t} style={{ display: 'contents' }}>
            <button type="button" className="pa-mn" onClick={() => setVer({ tipo: 'todos', tecnico: l.t })}><b>{l.t}</b><small>{l.qtd} OS</small></button>
            {l.cel.map((c, k) => {
              const a = c.total / max
              return (
                <button key={k} type="button" className="pa-mc" disabled={!c.qtd} onClick={() => setVer({ tipo: 'todos', tecnico: l.t, idade: k })}
                  style={{ background: c.qtd ? `color-mix(in srgb, ${COR_IDADE[k]} ${Math.round(12 + a * 70)}%, var(--portal-bg-card, #fefefe))` : undefined, color: a > 0.55 ? '#fefefe' : undefined, animationDelay: `${i * 60 + k * 40}ms` }}>
                  {c.qtd ? <><b>{brl(c.total)}</b><small>{c.qtd} OS</small></> : <small>—</small>}
                </button>
              )
            })}
            <span className="pa-mtot"><b>{brl(l.total)}</b></span>
          </div>
        ))}
        <span className="pa-mn pa-mfim"><b>Total</b></span>
        {totCol.map((v, k) => <span key={k} className="pa-mtot pa-mfim" style={{ color: COR_IDADE[k] }}><b>{brl(v)}</b></span>)}
        <span className="pa-mtot pa-mfim"><b>{brl(r.total.total)}</b></span>
      </div>
      <div className="pa-leg"><span>quanto mais forte a cor, mais dinheiro parado naquela idade · OS com 2 técnicos divide o valor</span></div>
      {ver && <ListaParadas lista={lista} filtro={ver} onFechar={() => setVer(null)} />}
    </div>
  )
}

// ============================================================================
/** E4 — Cartão por técnico: foto, quanto tem parado com ele, quanto é "feito" × "atrasado", a OS mais
 *  antiga e as 3 maiores. */
export function ParadoTecnicos({ pendencias, fotos }: { pendencias: Pendencia[]; fotos?: Record<string, string> }) {
  const { lista, garantias, r, garantiaTotal } = useParadas(pendencias)
  const [ver, setVer] = useState<Filtro | null>(null)
  const cards = Object.entries(r.porTecnico).sort((a, b) => b[1].total - a[1].total).map(([t, v]) => {
    const minhas = lista.filter((p) => (p.tecnicos.length ? p.tecnicos : ['Sem técnico']).includes(t))
    const parte = (tp: TipoPendencia) => minhas.filter((p) => p.tipo === tp).reduce((s, p) => s + p.total / Math.max(1, p.tecnicos.length), 0)
    return { t, v, feito: parte('preenchida'), atras: parte('atrasada'), velha: minhas.reduce((m, p) => (p.dias > (m?.dias ?? -1) ? p : m), null as Pendencia | null), top: [...minhas].sort((a, b) => b.total - a.total).slice(0, 3) }
  })
  if (!lista.length) return <Vazio />
  return (
    <div className="pa-caixa">
      <Cabeca total={r.total.total} qtd={r.total.qtd} garantias={garantias.length} garantiaTotal={garantiaTotal} onTodas={() => setVer({ tipo: 'todos' })} />
      <div className="pa-tecs">
        {cards.map((c, i) => {
          const foto = fotos?.[c.t]
          const tot = Math.max(1, c.feito + c.atras)
          return (
            <button key={c.t} type="button" className="pa-tc" style={{ animationDelay: `${i * 70}ms` }} onClick={() => setVer({ tipo: 'todos', tecnico: c.t })}>
              <div className="pa-tc-cab">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {foto ? <img src={foto} alt="" /> : <span className="pa-tc-av">{iniciais(c.t)}</span>}
                <div><b>{c.t}</b><small>{c.v.qtd} OS paradas</small></div>
                <strong>{brl(c.v.total)}</strong>
              </div>
              <div className="pa-tc-barra" title={`feito ${brl(c.feito)} · atrasado ${brl(c.atras)}`}>
                <i style={{ width: `${(c.feito / tot) * 100}%`, background: COR_TIPO.preenchida }} /><i style={{ width: `${(c.atras / tot) * 100}%`, background: COR_TIPO.atrasada }} />
              </div>
              <div className="pa-tc-leg"><span style={{ color: COR_TIPO.preenchida }}>feito {brl(c.feito)}</span><span style={{ color: COR_TIPO.atrasada }}>atrasado {brl(c.atras)}</span></div>
              {c.velha && <div className="pa-tc-velha" style={{ color: COR_IDADE[faixaDe(c.velha.dias)] }}><i className="fas fa-clock" /> mais antiga: {c.velha.os} há <b>{c.velha.dias} dias</b></div>}
              <div className="pa-tc-top">
                {c.top.map((p) => <span key={p.os}><em style={{ background: COR_TIPO[p.tipo] }} />{p.os}<small>{p.cliente || '—'}</small><b>{brl(p.total)}</b></span>)}
              </div>
            </button>
          )
        })}
      </div>
      {ver && <ListaParadas lista={lista} filtro={ver} onFechar={() => setVer(null)} />}
    </div>
  )
}

// ============================================================================
/** E5 — Bolhas: cada OS é uma bolha (direita = mais tempo parada, alto = mais valor). O canto de cima à
 *  direita é o que mais dói: muito dinheiro parado há muito tempo. */
export function ParadoBolhas({ pendencias }: { pendencias: Pendencia[] }) {
  const { lista, garantias, r, garantiaTotal } = useParadas(pendencias)
  const [ver, setVer] = useState<Filtro | null>(null)
  const [foco, setFoco] = useState<Pendencia | null>(null)
  const W = 1000, H = 300, P = 36
  const maxD = Math.max(31, ...lista.map((p) => p.dias)), maxV = Math.max(1, ...lista.map((p) => p.total))
  const x = (d: number) => P + (Math.sqrt(d) / Math.sqrt(maxD)) * (W - P * 2)
  const y = (v: number) => H - P - (v / maxV) * (H - P * 2)
  const dorida = lista.filter((p) => p.dias > 15 && p.total > maxV * 0.4)
  if (!lista.length) return <Vazio />
  return (
    <div className="pa-caixa">
      <Cabeca total={r.total.total} qtd={r.total.qtd} garantias={garantias.length} garantiaTotal={garantiaTotal} onTodas={() => setVer({ tipo: 'todos' })} />
      <div className="pa-bol">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
          <rect x={x(15)} y={P} width={W - P - x(15)} height={y(maxV * 0.4) - P} fill="#fef2f2" rx="10" />
          <text x={W - P - 8} y={P + 18} textAnchor="end" fontSize="13" fontWeight="800" fill="#b91c1c">muito valor, parado há muito tempo</text>
          {[7, 15, 30].filter((d) => d < maxD).map((d) => <g key={d}><line x1={x(d)} x2={x(d)} y1={P} y2={H - P} stroke="#e2e8f0" strokeDasharray="4 4" /><text x={x(d)} y={H - 12} textAnchor="middle" fontSize="12" fill="#94a3b8">{d} dias</text></g>)}
          <line x1={P} x2={W - P} y1={H - P} y2={H - P} stroke="#cbd5e1" />
          {lista.map((p, i) => (
            <circle key={p.os} cx={x(p.dias)} cy={y(p.total)} r={6 + Math.sqrt(p.total / maxV) * 16} fill={COR_TIPO[p.tipo]} fillOpacity={foco && foco.os !== p.os ? 0.15 : 0.6} stroke={COR_TIPO[p.tipo]} strokeWidth={foco?.os === p.os ? 3 : 1}
              className="pa-bolha" style={{ animationDelay: `${i * 25}ms` }} onMouseEnter={() => setFoco(p)} onMouseLeave={() => setFoco(null)} onClick={() => window.open(`/pos?id=${encodeURIComponent(p.os)}`, '_blank')} />
          ))}
        </svg>
        <span className="pa-bol-y">↑ valor</span><span className="pa-bol-x">tempo parado →</span>
      </div>
      <div className="pa-dica">
        {foco ? <><b style={{ color: COR_TIPO[foco.tipo] }}>{foco.os}</b> · {foco.cliente || '—'} · {foco.tecnicos.join(' + ') || 'sem técnico'} · <b>{brl(foco.total)}</b> parada há <b>{foco.dias} dias</b> · {NOME_TIPO[foco.tipo]}</>
          : dorida.length ? <><i className="fas fa-triangle-exclamation" style={{ color: '#dc2626' }} /> {dorida.length} OS no canto vermelho somam <b>{brl(dorida.reduce((s, p) => s + p.total, 0))}</b>: comece por elas. Passe o mouse numa bolha; clique abre a OS.</>
            : <><i className="fas fa-hand-pointer" /> Passe o mouse numa bolha; clique abre a OS.</>}
      </div>
      <div className="pa-leg"><span><i style={{ background: COR_TIPO.preenchida }} /> feito e não faturado</span><span><i style={{ background: COR_TIPO.atrasada }} /> passou da data sem preencher</span><span>bolha maior = mais valor</span></div>
      {ver && <ListaParadas lista={lista} filtro={ver} onFechar={() => setVer(null)} />}
    </div>
  )
}

function Vazio() { return <div className="pa-caixa" style={{ textAlign: 'center', color: MUDO }}>Nada parado agora.</div> }

export const ESTILO_PA = `
@keyframes paEntra { from { opacity: 0; transform: translateY(8px) } } @keyframes paPop { from { opacity: 0; transform: scale(.4) } } @keyframes paLado { from { transform: scaleX(0) } }
.pa-caixa { display: grid; gap: 14px; background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e5e7eb); border-radius: 18px; padding: 16px 18px; min-width: 0 }
.pa-cab { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; flex-wrap: wrap }
.pa-cab small { font-size: 12px; font-weight: 900; text-transform: uppercase; letter-spacing: .05em; color: ${MUDO} } .pa-cab h3 { margin: 2px 0; font-size: 22px; font-weight: 700; color: var(--portal-text, #0f172a) } .pa-cab h3 b { color: #b45309; font-weight: 900 }
.pa-gar { font-size: 12.5px; color: ${MUDO} } .pa-gar i { color: #7c3aed }
.pa-btn { border: 1px solid var(--portal-border, #e2e8f0); background: transparent; border-radius: 99px; padding: 6px 14px; font-family: inherit; font-weight: 800; font-size: 13px; color: #0369a1; cursor: pointer }
.pa-leg { display: flex; gap: 14px; flex-wrap: wrap; font-size: 12.5px; color: ${MUDO} } .pa-leg i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 5px; vertical-align: -1px }
.pa-dica { min-height: 22px; font-size: 13.5px; color: var(--portal-text, #334155); background: var(--portal-bg-secondary, #f8fafc); border-radius: 12px; padding: 8px 12px }
.pa-placar { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 10px }
.pa-pl { position: relative; display: grid; gap: 2px; text-align: left; font-family: inherit; border: 1px solid var(--portal-border, #e5e7eb); background: var(--portal-bg-card, #fefefe); border-radius: 16px; padding: 12px 14px; overflow: hidden; animation: paEntra .45s both; transition: transform .2s, box-shadow .2s }
button.pa-pl { cursor: pointer } button.pa-pl:hover { transform: translateY(-3px); box-shadow: 0 10px 22px rgba(15,23,42,.1) } .pa-pl.on { box-shadow: 0 0 0 2px var(--c) }
.pa-pl::before { content: ''; position: absolute; inset: 0 0 auto 0; height: 4px; background: var(--c) } .pa-pl > i { color: var(--c); font-size: 16px } .pa-pl small { font-size: 12px; font-weight: 900; text-transform: uppercase; color: var(--c) } .pa-pl b { font-size: 26px; font-variant-numeric: tabular-nums; color: var(--portal-text, #0f172a) } .pa-pl span { font-size: 12.5px; color: ${MUDO} }
.pa-fila-tit { display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap } .pa-fila-tit b { font-size: 15px } .pa-fila-tit b i { color: #b45309 } .pa-fila-tit small { font-size: 12.5px; color: ${MUDO} }
.pa-fila { display: grid; gap: 6px }
.pa-fl { display: grid; grid-template-columns: 28px 48px minmax(0, 2fr) minmax(80px, 1fr) 100px; gap: 10px; align-items: center; border: 1px solid var(--portal-border, #eef2f7); border-left: 5px solid var(--c); border-radius: 12px; padding: 8px 12px; text-decoration: none; color: inherit; animation: paEntra .4s both; transition: transform .2s, background .2s } .pa-fl:hover { transform: translateX(4px); background: var(--portal-bg-secondary, #f8fafc) }
.pa-fl-n { width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; background: var(--c); color: #fefefe; font-weight: 900; font-size: 13px }
.pa-fl-d { display: grid; justify-items: center; line-height: 1 } .pa-fl-d b { font-size: 20px; font-weight: 900 } .pa-fl-d small { font-size: 10px; font-weight: 800 }
.pa-fl-t { min-width: 0 } .pa-fl-t b { font-size: 14px } .pa-fl-t em { font-style: normal; font-size: 11.5px; font-weight: 700; color: ${MUDO}; background: var(--portal-bg-secondary, #f1f5f9); border-radius: 99px; padding: 1px 8px; margin-left: 4px } .pa-fl-t small { display: block; font-size: 12.5px; color: ${MUDO}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
.pa-fl-b { height: 8px; border-radius: 99px; background: var(--portal-bg-secondary, #f1f5f9); overflow: hidden } .pa-fl-b i { display: block; height: 100%; background: var(--c); border-radius: 99px; transform-origin: left; animation: paLado .8s both }
.pa-fl > strong { text-align: right; font-size: 15px; font-variant-numeric: tabular-nums }
.pa-est { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px } @media (max-width: 800px) { .pa-est { grid-template-columns: repeat(2, minmax(0, 1fr)) } }
.pa-est-col { display: grid; gap: 8px; align-content: start; background: var(--portal-bg-secondary, #f8fafc); border-radius: 16px; padding: 8px; animation: paEntra .45s both }
.pa-est-cab { display: grid; gap: 1px; text-align: left; border: none; border-top: 4px solid var(--c); background: var(--portal-bg-card, #fefefe); border-radius: 12px; padding: 8px 10px; font-family: inherit; cursor: pointer } .pa-est-cab small { font-size: 12px; font-weight: 900; text-transform: uppercase; color: var(--c) } .pa-est-cab b { font-size: 19px; font-variant-numeric: tabular-nums } .pa-est-cab span { font-size: 12px; color: ${MUDO} }
.pa-est-fichas { display: flex; flex-wrap: wrap; gap: 5px; max-height: 300px; overflow-y: auto }
.pa-ficha { flex: 1 1 88px; display: grid; align-content: center; gap: 0; border-radius: 10px; padding: 4px 8px; text-decoration: none; color: #fefefe; background: var(--t); animation: paPop .35s cubic-bezier(.3,1.5,.5,1) both; transition: transform .15s, box-shadow .15s } .pa-ficha:hover { transform: scale(1.06); box-shadow: 0 6px 16px rgba(15,23,42,.25) }
.pa-ficha b { font-size: 12px } .pa-ficha span { font-size: 12.5px; font-weight: 800 } .pa-ficha small { font-size: 10.5px; opacity: .85 }
.pa-nada { font-size: 12px; color: ${MUDO}; padding: 6px }
.pa-mapa { display: grid; gap: 4px; overflow-x: auto }
.pa-mt { font-size: 11.5px; font-weight: 900; text-transform: uppercase; color: ${MUDO}; text-align: center; padding: 4px } .pa-mt:first-child { text-align: left }
.pa-mn { display: grid; text-align: left; border: none; background: transparent; font-family: inherit; cursor: pointer; border-radius: 10px; padding: 6px 8px } .pa-mn:hover { background: var(--portal-bg-secondary, #f1f5f9) } .pa-mn b { font-size: 13.5px } .pa-mn small { font-size: 11.5px; color: ${MUDO} }
.pa-mc { display: grid; place-items: center; gap: 0; border: 1px solid var(--portal-border, #eef2f7); background: var(--portal-bg-card, #fefefe); border-radius: 10px; padding: 8px 4px; font-family: inherit; cursor: pointer; color: var(--portal-text, #0f172a); animation: paPop .35s both; transition: transform .15s } .pa-mc:hover:not(:disabled) { transform: scale(1.06) } .pa-mc:disabled { cursor: default; color: ${MUDO} }
.pa-mc b { font-size: 13.5px; font-variant-numeric: tabular-nums } .pa-mc small { font-size: 11px; opacity: .85 }
.pa-mtot { display: grid; place-items: center end; padding: 6px 8px; font-size: 13.5px; font-variant-numeric: tabular-nums } .pa-mfim { border-top: 2px solid var(--portal-border, #e2e8f0); padding-top: 8px }
.pa-tecs { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px }
.pa-tc { display: grid; gap: 8px; text-align: left; font-family: inherit; color: inherit; border: 1px solid var(--portal-border, #e5e7eb); background: var(--portal-bg-card, #fefefe); border-radius: 16px; padding: 12px 14px; cursor: pointer; animation: paEntra .45s both; transition: transform .2s, box-shadow .2s } .pa-tc:hover { transform: translateY(-3px); box-shadow: 0 12px 26px rgba(15,23,42,.1) }
.pa-tc-cab { display: flex; gap: 10px; align-items: center } .pa-tc-cab img, .pa-tc-av { width: 44px; height: 44px; border-radius: 50%; object-fit: cover; flex-shrink: 0 } .pa-tc-av { display: grid; place-items: center; background: #e0f2fe; color: #0369a1; font-weight: 900 }
.pa-tc-cab > div { flex: 1; min-width: 0 } .pa-tc-cab b { display: block; font-size: 15px } .pa-tc-cab small { font-size: 12px; color: ${MUDO} } .pa-tc-cab strong { font-size: 19px; color: #b45309; font-variant-numeric: tabular-nums }
.pa-tc-barra { display: flex; height: 10px; border-radius: 99px; overflow: hidden; background: var(--portal-bg-secondary, #f1f5f9) } .pa-tc-barra i { display: block; height: 100%; transform-origin: left; animation: paLado .8s both }
.pa-tc-leg { display: flex; justify-content: space-between; font-size: 12px; font-weight: 800 }
.pa-tc-velha { font-size: 12.5px; font-weight: 700 }
.pa-tc-top { display: grid; gap: 3px; border-top: 1px dashed var(--portal-border, #e5e7eb); padding-top: 6px } .pa-tc-top span { display: grid; grid-template-columns: 8px auto minmax(0, 1fr) auto; gap: 6px; align-items: center; font-size: 12.5px } .pa-tc-top em { width: 8px; height: 8px; border-radius: 50% } .pa-tc-top small { color: ${MUDO}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis } .pa-tc-top b { font-variant-numeric: tabular-nums }
.pa-bol { position: relative; height: 320px } .pa-bol svg { width: 100%; height: 100% } .pa-bolha { cursor: pointer; transform-box: fill-box; transform-origin: center; animation: paPop .45s cubic-bezier(.3,1.5,.5,1) both; transition: fill-opacity .2s }
.pa-bol-y { position: absolute; left: 4px; top: 4px; font-size: 12px; font-weight: 800; color: ${MUDO} } .pa-bol-x { position: absolute; right: 8px; bottom: 0; font-size: 12px; font-weight: 800; color: ${MUDO} }
.pa-limpa { margin-left: 8px; border: none; background: transparent; color: #0369a1; font-family: inherit; font-weight: 800; font-size: 12.5px; cursor: pointer; text-decoration: underline }
/* bloco 3 no estilo dos cartões do Faturamento por período (José, 21/10/2026): branco, ícone no quadradinho, sem negrito */
.pa-cheio .pc-n { color: #0f172a !important; background: #fefefe !important; border: 1px solid #e2e8f0 !important; box-shadow: none !important; gap: 6px !important }
.pa-cheio .pc-marca { display: none }
.pa-cheio .pc-n small { display: inline-flex; align-items: center; gap: 10px; font-size: 16px !important; font-weight: 500 !important; text-transform: none !important; letter-spacing: 0 !important; opacity: 1 !important; color: #0f172a }
.pa-cheio .pc-ic { width: 38px; height: 38px; border-radius: 11px; display: grid; place-items: center; font-size: 16px; color: var(--c); background: color-mix(in srgb, var(--c) 12%, #fefefe); border: 1px solid color-mix(in srgb, var(--c) 22%, #fefefe) }
.pa-cheio .pc-n b { font-size: 28px !important; font-weight: 500 !important; color: #0f172a; margin-top: 4px }
.pa-cheio .pc-n span { font-size: 13px !important; font-weight: 400 !important; opacity: 1 !important; color: #475569 } .pa-cheio .pc-n span em { color: var(--c); font-style: normal }
.pa-cheio button.pc-n:not(:disabled):hover { transform: translateY(-2px) !important; border-color: color-mix(in srgb, var(--c) 40%, #e2e8f0) !important; box-shadow: 0 12px 26px -18px rgba(15,23,42,.5) !important }
.pa-cheio .pc-n.on { outline: none !important; border-color: var(--c) !important; box-shadow: 0 0 0 1px var(--c), 0 12px 26px -18px var(--c) !important }
.pc-placar { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 12px }
.pc-n { position: relative; overflow: hidden; display: grid; gap: 2px; text-align: left; font-family: inherit; border: none; border-radius: 18px; padding: 14px 16px; color: #fefefe; background: linear-gradient(135deg, var(--c), color-mix(in srgb, var(--c) 70%, #0f172a)); box-shadow: 0 8px 20px color-mix(in srgb, var(--c) 30%, transparent); animation: paEntra .5s both; transition: transform .25s, box-shadow .25s, opacity .25s }
button.pc-n:not(:disabled) { cursor: pointer } button.pc-n:not(:disabled):hover { transform: translateY(-4px) scale(1.01); box-shadow: 0 14px 30px color-mix(in srgb, var(--c) 40%, transparent) } .pc-n:disabled { cursor: default } .pc-n.on { outline: 3px solid color-mix(in srgb, var(--c) 40%, #fefefe); outline-offset: 3px } .pc-n.apaga { opacity: .45 }
.pc-marca { position: absolute; right: -10px; bottom: -14px; font-size: 84px; opacity: .14; transform: rotate(-12deg); transition: transform .4s } .pc-n:hover .pc-marca { transform: rotate(0) scale(1.08) }
.pc-n small { font-size: 12px; font-weight: 900; text-transform: uppercase; letter-spacing: .04em; opacity: .9 } .pc-n b { font-size: 28px; font-weight: 900; font-variant-numeric: tabular-nums } .pc-n span { font-size: 12.5px; font-weight: 700; opacity: .9; display: flex; justify-content: space-between; gap: 8px } .pc-n em { font-style: normal; font-size: 11px; opacity: .85 }
.pc-fila { display: grid; gap: 6px }
.pc-fl { position: relative; display: grid; grid-template-columns: 30px minmax(0, 1fr) auto auto 110px; border: 1px solid #e8edf3 !important; background: #fefefe !important; gap: 12px; align-items: center; border-radius: 14px; padding: 10px 14px; text-decoration: none; color: inherit; background: var(--portal-bg-secondary, #f8fafc); overflow: hidden; animation: paEntra .4s both; transition: transform .2s }
.pc-fl::before { content: ''; position: absolute; inset: 8px auto 8px 0; width: 3px; border-radius: 0 3px 3px 0; background: var(--c); opacity: .7 } .pc-fl > * { position: relative } .pc-fl:hover { transform: translateY(-1px); box-shadow: 0 10px 22px -16px rgba(15,23,42,.45); border-color: color-mix(in srgb, var(--c) 35%, #e8edf3) !important }
.pc-fl-bar { display: block; height: 5px; border-radius: 99px; background: #f1f5f9; margin-top: 6px; overflow: hidden; max-width: 520px } .pc-fl-bar u { display: block; height: 100%; width: var(--w); border-radius: 99px; background: color-mix(in srgb, var(--c) 70%, #fefefe); transform-origin: left; animation: paLado .9s cubic-bezier(.2,.8,.2,1) both }
.pc-fl-s { font-style: normal; font-size: 12.5px; color: #334155; background: #f1f5f9; border-radius: 99px; padding: 3px 10px; white-space: nowrap; max-width: 260px; overflow: hidden; text-overflow: ellipsis }
.pc-fl-n { width: 28px; height: 28px; border-radius: 9px; display: grid; place-items: center; background: color-mix(in srgb, var(--c) 12%, #fefefe); color: color-mix(in srgb, var(--c) 85%, #0f172a); font-weight: 600; font-size: 13px }
.pc-fl-t { min-width: 0 } .pc-fl-t b { font-size: 14.5px; font-weight: 600 } .pc-fl-t small { display: block; font-size: 13px; color: #475569; white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
.pc-fl-d { font-size: 12.5px; font-weight: 600; color: color-mix(in srgb, var(--d) 85%, #0f172a); background: color-mix(in srgb, var(--d) 12%, #fefefe); border-radius: 99px; padding: 3px 10px; white-space: nowrap } .pc-fl-d i { font-size: 10px; margin-right: 2px }
.pc-fl > strong { text-align: right; font-size: 16px; font-weight: 500; font-variant-numeric: tabular-nums }
@media (max-width: 900px) { .pc-fl { grid-template-columns: 30px minmax(0, 1fr) 100px } .pc-fl-s, .pc-fl-d { display: none } }
.pl-faixa { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); border-top: 1px solid var(--portal-border, #e5e7eb); border-bottom: 1px solid var(--portal-border, #e5e7eb) } @media (max-width: 800px) { .pl-faixa { grid-template-columns: repeat(2, minmax(0, 1fr)) } }
.pl-n { position: relative; display: grid; gap: 2px; text-align: left; font-family: inherit; border: none; border-left: 1px solid var(--portal-border, #e5e7eb); background: transparent; padding: 14px 18px; color: inherit; animation: paEntra .45s both } .pl-n:first-child { border-left: none; padding-left: 4px }
.pl-n::after { content: ''; position: absolute; left: 18px; right: 18px; bottom: -1px; height: 3px; background: var(--c); transform: scaleX(0); transform-origin: left; transition: transform .3s } .pl-n:first-child::after { left: 4px }
button.pl-n:not(:disabled) { cursor: pointer } button.pl-n:not(:disabled):hover::after, .pl-n.on::after { transform: scaleX(1) } .pl-n:disabled { cursor: default }
.pl-n small { font-size: 12px; font-weight: 800; color: ${MUDO} } .pl-n b { font-size: 30px; font-weight: 900; color: var(--c); font-variant-numeric: tabular-nums; line-height: 1.1 } .pl-n span { font-size: 12.5px; color: ${MUDO} }
.pl-tab { display: grid }
.pl-tr { display: grid; grid-template-columns: 34px 90px 100px minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1fr) 150px; gap: 12px; align-items: center; padding: 9px 6px; border-bottom: 1px solid var(--portal-border, #f1f5f9); font-size: 13.5px; cursor: pointer; animation: paEntra .35s both; transition: background .15s } .pl-tr:not(.pl-th):hover { background: var(--portal-bg-secondary, #f8fafc) }
.pl-th { cursor: default; font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: .04em; color: ${MUDO}; border-bottom: 2px solid var(--portal-border, #e2e8f0) } .pl-th span:last-child { text-align: right }
.pl-pos { font-weight: 900; color: ${MUDO} } .pl-dias { font-style: normal; font-weight: 900 } .pl-cut { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--portal-text, #334155) }
.pl-ponto { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--c); margin-right: 6px }
.pl-val { display: grid; justify-items: end; gap: 3px } .pl-val b { font-size: 14.5px; font-variant-numeric: tabular-nums } .pl-val i { display: block; height: 4px; border-radius: 99px; background: var(--c); justify-self: end; transform-origin: right; animation: paLado .8s both }
@media (max-width: 800px) { .pl-tr { grid-template-columns: 26px 70px 1fr 110px } .pl-tr > :nth-child(4), .pl-tr > :nth-child(5), .pl-tr > :nth-child(6) { display: none } }
.pn-topo { display: grid; grid-template-columns: 200px 1fr; gap: 24px; align-items: center } @media (max-width: 700px) { .pn-topo { grid-template-columns: 1fr } }
.pn-anel { position: relative; width: 190px; height: 190px } .pn-anel svg { width: 100%; height: 100%; transform: rotate(-90deg) } .pn-anel circle { fill: none; stroke-width: 14 }
.pn-fundo { stroke: var(--portal-bg-secondary, #f1f5f9) } .pn-atras { stroke: ${COR_TIPO.atrasada}; stroke-dasharray: 314 314; animation: pnRoda 1.1s cubic-bezier(.2,.8,.2,1) both } .pn-feito { stroke: ${COR_TIPO.preenchida}; stroke-linecap: round; animation: pnRoda 1.3s .2s cubic-bezier(.2,.8,.2,1) both }
@keyframes pnRoda { from { stroke-dasharray: 0 314 } }
.pn-anel > div { position: absolute; inset: 0; display: grid; place-content: center; text-align: center } .pn-anel b { font-size: 34px; font-weight: 900; color: ${COR_TIPO.preenchida} } .pn-anel small { font-size: 12px; font-weight: 800; color: ${MUDO} }
.pn-lista { display: grid; gap: 2px }
.pn-l { display: grid; grid-template-columns: 22px minmax(0, 1fr) auto 70px; gap: 10px; align-items: center; text-align: left; font-family: inherit; border: none; background: transparent; border-radius: 10px; padding: 8px 10px; color: inherit; animation: paEntra .4s both; transition: background .2s } .pn-l > i { color: var(--c) }
button.pn-l:not(:disabled) { cursor: pointer } button.pn-l:not(:disabled):hover, .pn-l.on { background: color-mix(in srgb, var(--c) 9%, transparent) } .pn-l.on span { color: var(--c) } .pn-l:disabled { cursor: default }
.pn-l span { font-size: 14px; font-weight: 700 } .pn-l b { font-size: 21px; font-weight: 900; color: var(--c); font-variant-numeric: tabular-nums } .pn-l small { font-size: 12px; color: ${MUDO}; text-align: right }
.pn-fila { display: grid; gap: 7px }
.pn-fl { display: grid; grid-template-columns: 24px minmax(0, 1fr) 76px; gap: 10px; align-items: center; cursor: pointer; animation: paEntra .4s both } .pn-fl:hover .pn-fl-barra > i { filter: brightness(1.08) }
.pn-fl-n { font-size: 14px; font-weight: 900; color: ${MUDO}; text-align: center }
.pn-fl-barra { display: flex; align-items: center; gap: 10px; min-width: 0 }
.pn-fl-barra > i { display: flex; gap: 8px; align-items: baseline; min-width: 0; height: 34px; padding: 0 12px; border-radius: 10px; color: #fefefe; font-style: normal; align-items: center; overflow: hidden; transform-origin: left; animation: paLado .8s cubic-bezier(.2,.8,.2,1) both; transition: filter .2s }
.pn-fl-barra > i b { font-size: 13.5px; white-space: nowrap } .pn-fl-barra > i small { font-size: 12px; opacity: .9; white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
.pn-fl-barra > strong { font-size: 15px; font-variant-numeric: tabular-nums; white-space: nowrap }
.pn-fl-d { font-size: 12.5px; font-weight: 700; text-align: right } .pn-fl-d b { font-size: 16px; font-weight: 900 }
.pj-fundo { position: fixed; inset: 0; z-index: 100050; background: rgba(15,23,42,.45); backdrop-filter: blur(3px); display: flex; align-items: center; justify-content: center; padding: 16px; animation: pjFundo .25s both } @keyframes pjFundo { from { opacity: 0 } }
.pj { width: min(980px, 100%); max-height: 90vh; display: flex; flex-direction: column; background: var(--portal-bg-card, #fefefe); border-radius: 20px; box-shadow: 0 30px 80px rgba(15,23,42,.35); overflow: hidden; border-top: 6px solid var(--c); animation: pjAbre .45s cubic-bezier(.2,1.15,.3,1) both } @keyframes pjAbre { from { opacity: 0; transform: translateY(28px) scale(.94) } }
.pj-cab { display: flex; gap: 14px; align-items: center; padding: 16px 18px; border-bottom: 1px solid var(--portal-border, #e5e7eb); background: linear-gradient(100deg, color-mix(in srgb, var(--c) 8%, transparent), transparent 60%) }
.pj-dias { width: 64px; height: 64px; border-radius: 16px; display: grid; place-content: center; text-align: center; color: #fefefe; flex-shrink: 0 } .pj-dias b { font-size: 24px; line-height: 1 } .pj-dias small { font-size: 9.5px; font-weight: 800 }
.pj-tipo { font-size: 11.5px; font-weight: 900; text-transform: uppercase; color: var(--c) } .pj-cab h3 { margin: 1px 0; font-size: 21px; color: var(--portal-text, #0f172a) } .pj-cab h3 em { font-style: normal; font-size: 12.5px; font-weight: 700; color: ${MUDO}; background: var(--portal-bg-secondary, #f1f5f9); border-radius: 99px; padding: 2px 10px; vertical-align: 3px } .pj-cab span { font-size: 13px; color: ${MUDO} }
.pj-cab > strong { font-size: 24px; color: var(--portal-text, #0f172a); font-variant-numeric: tabular-nums; white-space: nowrap }
.pj-x { width: 38px; height: 38px; border-radius: 50%; border: 1px solid var(--portal-border, #e2e8f0); background: transparent; cursor: pointer; color: ${MUDO}; flex-shrink: 0 }
.pj-corpo { overflow-y: auto; padding: 16px 18px; display: grid; gap: 14px }
.pj-vals { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px } .pj-vals > div { display: grid; gap: 1px; background: var(--portal-bg-secondary, #f8fafc); border-radius: 14px; padding: 10px 12px; animation: paEntra .4s both } .pj-vals small { font-size: 11.5px; font-weight: 900; text-transform: uppercase; color: ${MUDO} } .pj-vals b { font-size: 20px; font-variant-numeric: tabular-nums } .pj-vals span { font-size: 12px; color: ${MUDO} }
.pj-carr, .pj-nada { color: ${MUDO}; font-size: 13px } .pj-erro { color: #b91c1c; background: #fef2f2; border-radius: 10px; padding: 8px 12px; font-size: 13px }
.pj-info { display: flex; gap: 8px 18px; flex-wrap: wrap } .pj-info span { display: grid; font-size: 13.5px; font-weight: 700 } .pj-info small { font-size: 11px; font-weight: 800; text-transform: uppercase; color: ${MUDO} }
.pj-txt { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 10px } .pj-txt > div { border: 1px solid var(--portal-border, #eef2f7); border-radius: 12px; padding: 8px 12px } .pj-txt small { font-size: 11px; font-weight: 900; text-transform: uppercase; color: ${MUDO} } .pj-txt p { margin: 3px 0 0; font-size: 13.5px; white-space: pre-wrap; max-height: 120px; overflow-y: auto }
.pj-pecas { display: grid; gap: 8px } .pj-pecas > b { font-size: 15px } .pj-pecas > b i { color: #ea580c }
.pj-ppv { border: 1px solid var(--portal-border, #e5e7eb); border-radius: 14px; overflow: hidden }
.pj-ppv-pdf { margin-left: 6px; border: 1px solid #fdba74; background: #fefefe; color: #c2410c; border-radius: 99px; padding: 2px 10px; font-family: inherit; font-size: 12px; font-weight: 700; cursor: pointer } .pj-ppv-pdf:hover { background: #ffedd5 }
.pj-ppv-cab { display: flex; gap: 8px; align-items: center; padding: 8px 12px; background: #fff7ed } .pj-ppv-cab span { font-weight: 900; color: #c2410c } .pj-ppv-cab em { font-style: normal; font-size: 11.5px; font-weight: 800; color: #9a3412; background: #ffedd5; border-radius: 99px; padding: 1px 8px } .pj-ppv-cab b { margin-left: auto; font-variant-numeric: tabular-nums }
.pj-itens { display: grid } .pj-it { display: grid; grid-template-columns: 140px minmax(0, 1fr) 120px 100px; gap: 10px; align-items: center; padding: 6px 12px; border-top: 1px solid var(--portal-border, #f1f5f9); font-size: 13px; animation: paEntra .3s both }
.pj-it code { font-size: 12px; color: ${MUDO}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis } .pj-it span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis } .pj-it small { color: ${MUDO}; text-align: right } .pj-it b { text-align: right; font-variant-numeric: tabular-nums }
@media (max-width: 700px) { .pj-vals { grid-template-columns: 1fr } .pj-it { grid-template-columns: minmax(0, 1fr) 90px } .pj-it code, .pj-it small { display: none } }
.pj-rodape { display: flex; gap: 8px; justify-content: flex-end; padding: 12px 18px; border-top: 1px solid var(--portal-border, #e5e7eb) }
.pj-rodape button, .pj-rodape a { display: inline-flex; gap: 6px; align-items: center; border: 1px solid var(--portal-border, #e2e8f0); background: var(--portal-bg-card, #fefefe); border-radius: 99px; padding: 7px 14px; font-family: inherit; font-weight: 800; font-size: 13px; color: var(--portal-text, #334155); cursor: pointer; text-decoration: none } .pj-rodape button:hover, .pj-rodape a:hover { border-color: #0369a1; color: #0369a1 }
.pj-doc { position: fixed; inset: 0; z-index: 100080; animation: pjFundo .3s both }
button.pc-fl { border: none; font-family: inherit; text-align: left; cursor: pointer; width: 100% }
`
