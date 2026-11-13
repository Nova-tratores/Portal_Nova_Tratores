'use client'
// Pós-Vendas na tela do diretor (/empresa). José, 12/11/2026: "mostrar o faturamento do pós-vendas, separando por
// garantia, internas, como é feito lá na Gestão do Pós-Vendas; e uma aba de técnicos, onde mostra quantas horas eles
// fizeram no total por semana e mês, e quando clicar, mostra os cards de cada técnico, como os dos vendedores".
// Dados: /api/empresa/posvendas (gravado em empresa_painel; conta em src/lib/empresa/posvendas.ts = conta da Gestão).
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { authHeaders } from '@/lib/auth/client'
import type { DadosPosVendas, HorasPv, MesPv, OsPv, TecnicoPv } from '@/lib/empresa/posvendas'
import type { Grupo } from '@/lib/mecanicos/itens-periodo'
import type { LinhasDre } from '@/lib/empresa/dre-gerencial'
import { compacto, brl, cap, nomeMes, mesCurto, plural, contaMes } from './comercial'
import { TelaCheia, Secao } from './comercial-assuntos'
import { useJson, JanelaFrame } from './comercial-telas'
import { TelaDespesasNova, NavAno } from './comercial-despesas'

// os mesmos tipos e cores da Gestão do Pós-Vendas (FaturamentoPeriodo)
const TIPOS: Array<{ g: Grupo; nome: string; cor: string; explica: string }> = [
  { g: 'faturada', nome: 'OS faturadas', cor: '#2563eb', explica: 'OS faturadas para o cliente (com nota ou recibo). É o dinheiro que entra do cliente.' },
  { g: 'garantia', nome: 'Garantia', cor: '#8b5cf6', explica: 'Garantias aprovadas pela fábrica no mês, pelo valor que ela pagou (módulo Garantias).' },
  { g: 'interna', nome: 'Internas', cor: '#cbd5e1', explica: 'OS internas fechadas (serviço da loja, cortesia, entrega técnica, montagem). Valor de referência: não entra dinheiro de cliente.' },
  { g: 'aguardando', nome: 'Ainda não faturadas', cor: '#f59e0b', explica: 'OS com o relatório preenchido que ainda esperam faturar.' },
]
const TIPO = Object.fromEntries(TIPOS.map((t) => [t.g, t])) as Record<Grupo, (typeof TIPOS)[number]>
const COR_H = { trab: '#2563eb', fat: '#16a34a', int: '#64748b', ocio: '#f59e0b' }
export const hrs = (n: number) => `${(Math.round(n * 10) / 10).toLocaleString('pt-BR')} h`
export const dataBR = (d: string) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString('pt-BR') : '')

type TelaPv = 'fat' | 'tec' | 'desp' | 'ofi'
export type ItemOficina = { id: string; nome: string; n: number; valor?: number | null; onClick: () => void }

/** a área Pós-Vendas: cartões por assunto, cada um abre em tela cheia — igual ao Comercial (José, 12/11: "pega de
 *  referência o estilo e a forma que foi distribuído no Comercial") */
export function PainelPosVendas({ dreG, oficina }: { dreG: Array<{ mes: string; parcial?: boolean; setores: object }> | null; oficina: ItemOficina[] }) {
  const { d, erro } = useJson<DadosPosVendas>('/api/empresa/posvendas')
  const [tela, setTela] = useState<TelaPv | null>(() => {
    if (typeof window === 'undefined') return null
    const t = new URLSearchParams(window.location.search).get('tela')
    return t === 'fat' || t === 'tec' || t === 'desp' || t === 'ofi' ? t : null
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
  const max6 = Math.max(1, ...ult6.map((x) => x.porGrupo.faturada.valor + x.porGrupo.garantia.valor))
  const mesH = d?.equipeMeses[d.equipeMeses.length - 1]
  const g = dreG?.[dreG.length - 1], lp = (g?.setores as Record<string, LinhasDre> | undefined)?.posvendas, x = lp ? contaMes(lp) : null
  const cartao = (t: TelaPv, cor: string, ic: string, nome: string, num: string, linha: ReactNode, extraEl?: ReactNode, cls = '') => (
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
        {cartao('fat', '#2563eb', 'fa-sack-dollar', 'Faturamento', m ? compacto(m.porGrupo.faturada.valor + m.porGrupo.garantia.valor) : '—',
          m ? <>entrou em {nomeMes(m.mes)} até hoje (cliente + garantia)</> : erro ? '' : 'carregando…',
          ult6.length ? (
            <span className="cml-mini">{ult6.map((q) => (
              <span key={q.mes} className={q.mes === m?.mes ? 'on' : ''}><span style={{ height: `${((q.porGrupo.faturada.valor + q.porGrupo.garantia.valor) / max6) * 100}%` }} /><small>{mesCurto(q.mes)}</small></span>
            ))}</span>
          ) : null, 'cml-g')}
        {cartao('tec', '#0f766e', 'fa-user-gear', 'Técnicos', mesH ? hrs(mesH.trabalhadas) : '—',
          mesH ? <>trabalhadas em {nomeMes(mesH.de.slice(0, 7))}{mesH.meta ? <> · <b>{Math.round((mesH.trabalhadas / mesH.meta) * 100)}%</b> da meta</> : null}</> : erro ? '' : 'carregando…',
          mesH?.meta ? <span className="cpv-meta-capa"><span style={{ width: `${Math.min(100, (mesH.trabalhadas / mesH.meta) * 100)}%` }} /></span> : null)}
        {cartao('desp', '#be123c', 'fa-receipt', 'Custos e despesas', x ? compacto(x.gastou) : '—',
          x ? <>{x.resultado >= 0 ? <>sobrou <b style={{ color: '#15803d' }}>{compacto(x.resultado)}</b></> : <>faltou <b style={{ color: '#be123c' }}>{compacto(-x.resultado)}</b></>} no mês</> : 'carregando o DRE…')}
        {cartao('ofi', '#d97706', 'fa-screwdriver-wrench', 'Oficina agora', oficina[0] ? String(oficina[0].n) : '—',
          oficina[0] ? <>{oficina[0].nome.toLowerCase()}{oficina.length > 1 ? ` · e mais ${oficina.length - 1} pontos de atenção` : ''}</> : 'carregando…', null, 'cpv-oficina')}
      </div>
      {tela === 'fat' && d && <TelaCheia titulo="Faturamento do Pós-Vendas" sub="OS faturadas, garantia, internas e as que esperam faturar" onFechar={fechar}><AbaFaturamento d={d} /></TelaCheia>}
      {tela === 'tec' && d && <TelaTecnicos d={d} onFechar={fechar} />}
      {tela === 'desp' && <TelaDespesasNova mesesBase={dreG || []} setor="posvendas" onFechar={fechar} />}
      {tela === 'ofi' && (
        <TelaCheia titulo="Oficina agora" sub="clique para ver a lista" onFechar={fechar}>
          <div className="cpv-kpis">
            {oficina.map((o) => (
              <button key={o.id} className="cmt-kpi cmt-kpi-bt" onClick={() => { fechar(); o.onClick() }}>
                <small>{o.nome}</small><b style={{ color: o.n ? '#d97706' : '#16a34a' }}>{o.n}</b><em>ver a lista <i className="fas fa-arrow-right" /></em>
              </button>
            ))}
          </div>
        </TelaCheia>
      )}
      {tela && tela !== 'desp' && tela !== 'ofi' && !d &&<TelaCheia titulo="Pós-Vendas" onFechar={fechar}><div className="cma-vazio">{erro || 'Carregando…'}</div></TelaCheia>}
    </div>
  )
}

// ── FATURAMENTO ──────────────────────────────────────────────────────────────
export function NavMes({ meses, mes, setMes }: { meses: string[]; mes: string; setMes: (m: string) => void }) {
  const i = meses.indexOf(mes)
  return (
    <div className="cdp-mes">
      <button className="cma-x" disabled={i <= 0} onClick={() => setMes(meses[i - 1])} title="Mês anterior"><i className="fas fa-chevron-left" /></button>
      <select value={mes} onChange={(e) => setMes(e.target.value)}>{[...meses].reverse().map((m) => <option key={m} value={m}>{cap(nomeMes(m, true))}</option>)}</select>
      <button className="cma-x" disabled={i >= meses.length - 1} onClick={() => setMes(meses[i + 1])} title="Próximo mês"><i className="fas fa-chevron-right" /></button>
    </div>
  )
}

function AbaFaturamento({ d }: { d: DadosPosVendas }) {
  const meses = d.meses.map((m) => m.mes)
  const [mesEsc, setMes] = useState('')
  const mes = mesEsc && meses.includes(mesEsc) ? mesEsc : meses[meses.length - 1]
  const [lista, setLista] = useState<{ titulo: string; grupo?: Grupo; sub?: string; tecnico?: string; campo?: 'servico' | 'kmValor' | 'pecas' | 'outros' } | null>(null)
  const m = d.meses.find((x) => x.mes === mes)!
  const ant = d.meses[meses.indexOf(mes) - 1]
  const internas = Object.entries(m.internas).sort((a, b) => b[1].valor - a[1].valor)
  const doCliente = m.porGrupo.faturada.valor + m.porGrupo.garantia.valor
  const osMes = d.os.filter((o) => o.data.startsWith(mes))
  return (
    <div className="cpv-corpo">
      <div className="cpv-topo">
        <NavMes meses={meses} mes={mes} setMes={setMes} />
        <span className="cpv-frase">{cap(nomeMes(mes))}{m.parcial ? ' até hoje' : ''}: <b>{compacto(doCliente)}</b> entraram (cliente + garantia){m.porGrupo.interna.valor ? <>, mais <b>{compacto(m.porGrupo.interna.valor)}</b> em internas</> : null}{m.porGrupo.aguardando.valor ? <> e <b>{compacto(m.porGrupo.aguardando.valor)}</b> esperando faturar</> : null}.</span>
      </div>
      <div className="cpv-kpis">
        {TIPOS.map((t) => {
          const v = m.porGrupo[t.g], a = ant?.porGrupo[t.g]
          const dif = a && a.valor ? Math.round(((v.valor - a.valor) / a.valor) * 100) : null
          return (
            <button key={t.g} className="cmt-kpi cmt-kpi-bt" onClick={() => setLista({ titulo: t.nome, grupo: t.g })}>
              <small><i className="cdp-dot" style={{ background: t.cor }} />{t.nome}</small>
              <b>{compacto(v.valor)}</b>
              <em>{plural(v.n, 'OS', 'OS')}{dif != null && t.g !== 'aguardando' ? <> · <span style={{ color: dif >= 0 ? '#15803d' : '#dc2626' }}>{dif >= 0 ? '+' : ''}{dif}%</span> que {mesCurto(ant.mes)}</> : null}</em>
            </button>
          )
        })}
      </div>

      {/* do que é feito o faturamento do mês: horas, km e peças */}
      <div className="cpv-partes">
        {([
          ['servico', 'Mão de obra', 'fa-user-gear', '#7c3aed', `${hrs(osMes.reduce((a, o) => a + o.horas, 0))} cobradas`],
          ['kmValor', 'Deslocamento (km)', 'fa-route', '#0891b2', `${osMes.filter((o) => o.kmValor > 0).length} OS com km`],
          ['pecas', 'Peças', 'fa-gears', '#ea580c', `${osMes.filter((o) => o.pecas > 0).length} OS com peças`],
          ['outros', 'Outros', 'fa-ellipsis', '#94a3b8', 'requisições repassadas, extras'],
        ] as const).filter(([k]) => k !== 'outros' || Math.abs(m.outros) > 0.5).map(([k, n, ic, cor, sub]) => (
          <button key={k} className="cmt-kpi cmt-kpi-bt cpv-parte" onClick={() => setLista({ titulo: n, campo: k })}>
            <small><i className={`fas ${ic}`} style={{ color: cor }} /> {n}</small>
            <b>{compacto(m[k])}</b>
            <span className="cpv-parte-bar"><span style={{ width: `${m.total ? Math.max(2, (m[k] / m.total) * 100) : 0}%`, background: cor }} /></span>
            <em>{m.total ? Math.round((m[k] / m.total) * 100) : 0}% do faturado · {sub}</em>
          </button>
        ))}
      </div>
      <div className="cmt-dois">
        <Secao titulo="Mês a mês" sub="clique num mês para ver ele">
          <GraficoTipos meses={d.meses} mes={mes} setMes={setMes} />
        </Secao>
        <div className="cpv-col">
          <Secao titulo="Internas por tipo" sub="clique para ver as OS">
            {internas.length ? internas.map(([k, v]) => (
              <button key={k} className="cdp-conta cpv-linha" onClick={() => setLista({ titulo: `Internas · ${k}`, grupo: 'interna', sub: k })}>
                <span>{k}</span>
                <span className="cdp-conta-bar"><span style={{ width: `${Math.max(3, (v.valor / Math.max(1, internas[0][1].valor)) * 100)}%`, background: TIPO.interna.cor }} /></span>
                <small>{v.n} OS</small><b>{compacto(v.valor)}</b><i className="fas fa-chevron-right" />
              </button>
            )) : <div className="ce-mudo">Nenhuma OS interna fechada no mês.</div>}
          </Secao>
        </div>
      </div>
      <QuemFezServico os={d.os.filter((o) => o.data.startsWith(mes))} mes={mes} onTecnico={(t) => setLista({ titulo: `OS de ${t}`, tecnico: t })} />
      <OrdensDoMes os={d.os.filter((o) => o.data.startsWith(mes))} mes={mes} />
      <p className="cma-nota">Mesma conta da Gestão do Pós-Vendas → Faturamento por período. O faturado soma as peças vendidas nas OS (elas também contam em Peças).</p>
      {lista && <JanelaOs titulo={lista.titulo} os={d.os.filter((o) => o.data.startsWith(mes) && (!lista.grupo || o.grupo === lista.grupo) && (!lista.sub || o.subtipo === lista.sub) && (!lista.tecnico || o.tecnicos.includes(lista.tecnico)) && (!lista.campo || Math.abs(o[lista.campo]) > 0.5))} mes={mes} explica={lista.grupo ? TIPO[lista.grupo].explica : undefined} onFechar={() => setLista(null)} />}
    </div>
  )
}

/** 12 meses, cada um com as 4 partes empilhadas (faturadas embaixo) */
/** janeiro a dezembro do ano escolhido, com faturadas + garantia + internas empilhadas (as que ainda esperam faturar
 *  não entram: ainda não é faturamento — José, 12/11) */
const NO_GRAF = TIPOS.filter((t) => t.g !== 'aguardando')
function GraficoTipos({ meses, mes, setMes }: { meses: MesPv[]; mes: string; setMes: (m: string) => void }) {
  const anos = [...new Set(meses.map((m) => m.mes.slice(0, 4)))].sort().reverse()
  const [anoEsc, setAno] = useState('')
  const ano = anoEsc && anos.includes(anoEsc) ? anoEsc : mes.slice(0, 4) || anos[0]
  const porMes = new Map(meses.map((m) => [m.mes, m]))
  const cols = Array.from({ length: 12 }, (_, i) => `${ano}-${String(i + 1).padStart(2, '0')}`)
  const tot = (m: MesPv) => NO_GRAF.reduce((a, t) => a + m.porGrupo[t.g].valor, 0)
  const max = Math.max(1, ...meses.map(tot))
  const soma = cols.reduce((a, k) => a + (porMes.get(k) ? tot(porMes.get(k)!) : 0), 0)
  // média por mês do ano anterior (José, 12/11: "faz uma média de quantos fatura por mês em 2025 e vê se em 2026 os
  // meses estão acima ou abaixo, pinta de verde e vermelho"). Só meses fechados do ano anterior entram na média.
  const anoAnt = String(Number(ano) - 1)
  const antes = meses.filter((m) => m.mes.startsWith(anoAnt) && !m.parcial)
  const media = antes.length ? antes.reduce((a, m) => a + tot(m), 0) / antes.length : null
  return (
    <div className="cpv-g">
      <div className="cdp-g-ctrl">
        <NavAno anos={anos} ano={ano} setAno={setAno} />
        <span className="cpv-g-soma">{ano}: <b>{compacto(soma)}</b>{media != null ? <> · média de {anoAnt}: <b>{compacto(media)}</b> por mês</> : null}</span>
        <span className="cpv-g-leg">{NO_GRAF.map((t) => <span key={t.g}><i style={{ background: t.cor }} />{t.nome}</span>)}</span>
      </div>
      <div className="cpv-g-cols">
        {cols.map((k) => {
          const m = porMes.get(k), v = m ? tot(m) : 0
          return (
            <button key={k} className={`cpv-g-col${k === mes ? ' on' : ''}`} disabled={!m} onClick={() => m && setMes(k)} title={m ? NO_GRAF.map((t) => `${t.nome}: ${brl(m.porGrupo[t.g].valor)}`).join('\n') : ''}>
              <b className={!v || media == null || m?.parcial ? '' : v >= media ? 'acima' : 'abaixo'}>{v ? compacto(v).replace('R$ ', '') : ''}</b>
              <span className="cpv-g-area">
                {media != null && <span className="cpv-g-media" style={{ bottom: `${(media / max) * 100}%` }} />}
                <span className="cpv-g-pilha" style={{ height: `${(v / max) * 100}%` }}>
                  {m && [...NO_GRAF].reverse().map((t) => m.porGrupo[t.g].valor > 0 && <span key={t.g} style={{ flex: m.porGrupo[t.g].valor, background: t.cor }} />)}
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

/** quem mais fez serviço no mês (José, 12/11: "algo parecido com o bloco de clientes, para ver quem mais fez serviço em
 *  cada mês"). OS com 2 técnicos: o valor é dividido entre eles; internas e ainda não faturadas entram (é serviço feito). */
function QuemFezServico({ os, mes, onTecnico }: { os: OsPv[]; mes: string; onTecnico: (t: string) => void }) {
  const [todos, setTodos] = useState(false)
  const m = new Map<string, { os: number; horas: number; valor: number }>()
  for (const o of os) {
    const ts = o.tecnicos.length ? o.tecnicos : ['Sem técnico']
    for (const t of ts) { const x = m.get(t) || { os: 0, horas: 0, valor: 0 }; x.os++; x.horas += o.horas / ts.length; x.valor += o.bruto / ts.length; m.set(t, x) }
  }
  const l = [...m.entries()].sort((a, b) => b[1].valor - a[1].valor)
  if (!l.length) return null
  return (
    <Secao titulo={`Quem mais fez serviço em ${nomeMes(mes)}`} sub="clique num técnico para ver as OS dele">
      {(todos ? l : l.slice(0, 5)).map(([t, x], i) => (
        <button key={t} className="cdp-conta cpv-linha" onClick={() => onTecnico(t)}>
          <span>{i === 0 ? <i className="fas fa-crown" style={{ color: '#d97706', marginRight: 6 }} /> : null}{t}</span>
          <span className="cdp-conta-bar"><span style={{ width: `${Math.max(3, (x.valor / Math.max(1, l[0][1].valor)) * 100)}%`, background: '#2563eb' }} /></span>
          <small>{x.os} OS{x.horas ? ` · ${hrs(x.horas)}` : ''}</small><b>{compacto(x.valor)}</b><i className="fas fa-chevron-right" />
        </button>
      ))}
      {l.length > 5 && <button className="cpc-mais" onClick={() => setTodos(!todos)}>{todos ? 'ver menos' : `ver mais (${l.length - 5})`}</button>}
    </Secao>
  )
}

/** as ordens do mês, cada uma abrindo as peças e as requisições usadas nela (José, 12/11) */
type PecaOs = { ppv: string; codigo: string; descricao: string; qtd: number; preco: number; total: number }
type ObsOs = { fase: string; relatorio: { qtd: number; ultimo: string; tecnico: string } | null; tipo: string; solicitado: string; causa: string; realizado: string; observacoes: string }
type ReqOs = { id: number; titulo: string; tipo: string; fornecedor: string; valor: number; cobrado: number; status: string; data: string; solicitante: string; temNota: boolean }
function OrdensDoMes({ os, mes }: { os: OsPv[]; mes: string }) {
  const [tipo, setTipo] = useState<Grupo | 'todas'>('todas')
  const [aberta, setAberta] = useState<string | null>(null)
  const [frame, setFrame] = useState<{ titulo: string; sub?: string; src: string } | null>(null)
  const [pdf, setPdf] = useState<OsPv | null>(null)
  const lista = os.filter((o) => tipo === 'todas' || o.grupo === tipo).sort((a, b) => b.data.localeCompare(a.data) || b.bruto - a.bruto)
  const { d: det } = useJson<{ os: Record<string, DetOs> }>(urlDet(os))
  const de = (o: OsPv) => det?.os?.[o.os]
  return (
    <Secao titulo={`Ordens de ${nomeMes(mes)}`} sub="clique numa ordem para ver as peças e as requisições">
      <div className="cmdp-chips">
        <button className={tipo === 'todas' ? 'on' : ''} onClick={() => setTipo('todas')}>Todas<b>{os.length}</b></button>
        {TIPOS.map((t) => { const n = os.filter((o) => o.grupo === t.g).length; return n ? <button key={t.g} className={tipo === t.g ? 'on' : ''} onClick={() => setTipo(t.g)}><i className="cdp-dot" style={{ background: t.cor }} />{t.nome}<b>{n}</b></button> : null })}
      </div>
      <div className="cpv-ords">
        {lista.map((o, i) => {
          const x = de(o), k = `${o.os}-${i}`, on = aberta === k
          const reqTot = x ? x.requisicoes.reduce((a, r) => a + r.valor, 0) : 0
          return (
            <div key={k} className={`cpv-ord${on ? ' on' : ''}`}>
              <button className="cpv-ord-l" onClick={() => setAberta(on ? null : k)}>
                <span className="cpv-ord-os"><b>{o.numero ? (o.grupo === 'garantia' ? o.numero : `OS ${o.numero}`) : o.os}</b><small><i className="cdp-dot" style={{ background: TIPO[o.grupo].cor }} />{o.grupo === 'interna' ? o.subtipo || 'Interna' : TIPO[o.grupo].nome} · {dataBR(o.data)}</small></span>
                <span className="cpv-ord-cli">{o.cliente || '—'}<small>{o.tecnicos.join(', ') || 'sem técnico'}</small>{temPdf(o) && <SeloOs obs={x?.obs} />}</span>
                <span className="cpv-ord-n"><small>peças</small>{x ? (x.pecas.length ? `${x.pecas.length} · ${compacto(o.pecas || x.pecas.reduce((a, p) => a + p.total, 0))}` : '—') : '…'}</span>
                <span className="cpv-ord-n"><small>requisições</small>{x ? (x.requisicoes.length ? `${x.requisicoes.length} · ${compacto(reqTot)}` : '—') : '…'}</span>
                <b className="cpv-ord-v">{brl(o.bruto)}</b>
                <i className={`fas fa-chevron-${on ? 'up' : 'down'}`} />
              </button>
              {on && (
                <div className="cpv-ord-det">
                  <div className="cpv-ord-conta">
                    <span>Mão de obra <b>{brl(o.servico)}</b>{o.horas ? <small>{hrs(o.horas)}</small> : null}</span>
                    <span>Deslocamento <b>{brl(o.kmValor)}</b></span>
                    <span>Peças <b>{brl(o.pecas)}</b></span>
                    {Math.abs(o.outros) > 0.5 && <span>Outros <b>{brl(o.outros)}</b></span>}
                    {temPdf(o) && <button className="cmnf-bt cpv-ord-pdf" onClick={() => setPdf(o)}><i className="fas fa-file-pdf" /> PDF da OS</button>}
                  </div>
                  {x?.obs && (x.obs.solicitado || x.obs.causa || x.obs.realizado || x.obs.observacoes) && (
                    <div className="cpv-ord-obs">
                      {([['Serviço pedido', x.obs.solicitado], ['Causa', x.obs.causa], ['Serviço feito', x.obs.realizado], ['Observações', x.obs.observacoes]] as const).filter(([, v]) => v).map(([n, v]) => (
                        <div key={n}><small>{n}</small><p>{v}</p></div>
                      ))}
                    </div>
                  )}
                  {!x && <div className="ce-mudo">Buscando as peças e requisições…</div>}
                  {x && (
                    <div className="cmt-dois">
                      <div>
                        <div className="cpv-ord-tit">Peças usadas</div>
                        {x.pecas.length ? x.pecas.map((p, j) => (
                          <div key={j} className="cpv-ord-it"><span>{p.descricao}<small>{p.codigo} · {p.ppv}</small></span><em>{p.qtd.toLocaleString('pt-BR')} ×</em><b>{brl(p.total)}</b></div>
                        )) : <div className="ce-mudo">Nenhuma peça lançada nesta OS.</div>}
                      </div>
                      <div>
                        <div className="cpv-ord-tit">Requisições</div>
                        {x.requisicoes.length ? x.requisicoes.map((r) => (
                          <button key={r.id} className="cpv-ord-it cpv-ord-req" onClick={() => setFrame({ titulo: `Requisição ${r.id}`, sub: r.titulo, src: `/requisicoes/imprimir/${r.id}` })}>
                            <span>{r.titulo || r.tipo || 'Requisição'}<small>{[r.tipo, r.fornecedor, r.data ? dataBR(r.data) : '', r.status, r.cobrado ? `cobrado do cliente ${brl(r.cobrado)}` : ''].filter(Boolean).join(' · ')}</small></span>
                            <em><i className="fas fa-file-pdf" /></em><b>{brl(r.valor)}</b>
                          </button>
                        )) : <div className="ce-mudo">Nenhuma requisição nesta OS.</div>}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
        {!lista.length && <div className="ce-mudo">Nenhuma ordem nesse mês.</div>}
      </div>
      {frame && <JanelaFrame titulo={frame.titulo} sub={frame.sub} src={frame.src} onFechar={() => setFrame(null)} />}
      {pdf && <JanelaPdfOs o={pdf} onFechar={() => setPdf(null)} />}
    </Secao>
  )
}

/** fase da OS no POS e se o relatório do técnico já foi feito */
function SeloOs({ obs }: { obs: ObsOs | null | undefined }) {
  if (!obs) return null
  const rel = obs.relatorio
  return (
    <span className="cpv-selos">
      {obs.fase && <span className="cpv-selo fase">{obs.fase}</span>}
      <span className={`cpv-selo ${rel ? 'ok' : 'falta'}`} title={rel ? `${rel.qtd} relatório(s) · último em ${dataBR(rel.ultimo)}${rel.tecnico ? ` por ${rel.tecnico}` : ''}` : 'O técnico ainda não preencheu o relatório no app'}>
        <i className={`fas ${rel ? 'fa-circle-check' : 'fa-circle-exclamation'}`} /> {rel ? 'relatório feito' : 'sem relatório'}
      </span>
    </span>
  )
}
type DetOs = { pecas: PecaOs[]; requisicoes: ReqOs[]; obs: ObsOs | null }
const urlDet = (os: OsPv[]) => { const ids = [...new Set(os.map((o) => o.os).filter((x) => /^OS-\d+$/i.test(x)))].sort(); return `/api/empresa/os-detalhe?os=${ids.join(',')}` }

/** a OS tem PDF no POS quando é uma OS do portal (OS-0000) */
const temPdf = (o: OsPv) => /^OS-\d+$/i.test(o.os)
/** o PDF da OS (o mesmo do POS: /api/pos/ordens/[id]/print) numa janela, sem abrir outra aba */
function JanelaPdfOs({ o, onFechar }: { o: OsPv; onFechar: () => void }) {
  const [html, setHtml] = useState<string | null>(null), [erro, setErro] = useState<string | null>(null)
  const ref = useRef<HTMLIFrameElement>(null)
  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const r = await fetch(`/api/pos/ordens/${encodeURIComponent(o.os)}/print?pecas=1`, { headers: await authHeaders() })
        if (!r.ok) { if (vivo) setErro(r.status === 403 ? 'Sem acesso ao PDF das OS.' : `Não deu para gerar o PDF (${r.status}).`); return }
        const t = await r.text()
        if (vivo) setHtml(t)
      } catch { if (vivo) setErro('Não deu para gerar o PDF agora.') }
    })()
    return () => { vivo = false }
  }, [o.os])
  return (
    <div className="cmw-fundo cmpdf-fundo" onClick={(e) => { e.stopPropagation(); onFechar() }}>
      <div className="cmpdf" onClick={(e) => e.stopPropagation()}>
        <div className="cml-janela-cab"><h3>{o.numero && o.grupo !== 'garantia' ? `OS ${o.numero}` : o.os}</h3><span>{o.cliente}</span>{html && <button className="cm-bt" onClick={() => ref.current?.contentWindow?.print()}><i className="fas fa-print" /> Imprimir / salvar PDF</button>}<button className="cma-x" onClick={onFechar} aria-label="Fechar"><i className="fas fa-xmark" /></button></div>
        {html ? <iframe ref={ref} className="cmpdf-frame" srcDoc={html} title="PDF da OS" /> : <div className="cmnf-msg">{erro || 'Gerando o PDF da OS…'}</div>}
      </div>
    </div>
  )
}

function JanelaOs({ titulo, os, mes, explica, onFechar }: { titulo: string; os: OsPv[]; mes: string; explica?: string; onFechar: () => void }) {
  const [tipo, setTipo] = useState<string | null>(null)
  const [pdf, setPdf] = useState<OsPv | null>(null)
  const { d: det } = useJson<{ os: Record<string, DetOs> }>(urlDet(os))
  const chave = (o: OsPv) => (o.grupo === 'interna' ? o.subtipo || 'Interno' : TIPO[o.grupo].nome)
  const tipos = [...os.reduce((mp, o) => mp.set(chave(o), (mp.get(chave(o)) || 0) + o.bruto), new Map<string, number>()).entries()].sort((a, b) => b[1] - a[1])
  const lista = os.filter((o) => !tipo || chave(o) === tipo).sort((a, b) => b.bruto - a.bruto)
  return (
    <div className="cmw-fundo cml-janela-fundo cmp-fundo" onClick={onFechar}>
      <div className="cml-janela cmp-janela" onClick={(e) => e.stopPropagation()}>
        <div className="cml-janela-cab"><h3>{titulo}</h3><span>{cap(nomeMes(mes, true))} · {plural(lista.length, 'OS', 'OS')} · {compacto(lista.reduce((a, o) => a + o.bruto, 0))}</span><button className="cma-x" onClick={onFechar} aria-label="Fechar"><i className="fas fa-xmark" /></button></div>
        <div className="cml-janela-corpo">
          {explica && <div className="cmx-explica">{explica}</div>}
          {tipos.length > 1 && (
            <div className="cmdp-chips">
              <button className={!tipo ? 'on' : ''} onClick={() => setTipo(null)}>Todas</button>
              {tipos.map(([k, v]) => <button key={k} className={tipo === k ? 'on' : ''} onClick={() => setTipo(tipo === k ? null : k)}>{k}<b>{compacto(v)}</b></button>)}
            </div>
          )}
          <div className="cmt-tab-wrap"><table className="cmt-tab cpv-tab">
            <thead><tr><th>OS</th><th>Cliente</th><th>Técnico</th><th>Fase / relatório</th><th>Mão de obra</th><th>Km</th><th>Peças</th><th>Total</th><th /></tr></thead>
            <tbody>{lista.map((o, i) => (
              <tr key={`${o.os}-${i}`}>
                <td>{o.numero ? (o.grupo === 'garantia' ? o.numero : `OS ${o.numero}`) : o.os}<small><i className="cdp-dot" style={{ background: TIPO[o.grupo].cor }} />{o.grupo === 'interna' ? o.subtipo || 'Interna' : TIPO[o.grupo].nome} · {dataBR(o.data)}</small></td>
                <td>{o.cliente || '—'}</td>
                <td>{o.tecnicos.join(', ') || '—'}{o.horas ? <small>{hrs(o.horas)}</small> : null}</td>
                <td>{temPdf(o) ? (det ? <SeloOs obs={det.os?.[o.os]?.obs} /> : <small>…</small>) : null}</td>
                <td className="val">{brl(o.servico)}</td><td className="val">{brl(o.kmValor)}</td><td className="val">{brl(o.pecas)}</td>
                <td className="val"><b>{brl(o.bruto)}</b></td>
                <td>{temPdf(o) ? <button className="cmnf-bt" onClick={() => setPdf(o)}><i className="fas fa-file-pdf" /> PDF</button> : null}</td>
              </tr>
            ))}</tbody>
          </table></div>
          {pdf && <JanelaPdfOs o={pdf} onFechar={() => setPdf(null)} />}
          {!lista.length && <div className="ce-mudo">Nenhuma OS aqui. A lista de OS fica guardada só dos últimos 13 meses; antes disso, veja na Gestão do Pós-Vendas.</div>}
        </div>
      </div>
    </div>
  )
}

// ── TÉCNICOS ─────────────────────────────────────────────────────────────────
function TelaTecnicos({ d, onFechar }: { d: DadosPosVendas; onFechar: () => void }) {
  const [sel, setSel] = useState<string | null>(null)
  const tec = d.tecnicos.find((t) => t.nome === sel)
  if (tec) return <DetalheTecnico t={tec} d={d} onFechar={() => setSel(null)} />
  return <TelaCheia titulo="Técnicos" sub="horas por semana e por mês · clique num técnico para ver tudo" onFechar={onFechar}><AbaTecnicos d={d} setSel={setSel} /></TelaCheia>
}

function AbaTecnicos({ d, setSel }: { d: DadosPosVendas; setSel: (n: string) => void }) {
  const [escala, setEscala] = useState<'semanas' | 'meses'>('semanas')
  const [iEsc, setI] = useState<number | null>(null)
  const serie = escala === 'semanas' ? d.equipeSemanas : d.equipeMeses
  const i = iEsc != null && iEsc < serie.length ? iEsc : serie.length - 1
  const p = serie[i]
  const rot = (h: HorasPv) => (escala === 'semanas' ? `semana de ${dataBR(h.de).slice(0, 5)} a ${dataBR(h.ate).slice(0, 5)}` : nomeMes(h.de.slice(0, 7), true))
  const campo = d.tecnicos.filter((t) => !t.grupo), grupos = d.tecnicos.filter((t) => t.grupo)
  return (
    <div className="cpv-corpo">
      <div className="cpv-topo">
        <span className="cm-abas">{([['semanas', 'Por semana'], ['meses', 'Por mês']] as const).map(([k, n]) => <button key={k} className={escala === k ? 'on' : ''} onClick={() => { setEscala(k); setI(null) }}>{n}</button>)}</span>
        <span className="cpv-frase">A equipe fez <b>{hrs(p.trabalhadas)}</b> na {rot(p)}{p.meta ? <> · meta de <b>{hrs(p.meta)}</b> ({Math.round((p.trabalhadas / p.meta) * 100)}%)</> : null}{p.extras ? <> · mais {hrs(p.extras)} no fim de semana</> : null}.</span>
      </div>
      <div className="cpv-kpis">
        <div className="cmt-kpi"><small><i className="cdp-dot" style={{ background: COR_H.trab }} />Horas trabalhadas</small><b>{hrs(p.trabalhadas)}</b><em>registradas no app, seg a sex</em></div>
        <div className="cmt-kpi"><small><i className="cdp-dot" style={{ background: COR_H.fat }} />Horas cobradas</small><b>{hrs(p.faturadas + p.aguardando)}</b><em>{hrs(p.faturadas)} faturadas · {hrs(p.aguardando)} esperando faturar</em></div>
        <div className="cmt-kpi"><small><i className="cdp-dot" style={{ background: COR_H.int }} />Horas em internas</small><b>{hrs(p.internas)}</b><em>serviço da loja, cortesia, montagem</em></div>
        <div className="cmt-kpi"><small><i className="cdp-dot" style={{ background: COR_H.ocio }} />Horas paradas</small><b>{hrs(p.ociosas)}</b><em>meta − (cobradas + internas)</em></div>
      </div>
      <Secao titulo={escala === 'semanas' ? 'Horas da equipe por semana' : 'Horas da equipe por mês'} sub="clique numa barra para ver aquele período nos cartões">
        <BarrasHoras serie={serie} i={i} setI={setI} escala={escala} />
      </Secao>
      <div className="cmt-sec-cab cpv-cab"><h3>Cada técnico</h3><span>{rot(p)} · clique para ver tudo</span></div>
      <div className="cmv-grade">
        {[...campo, ...grupos].map((t) => <CartaoTecnico key={t.nome} t={t} h={t[escala][i]} escala={escala} onClick={() => setSel(t.nome)} />)}
      </div>
      <p className="cma-nota">Mesma conta da Gestão do Pós-Vendas: horas trabalhadas = relatório do app (seg a sex); cobradas = horas nas OS faturadas (repartidas entre os técnicos da OS) mais as já preenchidas esperando faturar. Garantia e Outros não têm meta.</p>
    </div>
  )
}

function BarrasHoras({ serie, i, setI, escala, alto = 220 }: { serie: HorasPv[]; i: number; setI: (i: number) => void; escala: 'semanas' | 'meses'; alto?: number }) {
  const max = Math.max(1, ...serie.map((h) => Math.max(h.trabalhadas, h.meta)))
  return (
    <div className="cpv-b" style={{ height: alto }}>
      {serie.map((h, k) => (
        <button key={h.de} className={`cpv-b-col${k === i ? ' on' : ''}`} onClick={() => setI(k)} title={`${hrs(h.trabalhadas)} trabalhadas · ${hrs(h.faturadas + h.aguardando)} cobradas · meta ${hrs(h.meta)}`}>
          <b>{Math.round(h.trabalhadas)}</b>
          <span className="cpv-b-area">
            {h.meta > 0 && <span className="cpv-b-meta" style={{ bottom: `${(h.meta / max) * 100}%` }} />}
            <span className="cpv-b-trab" style={{ height: `${(h.trabalhadas / max) * 100}%` }}><span style={{ height: `${h.trabalhadas ? Math.min(100, ((h.faturadas + h.aguardando) / h.trabalhadas) * 100) : 0}%` }} /></span>
          </span>
          <small>{escala === 'semanas' ? dataBR(h.de).slice(0, 5) : mesCurto(h.de.slice(0, 7))}</small>
        </button>
      ))}
      <span className="cpv-b-leg"><span><i style={{ background: '#93c5fd' }} />trabalhadas</span><span><i style={{ background: COR_H.fat }} />cobradas</span><span><i className="meta" />meta</span></span>
    </div>
  )
}

function CartaoTecnico({ t, h, escala, onClick }: { t: TecnicoPv; h: HorasPv; escala: 'semanas' | 'meses'; onClick: () => void }) {
  const pct = h.meta ? Math.round((h.trabalhadas / h.meta) * 100) : null
  const ult = t[escala].slice(-8), max = Math.max(1, ...ult.map((x) => x.trabalhadas))
  return (
    <button className="cmv-card" onClick={onClick}>
      <span className="cmv-nome">{t.nome}<small>{t.grupo ? 'grupo sem meta de horas' : 'Técnico'}</small></span>
      <span className="cmv-nums">
        <span><b>{hrs(h.trabalhadas)}</b><small>trabalhadas</small></span>
        <span><b>{hrs(h.faturadas + h.aguardando)}</b><small>cobradas</small></span>
        <span><b>{compacto(h.bruto)}</b><small>faturou ({Math.round(h.os * 10) / 10} OS)</small></span>
        <span><b>{hrs(h.internas)}</b><small>em internas</small></span>
      </span>
      {pct != null ? (
        <span className="cmv-meta"><span className="cm-meta-trilho"><span style={{ width: `${Math.min(100, pct)}%`, background: pct >= 90 ? '#16a34a' : pct >= 70 ? '#2563eb' : '#f59e0b' }} /></span><small>{pct}% da meta de {hrs(h.meta)}{h.ociosas ? ` · ${hrs(h.ociosas)} paradas` : ''}</small></span>
      ) : <span className="cmv-meta"><small>sem meta</small></span>}
      <span className="cpv-mini">{ult.map((x) => <i key={x.de} style={{ height: `${Math.max(4, (x.trabalhadas / max) * 100)}%` }} title={`${x.rotulo}: ${hrs(x.trabalhadas)}`} />)}</span>
      <span className="cmv-ver">ver tudo <i className="fas fa-arrow-right" /></span>
    </button>
  )
}

function DetalheTecnico({ t, d, onFechar }: { t: TecnicoPv; d: DadosPosVendas; onFechar: () => void }) {
  const [iS, setIS] = useState(t.semanas.length - 1), [iM, setIM] = useState(t.meses.length - 1)
  const mesSel = t.meses[iM], sem = t.semanas[iS]
  const mes = mesSel.de.slice(0, 7)
  const os = d.os.filter((o) => o.data.startsWith(mes) && o.tecnicos.includes(t.nome)).sort((a, b) => b.data.localeCompare(a.data))
  const porTipo = TIPOS.map((x) => ({ ...x, l: os.filter((o) => o.grupo === x.g) })).filter((x) => x.l.length)
  const [lista, setLista] = useState<{ titulo: string; grupo?: Grupo } | null>(null)
  return (
    <TelaCheia titulo={t.nome} sub={t.grupo ? 'grupo sem meta de horas' : 'Técnico'} onFechar={onFechar}>
      <Secao titulo="Por semana" sub={`semana de ${dataBR(sem.de).slice(0, 5)} a ${dataBR(sem.ate).slice(0, 5)}`}>
        <ResumoHoras h={sem} />
        <BarrasHoras serie={t.semanas} i={iS} setI={setIS} escala="semanas" alto={180} />
      </Secao>
      <Secao titulo="Por mês" sub={cap(nomeMes(mes, true))}>
        <ResumoHoras h={mesSel} />
        <BarrasHoras serie={t.meses} i={iM} setI={setIM} escala="meses" alto={180} />
      </Secao>
      <Secao titulo={`OS de ${nomeMes(mes)}`} sub="clique num tipo para ver as OS">
        <div className="cpv-kpis">
          {porTipo.length ? porTipo.map((x) => (
            <button key={x.g} className="cmt-kpi cmt-kpi-bt" onClick={() => setLista({ titulo: `${x.nome} · ${t.nome}`, grupo: x.g })}>
              <small><i className="cdp-dot" style={{ background: x.cor }} />{x.nome}</small><b>{compacto(x.l.reduce((a, o) => a + o.bruto, 0))}</b><em>{plural(x.l.length, 'OS', 'OS')}</em>
            </button>
          )) : <div className="ce-mudo">Nenhuma OS com {t.nome} em {nomeMes(mes)}.</div>}
        </div>
      </Secao>
      {lista && <JanelaOs titulo={lista.titulo} os={os.filter((o) => !lista.grupo || o.grupo === lista.grupo)} mes={mes} onFechar={() => setLista(null)} />}
    </TelaCheia>
  )
}

function ResumoHoras({ h }: { h: HorasPv }) {
  const pct = h.meta ? Math.round((h.trabalhadas / h.meta) * 100) : null
  return (
    <div className="cpv-res">
      <span><b>{hrs(h.trabalhadas)}</b><small>trabalhadas{pct != null ? ` · ${pct}% da meta (${hrs(h.meta)})` : ''}</small></span>
      <span><b>{hrs(h.faturadas)}</b><small>faturadas</small></span>
      <span><b>{hrs(h.aguardando)}</b><small>esperando faturar</small></span>
      <span><b>{hrs(h.internas)}</b><small>internas</small></span>
      <span><b>{hrs(h.extras)}</b><small>fim de semana</small></span>
      {pct != null && <span><b style={{ color: h.ociosas ? '#d97706' : undefined }}>{hrs(h.ociosas)}</b><small>paradas</small></span>}
      <span><b>{compacto(h.bruto)}</b><small>faturou</small></span>
    </div>
  )
}

export const CSS_CPV = `
.cpv-ords{display:flex;flex-direction:column;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;margin-top:10px}
.cpv-ord{border-bottom:1px solid #f1f5f9}
.cpv-ord:last-child{border-bottom:0}
.cpv-ord.on{background:#f8fafc}
.ce .cpv-ord-l{width:100%;display:grid;grid-template-columns:150px minmax(180px,1fr) 130px 130px 110px 14px;align-items:center;gap:14px;padding:12px 16px;cursor:pointer;text-align:left;font-family:inherit;font-size:14px;color:#0f172a}
.ce .cpv-ord-l:hover{background:#f8fafc}
.cpv-ord-os,.cpv-ord-cli,.cpv-ord-n{display:flex;flex-direction:column;min-width:0}
.cpv-ord-os b{font-weight:600}
.cpv-ord-os small,.cpv-ord-cli small{font-size:12px;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cpv-ord-n{font-size:13.5px;color:#334155}
.cpv-ord-n small{font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:.04em}
.cpv-ord-v{text-align:right;font-weight:500;font-variant-numeric:tabular-nums}
.cpv-ord-l > i{font-size:11px;color:#94a3b8}
.cpv-ord-det{padding:4px 16px 16px;display:flex;flex-direction:column;gap:12px}
.cpv-ord-conta{display:flex;flex-wrap:wrap;gap:8px}
.cpv-ord-conta span{background:#fefefe;border:1px solid #e2e8f0;border-radius:10px;padding:6px 10px;font-size:13px;color:#475569}
.cpv-ord-conta b{font-weight:600;color:#0f172a;margin-left:4px}
.cpv-ord-conta small{margin-left:6px;color:#94a3b8}
.cpv-ord-tit{font-size:12.5px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:#64748b;margin-bottom:6px}
.ce .cpv-ord-it{width:100%;display:grid;grid-template-columns:1fr auto 90px;align-items:center;gap:10px;padding:8px 10px;background:#fefefe;border:1px solid #eef2f7;border-radius:10px;margin-bottom:6px;font-family:inherit;font-size:13.5px;color:#0f172a;text-align:left}
.cpv-ord-it span{display:flex;flex-direction:column;min-width:0}
.cpv-ord-it small{font-size:12px;color:#64748b}
.cpv-ord-it em{font-style:normal;font-size:12.5px;color:#64748b}
.cpv-ord-it b{text-align:right;font-weight:500;font-variant-numeric:tabular-nums}
.ce .cpv-ord-req{cursor:pointer}
.ce .cpv-ord-req:hover{border-color:#93c5fd}
.cpv-ord-req em i{color:#2563eb}
@media (max-width:900px){.ce .cpv-ord-l{grid-template-columns:1fr auto 14px}.cpv-ord-cli,.cpv-ord-n{display:none}}
.cpv-oficina{grid-column:span 2}
.cpv-meta-capa{display:block;height:8px;border-radius:99px;background:#e2e8f0;overflow:hidden;margin-top:auto}
.cpv-meta-capa span{display:block;height:100%;border-radius:99px;background:var(--c)}
@media (max-width:1100px){.cpv-oficina{grid-column:auto}}
.cpv-partes{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}
.cpv-parte-bar{display:block;height:6px;border-radius:99px;background:#f1f5f9;overflow:hidden;margin:4px 0 2px;width:100%}
.cpv-parte-bar span{display:block;height:100%;border-radius:99px}
.cpv-corpo{display:flex;flex-direction:column;gap:16px}
.cpv-topo{display:flex;align-items:center;gap:16px;flex-wrap:wrap}
.cpv-topo .cm-abas{margin:0}
.cpv-frase{font-size:15px;color:#334155;line-height:1.5}
.cpv-frase b{font-weight:600;color:#0f172a}
.cpv-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}
.cpv-col{display:flex;flex-direction:column;gap:18px}
.ce .cpv-linha{grid-template-columns:minmax(120px,1fr) 1fr 110px 80px 12px}
.ce .cpv-fixa{cursor:default}
.ce .cpv-fixa:hover{background:none}
.cpv-g{display:flex;flex-direction:column;gap:10px}
.cpv-g-leg{margin-left:auto;display:flex;flex-wrap:wrap;gap:14px;font-size:12.5px;color:#475569}
.cpv-g-soma{font-size:14px;color:#475569}
.cpv-g-soma b{font-weight:600;color:#0f172a}
.ce .cpv-g-col:disabled{cursor:default}
.cpv-g-leg i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px}
.cpv-g-cols{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:6px;height:260px}
.ce .cpv-g-col{display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:4px;border-radius:12px;padding:6px 2px;cursor:pointer;font-family:inherit}
.ce .cpv-g-col:hover{background:#f8fafc}
.ce .cpv-g-col.on{background:#eff6ff;box-shadow:inset 0 0 0 1px #93c5fd}
.cpv-g-col b{font-size:15px;font-weight:600;color:#0f172a;white-space:nowrap;font-variant-numeric:tabular-nums}
.cpv-g-col b.acima{color:#15803d}
.cpv-g-col b.abaixo{color:#dc2626}
.cpv-g-area{position:relative;flex:1;width:100%;display:flex;align-items:flex-end;justify-content:center;min-height:0}
.cpv-g-media{position:absolute;left:-3px;right:-3px;border-top:2px dashed #0f172a;opacity:.45;z-index:1;pointer-events:none}
.cpv-g-col small{font-size:12px;color:#475569}
.cpv-g-pilha{width:min(30px,70%);display:flex;flex-direction:column;border-radius:6px 6px 2px 2px;overflow:hidden;min-height:2px}
.cpv-g-pilha span{display:block;min-height:1px}
.cpv-tab td small{display:block;font-size:12px;color:#64748b}
.ce .cpv-tab th,.ce .cpv-tab td{text-align:left;color:#0f172a}
.ce .cpv-tab td.val,.ce .cpv-tab th:nth-child(n+5){text-align:right}
.cpv-selos{display:flex;flex-wrap:wrap;gap:4px;margin-top:4px}
.cpv-selo{display:inline-flex;align-items:center;gap:4px;font-size:11.5px;font-weight:500;padding:2px 8px;border-radius:99px;white-space:nowrap}
.cpv-selo.fase{background:#eff6ff;color:#1d4ed8}
.cpv-selo.ok{background:#f0fdf4;color:#15803d}
.cpv-selo.falta{background:#fef2f2;color:#b91c1c}
.cpv-ord-pdf{margin-left:auto}
.cpv-ord-obs{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px}
.cpv-ord-obs > div{background:#fefefe;border:1px solid #eef2f7;border-radius:10px;padding:8px 12px}
.cpv-ord-obs small{font-size:11.5px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:#64748b}
.cpv-ord-obs p{margin:2px 0 0;font-size:13.5px;color:#0f172a;white-space:pre-wrap;line-height:1.45}
.cpv-cab{margin-top:4px}
.cpv-b{position:relative;display:grid;grid-auto-flow:column;grid-auto-columns:minmax(0,1fr);gap:6px;padding-bottom:22px}
.ce .cpv-b-col{display:flex;flex-direction:column;align-items:center;gap:4px;border-radius:12px;padding:6px 2px;cursor:pointer;font-family:inherit;min-height:0}
.ce .cpv-b-col:hover{background:#f8fafc}
.ce .cpv-b-col.on{background:#eff6ff;box-shadow:inset 0 0 0 1px #93c5fd}
.cpv-b-col b{font-size:12px;font-weight:600;color:#0f172a}
.cpv-b-col small{font-size:11.5px;color:#475569;white-space:nowrap}
.cpv-b-area{position:relative;flex:1;width:100%;display:flex;align-items:flex-end;justify-content:center}
.cpv-b-trab{width:min(26px,70%);background:#93c5fd;border-radius:6px 6px 2px 2px;display:flex;align-items:flex-end;overflow:hidden}
.cpv-b-trab span{display:block;width:100%;background:#16a34a}
.cpv-b-meta{position:absolute;left:8%;right:8%;border-top:2px dashed #0f172a;opacity:.55;z-index:1}
.cpv-b-leg{position:absolute;left:0;bottom:0;display:flex;gap:14px;font-size:12px;color:#475569}
.cpv-b-leg i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:5px;vertical-align:-1px}
.cpv-b-leg i.meta{height:0;border-top:2px dashed #0f172a;border-radius:0;width:14px;vertical-align:3px}
.cpv-mini{display:flex;align-items:flex-end;gap:3px;height:34px}
.cpv-mini i{flex:1;background:#bfdbfe;border-radius:3px 3px 1px 1px}
.cpv-mini i:last-child{background:#2563eb}
.cpv-res{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-bottom:12px}
.cpv-res span{display:flex;flex-direction:column;background:#f8fafc;border-radius:12px;padding:10px 12px}
.cpv-res b{font-size:18px;font-weight:500;color:#0f172a}
.cpv-res small{font-size:12px;color:#64748b}
@media (max-width:760px){.cpv-g-cols{gap:2px;height:200px}.cpv-g-col b{display:none}.cpv-b{gap:2px}.cpv-b-col b{font-size:10.5px}.cpv-b-col small{font-size:10px}.ce .cpv-linha{grid-template-columns:1fr 70px 12px}.cpv-linha .cdp-conta-bar,.cpv-linha small{display:none}.ce .cpv-abas button{flex:1;justify-content:center}}
`
