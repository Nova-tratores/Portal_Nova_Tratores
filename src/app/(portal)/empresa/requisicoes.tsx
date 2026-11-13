'use client'
// Requisições na tela do diretor (/empresa). José, 12/11/2026: "cartões com assuntos das requisições: quanto gastou, qual o
// setor que mais gastou, dentro de cada setor quem mais gastou, e assim vai indo; quantas requisições estão paradas".
// Mesmo jeito das outras áreas: cartões → tela cheia. Dados: /api/empresa/requisicoes (tabela Requisicao, 13 meses).
import { useEffect, useState, type ReactNode } from 'react'
import { compacto, brl, cap, nomeMes, mesCurto, plural } from './comercial'
import { TelaCheia, Secao } from './comercial-assuntos'
import { useJson, JanelaFrame } from './comercial-telas'
import { NavMes, dataBR } from './posvendas'
import { NavAno } from './comercial-despesas'

type Req = { id: number; titulo: string; tipo: string; pessoa: string; setor: string; data: string; status: string; valor: number; cobrado: number; fornecedor: string; os: string; veiculo: string; cliente: string; temNota: boolean }
type Dados = { reqs: Req[]; hoje: string }
const FASE: Record<string, { nome: string; cor: string; aberta: boolean }> = {
  pedido: { nome: 'Pedido realizado', cor: '#2563eb', aberta: true },
  aguardando: { nome: 'Aguardando fornecedor', cor: '#d97706', aberta: true },
  financeiro: { nome: 'No financeiro', cor: '#16a34a', aberta: false },
}
const COR_TIPO = ['#0f766e', '#0891b2', '#6366f1', '#a855f7', '#f59e0b', '#f97316', '#84cc16', '#94a3b8', '#e11d48', '#64748b']
/** "DOUGRAS MOGRS DE JESUS BONFIM" → "Dougras Mogrs de Jesus Bonfim"; sem nome → "Sem nome na requisição" */
const nomeBonito = (n: string) => (!n || /^sem solicitante$/i.test(n) ? 'Sem nome na requisição' : n.toLowerCase().replace(/(^|\s)(\p{L})/gu, (_, a, b) => a + b.toUpperCase()).replace(/\s(De|Da|Do|Dos|Das|E)\s/g, (m) => m.toLowerCase()))
const iniciais = (n: string) => { const p = nomeBonito(n).split(' ').filter((x) => x.length > 2 || /^[A-Z]/.test(x)); return ((p[0]?.[0] || '?') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase() }
const dias = (data: string, hoje: string) => Math.max(0, Math.round((Date.parse(`${hoje}T12:00:00`) - Date.parse(`${data}T12:00:00`)) / 86_400_000))
const soma = (l: Req[]) => l.reduce((a, r) => a + r.valor, 0)
function agrupar(l: Req[], k: (r: Req) => string) {
  const m = new Map<string, Req[]>()
  for (const r of l) m.set(k(r), [...(m.get(k(r)) || []), r])
  return [...m.entries()].map(([nome, rs]) => ({ nome, rs, valor: soma(rs) })).sort((a, b) => b.valor - a.valor || b.rs.length - a.rs.length)
}

type TelaRq = 'gasto' | 'setor' | 'paradas' | 'abertas'
export function PainelRequisicoes() {
  const { d, erro } = useJson<Dados>('/api/empresa/requisicoes')
  const [tela, setTela] = useState<TelaRq | null>(() => {
    if (typeof window === 'undefined') return null
    const t = new URLSearchParams(window.location.search).get('tela')
    return t === 'gasto' || t === 'setor' || t === 'paradas' || t === 'abertas' ? t : null
  })
  useEffect(() => {
    try {
      const u = new URL(window.location.href)
      if (tela) u.searchParams.set('tela', tela); else u.searchParams.delete('tela')
      if (u.toString() !== window.location.href) window.history.replaceState(null, '', u.toString())
    } catch { /* sem URL */ }
  }, [tela])
  const fechar = () => setTela(null)
  const hoje = d?.hoje || ''
  const mes = hoje.slice(0, 7)
  const doMes = (d?.reqs || []).filter((r) => r.data.startsWith(mes))
  const setores = agrupar(doMes, (r) => r.setor)
  const abertas = (d?.reqs || []).filter((r) => FASE[r.status]?.aberta)
  const paradas = abertas.filter((r) => dias(r.data, hoje) > 30)
  const meses6 = Array.from({ length: 6 }, (_, i) => { const x = new Date(Number(hoje.slice(0, 4) || 2026), Number(hoje.slice(5, 7) || 1) - 6 + i, 1); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}` })
  const porMes6 = meses6.map((m) => ({ m, v: soma((d?.reqs || []).filter((r) => r.data.startsWith(m))) }))
  const max6 = Math.max(1, ...porMes6.map((x) => x.v))
  const cartao = (t: TelaRq, cor: string, ic: string, nome: string, num: string, linha: ReactNode, extra?: ReactNode, cls = '') => (
    <button className={`cml-card ${cls}`} style={{ ['--c' as string]: cor }} onClick={() => setTela(t)}>
      <span className="cml-cab"><span className="pf-ic"><i className={`fas ${ic}`} /></span><span className="cml-nome">{nome}</span><i className="fas fa-arrow-right cml-seta" /></span>
      <span className="cml-num">{num}</span>
      <span className="cml-linha">{linha}</span>
      {extra}
    </button>
  )
  return (
    <div className="pf cml">
      {erro && <div className="cm-aviso">{erro}</div>}
      <div className="cml-grade">
        {cartao('gasto', '#475569', 'fa-receipt', 'Quanto gastou', d ? compacto(soma(doMes)) : '—',
          d ? <>em requisições em {nomeMes(mes)} até hoje · {plural(doMes.length, 'requisição', 'requisições')}</> : 'carregando…',
          d ? <span className="cml-mini">{porMes6.map((x) => <span key={x.m} className={x.m === mes ? 'on' : ''}><span style={{ height: `${(x.v / max6) * 100}%` }} /><small>{mesCurto(x.m)}</small></span>)}</span> : null, 'cml-g')}
        {cartao('setor', '#7c3aed', 'fa-sitemap', 'Setor que mais gastou', setores[0] ? setores[0].nome : '—',
          setores[0] ? <>{compacto(setores[0].valor)} em {nomeMes(mes)} · quem mais pediu: {agrupar(setores[0].rs, (r) => r.pessoa)[0]?.nome.split(' ')[0]}</> : d ? 'nenhuma requisição no mês' : 'carregando…')}
        {cartao('paradas', '#dc2626', 'fa-hourglass-half', 'Paradas', d ? String(paradas.length) : '—',
          d ? <>abertas há mais de 30 dias · {compacto(soma(paradas))}</> : 'carregando…')}
        {cartao('abertas', '#2563eb', 'fa-folder-open', 'Em aberto', d ? String(abertas.length) : '—',
          d ? <>{Object.entries(FASE).filter(([, f]) => f.aberta).map(([k, f]) => `${abertas.filter((r) => r.status === k).length} ${f.nome.toLowerCase()}`).join(' · ')}</> : 'carregando…', null, 'cpv-oficina')}
      </div>
      {d && (tela === 'gasto' || tela === 'setor') && <TelaCheia titulo="Quanto gastou com requisições" sub="por setor, por pessoa e por tipo" onFechar={fechar}><TelaGasto d={d} /></TelaCheia>}
      {d && (tela === 'paradas' || tela === 'abertas') && <TelaCheia titulo="Requisições em aberto" sub="em que fase estão e há quanto tempo" onFechar={fechar}><TelaAbertas d={d} soParadas={tela === 'paradas'} /></TelaCheia>}
      {tela && !d && <TelaCheia titulo="Requisições" onFechar={fechar}><div className="cma-vazio">{erro || 'Carregando…'}</div></TelaCheia>}
    </div>
  )
}

// ── QUANTO GASTOU: mês → setores → pessoas → requisições
function TelaGasto({ d }: { d: Dados }) {
    const primeiro = d.reqs.reduce((a, r) => (r.data && r.data < a ? r.data : a), d.hoje).slice(0, 7)
  const meses: string[] = []
  for (let x = new Date(Number(primeiro.slice(0, 4)), Number(primeiro.slice(5, 7)) - 1, 1); `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}` <= d.hoje.slice(0, 7); x = new Date(x.getFullYear(), x.getMonth() + 1, 1)) meses.push(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`)
  const [mesEsc, setMes] = useState('')
  const mes = mesEsc && meses.includes(mesEsc) ? mesEsc : meses[meses.length - 1]
  const [setor, setSetor] = useState<string | null>(null)
  const [lista, setLista] = useState<{ titulo: string; rs: Req[] } | null>(null)
  const [verTodos, setVerTodos] = useState(false)
  const doMes = d.reqs.filter((r) => r.data.startsWith(mes))
  const setores = agrupar(doMes, (r) => r.setor)
  const ranking = agrupar(d.reqs, (r) => r.setor).map((x) => x.nome)
  const TONS = ['#1e40af', '#3b82f6', '#93c5fd']
  const top3 = ranking.slice(0, 3)
  const corDe = new Map(ranking.map((n, i) => [n, TONS[i] || '#cbd5e1']))
  const grupoDe = (n: string) => (top3.includes(n) ? n : 'Outros')
  const base = setor ? doMes.filter((r) => r.setor === setor) : doMes
  const pessoas = agrupar(base, (r) => r.pessoa)
  const tipos = agrupar(base, (r) => r.tipo)
  const anos = [...new Set(meses.map((m) => m.slice(0, 4)))].sort().reverse()
  const [anoEsc, setAno] = useState('')
  const ano = anoEsc && anos.includes(anoEsc) ? anoEsc : mes.slice(0, 4)
  const colsAno = Array.from({ length: 12 }, (_, i) => `${ano}-${String(i + 1).padStart(2, '0')}`)
  const porMes = colsAno.map((m) => { const l = d.reqs.filter((r) => r.data.startsWith(m)); return { m, v: soma(l), set: agrupar(l, (r) => r.setor), grp: agrupar(l, (r) => grupoDe(r.setor)) } })
  const max = Math.max(1, ...porMes.map((x) => x.v))
  const antAno = meses.filter((m) => m.startsWith(String(Number(ano) - 1)) && m < d.hoje.slice(0, 7))
  const mediaAnt = antAno.length ? antAno.reduce((a, m) => a + soma(d.reqs.filter((r) => r.data.startsWith(m))), 0) / antAno.length : null
  const legenda = [...top3, ...(ranking.length > 3 ? ['Outros'] : [])]
  const ant = (() => { const m = meses[meses.indexOf(mes) - 1]; return m ? { m, v: soma(d.reqs.filter((r) => r.data.startsWith(m))) } : null })()
  return (
    <div className="cpv-corpo">
      <div className="cpv-topo"><NavMes meses={meses} mes={mes} setMes={setMes} /><span className="cpv-frase">{cap(nomeMes(mes))}{mes === d.hoje.slice(0, 7) ? ' até hoje' : ''}: <b>{compacto(soma(doMes))}</b> em {plural(doMes.length, 'requisição', 'requisições')}{ant?.v ? <> ({soma(doMes) >= ant.v ? 'mais' : 'menos'} que os {compacto(ant.v)} de {nomeMes(ant.m)})</> : null}.</span></div>
      <Secao titulo="Mês a mês, por setor" sub="clique num mês para ver ele">
        <div className="cdp-g-ctrl">
          <NavAno anos={anos} ano={ano} setAno={setAno} />
          <span className="cpv-g-soma">{ano}: <b>{compacto(porMes.reduce((a, x) => a + x.v, 0))}</b>{mediaAnt != null ? <> · média de {Number(ano) - 1}: <b>{compacto(mediaAnt)}</b> por mês</> : null}</span>
          <span className="cpv-g-leg">{legenda.map((n) => <span key={n}><i style={{ background: corDe.get(n) || '#cbd5e1' }} />{n === 'Outros' ? `Outros (${ranking.slice(3).join(', ')})` : n}</span>)}</span>
        </div>
        <div className="cpv-g-cols cfr-g">
          {porMes.map((x) => (
            <button key={x.m} className={`cpv-g-col${x.m === mes ? ' on' : ''}`} disabled={!meses.includes(x.m)} onClick={() => setMes(x.m)} title={x.set.map((s) => `${s.nome}: ${brl(s.valor)}`).join('\n')}>
              <b className={!x.v || mediaAnt == null || x.m === d.hoje.slice(0, 7) ? '' : x.v <= mediaAnt ? 'acima' : 'abaixo'}>{x.v ? compacto(x.v).replace('R$ ', '') : ''}</b>
              <span className="cpv-g-area">{mediaAnt != null && <span className="cpv-g-media" style={{ bottom: `${(mediaAnt / max) * 100}%` }} />}<span className="cpv-g-pilha" style={{ height: `${(x.v / max) * 100}%` }}>{[...x.grp].sort((a, b) => legenda.indexOf(b.nome) - legenda.indexOf(a.nome)).map((s) => s.valor > 0 && <span key={s.nome} style={{ flex: s.valor, background: corDe.get(s.nome) || '#cbd5e1' }} />)}</span></span>
              <small>{mesCurto(x.m)}</small>
            </button>
          ))}
        </div>
      </Secao>
      <Secao titulo="Por setor" sub="clique num setor para ver quem mais gastou nele">
        <div className="cpv-kpis">
          {setores.map((s) => (
            <button key={s.nome} className={`cmt-kpi cmt-kpi-bt${setor === s.nome ? ' cpc-on' : ''}`} onClick={() => setSetor(setor === s.nome ? null : s.nome)}>
              <small><i className="cdp-dot" style={{ background: corDe.get(s.nome) }} />{s.nome}</small><b>{compacto(s.valor)}</b>
              <em>{plural(s.rs.length, 'requisição', 'requisições')} · {soma(doMes) ? Math.round((s.valor / soma(doMes)) * 100) : 0}% do mês</em>
            </button>
          ))}
          {!setores.length && <div className="ce-mudo">Nenhuma requisição nesse mês.</div>}
        </div>
      </Secao>
      <div className="cmt-dois">
        <Secao titulo={setor ? `Quem mais gastou em ${setor}` : 'Quem mais gastou'} sub="clique para ver as requisições da pessoa">
          <div className="crq-rank">
            {pessoas.slice(0, verTodos ? 99 : 8).map((x, k) => {
              const tot = soma(base), cor = setor ? corDe.get(setor) || '#475569' : '#475569'
              return (
                <button key={x.nome} className="crq-rk" onClick={() => setLista({ titulo: `${nomeBonito(x.nome)}${setor ? ` · ${setor}` : ''}`, rs: x.rs })}>
                  <span className="crq-rk-n">{k + 1}</span>
                  <span className="crq-rk-av" style={{ background: `${cor}1a`, color: cor }}>{iniciais(x.nome)}</span>
                  <span className="crq-rk-t"><b>{nomeBonito(x.nome)}</b><small>{plural(x.rs.length, 'requisição', 'requisições')} · {tot ? Math.round((x.valor / tot) * 100) : 0}% {setor ? 'do setor' : 'do mês'}{x.rs.some((r) => !r.valor) ? ` · ${x.rs.filter((r) => !r.valor).length} sem valor` : ''}</small>
                    <span className="crq-rk-bar"><span style={{ width: `${Math.max(2, (x.valor / Math.max(1, pessoas[0].valor)) * 100)}%`, background: cor }} /></span></span>
                  <b className="crq-rk-v">{brl(x.valor)}</b>
                </button>
              )
            })}
          </div>
          {pessoas.length > 8 && <button className="cpc-mais" onClick={() => setVerTodos(!verTodos)}>{verTodos ? 'ver menos' : `ver todos (${pessoas.length})`}</button>}
          {!pessoas.length && <div className="ce-mudo">Ninguém pediu nada nesse mês.</div>}
        </Secao>
        <Secao titulo={setor ? `Em quê, em ${setor}` : 'Em quê'} sub="o tipo da requisição · clique para ver">
          {tipos.length ? <div className="crq-comp">{tipos.map((x, k) => x.valor > 0 && <span key={x.nome} style={{ flex: x.valor, background: COR_TIPO[k % COR_TIPO.length] }} title={`${x.nome}: ${brl(x.valor)}`} />)}</div> : null}
          {tipos.map((x, k) => { const tot = soma(base); return (
            <button key={x.nome} className="crq-tp" onClick={() => setLista({ titulo: `${x.nome}${setor ? ` · ${setor}` : ''}`, rs: x.rs })}>
              <i style={{ background: COR_TIPO[k % COR_TIPO.length] }} />
              <span className="crq-tp-t"><b>{x.nome}</b><small>{plural(x.rs.length, 'requisição', 'requisições')}</small></span>
              <span className="crq-tp-p">{tot ? Math.round((x.valor / tot) * 100) : 0}%</span>
              <b className="crq-rk-v">{brl(x.valor)}</b>
            </button>
          ) })}
          {!tipos.length && <div className="ce-mudo">Nada nesse mês.</div>}
        </Secao>
      </div>
      {mediaAnt != null && <p className="cma-nota">A linha tracejada é a média por mês de {Number(ano) - 1}. Valor em <b style={{ color: '#15803d' }}>verde</b> = gastou menos que a média; em <b style={{ color: '#dc2626' }}>vermelho</b> = gastou mais. O mês em andamento fica sem cor.</p>}
      <p className="cma-nota">Valor = o que foi informado na requisição (valor da despesa). Requisição sem valor conta na quantidade, mas não no total. As da lixeira ficam de fora.</p>
      {lista && <JanelaReqs titulo={lista.titulo} rs={lista.rs} hoje={d.hoje} onFechar={() => setLista(null)} />}
    </div>
  )
}

// ── EM ABERTO / PARADAS
function TelaAbertas({ d, soParadas }: { d: Dados; soParadas: boolean }) {
  const [paradas, setParadas] = useState(soParadas)
  const [fase, setFase] = useState<string | null>(null)
  const [setor, setSetor] = useState<string | null>(null)
  const abertas = d.reqs.filter((r) => FASE[r.status]?.aberta)
  const lista = abertas.filter((r) => (!paradas || dias(r.data, d.hoje) > 30) && (!fase || r.status === fase) && (!setor || r.setor === setor)).sort((a, b) => a.data.localeCompare(b.data))
  const faixas = [['até 7 dias', 0, 7], ['8 a 30 dias', 8, 30], ['31 a 60 dias', 31, 60], ['mais de 60 dias', 61, 99999]] as const
  return (
    <div className="cpv-corpo">
      <div className="cpv-kpis">
        {Object.entries(FASE).filter(([, f]) => f.aberta).map(([k, f]) => { const l = abertas.filter((r) => r.status === k); return (
          <button key={k} className={`cmt-kpi cmt-kpi-bt${fase === k ? ' cpc-on' : ''}`} onClick={() => setFase(fase === k ? null : k)}><small><i className="cdp-dot" style={{ background: f.cor }} />{f.nome}</small><b>{l.length}</b><em>{compacto(soma(l))}</em></button>
        ) })}
        <button className={`cmt-kpi cmt-kpi-bt${paradas ? ' cpc-on' : ''}`} onClick={() => setParadas(!paradas)}><small><i className="cdp-dot" style={{ background: '#dc2626' }} />Paradas há mais de 30 dias</small><b style={{ color: '#dc2626' }}>{abertas.filter((r) => dias(r.data, d.hoje) > 30).length}</b><em>{paradas ? 'mostrando só elas · clique para ver todas' : 'clique para ver só elas'}</em></button>
      </div>
      <div className="cmt-dois">
        <Secao titulo="Há quanto tempo estão abertas">
          {faixas.map(([n, a, b]) => { const l = abertas.filter((r) => { const x = dias(r.data, d.hoje); return x >= a && x <= b }); return (
            <div key={n} className="cdp-conta cpv-linha cpv-fixa"><span>{n}</span><span className="cdp-conta-bar"><span style={{ width: `${Math.max(3, (l.length / Math.max(1, abertas.length)) * 100)}%`, background: b > 30 ? '#dc2626' : '#d97706' }} /></span><small>{l.length}</small><b>{compacto(soma(l))}</b><i /></div>
          ) })}
        </Secao>
        <Secao titulo="Por setor" sub="clique para filtrar">
          {agrupar(abertas, (r) => r.setor).map((s) => (
            <button key={s.nome} className={`cdp-conta cpv-linha${setor === s.nome ? ' cpv-sel' : ''}`} onClick={() => setSetor(setor === s.nome ? null : s.nome)}>
              <span>{s.nome}</span><span className="cdp-conta-bar"><span style={{ width: `${Math.max(3, (s.rs.length / Math.max(1, abertas.length)) * 100)}%`, background: '#2563eb' }} /></span><small>{s.rs.length}</small><b>{compacto(s.valor)}</b><i className="fas fa-chevron-right" />
            </button>
          ))}
        </Secao>
      </div>
      <Secao titulo={`${plural(lista.length, 'requisição', 'requisições')}${paradas ? ' paradas' : ' em aberto'}`} sub="as mais antigas primeiro · clique para ver a requisição">
        <ListaReqs rs={lista} hoje={d.hoje} />
      </Secao>
    </div>
  )
}

function ListaReqs({ rs, hoje }: { rs: Req[]; hoje: string }) {
  const [frame, setFrame] = useState<Req | null>(null)
  return (
    <>
      {rs.map((r) => { const x = dias(r.data, hoje), f = FASE[r.status]; return (
        <div key={r.id} className="crq-l" onClick={() => setFrame(r)}>
          <span className="crq-t">{r.titulo || r.tipo}<small>#{r.id} · {r.tipo} · {r.setor}{r.fornecedor ? ` · ${r.fornecedor}` : ''}{r.os ? ` · ${r.os}` : ''}</small></span>
          <span className="crq-p">{nomeBonito(r.pessoa)}<small>{dataBR(r.data)}</small></span>
          <span>{f ? <em className="crq-f" style={{ background: `${f.cor}17`, color: f.cor }}>{f.nome}</em> : null}{f?.aberta ? <small className={`crq-d${x > 30 ? ' velha' : ''}`}>há {plural(x, 'dia', 'dias')}</small> : null}</span>
          <b className="crq-v">{r.valor ? brl(r.valor) : <span className="cfr-man-sv">sem valor</span>}</b>
        </div>
      ) })}
      {!rs.length && <div className="ce-mudo">Nenhuma requisição.</div>}
      {frame && <JanelaFrame titulo={`Requisição ${frame.id}`} sub={frame.titulo} src={`/requisicoes/imprimir/${frame.id}`} onFechar={() => setFrame(null)} />}
    </>
  )
}

function JanelaReqs({ titulo, rs, hoje, onFechar }: { titulo: string; rs: Req[]; hoje: string; onFechar: () => void }) {
  return (
    <div className="cmw-fundo cml-janela-fundo cmp-fundo" onClick={onFechar}>
      <div className="cml-janela cmp-janela" onClick={(e) => e.stopPropagation()}>
        <div className="cml-janela-cab"><h3>{titulo}</h3><span>{plural(rs.length, 'requisição', 'requisições')} · {compacto(soma(rs))}</span><button className="cma-x" onClick={onFechar} aria-label="Fechar"><i className="fas fa-xmark" /></button></div>
        <div className="cml-janela-corpo"><ListaReqs rs={[...rs].sort((a, b) => b.valor - a.valor)} hoje={hoje} /></div>
      </div>
    </div>
  )
}

export const CSS_CRQ = `
.crq-rank{display:flex;flex-direction:column;gap:4px}
.ce .crq-rk{display:grid;grid-template-columns:22px 38px 1fr auto;align-items:center;gap:12px;padding:9px 8px;border-radius:12px;cursor:pointer;text-align:left;font-family:inherit}
.ce .crq-rk:hover{background:#f8fafc}
.crq-rk-n{font-size:13px;color:#94a3b8;text-align:right;font-variant-numeric:tabular-nums}
.crq-rk-av{width:38px;height:38px;border-radius:99px;display:grid;place-items:center;font-size:13px;font-weight:600}
.crq-rk-t{display:flex;flex-direction:column;min-width:0;gap:2px}
.crq-rk-t b{font-size:14.5px;font-weight:500;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.crq-rk-t small{font-size:12px;color:#64748b}
.crq-rk-bar{display:block;height:4px;border-radius:99px;background:#f1f5f9;overflow:hidden;margin-top:3px}
.crq-rk-bar span{display:block;height:100%;border-radius:99px}
.crq-rk-v{font-size:15px;font-weight:500;color:#0f172a;font-variant-numeric:tabular-nums;white-space:nowrap}
.crq-comp{display:flex;height:14px;border-radius:99px;overflow:hidden;gap:2px;margin-bottom:10px}
.crq-comp span{display:block;min-width:3px}
.ce .crq-tp{width:100%;display:grid;grid-template-columns:12px 1fr 48px auto;align-items:center;gap:12px;padding:10px 8px;border-bottom:1px solid #f1f5f9;cursor:pointer;text-align:left;font-family:inherit}
.ce .crq-tp:hover{background:#f8fafc}
.crq-tp i{width:12px;height:12px;border-radius:4px}
.crq-tp-t{display:flex;flex-direction:column;min-width:0}
.crq-tp-t b{font-size:14px;font-weight:500;color:#0f172a}
.crq-tp-t small{font-size:12px;color:#64748b}
.crq-tp-p{font-size:13px;color:#475569;text-align:right;font-variant-numeric:tabular-nums}
.crq-l{display:grid;grid-template-columns:minmax(220px,1.8fr) minmax(140px,1fr) 170px 100px;align-items:center;gap:14px;padding:10px 6px;border-bottom:1px solid #f1f5f9;cursor:pointer}
.crq-l:hover{background:#f8fafc}
.crq-t,.crq-p{display:flex;flex-direction:column;min-width:0;font-size:14px;color:#0f172a}
.crq-t small,.crq-p small{font-size:12px;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.crq-f{font-style:normal;font-size:12px;font-weight:500;border-radius:99px;padding:2px 9px;margin-right:6px}
.crq-d{font-size:12px;color:#64748b}
.crq-d.velha{color:#dc2626;font-weight:500}
.crq-v{text-align:right;font-weight:500;font-variant-numeric:tabular-nums}
.ce .cpv-sel{background:#eff6ff}
@media (max-width:800px){.crq-l{grid-template-columns:1fr auto;gap:6px 10px}.crq-t{grid-column:1/-1}}
`
