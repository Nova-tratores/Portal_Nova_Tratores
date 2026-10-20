'use client'
// Planta Viva — a empresa vista de cima (docs/planta-viva-plano.md, Gate 2).
// Lê GET /api/planta (números gravados pelo worker a cada 5 min) e, ao clicar num número,
// GET /api/planta/kpi/<id> (os registros que formam o número, com link para a tela oficial).
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Lock, X, ExternalLink, Wrench } from 'lucide-react'
import { authHeaders } from '@/lib/auth/client'
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus'
import { useAuditLog } from '@/hooks/useAuditLog'
import s from './planta.module.css'

type Frescor = 'verde' | 'amarelo' | 'vermelho'
type Conta = 'NOVA' | 'CASTRO' | 'TODAS'
type Camada = 'agua' | 'gas' | 'luz'
interface Kpi {
  kpi_id: string; conta: string; comodo: string; rotulo: string; tela: string
  contagem: number; valor: number | null; detalhe: Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
  sensivel: boolean; lacrado: boolean; erro: string | null
  dado_ate: string | null; idade_min: number | null; frescor: Frescor
}
interface Item { chave: string; titulo: string; sub: string; valor: number | null; data: string | null; href: string | null }

// ── Desenho da planta ─────────────────────────────────────────────────────────
const SALAS: Array<{ id: string; nome: string; camada: Camada | null; kpis: string[] }> = [
  { id: 'financeiro', nome: 'Financeiro', camada: 'agua', kpis: ['receber_vencido', 'pagar_vencido', 'receber_7d', 'pagar_7d', 'receber_hoje', 'pagar_hoje', 'fluxo_30d', 'fila_financeiro'] },
  { id: 'maquinas', nome: 'Sala de máquinas', camada: null, kpis: ['robos'] },
  { id: 'patio', nome: 'Pátio e máquinas vindo', camada: 'gas', kpis: ['maq_em_transito', 'maq_pedido_fabrica', 'maq_recebida_sem_faturar', 'maq_receb_esquecido'] },
  { id: 'oficina', nome: 'Oficina', camada: 'luz', kpis: ['os_por_fase', 'os_atrasada', 'os_sem_faturar'] },
  { id: 'balcao', nome: 'Balcão de peças', camada: 'luz', kpis: ['ppv_aberto'] },
  { id: 'almoxarifado', nome: 'Almoxarifado', camada: 'luz', kpis: ['pecas_a_alocar', 'estoque_negativo'] },
]
const CAMADA_DO_KPI: Record<string, Camada> = {}
for (const sl of SALAS) for (const k of sl.kpis) if (sl.camada) CAMADA_DO_KPI[k] = sl.camada
const CAMADAS: Array<{ id: Camada; nome: string }> = [{ id: 'agua', nome: 'Dinheiro' }, { id: 'gas', nome: 'Máquinas' }, { id: 'luz', nome: 'Pedidos e peças' }]

// Canos: de uma sala (ou de fora da planta) para outra; o número dá o fluxo e a idade.
type Ponta = string | 'fora-esq' | 'fora-dir'
const CANOS: Array<{ id: string; de: Ponta; para: Ponta; camada: Camada; kpi: string; rotulo: string }> = [
  { id: 'entra-receber', de: 'fora-esq', para: 'financeiro', camada: 'agua', kpi: 'receber_7d', rotulo: 'a receber' },
  { id: 'oficina-caixa', de: 'oficina', para: 'financeiro', camada: 'agua', kpi: 'os_sem_faturar', rotulo: 'OS a faturar' },
  { id: 'estrada', de: 'fora-dir', para: 'patio', camada: 'gas', kpi: 'maq_em_transito', rotulo: 'estrada' },
  { id: 'almox-balcao', de: 'almoxarifado', para: 'balcao', camada: 'luz', kpi: 'ppv_aberto', rotulo: 'peças' },
  { id: 'balcao-oficina', de: 'balcao', para: 'oficina', camada: 'luz', kpi: 'os_por_fase', rotulo: 'peças p/ OS' },
  { id: 'doca', de: 'fora-dir', para: 'almoxarifado', camada: 'luz', kpi: 'pecas_a_alocar', rotulo: 'doca' },
]

const UNIDADE: Record<string, [string, string]> = {
  maq_em_transito: ['máquina', 'máquinas'], maq_receb_esquecido: ['máquina', 'máquinas'], maq_pedido_fabrica: ['pedido', 'pedidos'],
  maq_recebida_sem_faturar: ['máquina', 'máquinas'], ppv_aberto: ['pedido', 'pedidos'], os_por_fase: ['OS', 'OS'], os_atrasada: ['OS', 'OS'],
  os_sem_faturar: ['OS', 'OS'], pecas_a_alocar: ['peça', 'peças'], estoque_negativo: ['produto', 'produtos'], fila_financeiro: ['pedido', 'pedidos'],
}
const un = (id: string, n: number) => { const u = UNIDADE[id] || ['título', 'títulos']; return `${n.toLocaleString('pt-BR')} ${n === 1 ? u[0] : u[1]}` }
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const compacto = (v: number) => {
  const a = Math.abs(v), sinal = v < 0 ? '−' : ''
  if (a >= 1e6) return `${sinal}R$ ${(a / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} mi`
  if (a >= 1e3) return `${sinal}R$ ${Math.round(a / 1e3).toLocaleString('pt-BR')} mil`
  return `${sinal}R$ ${Math.round(a).toLocaleString('pt-BR')}`
}
const idadeTexto = (min: number | null) => min == null ? 'idade desconhecida' : min < 1 ? 'agora' : min < 60 ? `há ${min} min` : min < 48 * 60 ? `há ${Math.round(min / 60)} h` : `há ${Math.round(min / 1440)} d`
const brData = (iso: string | null) => iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : ''
const pior = (fs: Frescor[]): Frescor => fs.includes('vermelho') ? 'vermelho' : fs.includes('amarelo') ? 'amarelo' : 'verde'

function lerConta(): Conta {
  try { const c = localStorage.getItem('planta-conta'); return c === 'NOVA' || c === 'CASTRO' ? c : 'TODAS' } catch { return 'TODAS' }
}

export default function PlantaViva() {
  const { log } = useAuditLog()
  const [conta, setConta] = useState<Conta>('TODAS')
  const [kpis, setKpis] = useState<Kpi[]>([])
  const [admin, setAdmin] = useState(false)
  const [calculadoEm, setCalculadoEm] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [camadas, setCamadas] = useState<Record<Camada, boolean>>({ agua: true, gas: true, luz: true })
  const [aberto, setAberto] = useState<string | null>(null)
  const [agora, setAgora] = useState(0) // hora da última leitura (Date.now fora do render)

  useEffect(() => { setConta(lerConta()) }, [])
  const carregar = useCallback(async (c: Conta) => {
    try {
      const r = await fetch(`/api/planta?conta=${c}`, { headers: await authHeaders(), cache: 'no-store' })
      const j = await r.json()
      if (j.migracaoFaltando) { setErro('A tabela da planta ainda não existe no banco.'); return }
      if (!r.ok) { setErro(j.erro || `Erro ${r.status}`); return }
      setKpis(j.kpis || []); setAdmin(!!j.admin); setCalculadoEm(j.calculadoEm || null); setErro(null); setAgora(Date.now())
    } catch { setErro('Sem conexão com o portal agora. Tentando de novo em 1 min.') }
    finally { setCarregando(false) }
  }, [])
  useEffect(() => { carregar(conta); const t = setInterval(() => carregar(conta), 60_000); return () => clearInterval(t) }, [conta, carregar])
  useRefreshOnFocus(() => carregar(conta))
  useEffect(() => { log({ sistema: 'planta', acao: 'acesso' }) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const porId = useMemo(() => Object.fromEntries(kpis.map((k) => [k.kpi_id, k])), [kpis])
  const trocarConta = (c: Conta) => { setConta(c); try { localStorage.setItem('planta-conta', c) } catch { /* sem armazenamento */ } }
  const abrir = (id: string) => { setAberto(id); log({ sistema: 'planta', acao: 'abrir', entidade: 'kpi', entidade_id: id }) }

  // Medidas das salas para desenhar os canos sobre a grade.
  const plantaRef = useRef<HTMLDivElement>(null)
  const salaRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const [caixas, setCaixas] = useState<{ w: number; h: number; salas: Record<string, DOMRect> } | null>(null)
  const medir = useCallback(() => {
    const p = plantaRef.current
    if (!p) return
    const base = p.getBoundingClientRect()
    const salas: Record<string, DOMRect> = {}
    for (const [id, el] of Object.entries(salaRefs.current)) {
      if (!el) continue
      const r = el.getBoundingClientRect()
      salas[id] = new DOMRect(r.left - base.left, r.top - base.top, r.width, r.height)
    }
    setCaixas({ w: base.width, h: base.height, salas })
  }, [])
  useLayoutEffect(() => {
    medir()
    const ro = new ResizeObserver(medir)
    if (plantaRef.current) ro.observe(plantaRef.current)
    return () => ro.disconnect()
  }, [medir, kpis.length])

  const kpiAberto = aberto ? porId[aberto] : null
  const calculado = calculadoEm && agora ? Math.max(0, Math.round((agora - new Date(calculadoEm).getTime()) / 60000)) : null

  return (
    <div className={s.raiz}>
      <div className={s.topo}>
        <div>
          <h1 className={s.titulo}>Planta Viva</h1>
          <div className={s.subtitulo}>A empresa vista de cima. Clique num número para ver os registros e abrir a tela oficial.</div>
        </div>
        <div className={s.controles}>
          <div className={s.grupo} role="group" aria-label="Empresa">
            {(['TODAS', 'NOVA', 'CASTRO'] as Conta[]).map((c) => (
              <button key={c} type="button" aria-pressed={conta === c} onClick={() => trocarConta(c)}>{c === 'TODAS' ? 'Todas' : c}</button>
            ))}
          </div>
          <div className={s.grupo} role="group" aria-label="Camadas">
            {CAMADAS.map((c) => (
              <button key={c.id} type="button" aria-pressed={camadas[c.id]} onClick={() => setCamadas((v) => ({ ...v, [c.id]: !v[c.id] }))}>{c.nome}</button>
            ))}
          </div>
          <span className={s.atualizado}>{calculado == null ? '' : `Calculado ${idadeTexto(calculado)}`}</span>
        </div>
      </div>

      {erro && <div className={s.aviso} role="status">{erro}</div>}
      {!admin && !carregando && !erro && (
        <div className={s.aviso}><Lock size={13} style={{ verticalAlign: '-2px' }} /> Os valores do financeiro e os R$ ficam lacrados: só administradores veem.</div>
      )}

      <div className={s.planta} ref={plantaRef}>
        {caixas && (
          <svg className={s.canos} viewBox={`0 0 ${caixas.w} ${caixas.h}`} aria-hidden="true">
            {CANOS.map((c) => {
              const d = caminho(c.de, c.para, caixas)
              if (!d) return null
              const k = porId[c.kpi]
              const parado = !k || k.frescor !== 'verde' || !!k.erro
              const largura = 5 + Math.min(5, Math.log10(1 + (k?.contagem || 0)) * 2)
              const cls = [s.cano, s[c.camada], parado ? s.parado : s.correndo, camadas[c.camada] ? '' : s.apagado].join(' ')
              return <path key={c.id} d={d.path} className={cls} strokeWidth={largura}><title>{c.rotulo}</title></path>
            })}
          </svg>
        )}
        <div className={s.salas}>
          {SALAS.map((sala) => {
            const ks = sala.kpis.map((id) => porId[id]).filter(Boolean) as Kpi[]
            const f = ks.length ? pior(ks.map((k) => k.frescor)) : 'vermelho'
            const obras = ks.some((k) => k.erro)
            const idade = ks.length ? Math.max(...ks.map((k) => k.idade_min ?? 1e9)) : null
            const apagada = sala.camada ? !camadas[sala.camada] : false
            return (
              <div key={sala.id} ref={(el) => { salaRefs.current[sala.id] = el }} style={{ gridArea: sala.id }}
                className={[s.sala, apagada ? s.apagada : '', obras ? s.obras : ''].join(' ')}>
                <div className={s.salaTopo}>
                  <span className={s.salaNome}>{sala.nome}</span>
                  <span className={s.salaIdade} title="Idade do dado mais velho deste cômodo">
                    <i className={[s.ponto, s[f]].join(' ')} />
                    {obras ? <><Wrench size={12} /> em obras</> : idade == null || idade >= 1e9 ? '—' : `dado ${idadeTexto(idade)}`}
                  </span>
                </div>
                <div className={s.chips}>
                  {carregando && !ks.length ? <span className={s.mudo}>Carregando…</span> : null}
                  {ks.map((k) => <Chip key={k.kpi_id} k={k} ativo={aberto === k.kpi_id} onClick={() => abrir(k.kpi_id)} />)}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className={s.legenda}>
        <span><i className={[s.traco, s.agua].join(' ')} /> dinheiro</span>
        <span><i className={[s.traco, s.gas].join(' ')} /> máquinas</span>
        <span><i className={[s.traco, s.luz].join(' ')} /> pedidos e peças</span>
        <span>cano correndo = dado em dia · pontilhado parado = dado velho</span>
        <span><i className={[s.ponto, s.verde].join(' ')} /> em dia <i className={[s.ponto, s.amarelo].join(' ')} /> atrasando <i className={[s.ponto, s.vermelho].join(' ')} /> velho ou com erro</span>
      </div>

      {kpiAberto && <Inspetor key={`${kpiAberto.kpi_id}-${conta}`} k={kpiAberto} conta={conta} agora={agora} onFechar={() => setAberto(null)} />}
    </div>
  )
}

function Chip({ k, ativo, onClick }: { k: Kpi; ativo: boolean; onClick: () => void }) {
  const camada = CAMADA_DO_KPI[k.kpi_id]
  const principal = k.kpi_id === 'robos' ? `${Object.values(k.detalhe || {}).filter((r: any) => r && r.status === 'ok').length}/${k.contagem} ok` // eslint-disable-line @typescript-eslint/no-explicit-any
    : k.valor != null ? compacto(k.valor) : un(k.kpi_id, k.contagem)
  const sub = k.kpi_id === 'robos' ? 'última rodada de cada robô'
    : k.kpi_id === 'fluxo_30d' ? 'receber − pagar, por semana'
    : k.valor != null ? un(k.kpi_id, k.contagem) : ''
  return (
    <button type="button" onClick={onClick} className={[s.chip, camada ? s[camada] : '', ativo ? s.ativo : ''].join(' ')}>
      <div className={s.chipRotulo}>{k.rotulo}</div>
      {k.lacrado
        ? <div className={s.lacre}><Lock size={13} /> só admin</div>
        : <div className={s.chipValor}>{principal}</div>}
      <div className={s.chipSub}>{k.lacrado ? un(k.kpi_id, k.contagem) : sub}{k.erro ? ' · em obras' : ''}</div>
    </button>
  )
}

// Caminho em L entre duas salas (ou da borda da planta até uma sala).
function caminho(de: Ponta, para: Ponta, cx: { w: number; h: number; salas: Record<string, DOMRect> }): { path: string } | null {
  const ponto = (p: Ponta, alvo: DOMRect | null): [number, number] | null => {
    if (p === 'fora-esq') return [0, alvo ? alvo.y + alvo.height * 0.3 : cx.h / 2]
    if (p === 'fora-dir') return [cx.w, alvo ? alvo.y + alvo.height * 0.5 : cx.h / 2]
    const r = cx.salas[p]
    return r ? [r.x + r.width / 2, r.y + r.height / 2] : null
  }
  const rPara = typeof para === 'string' && cx.salas[para] ? cx.salas[para] : null
  const rDe = typeof de === 'string' && cx.salas[de] ? cx.salas[de] : null
  const a = ponto(de, rPara), b = ponto(para, rDe ?? rPara)
  if (!a || !b) return null
  // Vai na horizontal até o x do destino e depois na vertical (os centros ficam sob as salas, que cobrem o cano).
  return { path: `M ${a[0]} ${a[1]} L ${b[0]} ${a[1]} L ${b[0]} ${b[1]}` }
}

function Inspetor({ k, conta, agora, onFechar }: { k: Kpi; conta: Conta; agora: number; onFechar: () => void }) {
  const [itens, setItens] = useState<Item[] | null>(null)
  const [total, setTotal] = useState(0)
  const [erro, setErro] = useState<string | null>(null)
  const semLista = k.lacrado || k.kpi_id === 'robos'
  useEffect(() => {
    const fechar = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar() }
    window.addEventListener('keydown', fechar)
    return () => window.removeEventListener('keydown', fechar)
  }, [onFechar])
  useEffect(() => {
    if (semLista) return
    let vivo = true // o painel é remontado por chave (número + empresa): começa sempre vazio
    ;(async () => {
      try {
        const r = await fetch(`/api/planta/kpi/${k.kpi_id}?conta=${conta}`, { headers: await authHeaders(), cache: 'no-store' })
        const j = await r.json()
        if (!vivo) return
        if (!r.ok) { setErro(j.erro || `Erro ${r.status}`); return }
        setItens(j.itens || []); setTotal(j.total || 0)
      } catch { if (vivo) setErro('Não deu para carregar os registros agora.') }
    })()
    return () => { vivo = false }
  }, [k.kpi_id, conta, semLista])

  const numero = k.lacrado ? un(k.kpi_id, k.contagem) : k.valor != null ? brl(k.valor) : un(k.kpi_id, k.contagem)
  return (
    <>
      <div className={s.fundo} onClick={onFechar} />
      <aside className={s.inspetor} role="dialog" aria-label={k.rotulo}>
        <div className={s.inspTopo}>
          <div>
            <div className={s.secaoTitulo}>{k.conta === 'TODAS' ? 'NOVA + CASTRO' : k.conta}</div>
            <div style={{ fontSize: 17, fontWeight: 800 }}>{k.rotulo}</div>
          </div>
          <button type="button" className={s.fechar} onClick={onFechar} aria-label="Fechar"><X size={14} /></button>
        </div>
        <div>
          <div className={s.inspNumero}>{numero}</div>
          {!k.lacrado && k.valor != null && <div className={s.mudo}>{un(k.kpi_id, k.contagem)}</div>}
          <div className={s.mudo} style={{ marginTop: 4 }}>
            <i className={[s.ponto, s[k.frescor]].join(' ')} /> dado {idadeTexto(k.idade_min)}{k.dado_ate ? ` (${new Date(k.dado_ate).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })})` : ''}
          </div>
          {k.erro && <div className={s.aviso} style={{ marginTop: 8 }}><Wrench size={13} style={{ verticalAlign: '-2px' }} /> A última leitura falhou e o número é o da rodada anterior: {k.erro}</div>}
        </div>

        {!k.lacrado && <Detalhe k={k} agora={agora} />}

        {k.lacrado && <div className={s.aviso}><Lock size={13} style={{ verticalAlign: '-2px' }} /> Os valores e a lista deste número são só para administradores.</div>}

        {!semLista && (
          <div className={s.secao}>
            <div className={s.secaoTitulo}>Registros {itens ? `(${total > itens.length ? `${itens.length} de ${total}` : total})` : ''}</div>
            {erro && <div className={s.mudo}>{erro}</div>}
            {!itens && !erro && <div className={s.mudo}>Carregando os registros…</div>}
            {itens && itens.length === 0 && <div className={s.mudo}>Nada aqui agora.</div>}
            <div className={s.itens}>
              {(itens || []).map((it) => {
                const corpo = (
                  <>
                    <span className={s.itemTitulo}>{it.titulo}</span>
                    <span className={[s.itemValor, (it.valor || 0) < 0 ? s.neg : ''].join(' ')}>{it.valor == null ? '' : brl(it.valor)}</span>
                    <span className={s.itemSub}>{it.sub}</span>
                  </>
                )
                return it.href ? <Link key={it.chave} href={it.href} className={s.item}>{corpo}</Link> : <div key={it.chave} className={s.item}>{corpo}</div>
              })}
            </div>
          </div>
        )}

        {k.tela && (
          <Link href={k.tela} className={s.oficial}>Abrir a tela oficial <ExternalLink size={13} style={{ verticalAlign: '-2px' }} /></Link>
        )}
      </aside>
    </>
  )
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function Detalhe({ k, agora }: { k: Kpi; agora: number }) {
  const d = k.detalhe || {}
  // KPI por conta em TODAS: o detalhe vem por conta ({NOVA:{…}, CASTRO:{…}}) — junta o que soma.
  const partes: any[] = k.conta === 'TODAS' && (d.NOVA || d.CASTRO) ? [d.NOVA, d.CASTRO].filter(Boolean) : [d]
  const soma = (campo: string, sub: string) => partes.reduce((s, p) => s + (Number(p?.[campo]?.[sub]) || 0), 0)

  if (k.kpi_id.endsWith('_vencido')) {
    const faixas = ['1-30', '31-60', '61-90', '90+']
    const vals = faixas.map((f) => soma('aging', f))
    const max = Math.max(1, ...vals)
    const antes = partes.reduce((s, p) => ({ n: s.n + (p?.antes_do_ano?.contagem || 0), v: s.v + (p?.antes_do_ano?.valor || 0) }), { n: 0, v: 0 })
    return (
      <div className={s.secao}>
        <div className={s.secaoTitulo}>Dias de atraso</div>
        {faixas.map((f, i) => (
          <div key={f} className={s.barraLinha}>
            <span>{f} dias</span>
            <span><span className={[s.barra, f === '90+' ? s.ruim : ''].join(' ')} style={{ display: 'block', width: `${(vals[i] / max) * 100}%` }} /></span>
            <span>{compacto(vals[i])}</span>
          </div>
        ))}
        {antes.n > 0 && <div className={s.mudo}>Fora desta conta (igual à tela oficial): {antes.n} títulos vencidos antes de {new Date().getFullYear()}, {brl(antes.v)}.</div>}
      </div>
    )
  }
  if (k.kpi_id === 'fluxo_30d') {
    const sem = [0, 1, 2, 3, 4].map((i) => partes.reduce((acc, p) => {
      const x = p?.semanas?.[i]; return x ? { receber: acc.receber + x.receber, pagar: acc.pagar + x.pagar } : acc
    }, { receber: 0, pagar: 0 }))
    return (
      <div className={s.secao}>
        <div className={s.secaoTitulo}>Por semana (pela data de previsão)</div>
        <table className={s.tabela}>
          <thead><tr><th>Semana</th><th>Receber</th><th>Pagar</th><th>Líquido</th></tr></thead>
          <tbody>
            {sem.map((x, i) => (
              <tr key={i}><td>{i === 4 ? 'dias 29–30' : `${i + 1}ª`}</td><td>{compacto(x.receber)}</td><td>{compacto(x.pagar)}</td>
                <td className={x.receber - x.pagar < 0 ? s.neg : ''}>{compacto(x.receber - x.pagar)}</td></tr>
            ))}
          </tbody>
        </table>
        <div className={s.mudo}>Sem saldo bancário: mostra só o que entra e sai, partindo de zero.</div>
      </div>
    )
  }
  if (k.kpi_id === 'os_por_fase' && d.por_fase) {
    const fases = Object.entries(d.por_fase as Record<string, number>).sort((a, b) => b[1] - a[1])
    const max = Math.max(1, ...fases.map((f) => f[1]))
    return (
      <div className={s.secao}>
        <div className={s.secaoTitulo}>Por fase</div>
        {fases.map(([f, n]) => (
          <div key={f} className={s.barraLinha} style={{ gridTemplateColumns: '1fr 80px 28px' }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f}</span>
            <span><span className={s.barra} style={{ display: 'block', width: `${(n / max) * 100}%` }} /></span>
            <span>{n}</span>
          </div>
        ))}
      </div>
    )
  }
  if (k.kpi_id === 'ppv_aberto' && d.por_idade) {
    return (
      <div className={s.secao}>
        <div className={s.secaoTitulo}>Há quanto tempo na fase</div>
        <table className={s.tabela}><tbody>
          {Object.entries(d.por_idade as Record<string, number>).map(([f, n]) => <tr key={f}><td>{f === 'sem data' ? 'sem data' : `${f} dias`}</td><td>{n}</td></tr>)}
        </tbody></table>
      </div>
    )
  }
  if (k.kpi_id === 'robos') {
    const linhas = Object.entries(d).filter(([, r]) => r && typeof r === 'object') as Array<[string, any]>
    return (
      <div className={s.secao}>
        <div className={s.secaoTitulo}>Última rodada de cada robô</div>
        <table className={s.tabela}>
          <thead><tr><th>Robô</th><th>Situação</th><th>Último OK</th></tr></thead>
          <tbody>
            {linhas.map(([job, r]) => {
              const ok = r.ultimo_ok || r.fim
              return <tr key={job}><td>{job}</td><td>{r.bloqueio ? 'bloqueio Omie' : r.status || '—'}</td><td>{ok ? idadeTexto(Math.max(0, Math.round((agora - new Date(ok).getTime()) / 60000))) : '—'}</td></tr>
            })}
          </tbody>
        </table>
      </div>
    )
  }
  const extras: string[] = []
  for (const p of partes) {
    if (!p) continue
    if (p.mais_antigo) extras.push(`mais antigo de ${brData(p.mais_antigo)}`)
    if (p.mais_antiga) extras.push(`NF mais antiga de ${brData(p.mais_antiga)}`)
    if (p.erro_envio) extras.push(`${p.erro_envio} com erro no envio à Omie`)
    if (p.atrasados) extras.push(`${p.atrasados} com a previsão de chegada vencida`)
    if (p.maior_atraso_dias) extras.push(`maior atraso: ${p.maior_atraso_dias} dias`)
    if (p.maior_dias_na_fase) extras.push(`há ${p.maior_dias_na_fase} dias na fase`)
  }
  return extras.length ? <div className={s.secao}><div className={s.mudo}>{extras.join(' · ')}</div></div> : null
}
/* eslint-enable @typescript-eslint/no-explicit-any */
