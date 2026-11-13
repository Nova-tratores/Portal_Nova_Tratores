'use client'
// Comercial · CARTÕES POR ASSUNTO (José, 11/11): "faz os cartões com os assuntos — faturamento, despesa, vendedores,
// máquinas em estoque, vitrine com fotos — e quando clicar abre uma tela com tudo detalhado".
// Cada cartão abre uma TELA CHEIA (portal no body). Contas e formatação vêm de ./comercial.
import { Fragment, useEffect, useState, type ReactNode } from 'react'
import dynamic from 'next/dynamic'
import { supabase } from '@/lib/supabase'
import { createPortal } from 'react-dom'
import { authHeaders } from '@/lib/auth/client'
import type { DadosComercial, PropostaCm, TipoMaq } from '@/lib/empresa/comercial'
import {
  compacto, brl, cap, nomeMes, plural, frasePecas, contar, somar, contas, contaMes, mesCurto,
  COR_ENTROU, TIPO_UM, type MesDre, type SetD,
} from './comercial'
import { TelaDespesasNova } from './comercial-despesas'
import { JanelaPropostas, FaseTrilha } from './comercial-propostas'
import { TelaVendedores, TelaEstoque, TelaVitrine, prepararDados, useJson, resumoLoja, type Patio } from './comercial-telas'

const COR_SAIU = '#be123c', COR_FICOU = '#15803d'
type Tela = 'fat' | 'maq' | 'desp' | 'vend' | 'vit'

/** moldura de tela cheia (fecha no X e no Esc) */
export function TelaCheia({ titulo, sub, onFechar, children, chave }: { titulo: string; sub?: ReactNode; onFechar: () => void; children: ReactNode; chave?: ReactNode }) {
  useEffect(() => {
    const t = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar() }
    window.addEventListener('keydown', t)
    const ov = document.body.style.overflow; document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', t); document.body.style.overflow = ov }
  }, [onFechar])
  return createPortal(
    <div className="ce cma-raiz"><div className="cma cmt" role="dialog" aria-label={titulo}>
      <div className="cma-topo">
        <span className="cmt-tit">{titulo}{sub ? <small>{sub}</small> : null}</span>
        {chave}
        <button className="cma-x" onClick={onFechar} aria-label="Fechar"><i className="fas fa-xmark" /></button>
      </div>
      <div className="cmt-corpo">{children}</div>
    </div></div>,
    document.body,
  )
}

export function Kpi({ rot, val, cor, sub }: { rot: string; val: string; cor?: string; sub?: ReactNode }) {
  return <div className="cmt-kpi"><small>{rot}</small><b style={{ color: cor }}>{val}</b>{sub ? <em>{sub}</em> : null}</div>
}
export function Secao({ titulo, sub, children }: { titulo: string; sub?: ReactNode; children: ReactNode }) {
  return <section className="cmt-sec"><div className="cmt-sec-cab"><h3>{titulo}</h3>{sub ? <span>{sub}</span> : null}</div>{children}</section>
}

// ── os cartões ───────────────────────────────────────────────────────────────
export function PainelAssuntos({ d, setD, dreG }: { d: DadosComercial | null; setD?: SetD; dreG: MesDre[] | null }) {
  useEffect(() => { prepararDados() }, []) // máquinas e vendedores já vêm antes do clique
  const { d: patio } = useJson<Patio>('/api/empresa/maquinas') // a mesma lista da tela Máquinas
  const loja = patio ? resumoLoja(patio) : null
  const { d: vendApp } = useJson<{ vendedores: Array<{ nome: string }> }>('/api/empresa/vendedores') // equipe de hoje (portal + RH)
  const equipe = vendApp ? vendApp.vendedores.map((v) => v.nome) : null
  const [tela, setTela] = useState<Tela | null>(() => {
    if (typeof window === 'undefined') return null
    const t = new URLSearchParams(window.location.search).get('tela')
    return t === 'fat' || t === 'maq' || t === 'desp' || t === 'vend' || t === 'vit' ? t : null
  })
  useEffect(() => {
    try {
      const u = new URL(window.location.href)
      if (tela) u.searchParams.set('tela', tela); else u.searchParams.delete('tela')
      if (u.toString() !== window.location.href) window.history.replaceState(null, '', u.toString())
    } catch { /* sem URL */ }
  }, [tela])
  const meses = dreG || []
  const ult = meses[meses.length - 1]
  const x = ult ? contaMes(ult.setores.comercial) : null
  const c = d ? contas(d) : null
  // mini gráfico do cartão de faturamento: últimos 6 meses do DRE
  const max6 = Math.max(1, ...meses.map((m) => m.setores.comercial.receita))
  const fechar = () => setTela(null)
  const [propostas, setPropostas] = useState(false) // janela das propostas em aberto
  const cartao = (t: Tela, cor: string, ic: string, nome: string, num: string, linha: ReactNode, extraEl?: ReactNode, cls = '') => (
    <button className={`cml-card ${cls}`} style={{ ['--c' as string]: cor }} onClick={() => setTela(t)}>
      <span className="cml-cab"><span className="pf-ic"><i className={`fas ${ic}`} /></span><span className="cml-nome">{nome}</span><i className="fas fa-arrow-right cml-seta" /></span>
      <span className="cml-num">{num}</span>
      <span className="cml-linha">{linha}</span>
      {extraEl}
    </button>
  )
  return (
    <div className="pf cml">
      <div className="cml-grade">
        {cartao('fat', COR_ENTROU, 'fa-sack-dollar', 'Faturamento', x ? compacto(x.faturou) : '—',
          x && ult ? <>em {nomeMes(ult.mes)}{ult.parcial ? ' até hoje' : ''} · {c ? frasePecas(contar(c.doMes, 'trator'), contar(c.doMes, 'implemento')) : ''}</> : 'carregando o DRE…',
          meses.length ? (
            <span className="cml-mini">{meses.map((m) => (
              <span key={m.mes} className={m.mes === ult?.mes ? 'on' : ''}><span style={{ height: `${(m.setores.comercial.receita / max6) * 100}%` }} /><small>{mesCurto(m.mes)}</small></span>
            ))}</span>
          ) : null, 'cml-g')}
        {cartao('maq', '#15803d', 'fa-tractor', 'Estoque da loja', loja ? plural(loja.qtdLoja, 'máquina', 'máquinas') : '—',
          loja ? <>{compacto(loja.valorLoja)} parados · {loja.velhas} há mais de 1 ano · + {loja.qtdDemo} em demonstração</> : 'carregando…',
          c ? (
            <span className="cml-extras">
              <span><i className="fas fa-tractor" /><b>{c.doAnt.reduce((a, v) => a + v.qtd, 0)}</b> vendidas em {nomeMes(c.ant)}<small>{frasePecas(contar(c.doAnt, 'trator'), contar(c.doAnt, 'implemento'))} · {compacto(somar(c.doAnt))}</small></span>
              <span><i className="fas fa-file-signature" /><b>{c.abertas.length}</b> propostas em aberto<small>{compacto(somar(c.abertas))}</small></span>
            </span>
          ) : null)}
        {cartao('desp', COR_SAIU, 'fa-receipt', 'Custos e despesas', x ? compacto(x.gastou) : '—',
          x ? <>custo das máquinas <b>{compacto(x.partes.find((q) => q.k === 'custo')?.valor || 0)}</b> + despesas <b>{compacto(x.gastou - (x.partes.find((q) => q.k === 'custo')?.valor || 0))}</b><br />{x.resultado >= 0 ? <>sobrou <b style={{ color: COR_FICOU }}>{compacto(x.resultado)}</b></> : <>faltou <b style={{ color: COR_SAIU }}>{compacto(-x.resultado)}</b></>} no mês</> : 'carregando o DRE…')}
        {cartao('vend', '#7c3aed', 'fa-user-tie', 'Vendedores', equipe ? `${equipe.length}` : '—',
          c && equipe ? <>{equipe.join(', ')} · {c.ranking.find((r) => equipe.includes(r.nome))?.nome || 'ninguém'} vendeu mais em 3 meses{c.metaEquipe ? ` · ${Math.round((somar(c.doMes) / c.metaEquipe) * 100)}% da meta` : ''}</> : 'carregando…')}
        {cartao('vit', '#0f766e', 'fa-images', 'Vitrine das máquinas', 'Catálogo', <>fotos, ficha e preço de venda de cada máquina</>)}
      </div>
      {tela === 'fat' && <TelaFaturamento d={d} meses={meses} onFechar={fechar} />}
      {tela === 'desp' && <TelaDespesasNova mesesBase={meses} onFechar={fechar} />}
      {tela === 'vend' && <TelaVendedores d={d} setD={setD} onFechar={fechar} />}
      {tela === 'vit' && <TelaVitrine onFechar={fechar} />}
      {tela === 'maq' && <TelaEstoque onFechar={fechar} depois={<VendasModelo d={d} />} kpiExtra={c ? (
        <button className="cmt-kpi cmt-kpi-bt" onClick={() => setPropostas(true)}><small>Propostas em aberto</small><b style={{ color: '#1d4ed8' }}>{c.abertas.length}</b><em>{compacto(somar(c.abertas))} · {c.abertas.filter((p) => p.diasNaFase > 30).length} paradas +30 dias</em></button>
      ) : null} />}
      {propostas && d && <JanelaPropostas propostas={d.propostas} onFechar={() => setPropostas(false)} />}
    </div>
  )
}

// ── gráfico das máquinas vendidas nos 12 meses (José, 12/11: "melhora esse gráfico") ──
// escala com linhas de fundo, linha da média, mês com o ano, quantidade embaixo, detalhe ao passar o mouse,
// mês escolhido em destaque (clicar escolhe o mês da tela)
function Grafico12({ d, mes, temMes, setMes }: { d: DadosComercial; mes: string; temMes: (k: string) => boolean; setMes: (k: string) => void }) {
  const [sobre, setSobre] = useState<string | null>(null)
  // fecha ao clicar fora da barra (José, 12/11)
  useEffect(() => {
    if (!sobre) return
    const fora = (e: MouseEvent) => { if (!(e.target as HTMLElement)?.closest?.('.g12-col')) setSobre(null) }
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [sobre])
  const cols = d.meses.map((k) => {
    const vs = d.vendas.filter((v) => v.mes === k)
    const tr = vs.filter((v) => v.tipo === 'trator'), ou = vs.filter((v) => v.tipo !== 'trator')
    return { k, tr: somar(tr), ou: somar(ou), nTr: contar(vs, 'trator'), nIm: ou.reduce((a, v) => a + v.qtd, 0) }
  })
  const media = cols.reduce((a, c) => a + c.tr + c.ou, 0) / Math.max(1, cols.length)
  const bruto = Math.max(1, ...cols.map((c) => c.tr + c.ou))
  const passo = bruto > 2e6 ? 1e6 : bruto > 1e6 ? 5e5 : bruto > 4e5 ? 2e5 : 1e5
  const topo = Math.ceil(bruto / passo) * passo
  const linhas = Array.from({ length: Math.round(topo / passo) + 1 }, (_, i) => i * passo)
  const rot = (k: string) => `${mesCurto(k)}/${k.slice(2, 4)}`
  const ativo = cols.find((c) => c.k === sobre)
  return (
    <div className="g12">
      <div className="g12-area">
        {linhas.map((v) => <div key={v} className="g12-linha" style={{ bottom: `${(v / topo) * 100}%` }}><span>{v ? compacto(v).replace('R$ ', '') : '0'}</span></div>)}
        <div className="g12-media" style={{ bottom: `${(media / topo) * 100}%` }}><span>média {compacto(media)}</span></div>
        <div className="g12-cols">
          {cols.map((c) => {
            const tot = c.tr + c.ou, escolhido = c.k === mes
            return (
              <button key={c.k} className={`g12-col${escolhido ? ' on' : ''}${tot >= media ? ' acima' : ''}`} disabled={!tot}
                onClick={() => { setSobre(sobre === c.k ? null : c.k); if (temMes(c.k)) setMes(c.k) }}>
                <span className="g12-val">{tot ? compacto(tot).replace('R$ ', '') : ''}</span>
                <span className="g12-pilha" style={{ height: `${(tot / topo) * 100}%` }}>
                  <span style={{ flex: c.ou, background: '#93c5fd' }} /><span style={{ flex: c.tr, background: '#1d4ed8' }} />
                </span>
              </button>
            )
          })}
        </div>
        {ativo && (
          <div className="g12-dica" title="Clique para fechar" onClick={() => setSobre(null)} style={{ left: `${((cols.indexOf(ativo) + 0.5) / cols.length) * 100}%` }}>
            <b>{cap(nomeMes(ativo.k, true))}</b>
            <span><i style={{ background: '#1d4ed8' }} />{plural(ativo.nTr, 'trator', 'tratores')}<em>{compacto(ativo.tr)}</em></span>
            <span><i style={{ background: '#93c5fd' }} />{plural(ativo.nIm, 'implemento', 'implementos')}<em>{compacto(ativo.ou)}</em></span>
            <span className="g12-dica-tot">Total<em>{compacto(ativo.tr + ativo.ou)}</em></span>
          </div>
        )}
      </div>
      <div className="g12-eixo">
        {cols.map((c) => (
          <button key={c.k} className={c.k === mes ? 'on' : ''} disabled={!temMes(c.k)} onClick={() => setMes(c.k)} title={temMes(c.k) ? `Ver ${nomeMes(c.k, true)}` : 'Sem o resultado gerencial deste mês'}>
            <b>{rot(c.k)}</b>
            <small>{c.nTr || c.nIm ? `${c.nTr} tr · ${c.nIm} im` : '—'}</small>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── pizza das propostas + ticket (José, 12/11: "um bloquinho com gráfico pizza das propostas e o ticket aberto") ──
export function PizzaPropostas({ d, abrir, lista }: { d: DadosComercial; abrir: (titulo: string, l: PropostaCm[]) => void; lista?: PropostaCm[] }) {
  const props = lista ?? d.propostas // por vendedor: só as dele
  const [sobre, setSobre] = useState<number | null>(null)
  const ab = props.filter((p) => p.aberta)
  const f = (re: RegExp) => ab.filter((p) => re.test(p.fase.toLowerCase()))
  const fatias = [
    { nome: 'Esperando o cliente', l: f(/cliente/), cor: '#2563eb' },
    { nome: 'Esperando o banco', l: f(/banco/), cor: '#7c3aed' },
    { nome: 'A enviar', l: f(/enviar/), cor: '#93c5fd' },
    { nome: 'Viraram venda', l: props.filter((p) => p.vendida), cor: '#16a34a' },
    { nome: 'Não vendemos', l: props.filter((p) => p.perdida), cor: '#dc2626' },
  ].filter((x) => x.l.length)
  const outrasAbertas = ab.filter((p) => !fatias.some((x) => x.l.includes(p)))
  if (outrasAbertas.length) fatias.splice(3, 0, { nome: 'Outras fases', l: outrasAbertas, cor: '#94a3b8' })
  const total = fatias.reduce((a, x) => a + x.l.length, 0) || 1
  // donut em SVG (círculo com traço por fatia)
  const R = 54, C = 2 * Math.PI * R
  let acc = 0
  const ticketAb = ab.length ? somar(ab) / ab.length : 0
  const vend = props.filter((p) => p.vendida), ticketVend = vend.length ? somar(vend) / vend.length : 0
  const at = sobre != null ? fatias[sobre] : null
  return (
    <div className="cmpz">
      <div className="cmpz-graf">
        <svg viewBox="0 0 140 140" className="cmpz-svg">
          {fatias.map((x, i) => {
            const frac = x.l.length / total, dash = frac * C, off = -acc * C
            acc += frac
            return <circle key={x.nome} cx="70" cy="70" r={R} fill="none" stroke={x.cor} strokeWidth={sobre === i ? 22 : 18} strokeDasharray={`${dash} ${C - dash}`} strokeDashoffset={off}
              transform="rotate(-90 70 70)" style={{ cursor: 'pointer', transition: 'stroke-width .15s' }} onMouseEnter={() => setSobre(i)} onMouseLeave={() => setSobre(null)} onClick={() => abrir(`Propostas: ${x.nome.toLowerCase()}`, x.l)} />
          })}
          <text x="70" y="66" textAnchor="middle" className="cmpz-n">{at ? at.l.length : props.length}</text>
          <text x="70" y="84" textAnchor="middle" className="cmpz-t">{at ? at.nome.toLowerCase() : 'propostas'}</text>
        </svg>
        <div className="cmpz-leg">
          {fatias.map((x, i) => (
            <button key={x.nome} className={sobre === i ? 'on' : ''} onMouseEnter={() => setSobre(i)} onMouseLeave={() => setSobre(null)} onClick={() => abrir(`Propostas: ${x.nome.toLowerCase()}`, x.l)}>
              <i style={{ background: x.cor }} /><span>{x.nome}</span><b>{x.l.length}</b><small>{compacto(somar(x.l))}</small>
            </button>
          ))}
        </div>
      </div>
      <div className="cmpz-ticket">
        <div><small>Ticket médio das abertas</small><b>{compacto(ticketAb)}</b><em>por proposta · {ab.length} abertas</em></div>
        <div><small>Ticket das que viraram venda</small><b style={{ color: '#16a34a' }}>{compacto(ticketVend)}</b><em>{vend.length} vendidas</em></div>
      </div>
    </div>
  )
}

// ── tela cheia: FATURAMENTO ──────────────────────────────────────────────────
function TelaFaturamento({ d, meses, onFechar }: { d: DadosComercial | null; meses: MesDre[]; onFechar: () => void }) {
  const [propLista, setPropLista] = useState<{ titulo: string; l: PropostaCm[] } | null>(null) // lista ao clicar num cartão de propostas
  const [janFat, setJanFat] = useState<'valor' | 'custo' | 'margem' | 'resultado' | null>(null) // janela dos cartões do topo
  const [nota, setNota] = useState<{ pedido: string; conta: string; cliente: string } | null>(null) // PDF da nota fiscal
  // mês escolhido; até o DRE chegar (ou se o escolhido não existir) vale o último mês — senão aparecia 'Invalid Date'
  const [mesEsc, setMes] = useState('')
  const mes = mesEsc && meses.some((x) => x.mes === mesEsc) ? mesEsc : meses[meses.length - 1]?.mes || ''
  const [filtro, setFiltro] = useState<'todos' | TipoMaq>('todos')
  const m = meses.find((x) => x.mes === mes) || meses[meses.length - 1]
  const l = m?.setores.comercial
  const x = l ? contaMes(l) : null
  const margem = l ? l.margem : 0
  const vendM = d ? d.vendas.filter((v) => v.mes === mes) : []
  const qtdM = vendM.reduce((a, v) => a + v.qtd, 0)
  // vendas por modelo: últimos 6 meses (os do DRE), quantidade por mês e valor total
  // gráfico: 12 meses de máquinas (tratores x implementos)
  const c = d ? contas(d) : null
  const fechadas = d ? d.propostas.filter((p) => p.vendida || p.perdida) : []
  const vendidas = fechadas.filter((p) => p.vendida).length
  return (
    <TelaCheia titulo="Faturamento do Comercial" sub={m ? `${cap(nomeMes(m.mes, true))}${m.parcial ? ' · até hoje' : ''}` : undefined} onFechar={onFechar}>
      {x && l && (
        <div className="cmt-kpis">
          <button className="cmt-kpi cmt-kpi-bt" onClick={() => setJanFat('valor')}><small>Faturou</small><b style={{ color: COR_ENTROU }}>{compacto(x.faturou)}</b><em>{!d ? 'carregando…' : qtdM ? frasePecas(contar(vendM, 'trator'), contar(vendM, 'implemento')) : 'nenhuma máquina'}</em></button>
          <button className="cmt-kpi cmt-kpi-bt" onClick={() => setJanFat('custo')}><small>Custo das máquinas</small><b style={{ color: '#b91c1c' }}>{compacto(Math.max(0, -l.custos))}</b><em>o que pagamos nelas</em></button>
          <button className="cmt-kpi cmt-kpi-bt" onClick={() => setJanFat('margem')}><small>Margem bruta</small><b style={{ color: margem >= 0 ? COR_FICOU : COR_SAIU }}>{compacto(margem)}</b><em>{x.faturou ? `${Math.round((margem / x.faturou) * 100)}% do que vendeu, já sem impostos` : ''}</em></button>
          <button className="cmt-kpi cmt-kpi-bt" onClick={() => setJanFat('valor')}><small>Ticket médio</small><b>{!d ? '…' : qtdM ? compacto(somar(vendM) / qtdM) : '—'}</b><em>por máquina vendida</em></button>
          <button className={`cmt-kpi cmt-kpi-bt cmt-res ${x.resultado >= 0 ? 'bom' : 'ruim'}`} onClick={() => setJanFat('resultado')}><small>Resultado do mês</small><b>{compacto(x.resultado)}</b><em>{x.resultado >= 0 ? 'sobrou' : 'faltou'} depois de todas as despesas · ver a conta</em></button>
        </div>
      )}
      <Secao titulo="Máquinas vendidas nos últimos 12 meses" sub={<><span className="cmt-leg"><i style={{ background: '#1d4ed8' }} />Tratores</span><span className="cmt-leg"><i style={{ background: '#93c5fd' }} />Implementos e outras</span></>}>
        {d ? (
          <Grafico12 d={d} mes={mes} temMes={(k) => meses.some((mm) => mm.mes === k)} setMes={setMes} />
        ) : <div className="ce-mudo">Carregando…</div>}
      </Secao>
        <Secao titulo="Propostas">
          {c && d ? (
            <div className="cmpz-l">
            <PizzaPropostas d={d} abrir={(titulo, l) => setPropLista({ titulo, l })} />
            <div className="cmt-kpis cmpz-cards">
              <button className="cmt-kpi cmt-kpi-bt" onClick={() => setPropLista({ titulo: 'Propostas abertas', l: c.abertas })}><small>Abertas</small><b>{c.abertas.length}</b><em>{compacto(somar(c.abertas))}</em></button>
              <button className="cmt-kpi cmt-kpi-bt" onClick={() => setPropLista({ titulo: 'Propostas esquecidas há mais de 30 dias', l: c.abertas.filter((p) => p.diasNaFase > 30) })}><small>Esquecidas +30 dias</small><b style={{ color: '#b45309' }}>{c.abertas.filter((p) => p.diasNaFase > 30).length}</b><em>sem mudar de fase</em></button>
              <button className="cmt-kpi cmt-kpi-bt" onClick={() => setPropLista({ titulo: 'Propostas que viraram venda', l: fechadas.filter((p) => p.vendida) })}><small>Viraram venda</small><b style={{ color: COR_FICOU }}>{vendidas}</b><em>{fechadas.length ? `${Math.round((vendidas / fechadas.length) * 100)}% das que fecharam` : ''}</em></button>
              <button className="cmt-kpi cmt-kpi-bt" onClick={() => setPropLista({ titulo: 'Propostas que não vendemos', l: fechadas.filter((p) => p.perdida) })}><small>Não vendemos</small><b style={{ color: COR_SAIU }}>{fechadas.length - vendidas}</b><em>com o motivo</em></button>
            </div>
            </div>
          ) : <div className="ce-mudo">Carregando…</div>}
        </Secao>
      <Secao titulo={`Faturado em ${nomeMes(mes)}${m?.parcial ? ' até hoje' : ''}`} sub={
        <span className="cm-abas">{([['todos', 'Todos'], ['trator', 'Tratores'], ['implemento', 'Implementos'], ['precisao', 'GPS']] as Array<['todos' | TipoMaq, string]>).map(([k, n]) => <button key={k} className={filtro === k ? 'on' : ''} onClick={() => setFiltro(k)}>{n}</button>)}</span>
      }>
        {(() => {
          const l = vendM.filter((v) => filtro === 'todos' || v.tipo === filtro).sort((a, b) => b.valor - a.valor)
          if (!d) return <div className="ce-mudo">Carregando…</div>
          if (!l.length) return <div className="ce-mudo">Nenhuma máquina faturada {filtro === 'todos' ? '' : 'desse tipo '}em {nomeMes(mes)}.</div>
          return (
            <div className="cmt-tab-wrap"><table className="cmt-tab cmfat-tab">
              <thead><tr><th>Cliente</th><th>Máquina</th><th>Vendedor</th><th>Pedido</th><th>Valor</th><th>Nota</th></tr></thead>
              <tbody>{l.map((v, k) => (
                <tr key={k}>
                  <td>{v.cliente || 'cliente'}{v.conta === 'CASTRO' ? <small>Castro</small> : null}</td>
                  <td>{v.modelo}{v.qtd > 1 ? ` · ${v.qtd} unidades` : ''}<small>{TIPO_UM[v.tipo]}</small></td>
                  <td>{v.vendedor || '—'}</td>
                  <td>{v.pedido || '—'}</td>
                  <td className="val">{brl(v.valor)}</td>
                  <td>{v.pedido ? <button className="cmnf-bt" onClick={() => setNota({ pedido: String(v.pedido), conta: v.conta, cliente: v.cliente || '' })}><i className="fas fa-file-invoice" /> Ver nota</button> : '—'}</td>
                </tr>
              ))}</tbody>
              <tfoot><tr><td>{plural(l.reduce((a, v) => a + v.qtd, 0), 'máquina', 'máquinas')}</td><td /><td /><td /><td className="val">{brl(somar(l))}</td><td /></tr></tfoot>
            </table></div>
          )
        })()}
        <p className="cma-nota">Pelos pedidos de máquinas faturados no Omie (cancelados e devolvidos fora). O faturamento do topo ({x ? compacto(x.faturou) : '—'}) é o da contabilidade e inclui outras receitas do Comercial.</p>
      </Secao>
      {janFat && x && l && (
        <div className="cmw-fundo cml-janela-fundo cmp-fundo" onClick={() => setJanFat(null)}>
          <div className="cml-janela cmp-janela" onClick={(e) => e.stopPropagation()}>
            <div className="cml-janela-cab"><h3>{janFat === 'resultado' ? `A conta de ${nomeMes(mes)}` : `Vendas de ${nomeMes(mes)}`}</h3><span>{janFat === 'resultado' ? 'do que entrou ao que sobrou' : janFat === 'custo' ? 'das que custaram mais' : janFat === 'margem' ? 'das de menor margem' : 'das maiores'}</span><button className="cma-x" onClick={() => setJanFat(null)} aria-label="Fechar"><i className="fas fa-xmark" /></button></div>
            <div className="cml-janela-corpo">
              {janFat === 'resultado' ? (
                <div className="cmr-conta">
                  <div><span>Faturou</span><b style={{ color: COR_ENTROU }}>{brl(x.faturou)}</b></div>
                  {x.partes.map((pp) => <div key={pp.k}><span>− {pp.nome}</span><b>{brl(pp.valor)}</b></div>)}
                  <div className={`cmr-tot ${x.resultado >= 0 ? 'bom' : 'ruim'}`}><span>= {x.resultado >= 0 ? 'Sobrou' : 'Faltou'}</span><b>{brl(x.resultado)}</b></div>
                  <p className="cma-nota">Pelo DRE gerencial do Comercial. a “parte das despesas gerais” é a fatia das despesas da empresa toda (administração, pessoal sem setor…) que cabe ao Comercial pelo tanto que ele vendeu.</p>
                </div>
              ) : (() => {
                const ls = vendM.map((v) => ({ ...v, mg: v.valor && v.custo ? (v.valor - v.custo) / v.valor : null }))
                  .sort((a, b) => janFat === 'custo' ? b.custo - a.custo : janFat === 'margem' ? (a.mg ?? 9) - (b.mg ?? 9) : b.valor - a.valor)
                return ls.length ? (<>
                  <div className="mg-leg"><span><i className="r" />vendemos por menos do que pagamos</span><span><i className="g" />margem boa (15% ou mais)</span></div>
                  <div className="cmt-tab-wrap"><table className="cmt-tab cmfat-tab">
                    <thead><tr><th>Cliente</th><th>Máquina</th><th>Vendemos por</th><th>Pagamos</th><th>Margem</th></tr></thead>
                    <tbody>{ls.map((v, k) => (
                      <tr key={k} className={v.mg == null ? '' : v.mg < 0 ? 'mg-ruim' : v.mg >= 0.15 ? 'mg-boa' : ''}><td>{v.cliente || 'cliente'}<small>{v.vendedor || 'sem vendedor'}{v.pedido ? ` · pedido ${v.pedido}` : ''}</small></td><td>{v.modelo}<small>{TIPO_UM[v.tipo]}</small></td>
                        <td className="val">{brl(v.valor)}</td><td className="val">{v.custo ? brl(v.custo) : '—'}</td>
                        <td className="val mg" style={{ color: v.mg == null ? '#64748b' : v.mg < 0 ? COR_SAIU : v.mg >= 0.15 ? COR_FICOU : '#0f172a' }}>{v.mg == null ? '—' : `${Math.round(v.mg * 100)}%`}</td></tr>
                    ))}</tbody>
                    <tfoot><tr><td>{plural(ls.reduce((a, v) => a + v.qtd, 0), 'máquina', 'máquinas')}</td><td /><td className="val">{brl(somar(ls))}</td><td className="val">{brl(ls.reduce((a, v) => a + v.custo, 0))}</td><td /></tr></tfoot>
                  </table></div>
                </>) : <div className="ce-mudo">Nenhuma máquina faturada em {nomeMes(mes)}.</div>
              })()}
            </div>
          </div>
        </div>
      )}
      {nota && <JanelaNota {...nota} onFechar={() => setNota(null)} />}
      {propLista && <ListaPropostas titulo={propLista.titulo} l={propLista.l} onFechar={() => setPropLista(null)} />}
    </TelaCheia>
  )
}

// ── QUADRO DO ANO (José, 11/11: "algo assim mesmo" — meses com barrinhas por categoria, trimestres e total) ──
// ── CALENDÁRIO DO ANO (José, 11/11): só o número de máquinas vendidas em cada mês; "só se clicar no mês aparece o que
// foi vendido, ou clicar no ano". Os modelos ficam na janela que abre.
type VendaCal = DadosComercial['vendas'][number]
const MESES_NOME = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
// José, 11/11: nome do mês inteiro, "tantos tratores e tantos implementos" no mês e a soma no fim; sem bloco preto
function CalendarioAno({ ano, vendas, extra, abrir }: { ano: number; vendas: VendaCal[]; extra?: ReactNode; abrir: (titulo: string, l: VendaCal[]) => void }) {
  const agora = new Date(), mesHoje = agora.getFullYear() === ano ? agora.getMonth() + 1 : 13
  const doMes = (m: number) => vendas.filter((v) => Number(v.mes.slice(5)) === m)
  const qtd = (l: VendaCal[], t?: TipoMaq | 'outros') => l.filter((v) => !t || (t === 'outros' ? v.tipo !== 'trator' && v.tipo !== 'implemento' : v.tipo === t)).reduce((a, v) => a + v.qtd, 0)
  const linhas = (l: VendaCal[]) => {
    const tr = qtd(l, 'trator'), im = qtd(l, 'implemento'), ou = qtd(l, 'outros')
    return <>
      <span className={tr ? '' : 'zero'}><b>{tr}</b> {tr === 1 ? 'trator' : 'tratores'}</span>
      <span className={im ? '' : 'zero'}><b>{im}</b> {im === 1 ? 'implemento' : 'implementos'}</span>
      {ou ? <span><b>{ou}</b> GPS</span> : null}
    </>
  }
  return (
    <section className={`cmc ${ano === new Date().getFullYear() ? 'cmc-atual' : ano === new Date().getFullYear() - 1 ? 'cmc-passado' : 'cmc-antigo'}`}>
      <div className={`cmc-caixa${extra ? ' com-extra' : ''}`}>
        <div className="cmc-meses">
          {MESES_NOME.map((n, k) => {
            const l = doMes(k + 1), futuro = k + 1 > mesHoje
            return (
              <button key={n} className={`cmc-mes${k + 1 === mesHoje ? ' agora' : ''}${futuro ? ' futuro' : ''}`} disabled={futuro || !l.length}
                onClick={() => abrir(`${n} de ${ano}`, l)}>
                <small>{n}</small>{futuro ? null : linhas(l)}
              </button>
            )
          })}
        </div>
        <button className="cmc-ano" disabled={!vendas.length} onClick={() => abrir(`Ano de ${ano}`, vendas)}>
          <small>Soma de {ano}</small>
          <strong>{qtd(vendas)}<em>máquinas</em></strong>
          <span className="cmc-ano-l"><span>Tratores</span><b>{qtd(vendas, 'trator')}</b></span>
          <span className="cmc-ano-l"><span>Implementos</span><b>{qtd(vendas, 'implemento')}</b></span>
          {qtd(vendas, 'outros') ? <span className="cmc-ano-l"><span>GPS</span><b>{qtd(vendas, 'outros')}</b></span> : null}
          <span className="cmc-ano-ver">ver o que foi vendido <i className="fas fa-arrow-right" /></span>
        </button>
        {extra ? <div className="cmq-extra cmc-extra">{extra}</div> : null}
      </div>
    </section>
  )
}

/** janela com o que foi vendido no mês / no ano: por modelo, e cada venda */
function JanelaVendidas({ titulo, l, onFechar }: { titulo: string; l: VendaCal[]; onFechar: () => void }) {
  const [aberto, setAberto] = useState<string | null>(null)
  const ag = new Map<string, VendaCal[]>()
  for (const v of l) ag.set(v.modelo, [...(ag.get(v.modelo) || []), v])
  const linhas = [...ag.entries()].map(([mod, vs]) => ({ mod, vs, qtd: vs.reduce((a, v) => a + v.qtd, 0), valor: somar(vs) })).sort((a, b) => b.qtd - a.qtd || b.valor - a.valor)
  const total = l.reduce((a, v) => a + v.qtd, 0)
  return (
    <div className="cmw-fundo" onClick={onFechar}>
      <div className="cmw-caixa cmv-jan" onClick={(e) => e.stopPropagation()}>
        <div className="cmv-jan-cab"><h3>{titulo}</h3><span>{plural(total, 'máquina vendida', 'máquinas vendidas')} · {compacto(somar(l))}</span><button className="cma-x" onClick={onFechar} aria-label="Fechar"><i className="fas fa-xmark" /></button></div>
        <div className="cmv-jan-corpo">
          {linhas.map((x) => (
            <div key={x.mod} className="cmv-jan-mod">
              <button className="cmv-jan-l" onClick={() => setAberto(aberto === x.mod ? null : x.mod)}>
                <span className="cmv-jan-q">{x.qtd}</span><span className="cmv-jan-n">{x.mod}<small>{TIPO_UM[x.vs[0].tipo]}</small></span><b>{compacto(x.valor)}</b><i className={`fas fa-chevron-${aberto === x.mod ? 'up' : 'down'}`} />
              </button>
              {aberto === x.mod && x.vs.sort((a, b) => b.mes.localeCompare(a.mes)).map((v, k) => (
                <div key={k} className="cmj-it cmv-jan-v"><span>{v.cliente || 'cliente'}<small>{[cap(nomeMes(v.mes)), v.vendedor || 'sem vendedor no pedido', v.pedido ? `pedido ${v.pedido}` : ''].filter(Boolean).join(' · ')}</small></span><b>{brl(v.valor)}</b></div>
              ))}
            </div>
          ))}
          {!linhas.length && <div className="ce-mudo">Nenhuma venda.</div>}
        </div>
      </div>
    </div>
  )
}

// ── VENDAS POR MODELO: bloco dentro da tela de Máquinas (José, 11/11: "coloca o venda por modelo aqui"; o quadro do
// ano atual com as propostas em aberto ao lado e, embaixo, o do ano anterior — vai rolando conforme os anos passam) ──
export function VendasModelo({ d }: { d: DadosComercial | null }) {
  const [vendidas, setVendidas] = useState<{ titulo: string; l: VendaCal[] } | null>(null) // janela do mês / do ano
  const [anteriores, setAnteriores] = useState(false) // 2024, 2023… escondidos até clicar
  const anoAtual = new Date().getFullYear()
  return (
    <section className="cmt-sec cmvm">
      <div className="cmt-sec-cab"><h3>Vendas por modelo</h3><span>clique num mês (ou na soma do ano) para ver o que foi vendido</span></div>
      {!d ? <div className="ce-mudo">Carregando…</div> : <>
        {[anoAtual, anoAtual - 1, ...(anteriores ? (d.anos || []).filter((x) => x < anoAtual - 1) : [])].map((a) => (
          <Fragment key={a}>
            <h3 className={`cmq-ano cmc-tit-${a === anoAtual ? 'atual' : a === anoAtual - 1 ? 'passado' : 'antigo'}`}><span>{a}</span><small>{a === anoAtual ? 'ano atual, até hoje' : a === anoAtual - 1 ? 'ano passado' : ''}</small></h3>
            <CalendarioAno ano={a} vendas={d.vendas.filter((v) => v.mes.startsWith(String(a)))} abrir={(titulo, l) => setVendidas({ titulo, l })} />
          </Fragment>
        ))}
        {(d.anos || []).some((x) => x < anoAtual - 1) && (
          <button className="cmc-mais-anos" onClick={() => setAnteriores((v) => !v)}>
            <i className={`fas fa-chevron-${anteriores ? 'up' : 'down'}`} /> {anteriores ? 'Esconder os anos anteriores' : `Ver anos anteriores (${(d.anos || []).filter((x) => x < anoAtual - 1).sort((a, b) => b - a).join(', ')})`}
          </button>
        )}
        {vendidas && <JanelaVendidas titulo={vendidas.titulo} l={vendidas.l} onFechar={() => setVendidas(null)} />}
        <p className="cma-nota">Cancelados e devolvidos ficam de fora.</p>
      </>}
    </section>
  )
}

// ── PDF da nota fiscal de uma venda numa janela (José, 12/11) — /api/empresa/nota ──
function JanelaNota({ pedido, conta, cliente, onFechar }: { pedido: string; conta: string; cliente: string; onFechar: () => void }) {
  const [url, setUrl] = useState<string | null>(null), [erro, setErro] = useState<string | null>(null), [num, setNum] = useState('')
  useEffect(() => {
    let vivo = true, criado: string | null = null
    ;(async () => {
      try {
        const r = await fetch(`/api/empresa/nota?conta=${encodeURIComponent(conta || 'NOVA')}&pedido=${encodeURIComponent(pedido)}`, { headers: await authHeaders() })
        if (!r.ok) { const j = await r.json().catch(() => ({})); if (vivo) setErro(j.erro || `Erro ${r.status}`); return }
        criado = URL.createObjectURL(await r.blob())
        if (vivo) { setUrl(criado); setNum(r.headers.get('X-Nota-Numero') || '') }
      } catch { if (vivo) setErro('Não deu para buscar a nota agora.') }
    })()
    return () => { vivo = false; if (criado) URL.revokeObjectURL(criado) }
  }, [pedido, conta])
  return (
    <div className="cmw-fundo cmpdf-fundo" onClick={onFechar}>
      <div className="cmpdf" onClick={(e) => e.stopPropagation()}>
        <div className="cml-janela-cab"><h3>Nota fiscal{num ? ` nº ${num}` : ''}</h3><span>{cliente} · pedido {pedido}</span>
          {url && <a className="cm-bt" href={url} download={`NF_${num || pedido}.pdf`}><i className="fas fa-download" /> Baixar</a>}
          <button className="cma-x" onClick={onFechar} aria-label="Fechar"><i className="fas fa-xmark" /></button></div>
        {url ? <iframe className="cmpdf-frame" src={url} title="Nota fiscal" /> : <div className="cmnf-msg">{erro || 'Buscando a nota no Omie…'}</div>}
      </div>
    </div>
  )
}

// ── lista de propostas (José, 12/11: "clicável, mostra em lista e, ao clicar numa proposta, abre o PDF") ──
/** abre o PDF de uma proposta numa janela ali mesmo (gera com a janela de Propostas, no modo só-PDF) */
export function PdfProposta({ id, onFechar }: { id: number; onFechar: () => void }) {
  const [row, setRow] = useState<Record<string, unknown> | null>(null)
  const [url, setUrl] = useState<string | null>(null), [erro, setErro] = useState<string | null>(null)
  useEffect(() => {
    let vivo = true
    void supabase.from('Formulario').select('*').eq('id', id).maybeSingle().then(({ data, error }) => { if (!vivo) return; if (error || !data) setErro('Não deu para abrir essa proposta.'); else setRow(data) })
    return () => { vivo = false }
  }, [id])
  const titulo = String(row?.Cliente || 'Proposta')
  return (
    <div className="cmw-fundo cmpdf-fundo" onClick={onFechar}>
      <div className="cmpdf" onClick={(e) => e.stopPropagation()}>
        <div className="cml-janela-cab"><h3>Proposta · {titulo}</h3><span />{url && <a className="cm-bt" href={url} download={`Proposta_${titulo}.pdf`}><i className="fas fa-download" /> Baixar</a>}<button className="cma-x" onClick={onFechar} aria-label="Fechar"><i className="fas fa-xmark" /></button></div>
        {url ? <iframe className="cmpdf-frame" src={url} title="PDF da proposta" /> : <div className="cmnf-msg">{erro || 'Gerando o PDF da proposta…'}</div>}
      </div>
      {row && !url && <EditModalProposta proposal={row} soPdf onPdf={(u: string) => setUrl(u)} onClose={() => { if (!url) setErro((e) => e) }} />}
    </div>
  )
}

const EditModalProposta = dynamic(() => import('@/components/propostas/EditModal'), { ssr: false }) as unknown as React.ComponentType<Record<string, unknown>>
function ListaPropostas({ titulo, l, onFechar }: { titulo: string; l: PropostaCm[]; onFechar: () => void }) {
  const [pdf, setPdf] = useState<{ row: Record<string, unknown> } | null>(null)
  const [pdfUrl, setPdfUrl] = useState<{ url: string; titulo: string } | null>(null) // PDF aberto na janela
  const [estado, setEstado] = useState<string | null>(null)
  const abrirPdf = async (p: PropostaCm) => {
    setEstado(`Gerando o PDF de ${p.cliente}…`)
    const { data, error } = await supabase.from('Formulario').select('*').eq('id', p.id).maybeSingle()
    if (error || !data) { setEstado('Não deu para abrir essa proposta.'); return }
    setPdf({ row: data })
  }
  const lista = [...l].sort((a, b) => b.valor - a.valor)
  return (
    <div className="cmw-fundo cml-janela-fundo cmp-fundo" onClick={onFechar}>
      <div className="cml-janela cmp-janela" onClick={(e) => e.stopPropagation()}>
        <div className="cml-janela-cab"><h3>{titulo}</h3><span>{plural(lista.length, 'proposta', 'propostas')} · {compacto(somar(lista))} · clique numa para abrir o PDF</span><button className="cma-x" onClick={onFechar} aria-label="Fechar"><i className="fas fa-xmark" /></button></div>
        <div className="cml-janela-corpo">
          {estado && <div className="cmf-estado" style={{ marginBottom: 8 }}>{estado}</div>}
          <div className="cmt-tab-wrap"><table className="cmt-tab cmfat-tab cmpl-tab">
            <thead><tr><th>Cliente</th><th>Máquina</th><th>Vendedor</th><th>{lista.some((p) => p.aberta) ? 'Fase' : 'Resultado'}</th><th>Valor</th></tr></thead>
            <tbody>{lista.map((p) => (
              <tr key={p.id} className="cmm-l" onClick={() => void abrirPdf(p)}>
                <td>{p.cliente}<small>{p.cidade}</small></td>
                <td>{p.equipamento || '—'}</td>
                <td>{p.vendedor || 'sem vendedor'}</td>
                <td><FaseTrilha p={p} /></td>
                <td className="val">{brl(p.valor)} <i className="fas fa-file-pdf cmpl-pdf" /></td>
              </tr>
            ))}</tbody>
          </table></div>
        </div>
      </div>
      {pdf && <EditModalProposta proposal={pdf.row} soPdf onPdf={(url: string) => setPdfUrl({ url, titulo: String(pdf.row.Cliente || 'Proposta') })} onClose={() => { setPdf(null); setEstado(null) }} />}
      {pdfUrl && (
        <div className="cmw-fundo cmpdf-fundo" onClick={(e) => { e.stopPropagation(); setPdfUrl(null) }}>
          <div className="cmpdf" onClick={(e) => e.stopPropagation()}>
            <div className="cml-janela-cab"><h3>Proposta · {pdfUrl.titulo}</h3><span /><a className="cm-bt" href={pdfUrl.url} download={`Proposta_${pdfUrl.titulo}.pdf`}><i className="fas fa-download" /> Baixar</a><button className="cma-x" onClick={() => setPdfUrl(null)} aria-label="Fechar"><i className="fas fa-xmark" /></button></div>
            <iframe className="cmpdf-frame" src={pdfUrl.url} title="PDF da proposta" />
          </div>
        </div>
      )}
    </div>
  )
}

export const CSS_CML = `
/* gráfico 12 meses */
.g12{display:flex;flex-direction:column;gap:6px;padding:6px 0 0 44px}
.g12-area{position:relative;height:260px}
.g12-linha{position:absolute;left:0;right:0;border-top:1px solid #eef2f7}
.g12-linha span{position:absolute;left:-44px;top:-8px;width:38px;text-align:right;font-size:11.5px;color:#94a3b8;font-variant-numeric:tabular-nums}
.g12-media{position:absolute;left:0;right:0;border-top:2px dashed #94a3b8;z-index:2;pointer-events:none}
.g12-media span{position:absolute;right:0;top:-20px;font-size:11.5px;color:#475569;background:#fefefe;padding:0 4px;border-radius:4px}
.g12-cols{position:absolute;inset:0;display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:10px;align-items:end;z-index:1}
.ce .g12-col{height:100%;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:4px;cursor:pointer;opacity:.55;transition:opacity .2s;font-family:inherit}
.ce .g12-col:hover,.ce .g12-col.on{opacity:1}
.ce .g12-col:disabled{cursor:default}
.ce .g12-col:focus,.ce .g12-col:focus-visible{outline:none}
.g12-dica em{padding-left:14px}
.g12-val{font-size:12px;color:#334155;font-variant-numeric:tabular-nums;white-space:nowrap}
.g12-col.on .g12-val{font-weight:600;color:#0f172a}
.g12-pilha{width:min(46px,72%);display:flex;flex-direction:column;border-radius:8px 8px 2px 2px;overflow:hidden;min-height:2px;animation:btCresce .8s cubic-bezier(.22,1,.36,1) both;transform-origin:bottom}
.g12-pilha span{display:block;width:100%}
.g12-col.on .g12-pilha{box-shadow:0 0 0 2px #1e3a8a}
.g12-dica{position:absolute;top:0;transform:translateX(-50%);z-index:5;pointer-events:auto!important;background:#0f172a;color:#fff;border-radius:10px;padding:10px 12px;display:flex;flex-direction:column;gap:4px;font-size:12.5px;min-width:230px;white-space:nowrap;pointer-events:none;box-shadow:0 12px 26px -12px rgba(15,23,42,.6)}
.g12-dica b{font-weight:500;font-size:13px}
.g12-dica span{display:flex;align-items:center;gap:6px}
.g12-dica i{width:9px;height:9px;border-radius:3px}
.g12-dica em{font-style:normal;margin-left:auto;font-variant-numeric:tabular-nums}
.g12-dica-tot{border-top:1px solid #334155;padding-top:4px;font-weight:500}
.g12-eixo{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:10px;text-align:center}
.ce .g12-eixo button{display:flex;flex-direction:column;align-items:center;gap:1px;padding:6px 2px;border:1px solid #e2e8f0;border-radius:99px;background:#fefefe;cursor:pointer;font-family:inherit;transition:background .15s,border-color .15s}
.ce .g12-eixo button:hover:not(:disabled){border-color:#94a3b8}
.ce .g12-eixo button:disabled{cursor:default;opacity:.45;border-style:dashed}
.ce .g12-eixo button.on{background:#0f172a;border-color:#0f172a}
.ce .g12-eixo button.on b,.ce .g12-eixo button.on small{color:#fff}
.g12-eixo b{display:block;font-size:12.5px;font-weight:500;color:#475569}
.g12-eixo small{font-size:11px;color:#94a3b8}
.g12-eixo .on b{color:#0f172a;font-weight:600}
@media (max-width:620px){.g12{padding-left:34px}.g12-area{height:200px}.g12-cols,.g12-eixo{gap:3px}.g12-val,.g12-eixo small{display:none}.g12-linha span{left:-36px;width:30px}}
.cml-grade{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));grid-auto-rows:minmax(170px,auto);gap:14px}
.ce .cml-card{display:flex;flex-direction:column;gap:8px;background:#fefefe;border:1px solid #e2e8f0;border-radius:20px;padding:20px 22px;cursor:pointer;text-align:left;transition:box-shadow .25s,transform .25s,border-color .25s;animation:ceFade .3s both}
.ce .cml-card:hover{transform:translateY(-2px);border-color:color-mix(in srgb,var(--c) 35%,#e2e8f0);box-shadow:0 16px 32px -24px rgba(15,23,42,.6)}
.cml-g{grid-row:span 2;background:linear-gradient(165deg,color-mix(in srgb,var(--c) 7%,#fefefe),#fefefe 55%)!important}
.cml-cab{display:flex;align-items:center;gap:10px}
.cml-nome{font-size:16px;font-weight:500;color:#0f172a}
.cml-seta{margin-left:auto;color:#94a3b8;font-size:13px}
.cml-num{font-size:36px;font-weight:500;color:var(--c);letter-spacing:-.02em;font-variant-numeric:tabular-nums;line-height:1.15;margin-top:6px}
.cml-g .cml-num{font-size:48px}
.cml-linha{font-size:14px;color:#475569;line-height:1.4}
.cml-extras{display:flex;flex-direction:column;gap:8px;margin-top:auto;padding-top:12px;border-top:1px solid #f1f5f9}
.cml-extras > span{display:grid;grid-template-columns:20px auto 1fr;align-items:baseline;gap:0 8px;font-size:14.5px;color:#334155}
.cml-extras i{color:var(--c);font-size:13px}
.cml-extras b{font-size:18px;font-weight:500;color:#0f172a;font-variant-numeric:tabular-nums}
.cml-extras small{grid-column:2 / -1;font-size:12.5px;color:#64748b}
.cml-linha b{font-weight:500}
.cml-mini{flex:1;min-height:120px;display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px;align-items:end;margin-top:14px}
.cml-mini > span{display:flex;flex-direction:column;align-items:center;gap:6px;height:100%;justify-content:flex-end}
.cml-mini > span > span{width:70%;max-width:44px;border-radius:8px 8px 3px 3px;background:color-mix(in srgb,var(--c) 35%,#fefefe);animation:btCresce .8s cubic-bezier(.22,1,.36,1) both;transform-origin:bottom}
.cml-mini > span.on > span{background:var(--c)}
.cml-mini small{font-size:12px;color:#64748b}
/* telas cheias */
.cmt-tit{flex:1;display:flex;align-items:baseline;gap:12px;font-size:20px;font-weight:500;color:#0f172a}
.cmt-tit small{font-size:14px;font-weight:400;color:#64748b}
.cmt-corpo{flex:1;min-height:0;overflow-y:auto;padding:22px 32px 40px;display:flex;flex-direction:column;gap:18px;width:100%;box-sizing:border-box}
.cmt-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px}
.cmt-kpi{background:#fefefe;border:1px solid #e2e8f0;border-radius:16px;padding:16px 18px;display:flex;flex-direction:column;gap:3px}
.cmt-kpi small{font-size:13px;color:#64748b}
.cmt-kpi b{font-size:28px;font-weight:500;color:#0f172a;font-variant-numeric:tabular-nums;letter-spacing:-.02em}
.cmt-kpi em{font-style:normal;font-size:12.5px;color:#64748b}
.cmt-kpis-2{grid-template-columns:repeat(2,minmax(0,1fr))}
.cmt-sec{background:#fefefe;border:1px solid #e2e8f0;border-radius:18px;padding:18px 22px}
.cmt-sec-cab{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:14px}
.cmt-sec-cab h3{margin:0;font-size:17px;font-weight:500;color:#0f172a}
.cmt-sec-cab > span{display:flex;gap:12px;align-items:center;font-size:13px;color:#64748b;flex-wrap:wrap}
.cmt-sec .cm-abas{margin:0}
.cmt-leg i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px}
.cmt-g12{height:260px}
.cmt-dois{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}
.cmt-dois .cmt-sec{min-width:0}
.cmt-barra-l{display:grid;grid-template-columns:minmax(140px,240px) 1fr 100px;align-items:center;gap:14px;padding:7px 0;font-size:14.5px;color:#0f172a;border-bottom:1px solid #f1f5f9}
.cmt-barra-l .cma-v-bar{height:12px}
.cmt-barra-l b{font-weight:500;text-align:right;font-variant-numeric:tabular-nums}
.cmt-cols{height:260px;grid-template-columns:repeat(6,minmax(0,1fr))}
.ce .cmt-cols .cma-col{cursor:pointer;border-radius:12px;padding:6px 0}
.ce .cmt-cols .cma-col:hover{background:#f8fafc}
.cmt-tab-wrap{overflow-x:auto}
.cmt-tab{width:100%;border-collapse:collapse;font-size:14px}
.cmt-tab th{font-weight:400;font-size:12.5px;color:#64748b;text-align:center;padding:8px 10px;border-bottom:1px solid #e2e8f0}
.cmt-tab th:first-child{text-align:left}
.cmt-tab td{padding:9px 10px;border-bottom:1px solid #f1f5f9;text-align:center;color:#cbd5e1;font-variant-numeric:tabular-nums}
.cmt-tab td:first-child{text-align:left;color:#0f172a;display:flex;flex-direction:column}
.cmt-tab td small{font-size:12px;color:#64748b}
.cmt-tab td.tem{color:#0f172a;font-weight:500}
.cmfat-tab th,.cmfat-tab td{text-align:left!important}
.cmfat-tab tr.mg-ruim td{background:#fee2e2}
.cmfat-tab tr.mg-boa td{background:#dcfce7}
.cmfat-tab td.mg{font-weight:600}
.mg-leg{display:flex;gap:16px;flex-wrap:wrap;font-size:12.5px;color:#475569;margin-bottom:8px}
.mg-leg span{display:flex;align-items:center;gap:6px}
.mg-leg i{width:12px;height:12px;border-radius:4px}
.mg-leg i.r{background:#fecaca}
.mg-leg i.g{background:#bbf7d0}
.cmpz-l{display:grid;grid-template-columns:minmax(380px,1.1fr) 1fr;gap:14px;align-items:stretch}
.cmpz-cards{grid-template-columns:repeat(2,minmax(0,1fr))!important}
.cmpz{border:1px solid #e2e8f0;border-radius:16px;padding:14px 16px;display:flex;flex-direction:column;gap:12px;background:#fefefe}
.cmpz-graf{display:flex;align-items:center;gap:16px}
.cmpz-svg{width:150px;height:150px;flex:none}
.cmpz-n{font-size:26px;font-weight:600;fill:#0f172a}
.cmpz-t{font-size:10px;fill:#64748b}
.cmpz-leg{flex:1;display:flex;flex-direction:column;gap:2px;min-width:0}
.ce .cmpz-leg button{display:grid;grid-template-columns:12px 1fr auto 64px;align-items:center;gap:8px;padding:5px 6px;border-radius:8px;cursor:pointer;font-family:inherit;text-align:left;font-size:13.5px;color:#334155}
.ce .cmpz-leg button:hover,.ce .cmpz-leg button.on{background:#f1f5f9}
.cmpz-leg i{width:12px;height:12px;border-radius:4px}
.cmpz-leg span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cmpz-leg b{font-weight:600;color:#0f172a;font-variant-numeric:tabular-nums}
.cmpz-leg small{font-size:12px;color:#64748b;text-align:right;font-variant-numeric:tabular-nums}
.cmpz-ticket{display:grid;grid-template-columns:1fr 1fr;gap:10px;border-top:1px solid #f1f5f9;padding-top:10px}
.cmpz-ticket div{display:flex;flex-direction:column;gap:1px}
.cmpz-ticket small{font-size:12.5px;color:#64748b}
.cmpz-ticket b{font-size:24px;font-weight:500;color:#1d4ed8;font-variant-numeric:tabular-nums}
.cmpz-ticket em{font-style:normal;font-size:12px;color:#64748b}
@media (max-width:1000px){.cmpz-l{grid-template-columns:1fr}}
@media (max-width:620px){.cmpz-graf{flex-direction:column;align-items:stretch}.cmpz-svg{align-self:center}}
.cmpl-tab td small.velha{color:#b45309}
.ce .cmnf-bt{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border:1px solid #e2e8f0;border-radius:99px;font-size:12.5px;color:#0369a1;cursor:pointer;background:#fefefe;white-space:nowrap}
.ce .cmnf-bt:hover{border-color:#0369a1}
.cmnf-msg{flex:1;display:grid;place-items:center;font-size:15px;color:#475569;padding:24px;text-align:center}
.cmpdf-fundo{z-index:100085!important}
.cmpdf{background:#fefefe;border-radius:18px;width:min(1000px,96vw);height:92vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,.4)}
.cmpdf .cm-bt{display:inline-flex;align-items:center;gap:6px;text-decoration:none}
.cmpdf-frame{flex:1;border:0;width:100%;background:#525659}
.cmpl-pdf{color:#be123c;margin-left:6px;font-size:13px}
.cmfat-tab td{color:#0f172a!important;font-size:14.5px;vertical-align:top}
.cmfat-tab td small{display:block;font-size:12px;color:#64748b}
.cmfat-tab th:last-child,.cmfat-tab td:last-child{text-align:right!important;white-space:nowrap}
.cmfat-tab tfoot td{font-weight:600;border-top:2px solid #e2e8f0;background:#f8fafc}
@media (max-width:620px){.cmfat-tab th:nth-child(3),.cmfat-tab td:nth-child(3),.cmfat-tab th:nth-child(4),.cmfat-tab td:nth-child(4){display:none}}
.cmt-tab td.val{color:#0f172a;text-align:right;white-space:nowrap}
/* calendário do ano: cor do ano atual (azul) e do ano passado (âmbar), bem clarinha */
.cmc-atual{--ano:#2563eb;--ano-claro:#f4f8ff;--ano-borda:#d6e4fd}
.cmc-passado{--ano:#b45309;--ano-claro:#fffaf2;--ano-borda:#f3dfc0}
.cmc-antigo{--ano:#475569;--ano-claro:#f8fafc;--ano-borda:#e2e8f0}
.cmc-tit-antigo{display:flex;align-items:baseline;gap:10px}
.cmc-tit-antigo span{color:#475569}
.ce .cmc-mais-anos{display:inline-flex;align-items:center;gap:8px;margin:12px 0 4px;padding:9px 16px;border:1px solid #e2e8f0;border-radius:99px;background:#fefefe;font-size:14px;color:#334155;cursor:pointer;font-family:inherit}
.ce .cmc-mais-anos:hover{border-color:#94a3b8;color:#0f172a}
.cmc-mais-anos i{font-size:11px;color:#64748b}
.cmq-ano.cmc-tit-atual,.cmq-ano.cmc-tit-passado{display:flex;align-items:center;gap:10px}
.cmq-ano{margin:14px 0 8px!important;align-items:baseline!important}
.cmq-ano span{font-size:22px;font-weight:600;letter-spacing:-.01em}
.cmc-tit-atual span{color:#2563eb}
.cmc-tit-passado span{color:#b45309}
.cmq-ano small{font-size:13px;font-weight:400;color:#64748b}
.ce .cmc .cmc-mes:not(.futuro),.ce .cmc .cmc-ano{background:var(--ano-claro);border-color:var(--ano-borda)}
.cmc .cmc-mes small,.cmc .cmc-ano small{color:var(--ano)}
.ce .cmc .cmc-ano{background:var(--ano-claro);border:1px solid var(--ano-borda);padding:12px 14px 10px;gap:4px}
.cmc-ano strong{display:flex;align-items:baseline;gap:6px;font-size:34px;font-weight:600;color:var(--ano);line-height:1.1;font-variant-numeric:tabular-nums;margin-bottom:4px}
.cmc-ano strong em{font-style:normal;font-size:13px;font-weight:400;color:#64748b}
.cmc-ano .cmc-ano-l{display:flex!important;justify-content:space-between;width:100%;font-size:13.5px!important;color:#334155!important;padding:3px 0;border-top:1px solid #f1f5f9}
.cmc-ano .cmc-ano-l b{display:inline!important;font-size:16px!important;font-weight:600!important;color:#0f172a!important}
.cmc-ano-ver{margin-top:auto;padding-top:6px;font-size:12.5px!important;color:var(--ano)!important;display:flex!important;gap:6px;align-items:center}
/* calendário do ano: só o número do mês */
.cmc{margin-bottom:6px}
.cmc-caixa{display:grid;grid-template-columns:minmax(0,1fr) 180px;gap:8px}
.cmc-caixa.com-extra{grid-template-columns:minmax(0,1fr) 180px 190px}
.cmc-caixa{grid-template-columns:minmax(0,1fr) 200px!important}
.cmc-meses{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:6px}
.ce .cmc-mes,.ce .cmc-ano{background:#fefefe;border:1px solid #e2e8f0;border-radius:14px;padding:10px 7px;display:flex;flex-direction:column;align-items:flex-start;gap:3px;cursor:pointer;font-family:inherit;text-align:left;min-width:0;transition:border-color .2s,box-shadow .2s}
.ce .cmc-mes:hover:not(:disabled),.ce .cmc-ano:hover:not(:disabled){border-color:#94a3b8;box-shadow:0 10px 22px -18px rgba(15,23,42,.6)}
.ce .cmc-mes:disabled,.ce .cmc-ano:disabled{cursor:default}
.cmc-mes small,.cmc-ano small{font-size:13px;font-weight:500;color:#334155;margin-bottom:2px}
.cmc-mes > span,.cmc-ano > span{font-size:12px;color:#475569;line-height:1.25}
.cmc-mes > span b,.cmc-ano > span b{display:block;font-size:20px;font-weight:500;color:#0f172a;font-variant-numeric:tabular-nums;margin-right:2px}
.cmc-mes > span.zero,.cmc-ano > span.zero{color:#cbd5e1}
.cmc-mes > span.zero b,.cmc-ano > span.zero b{color:#cbd5e1}
.ce .cmc-mes.agora{border-color:#15803d;box-shadow:inset 0 0 0 1px #15803d}
.ce .cmc-mes.futuro{border-style:dashed;background:transparent}
.ce .cmc-ano{border-color:#cbd5e1}
.cmc-ano > span b{font-size:24px}
.cmc-ano-tot{margin-top:auto;padding-top:4px;border-top:1px solid #e2e8f0;width:100%;font-weight:500;color:#0f172a!important}
.cmc-extra{justify-content:center}
.cmv-jan{width:min(720px,100%);max-height:86vh;padding:0;overflow:hidden;gap:0}
.cmv-jan-cab{display:flex;align-items:center;gap:12px;padding:16px 20px;border-bottom:1px solid #e2e8f0}
.cmv-jan-cab h3{margin:0;font-size:19px;font-weight:500;color:#0f172a}
.cmv-jan-cab span{flex:1;font-size:14px;color:#64748b}
.cmv-jan-corpo{overflow-y:auto;padding:8px 20px 18px}
.cmv-jan-mod{border-bottom:1px solid #f1f5f9}
.ce .cmv-jan-l{width:100%;display:grid;grid-template-columns:44px 1fr auto 16px;align-items:center;gap:12px;padding:12px 0;cursor:pointer;text-align:left;font-family:inherit}
.cmv-jan-q{font-size:24px;font-weight:500;color:#0f172a;text-align:center;font-variant-numeric:tabular-nums}
.cmv-jan-n{display:flex;flex-direction:column;font-size:15.5px;color:#0f172a}
.cmv-jan-n small{font-size:12.5px;color:#64748b}
.cmv-jan-l b{font-size:15px;font-weight:500;color:#0f172a;font-variant-numeric:tabular-nums}
.cmv-jan-l i{font-size:11px;color:#94a3b8}
.cmv-jan-v{padding-left:56px!important}
@media (max-width:1400px){.cmc-meses{grid-template-columns:repeat(6,minmax(0,1fr))}}
@media (max-width:1100px){.cmc-caixa,.cmc-caixa.com-extra{grid-template-columns:1fr 1fr}.cmc-meses{grid-column:1/-1;grid-template-columns:repeat(4,minmax(0,1fr))}}
@media (max-width:620px){.cmc-meses{grid-template-columns:repeat(2,minmax(0,1fr))}}
/* quadro do ano: tabela modelo × mês */
.cmq-vista button.on{background:#0f172a!important;color:#fff!important}
.cmq{margin-top:8px}
.cmq-caixa{display:grid;grid-template-columns:minmax(0,1fr);gap:12px;align-items:start}
.cmq-caixa.cmq-com-extra{grid-template-columns:minmax(0,1fr) 200px}
.cmq-tab{width:100%;border-collapse:collapse;font-size:15px;font-variant-numeric:tabular-nums}
.cmq-tab th{font-weight:500;font-size:12.5px;color:#64748b;padding:8px 6px;border-bottom:1px solid #e2e8f0;text-align:center;letter-spacing:.04em}
.cmq-tab th:first-child{text-align:left;font-size:18px;color:#0f172a;letter-spacing:0}
.cmq-tab th.futuro{color:#cbd5e1}
.cmq-tab td{padding:9px 6px;border-bottom:1px solid #f1f5f9;text-align:center;color:#0f172a}
.cmq-tab td:first-child{text-align:left;font-weight:500;white-space:nowrap}
.cmq-tab .agora{background:#f0fdf4}
.cmq-tab th.agora{color:#15803d}
.cmq-tab .tot{font-weight:600;border-left:1px solid #e2e8f0}
.cmq-tab tfoot td{font-weight:600;border-top:2px solid #e2e8f0;border-bottom:0;background:#f8fafc}
.cmq-tab tfoot td.agora{background:#dcfce7}
.cmq-tab td.vazio{color:#94a3b8;text-align:center;font-weight:400}
.cmq-extra{border:1px solid #e2e8f0;border-radius:14px;padding:16px 12px;display:flex;flex-direction:column;align-items:center;gap:2px;text-align:center;background:#fefefe}
.cmq-extra small{font-size:12px;letter-spacing:.05em;color:#334155}
.cmq-extra b{font-size:40px;font-weight:500;color:#1d4ed8;line-height:1.1;font-variant-numeric:tabular-nums}
.cmq-extra span{font-size:13.5px;color:#475569}
@media (max-width:1100px){.cmq-caixa.cmq-com-extra{grid-template-columns:1fr}}
.cmm-busca{padding:8px 14px;border:1px solid #e2e8f0;border-radius:99px;font:inherit;font-size:14px;min-width:220px;background:#fefefe;color:#0f172a}
.cmm-tab td:first-child span{display:flex;align-items:center;gap:8px}
.cmm-tab td:first-child i{font-size:10px;color:#94a3b8;width:10px}
.cmm-l{cursor:pointer}
.cmm-l:hover td{background:#f8fafc}
.cmm-det td{background:#f8fafc;text-align:left!important;color:#0f172a!important;padding:6px 18px 10px!important;display:table-cell!important}
.cmm-tot td{font-weight:500;color:#0f172a!important;border-top:2px solid #e2e8f0;background:#f8fafc}
@media (max-width:1100px){.cml-grade{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:900px){.cmt-dois{grid-template-columns:1fr}}
@media (max-width:620px){
  .cml-grade{grid-template-columns:1fr}.cml-g{grid-row:auto}.cml-g .cml-num{font-size:38px}.cml-num{font-size:30px}
  .cmt-corpo{padding:14px 12px 30px}.cmt-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.cmt-kpi b{font-size:22px}
  .cmt-sec{padding:14px}.cmt-barra-l{grid-template-columns:1fr auto;gap:4px 10px}.cmt-barra-l .cma-v-bar{grid-column:1/-1;grid-row:2}
  .cmt-g12,.cmt-cols{height:200px}
}
`
