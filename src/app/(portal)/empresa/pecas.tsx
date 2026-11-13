'use client'
// Peças na tela do diretor (/empresa). José, 12/11/2026: "agora as peças, coisas parecidas com o Comercial e o Pós-Vendas".
// Mesmo jeito: cartões por assunto, cada um abre em tela cheia. Dados: /api/empresa/pecas (gravado em empresa_painel;
// conta em src/lib/empresa/pecas.ts), itens do pedido em /api/empresa/pedido-itens e a nota em /api/empresa/nota.
import { useEffect, useState, type ReactNode } from 'react'
import type { DadosPecas, MesPc, PedidoPc, Canal, TipoPc } from '@/lib/empresa/pecas'
import type { LinhasDre } from '@/lib/empresa/dre-gerencial'
import { authHeaders } from '@/lib/auth/client'
import { compacto, brl, cap, nomeMes, mesCurto, plural, contaMes } from './comercial'
import { TelaCheia, Secao } from './comercial-assuntos'
import { useJson } from './comercial-telas'
import { TelaDespesasNova, NavAno } from './comercial-despesas'
import { NavMes, dataBR, type ItemOficina } from './posvendas'

// cores do Peças: tons de laranja (José, 12/11: "tem que mudar a cor do gráfico")
const CANAL: Record<Canal, { cor: string; explica: string }> = {
  'Balcão': { cor: '#c2410c', explica: 'Peças vendidas no balcão (categoria "Revenda de Peças Balcão").' },
  'Oficina': { cor: '#f97316', explica: 'Peças vendidas junto com o serviço da oficina (OS de manutenção).' },
  'Revisões': { cor: '#fdba74', explica: 'Peças das revisões (categoria "Revenda de Peças Revisão").' },
  'Com máquina': { cor: '#78716c', explica: 'Peças que saíram no mesmo pedido de uma máquina.' },
  'Outros': { cor: '#d6d3d1', explica: 'Pedidos ainda sem categoria no relatório de pedidos (os mais novos) ou de outra categoria.' },
}
/** quem faturou o pedido (vendedor do pedido no Omie). Pecista = quem vende no balcão; nos pedidos de OS vem o técnico. */
const quemFaturou = (v: string) => v.replace(/^([^-]{1,15}?)\s-\s(.+)$/, '$1 ($2)').replace(/^T[ée]cnicos?( Externos?)?:\s*/i, '').replace(/^Motorista:\s*/i, '').trim() || 'sem vendedor'
const ehTecnico = (v: string) => /^(t[ée]cnic|motorista|#)/i.test(v.trim()) || !v.trim()
const CANAIS = Object.keys(CANAL) as Canal[]
const margem = (venda: number, custo: number) => (venda > 0 ? Math.round(((venda - custo) / venda) * 100) : null)

type TelaPc = 'fat' | 'est' | 'desp' | 'ate'
export function PainelPecas({ dreG, atencao }: { dreG: Array<{ mes: string; parcial?: boolean; setores: object }> | null; atencao: ItemOficina[] }) {
  const { d, erro } = useJson<DadosPecas>('/api/empresa/pecas')
  const [tela, setTela] = useState<TelaPc | null>(() => {
    if (typeof window === 'undefined') return null
    const t = new URLSearchParams(window.location.search).get('tela')
    return t === 'fat' || t === 'est' || t === 'desp' || t === 'ate' ? t : null
  })
  useEffect(() => {
    try {
      const u = new URL(window.location.href)
      if (tela) u.searchParams.set('tela', tela); else u.searchParams.delete('tela')
      if (u.toString() !== window.location.href) window.history.replaceState(null, '', u.toString())
    } catch { /* sem URL */ }
  }, [tela])
  const fechar = () => setTela(null)
  const m = d?.meses[d.meses.length - 1], ult6 = d?.meses.slice(-6) || []
  const max6 = Math.max(1, ...ult6.map((x) => x.venda))
  const g = dreG?.[dreG.length - 1], lp = (g?.setores as Record<string, LinhasDre> | undefined)?.pecas, x = lp ? contaMes(lp) : null
  const velho = d ? d.estoque.faixas.slice(2).reduce((a, f) => a + f.valor, 0) : 0
  const cartao = (t: TelaPc, cor: string, ic: string, nome: string, num: string, linha: ReactNode, extraEl?: ReactNode, cls = '') => (
    <button className={`cml-card ${cls}`} style={{ ['--c' as string]: cor }} onClick={() => setTela(t)}>
      <span className="cml-cab"><span className="pf-ic"><i className={`fas ${ic}`} /></span><span className="cml-nome">{nome}</span><i className="fas fa-arrow-right cml-seta" /></span>
      <span className="cml-num">{num}</span>
      <span className="cml-linha">{linha}</span>
      {extraEl}
    </button>
  )
  return (
    <div className="pf cml">
      {erro && <div className="cm-aviso">{erro}</div>}
      <div className="cml-grade">
        {cartao('fat', '#ea580c', 'fa-sack-dollar', 'Faturamento', m ? compacto(m.venda) : '—',
          m ? <>vendeu em {nomeMes(m.mes)} até hoje{margem(m.venda, m.custo) != null ? <> · margem de <b>{margem(m.venda, m.custo)}%</b></> : null}</> : erro ? '' : 'carregando…',
          ult6.length ? (
            <span className="cml-mini">{ult6.map((q) => (
              <span key={q.mes} className={q.mes === m?.mes ? 'on' : ''}><span style={{ height: `${(q.venda / max6) * 100}%` }} /><small>{mesCurto(q.mes)}</small></span>
            ))}</span>
          ) : null, 'cml-g')}
        {cartao('est', '#15803d', 'fa-boxes-stacked', 'Estoque de peças', d ? compacto(d.estoque.valor) : '—',
          d ? <>{d.estoque.itens.toLocaleString('pt-BR')} peças no estoque · <b>{compacto(velho)}</b> sem vender há mais de 1 ano</> : erro ? '' : 'carregando…')}
        {cartao('desp', '#be123c', 'fa-receipt', 'Custos e despesas', x ? compacto(x.gastou) : '—',
          x ? <>{x.resultado >= 0 ? <>sobrou <b style={{ color: '#15803d' }}>{compacto(x.resultado)}</b></> : <>faltou <b style={{ color: '#be123c' }}>{compacto(-x.resultado)}</b></>} no mês</> : 'carregando o DRE…')}
        {cartao('ate', '#d97706', 'fa-file-invoice', 'Pedidos em aberto', atencao[0] ? String(atencao[0].n) : '—',
          atencao[0] ? <>{atencao[0].nome.toLowerCase()}{atencao[0].valor ? <> · <b>{compacto(atencao[0].valor)}</b></> : null}{atencao.length > 1 ? <><br />{atencao.slice(1).map((a) => `${a.n} ${a.nome.toLowerCase()}`).join(' · ')}</> : null}</> : 'carregando…', null, 'cpv-oficina')}
      </div>
      {tela === 'fat' && d && <TelaCheia titulo="Faturamento de Peças" sub="balcão, oficina e revisões" onFechar={fechar}><FatPecas d={d} /></TelaCheia>}
      {tela === 'est' && d && <TelaCheia titulo="Estoque de peças" sub="pelo preço de custo, e há quanto tempo cada peça não vende" onFechar={fechar}><EstoquePecas d={d} /></TelaCheia>}
      {tela === 'desp' && <TelaDespesasNova mesesBase={dreG || []} setor="pecas" onFechar={fechar} />}
      {tela === 'ate' && (
        <TelaCheia titulo="Pedidos em aberto e atenção" sub="do Planta Viva · clique para ver a lista" onFechar={fechar}>
          <div className="cpv-kpis">
            {atencao.map((o) => (
              <button key={o.id} className="cmt-kpi cmt-kpi-bt" onClick={() => { fechar(); o.onClick() }}>
                <small>{o.nome}</small><b style={{ color: o.n ? '#d97706' : '#16a34a' }}>{o.n}</b><em>{o.valor ? `${compacto(o.valor)} · ` : ''}ver a lista <i className="fas fa-arrow-right" /></em>
              </button>
            ))}
          </div>
        </TelaCheia>
      )}
      {tela && (tela === 'fat' || tela === 'est') && !d && <TelaCheia titulo="Peças" onFechar={fechar}><div className="cma-vazio">{erro || 'Carregando…'}</div></TelaCheia>}
    </div>
  )
}

// ── FATURAMENTO ──────────────────────────────────────────────────────────────
function FatPecas({ d }: { d: DadosPecas }) {
  const meses = d.meses.map((m) => m.mes)
  const [mesEsc, setMes] = useState('')
  const mes = mesEsc && meses.includes(mesEsc) ? mesEsc : meses[meses.length - 1]
  const [canal, setCanal] = useState<Canal | null>(null)
  const [janCanal, setJanCanal] = useState<Canal | null>(null)
  const [comparar, setComparar] = useState<string | null>(null) // aba aberta na janela dos pecistas (nome ou 'comparar')
  const m = d.meses.find((x) => x.mes === mes)!
  const ant = d.meses[meses.indexOf(mes) - 1]
  const peds = d.pedidos.filter((p) => p.data.startsWith(mes))
  const clientes = [...peds.reduce((mp, p) => { const k = p.cliente || 'sem nome'; const x = mp.get(k) || { venda: 0, n: 0 }; x.venda += p.venda; x.n++; return mp.set(k, x) }, new Map<string, { venda: number; n: number }>()).entries()].sort((a, b) => b[1].venda - a[1].venda)
  const mg = margem(m.venda, m.custo)
  const [verCli, setVerCli] = useState(false), [verTipos, setVerTipos] = useState(false), [tipoNome, setTipo] = useState<string | null>(null)
  const tipoSel = m.tipos.find((t) => t.tipo === tipoNome)
  return (
    <div className="cpv-corpo">
      <div className="cpv-topo">
        <NavMes meses={meses} mes={mes} setMes={setMes} />
        <span className="cpv-frase">{cap(nomeMes(mes))}{m.parcial ? ' até hoje' : ''}: vendeu <b>{compacto(m.venda)}</b> em {plural(m.pedidos, 'pedido', 'pedidos')}{mg != null ? <>, com margem de <b>{mg}%</b> (custo {compacto(m.custo)})</> : null}.</span>
      </div>
      <div className="cpv-kpis">
        {CANAIS.filter((c) => m.porCanal[c]?.venda > 0.5 || (c !== 'Outros' && c !== 'Com máquina')).map((c) => {
          const v = m.porCanal[c], a = ant?.porCanal[c]
          const dif = a && a.venda ? Math.round(((v.venda - a.venda) / a.venda) * 100) : null
          return (
            <button key={c} className="cmt-kpi cmt-kpi-bt" onClick={() => setJanCanal(c)} title={CANAL[c].explica}>
              <small><i className="cdp-dot" style={{ background: CANAL[c].cor }} />{c}</small>
              <b>{compacto(v.venda)}</b>
              <em>{plural(v.n, 'pedido', 'pedidos')}{margem(v.venda, v.custo) != null ? ` · margem ${margem(v.venda, v.custo)}%` : ''}{dif != null && !m.parcial ? <> · <span style={{ color: dif >= 0 ? '#15803d' : '#dc2626' }}>{dif >= 0 ? '+' : ''}{dif}%</span></> : null}</em>
            </button>
          )
        })}
      </div>
      <Pecistas peds={peds} mes={mes} onAbrir={setComparar} />
      <Secao titulo="Mês a mês" sub="clique num mês para ver ele">
        <GraficoCanais meses={d.meses} mes={mes} setMes={setMes} />
      </Secao>
      <div className="cmt-dois">
        <Secao titulo="Tipos de peça que mais venderam" sub="clique num tipo para ver as peças">
          {m.tipos.length ? (verTipos ? m.tipos : m.tipos.slice(0, 8)).map((t) => (
            <button key={t.tipo} className="cdp-conta cpv-linha" onClick={() => setTipo(t.tipo)}>
              <span>{t.tipo}</span>
              <span className="cdp-conta-bar"><span style={{ width: `${Math.max(3, (t.venda / Math.max(1, m.tipos[0].venda)) * 100)}%`, background: '#ea580c' }} /></span>
              <small>{m.venda ? Math.round((t.venda / m.venda) * 100) : 0}%</small><b>{compacto(t.venda)}</b><i className="fas fa-chevron-right" />
            </button>
          )) : <div className="ce-mudo">Nenhuma venda de peça no mês.</div>}
          {m.tipos.length > 8 && <button className="cpc-mais" onClick={() => setVerTipos(!verTipos)}>{verTipos ? 'ver menos' : `ver mais (${m.tipos.length - 8})`}</button>}
        </Secao>
        <Secao titulo="Clientes que mais compraram" sub={nomeMes(mes)}>
          {clientes.length ? (verCli ? clientes : clientes.slice(0, 5)).map(([n, v]) => (
            <div key={n} className="cdp-conta cpv-linha cpv-fixa">
              <span>{n}</span>
              <span className="cdp-conta-bar"><span style={{ width: `${Math.max(3, (v.venda / Math.max(1, clientes[0][1].venda)) * 100)}%`, background: '#2563eb' }} /></span>
              <small>{v.n} ped.</small><b>{compacto(v.venda)}</b><i />
            </div>
          )) : <div className="ce-mudo">{d.pedidos.length && mes < d.pedidos[d.pedidos.length - 1].data.slice(0, 7) ? 'Os pedidos ficam guardados só dos últimos 13 meses.' : 'Nenhum pedido no mês.'}</div>}
          {clientes.length > 5 && <button className="cpc-mais" onClick={() => setVerCli(!verCli)}>{verCli ? 'ver menos' : `ver mais (${clientes.length - 5})`}</button>}
        </Secao>
      </div>
      {tipoSel && <JanelaTipo t={tipoSel} mes={mes} onFechar={() => setTipo(null)} />}
      <PedidosDoMes peds={peds} mes={mes} canal={canal} setCanal={setCanal} />
      {janCanal && (
        <div className="cmw-fundo cml-janela-fundo cmp-fundo" onClick={() => setJanCanal(null)}>
          <div className="cml-janela cmp-janela" onClick={(e) => e.stopPropagation()}>
            <div className="cml-janela-cab"><h3>{janCanal}</h3><span>{cap(nomeMes(mes, true))} · {plural(m.porCanal[janCanal].n, 'pedido', 'pedidos')} · {compacto(m.porCanal[janCanal].venda)}</span><button className="cma-x" onClick={() => setJanCanal(null)} aria-label="Fechar"><i className="fas fa-xmark" /></button></div>
            <div className="cml-janela-corpo">
              <div className="cmx-explica">{CANAL[janCanal].explica}</div>
              <PedidosDoMes peds={peds.filter((p) => p.canal === janCanal)} mes={mes} canal={null} setCanal={() => {}} semChips />
            </div>
          </div>
        </div>
      )}
      {comparar && <CompararPecistas pedidos={d.pedidos} mes={mes} inicial={comparar} onFechar={() => setComparar(null)} />}
      <p className="cma-nota">Mesma conta do Dashboard de Vendas: itens da família Peças, sem pedidos cancelados ou devolvidos. Custo = custo médio (CMC) de cada peça. O canal vem da categoria do pedido no Omie.</p>
    </div>
  )
}

/** as peças de um tipo vendidas no mês, com o estoque de hoje (José, 12/11: "ao clicar num tipo, mostra os produtos com
 *  marca, valor, quantidade no estoque") — a marca vem no nome da peça (o cadastro não tem o campo preenchido) */
function JanelaTipo({ t, mes, onFechar }: { t: TipoPc; mes: string; onFechar: () => void }) {
  return (
    <div className="cmw-fundo cml-janela-fundo cmp-fundo" onClick={onFechar}>
      <div className="cml-janela cmp-janela" onClick={(e) => e.stopPropagation()}>
        <div className="cml-janela-cab"><h3>{t.tipo}</h3><span>{cap(nomeMes(mes, true))} · {compacto(t.venda)}{margem(t.venda, t.custo) != null ? ` · margem ${margem(t.venda, t.custo)}%` : ''} · {plural(t.n, 'peça diferente', 'peças diferentes')}</span><button className="cma-x" onClick={onFechar} aria-label="Fechar"><i className="fas fa-xmark" /></button></div>
        <div className="cml-janela-corpo">
          {t.pecas ? (
            <div className="cmt-tab-wrap"><table className="cmt-tab cpv-tab">
              <thead><tr><th>Peça</th><th>Vendeu</th><th>Valor vendido</th><th>Margem</th><th>Estoque hoje</th><th>Valor no estoque</th></tr></thead>
              <tbody>{t.pecas.map((p) => (
                <tr key={`${p.conta}-${p.codigo}`}>
                  <td>{p.descricao}<small>{p.codigo}{p.conta === 'CASTRO' ? ' · Castro' : ''}</small></td>
                  <td className="val">{p.qtd.toLocaleString('pt-BR')} un.</td>
                  <td className="val"><b>{brl(p.venda)}</b></td>
                  <td className="val">{margem(p.venda, p.custo) != null ? `${margem(p.venda, p.custo)}%` : '—'}</td>
                  <td className="val" style={{ color: p.estoque <= 0 ? '#dc2626' : undefined }}>{p.estoque > 0 ? `${p.estoque.toLocaleString('pt-BR')} un.` : 'sem estoque'}</td>
                  <td className="val">{p.estoque > 0 ? brl(p.estoque * p.cmc) : '—'}</td>
                </tr>
              ))}</tbody>
            </table></div>
          ) : <div className="ce-mudo">A lista de peças fica guardada só dos últimos 13 meses.</div>}
        </div>
      </div>
    </div>
  )
}

const EMPRESAS = [{ k: 'NOVA', nome: 'Nova Tratores', cor: '#ea580c' }, { k: 'CASTRO', nome: 'Castro', cor: '#334155' }]

/** janeiro a dezembro do ano, empilhado por empresa (José, 12/11: "troca as cores… por empresa"), com a média do ano anterior (verde acima, vermelho abaixo) — igual ao Pós-Vendas */
function GraficoCanais({ meses, mes, setMes }: { meses: MesPc[]; mes: string; setMes: (m: string) => void }) {
  const anos = [...new Set(meses.map((m) => m.mes.slice(0, 4)))].sort().reverse()
  const [anoEsc, setAno] = useState('')
  const ano = anoEsc && anos.includes(anoEsc) ? anoEsc : mes.slice(0, 4) || anos[0]
  const porMes = new Map(meses.map((m) => [m.mes, m]))
  const cols = Array.from({ length: 12 }, (_, i) => `${ano}-${String(i + 1).padStart(2, '0')}`)
  const max = Math.max(1, ...meses.map((m) => m.venda))
  const soma = cols.reduce((a, k) => a + (porMes.get(k)?.venda || 0), 0)
  const anoAnt = String(Number(ano) - 1)
  const antes = meses.filter((m) => m.mes.startsWith(anoAnt) && !m.parcial)
  const media = antes.length ? antes.reduce((a, m) => a + m.venda, 0) / antes.length : null
  return (
    <div className="cpv-g">
      <div className="cdp-g-ctrl">
        <NavAno anos={anos} ano={ano} setAno={setAno} />
        <span className="cpv-g-soma">{ano}: <b>{compacto(soma)}</b>{media != null ? <> · média de {anoAnt}: <b>{compacto(media)}</b> por mês</> : null}</span>
        <span className="cpv-g-leg">{EMPRESAS.map((e) => <span key={e.k}><i style={{ background: e.cor }} />{e.nome}</span>)}</span>
      </div>
      <div className="cpv-g-cols">
        {cols.map((k) => {
          const m = porMes.get(k), v = m?.venda || 0
          return (
            <button key={k} className={`cpv-g-col${k === mes ? ' on' : ''}`} disabled={!m} onClick={() => m && setMes(k)} title={m ? EMPRESAS.map((e) => `${e.nome}: ${brl(m.porConta[e.k]?.venda || 0)}`).join('\n') : ''}>
              <b className={!v || media == null || m?.parcial ? '' : v >= media ? 'acima' : 'abaixo'}>{v ? compacto(v).replace('R$ ', '') : ''}</b>
              <span className="cpv-g-area">
                {media != null && <span className="cpv-g-media" style={{ bottom: `${(media / max) * 100}%` }} />}
                <span className="cpv-g-pilha" style={{ height: `${(v / max) * 100}%` }}>
                  {m && [...EMPRESAS].reverse().map((e) => (m.porConta[e.k]?.venda || 0) > 0 && <span key={e.k} style={{ flex: m.porConta[e.k].venda, background: e.cor }} />)}
                </span>
              </span>
              <small>{mesCurto(k)}</small>
            </button>
          )
        })}
      </div>
      {media != null && <p className="cma-nota">A linha tracejada é a média de {anoAnt} ({compacto(media)} por mês). Valor em <b style={{ color: '#15803d' }}>verde</b> = mês acima da média; em <b style={{ color: '#dc2626' }}>vermelho</b> = abaixo. O mês em andamento fica sem cor até fechar.</p>}
    </div>
  )
}

type ItemPed = { codigo: string; descricao: string; familia: string; qtd: number; unitario: number; total: number; custo: number; desconto: number }
/** quem faturou no mês: os pecistas em cartões (o que mais faturou com coroa) e os pedidos que saíram pelas OS */
function resumoPor(peds: PedidoPc[]) {
  const m = new Map<string, { nome: string; venda: number; custo: number; n: number; tecnico: boolean }>()
  for (const p of peds) {
    const tec = ehTecnico(p.vendedor), nome = tec ? 'Pedidos das OS (técnicos)' : quemFaturou(p.vendedor)
    const x = m.get(nome) || { nome, venda: 0, custo: 0, n: 0, tecnico: tec }
    x.venda += p.venda; x.custo += p.custo; x.n++; m.set(nome, x)
  }
  return [...m.values()].sort((a, b) => Number(a.tecnico) - Number(b.tecnico) || b.venda - a.venda)
}
function Pecistas({ peds, mes, onAbrir }: { peds: PedidoPc[]; mes: string; onAbrir: (aba: string) => void }) {
  const l = resumoPor(peds), topo = l.find((x) => !x.tecnico)
  if (!l.length) return null
  return (
    <Secao titulo={`Quem faturou em ${nomeMes(mes)}`} sub={<button className="cpc-link" onClick={() => onAbrir('comparar')}>comparar os pecistas mês a mês <i className="fas fa-arrow-right" /></button>}>
      <div className="cpv-kpis">
        {l.map((x) => (
          <button key={x.nome} className={`cmt-kpi cmt-kpi-bt${x === topo ? ' cpc-topo' : ''}`} onClick={() => onAbrir(x.nome)}>
            <small>{x === topo ? <><i className="fas fa-crown" style={{ color: '#d97706' }} /> mais faturou · </> : null}{x.nome}</small>
            <b>{compacto(x.venda)}</b>
            <em>{plural(x.n, 'pedido', 'pedidos')} · ticket {compacto(x.venda / x.n)}{margem(x.venda, x.custo) != null ? ` · margem ${margem(x.venda, x.custo)}%` : ''}</em>
          </button>
        ))}
      </div>
    </Secao>
  )
}

/** comparação dos pecistas (quem fatura no balcão — hoje José Camargo e Danilo Correa), mês a mês nos últimos 13 meses */
const COR_P = ['#c2410c', '#2563eb', '#16a34a', '#7c3aed']
const OS_TEC = 'Pedidos das OS (técnicos)'
function CompararPecistas({ pedidos, mes, inicial, onFechar }: { pedidos: PedidoPc[]; mes: string; inicial: string; onFechar: () => void }) {
  const nomes = resumoPor(pedidos).filter((x) => !x.tecnico && x.n >= 20).map((x) => x.nome).slice(0, 4)
  const meses = [...new Set(pedidos.map((p) => p.data.slice(0, 7)))].sort()
  const [mesSel, setMesSel] = useState(mes)
  const [aba, setAba] = useState(inicial)
  const abas = [...nomes, ...(pedidos.some((p) => ehTecnico(p.vendedor)) ? [OS_TEC] : []), 'comparar']
  const tab = (mm: string) => Object.fromEntries(nomes.map((n) => [n, resumoPor(pedidos.filter((p) => p.data.startsWith(mm))).find((x) => x.nome === n) || { nome: n, venda: 0, custo: 0, n: 0, tecnico: false }]))
  const porMes = meses.map((mm) => ({ mm, t: tab(mm) }))
  const max = Math.max(1, ...porMes.flatMap((x) => nomes.map((n) => x.t[n].venda)))
  const sel = tab(mesSel)
  const canaisDe = (n: string) => CANAIS.map((c) => ({ c, v: pedidos.filter((p) => p.data.startsWith(mesSel) && quemFaturou(p.vendedor) === n && !ehTecnico(p.vendedor) && p.canal === c).reduce((a, p) => a + p.venda, 0) })).filter((x) => x.v > 0)
  const ganhou = (mm: string) => { const t = porMes.find((x) => x.mm === mm)!.t; return nomes.reduce((a, n) => (t[n].venda > (t[a]?.venda ?? -1) ? n : a), nomes[0]) }
  return (
    <div className="cmw-fundo cml-janela-fundo cmp-fundo" onClick={onFechar}>
      <div className="cml-janela cmp-janela" onClick={(e) => e.stopPropagation()}>
        <div className="cml-janela-cab"><h3>Quem faturou</h3><span /><button className="cma-x" onClick={onFechar} aria-label="Fechar"><i className="fas fa-xmark" /></button></div>
        <div className="cpc-abas">{abas.map((a) => <button key={a} className={aba === a ? 'on' : ''} onClick={() => setAba(a)}>{a === 'comparar' ? <><i className="fas fa-scale-balanced" /> Comparar</> : a === OS_TEC ? 'Pedidos das OS' : a.replace(/\s*\(.*\)$/, '').split(' ').slice(0, 2).join(' ')}</button>)}</div>
        {aba !== 'comparar' ? <AbaPecista pedidos={pedidos} nome={aba} meses={meses} mes={mesSel} setMes={setMesSel} /> : (
        <div className="cml-janela-corpo cpv-corpo">
          <div className="cpc-leg">{nomes.map((n, i) => <span key={n}><i style={{ background: COR_P[i] }} />{n} <b>{meses.filter((mm) => ganhou(mm) === n && porMes.find((x) => x.mm === mm)!.t[n].venda > 0).length}</b> meses na frente</span>)}</div>
          <div className="cpc-comp">
            {porMes.map(({ mm, t }) => (
              <button key={mm} className={`cpc-comp-col${mm === mesSel ? ' on' : ''}`} onClick={() => setMesSel(mm)}>
                <span className="cpc-comp-barras">{nomes.map((n, i) => <span key={n} style={{ height: `${(t[n].venda / max) * 100}%`, background: COR_P[i] }} title={`${n}: ${brl(t[n].venda)}`} />)}</span>
                <small>{mesCurto(mm)}</small>
              </button>
            ))}
          </div>
          <div className="cmt-tab-wrap"><table className="cmt-tab cpv-tab">
            <thead><tr><th>{cap(nomeMes(mesSel, true))}</th>{nomes.map((n, i) => <th key={n} style={{ color: COR_P[i] }}>{n}</th>)}</tr></thead>
            <tbody>
              {([['Faturou', (x: { venda: number }) => brl(x.venda)], ['Pedidos', (x: { n: number }) => String(x.n)], ['Ticket médio', (x: { venda: number; n: number }) => (x.n ? brl(x.venda / x.n) : '—')], ['Margem', (x: { venda: number; custo: number }) => (margem(x.venda, x.custo) != null ? `${margem(x.venda, x.custo)}%` : '—')], ['Ficou (venda − custo)', (x: { venda: number; custo: number }) => brl(x.venda - x.custo)]] as Array<[string, (x: { venda: number; custo: number; n: number }) => string]>).map(([rot, f]) => {
                const vals = nomes.map((n) => sel[n]), melhor = rot === 'Pedidos' || rot === 'Faturou' || rot === 'Ficou (venda − custo)' || rot === 'Ticket médio' || rot === 'Margem' ? vals.reduce((a, v, i) => { const k = rot === 'Margem' ? (margem(v.venda, v.custo) ?? -999) : rot === 'Pedidos' ? v.n : rot === 'Ticket médio' ? (v.n ? v.venda / v.n : 0) : rot === 'Faturou' ? v.venda : v.venda - v.custo; return k > a.k ? { k, i } : a }, { k: -Infinity, i: -1 }).i : -1
                return <tr key={rot}><td>{rot}</td>{vals.map((v, i) => <td key={i} className="val">{i === melhor && v.n ? <b>★ {f(v)}</b> : f(v)}</td>)}</tr>
              })}
              <tr><td>Por canal</td>{nomes.map((n) => <td key={n} className="val">{canaisDe(n).map((x) => <small key={x.c}>{x.c}: {compacto(x.v)}</small>)}</td>)}</tr>
            </tbody>
          </table></div>
          <p className="cma-nota">Pecista = quem aparece como vendedor no pedido do Omie (balcão). Pedidos que saem pelas OS vêm com o técnico e ficam de fora da comparação. ★ = melhor do mês em cada linha.</p>
        </div>)}
      </div>
    </div>
  )
}

/** os pedidos de um pecista (ou das OS) no mês: valor, data, cliente, peças e nota — o mesmo jeito da lista de pedidos */
function AbaPecista({ pedidos, nome, meses, mes, setMes }: { pedidos: PedidoPc[]; nome: string; meses: string[]; mes: string; setMes: (m: string) => void }) {
  const [canal, setCanal] = useState<Canal | null>(null)
  const doNome = (p: PedidoPc) => (nome === OS_TEC ? ehTecnico(p.vendedor) : !ehTecnico(p.vendedor) && quemFaturou(p.vendedor) === nome)
  const peds = pedidos.filter((p) => p.data.startsWith(mes) && doNome(p))
  const ant = (() => { const i = meses.indexOf(mes); return i > 0 ? pedidos.filter((p) => p.data.startsWith(meses[i - 1]) && doNome(p)) : [] })()
  const v = peds.reduce((a, p) => a + p.venda, 0), c = peds.reduce((a, p) => a + p.custo, 0), va = ant.reduce((a, p) => a + p.venda, 0)
  const dif = va ? Math.round(((v - va) / va) * 100) : null
  return (
    <div className="cml-janela-corpo cpv-corpo">
      <div className="cpv-topo">
        <NavMes meses={meses} mes={mes} setMes={setMes} />
        <span className="cpv-frase"><b>{nome}</b> faturou <b>{compacto(v)}</b> em {plural(peds.length, 'pedido', 'pedidos')}{dif != null ? <> (<span style={{ color: dif >= 0 ? '#15803d' : '#dc2626' }}>{dif >= 0 ? '+' : ''}{dif}%</span> que {nomeMes(meses[meses.indexOf(mes) - 1])})</> : null}.</span>
      </div>
      <div className="cpv-kpis">
        <div className="cmt-kpi"><small>Faturou</small><b>{compacto(v)}</b><em>{plural(peds.length, 'pedido', 'pedidos')}</em></div>
        <div className="cmt-kpi"><small>Ticket médio</small><b>{peds.length ? compacto(v / peds.length) : '—'}</b><em>por pedido</em></div>
        <div className="cmt-kpi"><small>Margem</small><b>{margem(v, c) != null ? `${margem(v, c)}%` : '—'}</b><em>ficou {compacto(v - c)}</em></div>
        <div className="cmt-kpi"><small>Clientes</small><b>{new Set(peds.map((p) => p.cliente)).size}</b><em>diferentes no mês</em></div>
      </div>
      <PedidosDoMes peds={peds} mes={mes} canal={canal} setCanal={setCanal} />
    </div>
  )
}

function PedidosDoMes({ peds, mes, canal, setCanal, semChips }: { peds: PedidoPc[]; mes: string; canal: Canal | null; setCanal: (c: Canal | null) => void; semChips?: boolean }) {
  const [aberto, setAberto] = useState<string | null>(null)
  const [nota, setNota] = useState<PedidoPc | null>(null)
  const [busca, setBusca] = useState('')
  const q = busca.trim().toLowerCase()
  const lista = peds.filter((p) => (!canal || p.canal === canal) && (!q || `${p.numero} ${p.cliente} ${p.vendedor}`.toLowerCase().includes(q)))
  return (
    <Secao titulo={`Pedidos de ${nomeMes(mes)}`} sub="clique num pedido para ver as peças e a nota">
      <div className="cpf-ferr">
        <div className="cmdp-chips" style={semChips ? { display: 'none' } : undefined}>
          <button className={!canal ? 'on' : ''} onClick={() => setCanal(null)}>Todos<b>{peds.length}</b></button>
          {CANAIS.map((c) => { const n = peds.filter((p) => p.canal === c).length; return n ? <button key={c} className={canal === c ? 'on' : ''} onClick={() => setCanal(canal === c ? null : c)}><i className="cdp-dot" style={{ background: CANAL[c].cor }} />{c}<b>{n}</b></button> : null })}
        </div>
        <input className="cpf-busca" placeholder="Buscar pedido, cliente ou vendedor" value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>
      <div className="cpv-ords">
        {lista.map((p) => {
          const k = `${p.conta}|${p.numero}`, on = aberto === k, mg = margem(p.venda, p.custo)
          return (
            <div key={k} className={`cpv-ord${on ? ' on' : ''}`}>
              <button className="cpv-ord-l cpc-ped-l" onClick={() => setAberto(on ? null : k)}>
                <span className="cpv-ord-os"><b>Pedido {p.numero}</b><small><i className="cdp-dot" style={{ background: CANAL[p.canal].cor }} />{p.canal} · {dataBR(p.data)}{p.conta === 'CASTRO' ? ' · Castro' : ''}</small></span>
                <span className="cpv-ord-cli">{p.cliente || '—'}<small>faturou: <b>{quemFaturou(p.vendedor)}</b>{ehTecnico(p.vendedor) && p.vendedor ? ' (técnico)' : ''} · {plural(p.itens, 'item', 'itens')}</small></span>
                <span className="cpv-ord-n"><small>margem</small><span style={{ color: mg == null ? undefined : mg < 0 ? '#dc2626' : mg >= 30 ? '#15803d' : undefined }}>{mg != null ? `${mg}%` : '—'}</span></span>
                <b className="cpv-ord-v">{brl(p.venda)}</b>
                <i className={`fas fa-chevron-${on ? 'up' : 'down'}`} />
              </button>
              {on && <ItensPedido p={p} onNota={() => setNota(p)} />}
            </div>
          )
        })}
        {!lista.length && <div className="ce-mudo">Nenhum pedido.</div>}
      </div>
      {nota && <JanelaNotaPedido p={nota} onFechar={() => setNota(null)} />}
    </Secao>
  )
}

function ItensPedido({ p, onNota }: { p: PedidoPc; onNota: () => void }) {
  const { d, erro } = useJson<{ itens: ItemPed[] }>(`/api/empresa/pedido-itens?conta=${p.conta}&pedido=${encodeURIComponent(p.numero)}`)
  return (
    <div className="cpv-ord-det">
      <div className="cpv-ord-conta">
        <span>Venda <b>{brl(p.venda)}</b></span>
        <span>Custo <b>{brl(p.custo)}</b></span>
        <span>Ficou <b style={{ color: p.venda - p.custo >= 0 ? '#15803d' : '#dc2626' }}>{brl(p.venda - p.custo)}</b></span>
        {p.categoria && <span>{p.categoria}</span>}
        <button className="cmnf-bt cpv-ord-pdf" onClick={onNota}><i className="fas fa-file-pdf" /> Nota fiscal</button>
      </div>
      {erro && <div className="cm-aviso">{erro}</div>}
      {!d && !erro && <div className="ce-mudo">Buscando as peças…</div>}
      {d && (
        <div>
          <div className="cpv-ord-tit">Peças do pedido</div>
          {d.itens.map((i, j) => (
            <div key={j} className="cpv-ord-it cpc-it">
              <span>{i.descricao}<small>{i.codigo}{i.familia && !/pe[çc]a/i.test(i.familia) ? ` · ${i.familia}` : ''}</small></span>
              <em>{i.qtd.toLocaleString('pt-BR')} × {brl(i.unitario)}</em>
              <em>custo {brl(i.custo)}</em>
              <b>{brl(i.total)}</b>
            </div>
          ))}
          {!d.itens.length && <div className="ce-mudo">Sem itens.</div>}
        </div>
      )}
    </div>
  )
}

/** a nota do pedido (DANFE) numa janela — lê a nota guardada no portal; sem ela, o Omie */
function JanelaNotaPedido({ p, onFechar }: { p: PedidoPc; onFechar: () => void }) {
  const [url, setUrl] = useState<string | null>(null), [erro, setErro] = useState<string | null>(null), [num, setNum] = useState('')
  useEffect(() => {
    let vivo = true, criado: string | null = null
    ;(async () => {
      try {
        const r = await fetch(`/api/empresa/nota?conta=${p.conta}&pedido=${encodeURIComponent(p.numero)}`, { headers: await authHeaders() })
        if (!r.ok) { const j = await r.json().catch(() => ({})); if (vivo) setErro(j.erro || `Erro ${r.status}`); return }
        if (vivo) setNum(r.headers.get('X-Nota-Numero') || '')
        criado = URL.createObjectURL(await r.blob())
        if (vivo) setUrl(criado)
      } catch { if (vivo) setErro('Não deu para abrir a nota agora.') }
    })()
    return () => { vivo = false; if (criado) URL.revokeObjectURL(criado) }
  }, [p.conta, p.numero])
  return (
    <div className="cmw-fundo cmpdf-fundo" onClick={onFechar}>
      <div className="cmpdf" onClick={(e) => e.stopPropagation()}>
        <div className="cml-janela-cab"><h3>{num ? `Nota nº ${num}` : `Pedido ${p.numero}`}</h3><span>{p.cliente}</span>{url && <a className="cm-bt" href={url} download={`NF_${num || p.numero}.pdf`}><i className="fas fa-download" /> Baixar</a>}<button className="cma-x" onClick={onFechar} aria-label="Fechar"><i className="fas fa-xmark" /></button></div>
        {url ? <iframe className="cmpdf-frame" src={url} title="Nota fiscal" /> : <div className="cmnf-msg">{erro || 'Abrindo a nota…'}</div>}
      </div>
    </div>
  )
}

// ── ESTOQUE ──────────────────────────────────────────────────────────────────
const COR_FAIXA = ['#16a34a', '#f59e0b', '#ea580c', '#dc2626']
function EstoquePecas({ d }: { d: DadosPecas }) {
  const [faixa, setFaixa] = useState<number | null>(null)
  const [busca, setBusca] = useState('')
  const dias = (u: string | null) => (u ? Math.round((Date.parse(d.hoje) - Date.parse(u)) / 86_400_000) : null)
  const naFaixa = (u: string | null, i: number) => { const x = dias(u); return i === 1 ? x != null && x > 90 && x <= 365 : i === 2 ? x != null && x > 365 : i === 3 ? x == null : x != null && x <= 90 }
  const q = busca.trim().toLowerCase()
  const lista = d.estoque.paradas.filter((p) => (faixa == null || naFaixa(p.ultimaVenda, faixa)) && (!q || `${p.codigo} ${p.descricao}`.toLowerCase().includes(q)))
  const parado = d.estoque.faixas.slice(1).reduce((a, f) => a + f.valor, 0)
  return (
    <div className="cpv-corpo">
      <span className="cpv-frase">Tem <b>{compacto(d.estoque.valor)}</b> em peças no estoque ({d.estoque.itens.toLocaleString('pt-BR')} códigos), pelo custo. Desse total, <b>{compacto(parado)}</b> ({d.estoque.valor ? Math.round((parado / d.estoque.valor) * 100) : 0}%) não vende há mais de 3 meses.</span>
      <div className="cpv-kpis">
        {d.estoque.faixas.map((f, i) => (
          <button key={f.nome} className={`cmt-kpi cmt-kpi-bt${faixa === i ? ' cpc-on' : ''}`} onClick={() => setFaixa(faixa === i ? null : i)} disabled={i === 0}>
            <small><i className="cdp-dot" style={{ background: COR_FAIXA[i] }} />{f.nome}</small><b>{compacto(f.valor)}</b><em>{f.itens.toLocaleString('pt-BR')} peças · {d.estoque.valor ? Math.round((f.valor / d.estoque.valor) * 100) : 0}% do estoque</em>
          </button>
        ))}
      </div>
      <div className="cpc-barra">{d.estoque.faixas.map((f, i) => <span key={f.nome} style={{ flex: f.valor, background: COR_FAIXA[i] }} title={`${f.nome}: ${brl(f.valor)}`} />)}</div>
      <Secao titulo="Peças paradas" sub="as de maior valor sem vender há mais de 3 meses · clique nas faixas acima para filtrar">
        <div className="cpf-ferr"><input className="cpf-busca" placeholder="Buscar código ou descrição" value={busca} onChange={(e) => setBusca(e.target.value)} /></div>
        <div className="cmt-tab-wrap"><table className="cmt-tab cpv-tab">
          <thead><tr><th>Peça</th><th>Última venda</th><th>Estoque</th><th>Custo un.</th><th>Valor parado</th></tr></thead>
          <tbody>{lista.map((p) => {
            const x = dias(p.ultimaVenda)
            return (
              <tr key={`${p.conta}-${p.codigo}`}>
                <td>{p.descricao}<small>{p.codigo}{p.conta === 'CASTRO' ? ' · Castro' : ''}</small></td>
                <td style={{ textAlign: 'left' }}>{p.ultimaVenda ? <>{dataBR(p.ultimaVenda)}<small style={{ color: x != null && x > 365 ? '#dc2626' : '#d97706' }}>há {x} dias</small></> : <small style={{ color: '#dc2626' }}>não vendeu desde {Number(d.hoje.slice(0, 4)) - 3}</small>}</td>
                <td className="val">{p.estoque.toLocaleString('pt-BR')}</td>
                <td className="val">{brl(p.cmc)}</td>
                <td className="val"><b>{brl(p.valor)}</b></td>
              </tr>
            )
          })}</tbody>
        </table></div>
        {!lista.length && <div className="ce-mudo">Nenhuma peça com esse filtro.</div>}
      </Secao>
      <p className="cma-nota">Valor = estoque × custo médio (CMC). Última venda = última nota de peça desde {Number(d.hoje.slice(0, 4)) - 3}. A lista mostra as 300 peças paradas de maior valor.</p>
    </div>
  )
}

export const CSS_CPC = `
.ce .cpc-mais{margin-top:8px;font-size:13.5px;color:#c2410c;cursor:pointer;font-family:inherit}
.cpc-abas{display:flex;flex-wrap:wrap;gap:8px;padding:12px 24px;border-bottom:1px solid #f1f5f9;background:#fefefe}
.ce .cpc-abas button{display:inline-flex;align-items:center;gap:6px;padding:9px 18px;border:1px solid #fed7aa;border-radius:12px;background:#fff7ed;color:#9a3412;font-family:inherit;font-size:14.5px;cursor:pointer;white-space:nowrap}
.ce .cpc-abas button:hover{border-color:#fb923c}
.ce .cpc-abas button.on{background:#ea580c;border-color:#ea580c;color:#fff}
.ce .cpc-link{font-size:13px;color:#c2410c;cursor:pointer;font-family:inherit}
.ce button.cmt-kpi.cpc-topo{border-color:#fdba74;background:#fff7ed}
.cpc-leg{display:flex;flex-wrap:wrap;gap:18px;font-size:14px;color:#334155}
.cpc-leg i{display:inline-block;width:12px;height:12px;border-radius:4px;margin-right:6px;vertical-align:-1px}
.cpc-leg b{font-weight:600;color:#0f172a}
.cpc-comp{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(0,1fr);gap:6px;height:200px}
.ce .cpc-comp-col{display:flex;flex-direction:column;align-items:center;gap:4px;border-radius:12px;padding:6px 2px;cursor:pointer;font-family:inherit}
.ce .cpc-comp-col:hover{background:#f8fafc}
.ce .cpc-comp-col.on{background:#fff7ed;box-shadow:inset 0 0 0 1px #fdba74}
.cpc-comp-barras{flex:1;width:100%;display:flex;align-items:flex-end;justify-content:center;gap:3px}
.cpc-comp-barras span{width:min(14px,40%);border-radius:4px 4px 1px 1px;min-height:1px}
.cpc-comp-col small{font-size:11.5px;color:#475569}
.cpv-tab td small{display:block}
.ce button.cmt-kpi.cpc-on{border-color:#0f172a;box-shadow:inset 0 0 0 1px #0f172a}
.ce .cpc-ped-l{grid-template-columns:170px minmax(200px,1fr) 90px 120px 14px}
.ce .cpc-it{grid-template-columns:1fr auto auto 100px}
.cpc-barra{display:flex;height:14px;border-radius:99px;overflow:hidden;gap:2px}
.cpc-barra span{display:block;min-width:2px}
@media (max-width:900px){.ce .cpc-ped-l{grid-template-columns:1fr auto 14px}.ce .cpc-it{grid-template-columns:1fr 90px}.cpc-it em{display:none}}
`
