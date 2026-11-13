'use client'
// Tela cheia de DESPESAS do Comercial (/empresa). José, 12/11: botões clicáveis que mostram tudo (e o PDF da nota numa
// janela), "Para onde foi o dinheiro" em pizza com bloquinhos clicáveis, a parte das despesas gerais bem explicada,
// "Cada conta" melhor, Faturou × Despesas com cores melhores e comparando meses e anos, mês num seletor só.
// Serve para qualquer setor (prop `setor`): o Pós-Vendas usa a mesma tela (José, 12/11: "pega de referência o estilo e
// a forma que foi distribuído no Comercial").
// Dados: /api/empresa/dre-gerencial?meses=24 (gravado) e /api/empresa/dre-lancamentos (lançamentos de cada número).
import { useEffect, useMemo, useState } from 'react'
import { authHeaders } from '@/lib/auth/client'
import type { LinhasDre } from '@/lib/empresa/dre-gerencial'
import { compacto, brl, cap, nomeMes, mesCurto, contaMes, type MesDre } from './comercial'
import { TelaCheia, Secao } from './comercial-assuntos'
import { useJson, adiantar } from './comercial-telas'

export type SetorD = 'comercial' | 'posvendas' | 'pecas'
const NOME_S: Record<SetorD, string> = { comercial: 'Comercial', posvendas: 'Pós-Vendas', pecas: 'Peças' }
const CUSTO_S: Record<SetorD, [string, string]> = {
  comercial: ['Custo das máquinas', 'O que a empresa pagou nas máquinas que foram vendidas no mês (o custo de cada nota de venda).'],
  posvendas: ['Custo do serviço', 'O que a empresa pagou nas peças e serviços de terceiros usados nas OS do mês.'],
  pecas: ['Custo das peças', 'O que a empresa pagou nas peças que foram vendidas no mês.'],
}
type MesG = Omit<MesDre, 'setores'> & { setores: Record<string, LinhasDre>; geral?: LinhasDre; parteReceita?: Record<string, number> }
type LinhaLanc = 'todas' | 'custos' | 'deducoes' | 'despesas' | 'geral'
const COR = { faturou: '#2563eb', despesas: '#f97316', ficou: '#16a34a', faltou: '#dc2626' }
const partesDe = (S: SetorD): Record<string, { linha: LinhaLanc; cor: string; nome: string; explica: string }> => ({
  custo: { linha: 'custos', cor: '#ef4444', nome: CUSTO_S[S][0], explica: CUSTO_S[S][1] },
  impostos: { linha: 'deducoes', cor: '#f59e0b', nome: 'Impostos e devoluções', explica: 'Impostos sobre as vendas, devoluções e descontos dados na nota.' },
  setor: { linha: 'despesas', cor: '#8b5cf6', nome: `Despesas do ${NOME_S[S]}`, explica: `Gastos lançados no departamento ${NOME_S[S]}: pessoal, combustível, ferramentas, juros, etc.` },
  gerais: { linha: 'geral', cor: '#64748b', nome: 'Parte das despesas gerais', explica: 'Despesas da empresa toda (administração, pessoal sem setor, banco…). Cada setor leva uma parte do tamanho do que vendeu.' },
})

export function TelaDespesasNova({ mesesBase, onFechar, setor: S = 'comercial' }: { mesesBase: Array<{ mes: string; parcial?: boolean; setores: object }>; onFechar: () => void; setor?: SetorD }) {
  const PARTES = partesDe(S), NS = NOME_S[S]
  const { d: dre24 } = useJson<{ meses: MesG[] }>('/api/empresa/dre-gerencial?meses=24')
  const meses = (dre24?.meses?.length ? dre24.meses : mesesBase) as MesG[]
  const [mesEsc, setMes] = useState('')
  const mes = mesEsc && meses.some((x) => x.mes === mesEsc) ? mesEsc : meses[meses.length - 1]?.mes || ''
  const [jan, setJan] = useState<{ titulo: string; linha: LinhaLanc; conta?: string; explica?: string; mes: string; setor: SetorD } | null>(null)
  const m = meses.find((x) => x.mes === mes)
  // as janelas do mês escolhido já ficam prontas antes do clique (lidas da tabela)
  useEffect(() => { if (mes) for (const ln of ['todas', 'custos', 'deducoes', 'despesas', 'geral']) adiantar(urlLanc(S, mes, ln)) }, [mes, S])
  if (!m) return <TelaCheia titulo={`Custos e despesas do ${NS}`} onFechar={onFechar}><div className="cma-vazio">Carregando o DRE…</div></TelaCheia>
  const l = m.setores[S], x = contaMes(l)
  const idx = meses.findIndex((q) => q.mes === mes)
  const geralTot = m.geral ? Math.max(0, -(m.geral.receita + m.geral.deducoes + m.geral.custos + m.geral.outrasReceitas + m.geral.despesas)) : null
  const parte = m.parteReceita?.[S] ?? null
  const abre = (k: string) => setJan({ titulo: PARTES[k].nome, linha: PARTES[k].linha, explica: PARTES[k].explica, mes, setor: S })
  const partes = x.partes.map((p) => ({ ...p, cor: PARTES[p.k]?.cor || p.cor, nome: PARTES[p.k]?.nome || p.nome }))
  return (
    <TelaCheia titulo={`Custos e despesas do ${NS}`} sub={`${cap(nomeMes(mes, true))}${m.parcial ? ' · até hoje' : ''}`} onFechar={onFechar}>
      <div className="cdp-mes">
        <button className="cma-x" disabled={idx <= 0} onClick={() => setMes(meses[idx - 1].mes)} title="Mês anterior"><i className="fas fa-chevron-left" /></button>
        <select value={mes} onChange={(e) => setMes(e.target.value)}>{[...meses].reverse().map((q) => <option key={q.mes} value={q.mes}>{cap(nomeMes(q.mes, true))}{q.parcial ? ' (até hoje)' : ''}</option>)}</select>
        <button className="cma-x" disabled={idx >= meses.length - 1} onClick={() => setMes(meses[idx + 1].mes)} title="Próximo mês"><i className="fas fa-chevron-right" /></button>
      </div>

      <div className="cdp-cards">
        <button className="cmt-kpi cmt-kpi-bt" onClick={() => setJan({ titulo: `Custos e despesas do ${NS}`, linha: 'todas', mes, setor: S })}><small>Custos + despesas (tudo que saiu)</small><b style={{ color: COR.faltou }}>{compacto(x.gastou)}</b><em>{x.faturou ? `${Math.round((x.gastou / x.faturou) * 100)}% do que vendeu (${compacto(x.faturou)})` : ''}</em></button>
        {partes.filter((p) => p.k !== 'gerais').map((p) => (
          <button key={p.k} className="cmt-kpi cmt-kpi-bt" onClick={() => abre(p.k)}><small><i className="cdp-dot" style={{ background: p.cor }} />{p.nome}</small><b>{compacto(p.valor)}</b><em>{x.gastou ? `${Math.round((p.valor / x.gastou) * 100)}% do que gastou` : ''}</em></button>
        ))}
      </div>

      {Math.max(0, -l.rateio) > 0.5 && (
        <button className="cdp-geral" onClick={() => abre('gerais')}>
          <span className="cdp-geral-ic"><i className="fas fa-building" /></span>
          <span className="cdp-geral-txt">
            <small>Parte das despesas gerais da empresa</small>
            <b>{compacto(-l.rateio)}</b>
            <em>{parte != null && geralTot != null ? <>O {NS} vendeu <strong>{Math.round(parte * 100)}%</strong> de tudo que a empresa vendeu em {nomeMes(mes)}, então leva <strong>{Math.round(parte * 100)}%</strong> das despesas gerais (administração, pessoal sem setor, banco…), que somaram <strong>{compacto(geralTot)}</strong>.</> : 'Despesas da empresa toda divididas entre os setores pelo tanto que cada um vendeu.'}</em>
          </span>
          <span className="cdp-geral-ver">ver o que entra <i className="fas fa-arrow-right" /></span>
        </button>
      )}

      <div className="cmt-dois">
        <Secao titulo="Para onde foi o dinheiro" sub={`de cada R$ 100 vendidos em ${nomeMes(mes)}`}>
          <PizzaGasto partes={partes} faturou={x.faturou} resultado={x.resultado} onParte={abre} nome={NS} />
        </Secao>
        <Secao titulo="Cada conta" sub="clique para ver os lançamentos">
          <ContasDre l={l} S={S} onConta={(conta) => setJan({ titulo: conta.replace(/^\s*[\d.]+\s*/, ''), linha: 'todas', conta, mes, setor: S })} />
        </Secao>
      </div>

      <Secao titulo="Faturou × despesas" sub="clique num mês para ver as despesas dele">
        <GraficoAnos meses={meses} mes={mes} setMes={setMes} S={S} />
      </Secao>

      {jan && <JanelaLanc {...jan} onFechar={() => setJan(null)} />}
    </TelaCheia>
  )
}

/** pizza "para onde foi o dinheiro" + bloquinhos clicáveis */
function PizzaGasto({ partes, faturou, resultado, onParte, nome }: { nome: string; partes: Array<{ k: string; nome: string; valor: number; cor: string }>; faturou: number; resultado: number; onParte: (k: string) => void }) {
  const [sobre, setSobre] = useState<string | null>(null)
  const fatias = [...partes, ...(resultado > 0 ? [{ k: 'ficou', nome: 'Ficou para a empresa', valor: resultado, cor: COR.ficou }] : [])]
  const total = fatias.reduce((a, f) => a + f.valor, 0) || 1
  const R = 54, C = 2 * Math.PI * R
  let acc = 0
  const at = fatias.find((f) => f.k === sobre)
  return (
    <div className="cdp-pz">
      <svg viewBox="0 0 140 140" className="cmpz-svg">
        {fatias.map((f) => {
          const fr = f.valor / total, dash = fr * C, off = -acc * C
          acc += fr
          return <circle key={f.k} cx="70" cy="70" r={R} fill="none" stroke={f.cor} strokeWidth={sobre === f.k ? 22 : 18} strokeDasharray={`${dash} ${C - dash}`} strokeDashoffset={off} transform="rotate(-90 70 70)"
            style={{ cursor: f.k === 'ficou' ? 'default' : 'pointer', transition: 'stroke-width .15s' }} onMouseEnter={() => setSobre(f.k)} onMouseLeave={() => setSobre(null)} onClick={() => f.k !== 'ficou' && onParte(f.k)} />
        })}
        <text x="70" y="69" textAnchor="middle" className="cdp-pz-n">{at ? `R$ ${Math.round((at.valor / Math.max(1, faturou)) * 100)}` : resultado >= 0 ? `+${compacto(resultado).replace('R$ ', '')}` : compacto(resultado).replace('R$ ', '')}</text>
        <text x="70" y="86" textAnchor="middle" className="cdp-pz-t">{at ? 'de cada R$ 100' : resultado >= 0 ? 'sobrou' : 'faltou'}</text>
      </svg>
      <div className="cdp-blocos">
        {fatias.map((f) => (
          <button key={f.k} className={`cdp-bloco${sobre === f.k ? ' on' : ''}`} disabled={f.k === 'ficou'} onMouseEnter={() => setSobre(f.k)} onMouseLeave={() => setSobre(null)} onClick={() => onParte(f.k)}>
            <i style={{ background: f.cor }} /><span>{f.nome}<small>R$ {Math.round((f.valor / Math.max(1, faturou)) * 100)} de cada R$ 100</small></span><b>{compacto(f.valor)}</b>
          </button>
        ))}
        {resultado < 0 && <div className="cdp-falta">Faltaram <b>{compacto(-resultado)}</b>: o {nome} gastou mais do que vendeu nesse mês.</div>}
      </div>
    </div>
  )
}

/** cada conta do DRE do setor, agrupada e clicável */
function ContasDre({ l, S, onConta }: { l: LinhasDre; S: SetorD; onConta: (conta: string) => void }) {
  const GC = CUSTO_S[S][0], GD = `Despesas do ${NOME_S[S]}`
  const contas = Object.entries(l.porConta || {}).filter(([, v]) => v < -0.5).map(([k, v]) => ({ k, nome: k.replace(/^\s*[\d.]+\s*/, ''), v: -v }))
  const grupo = (n: string) => (/cmc|custo/i.test(n) ? GC : /impost|dedu|devolu/i.test(n) ? 'Impostos e devoluções' : GD)
  const cor: Record<string, string> = { [GC]: '#ef4444', 'Impostos e devoluções': '#f59e0b', [GD]: '#8b5cf6' }
  const tot = contas.reduce((a, c) => a + c.v, 0) || 1
  const grupos = [GC, 'Impostos e devoluções', GD].map((g) => ({ g, itens: contas.filter((c) => grupo(c.nome) === g).sort((a, b) => b.v - a.v) })).filter((g) => g.itens.length)
  if (!grupos.length) return <div className="ce-mudo">Nenhuma despesa nesse mês.</div>
  return (
    <div className="cdp-contas">
      {grupos.map((g) => (
        <div key={g.g} className="cdp-cg">
          <div className="cdp-cg-tit"><i style={{ background: cor[g.g] }} />{g.g}<b>{compacto(g.itens.reduce((a, c) => a + c.v, 0))}</b></div>
          {g.itens.map((c) => (
            <button key={c.k} className="cdp-conta" onClick={() => onConta(c.k)}>
              <span>{c.nome}</span>
              <span className="cdp-conta-bar"><span style={{ width: `${Math.max(2, (c.v / tot) * 100)}%`, background: cor[g.g] }} /></span>
              <small>{Math.round((c.v / tot) * 100)}%</small>
              <b>{compacto(c.v)}</b>
              <i className="fas fa-chevron-right" />
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}

/** o ano mostrado, com setas para voltar e avançar (José, 12/11: "deixa só o 2026 e a seta para voltar") */
export function NavAno({ anos, ano, setAno }: { anos: string[]; ano: string; setAno: (a: string) => void }) {
  const ord = [...anos].sort(), i = ord.indexOf(ano)
  return (
    <span className="cdp-ano">
      <button className="cma-x" disabled={i <= 0} onClick={() => setAno(ord[i - 1])} title="Ano anterior"><i className="fas fa-chevron-left" /></button>
      <b>{ano}</b>
      <button className="cma-x" disabled={i >= ord.length - 1} onClick={() => setAno(ord[i + 1])} title="Próximo ano"><i className="fas fa-chevron-right" /></button>
    </span>
  )
}

/** faturou × despesas por mês: escolhe o ano e compara com o ano anterior */
function GraficoAnos({ meses, mes, setMes, S }: { meses: MesG[]; mes: string; setMes: (m: string) => void; S: SetorD }) {
  const anos = useMemo(() => [...new Set(meses.map((q) => q.mes.slice(0, 4)))].sort().reverse(), [meses])
  const [anoEsc, setAno] = useState('')
  const ano = anoEsc && anos.includes(anoEsc) ? anoEsc : anos[0] || ''
  const [comparar, setComparar] = useState(false)
  const porMes = new Map(meses.map((q) => [q.mes, contaMes(q.setores[S])]))
  const cols = Array.from({ length: 12 }, (_, i) => {
    const k = `${ano}-${String(i + 1).padStart(2, '0')}`, kAnt = `${Number(ano) - 1}-${String(i + 1).padStart(2, '0')}`
    return { k, atual: porMes.get(k), ant: porMes.get(kAnt) }
  })
  const max = Math.max(1, ...cols.flatMap((c) => [c.atual?.faturou || 0, c.atual?.gastou || 0, comparar ? c.ant?.faturou || 0 : 0, comparar ? c.ant?.gastou || 0 : 0]))
  const temAnt = cols.some((c) => c.ant)
  return (
    <div className="cdp-g">
      <div className="cdp-g-ctrl">
        <NavAno anos={anos} ano={ano} setAno={setAno} />
        {temAnt && <label className="cdp-comp"><input type="checkbox" checked={comparar} onChange={(e) => setComparar(e.target.checked)} /> comparar com {Number(ano) - 1}</label>}
        <span className="cdp-g-leg"><span><i style={{ background: COR.faturou }} />Faturou</span><span><i style={{ background: COR.despesas }} />Despesas</span>{comparar && <span><i className="ant" />{Number(ano) - 1}</span>}</span>
      </div>
      <div className="cdp-g-cols">
        {cols.map((c) => {
          const at = c.atual
          return (
            <button key={c.k} className={`cdp-g-col${c.k === mes ? ' on' : ''}`} disabled={!at} onClick={() => at && setMes(c.k)}>
              <span className="cdp-g-barras">
                {comparar && <span className="ant" style={{ height: `${((c.ant?.faturou || 0) / max) * 100}%` }} title={c.ant ? `${Number(ano) - 1}: faturou ${brl(c.ant.faturou)}` : ''} />}
                <span style={{ height: `${((at?.faturou || 0) / max) * 100}%`, background: COR.faturou }} title={at ? `Faturou ${brl(at.faturou)}` : ''} />
                <span style={{ height: `${((at?.gastou || 0) / max) * 100}%`, background: COR.despesas }} title={at ? `Despesas ${brl(at.gastou)}` : ''} />
                {comparar && <span className="ant" style={{ height: `${((c.ant?.gastou || 0) / max) * 100}%` }} title={c.ant ? `${Number(ano) - 1}: despesas ${brl(c.ant.gastou)}` : ''} />}
              </span>
              <b className={at ? (at.resultado >= 0 ? 'bom' : 'ruim') : ''}>{at ? `${at.resultado >= 0 ? '+' : '−'}${compacto(Math.abs(at.resultado)).replace('R$ ', '')}` : ''}</b>
              {comparar && c.ant && <em className={c.ant.resultado >= 0 ? 'bom' : 'ruim'}>{c.ant.resultado >= 0 ? '+' : '−'}{compacto(Math.abs(c.ant.resultado)).replace('R$ ', '')}</em>}
              <small>{mesCurto(c.k)}</small>
            </button>
          )
        })}
      </div>
      <p className="cma-nota">Embaixo de cada mês, o que sobrou (verde) ou faltou (vermelho){comparar ? `; em cinza, o mesmo mês de ${Number(ano) - 1}` : ''}.</p>
    </div>
  )
}

/** lançamentos de um número (linha ou conta) do mês, com a nota em PDF */
const urlLanc = (setor: SetorD, mes: string, linha: string, conta?: string) => `/api/empresa/dre-lancamentos?${new URLSearchParams({ mes, setor, linha, ...(conta ? { conta } : {}) })}`
type Lanc = { nome: string; data: string; valor: number; categoria: string; detalhe: string; doc: string; origem: string; departamento: string; conta: string; empresa: string; linha?: string }
// o que é cada lançamento, em palavra simples (José, 12/11: "esse trator não é despesa, é custo")
const TIPO_LANC: Record<string, { nome: string; cor: string }> = {
  custos: { nome: 'Custo do que foi vendido', cor: '#dc2626' }, deducoes: { nome: 'Imposto / devolução', cor: '#d97706' },
  despesas: { nome: 'Despesa', cor: '#7c3aed' }, outrasReceitas: { nome: 'Despesa', cor: '#7c3aed' },
}
const tipoDe = (i: Lanc) => TIPO_LANC[i.linha || '']
/** porTipo = "Gastou no total": separa custo × imposto × despesa; senão a categoria (N/D vira o tipo) */
const catDe = (i: Lanc, porTipo: boolean) => {
  const c = (i.categoria || i.conta || '').replace(/\*$/, '')
  return porTipo ? tipoDe(i)?.nome || c : !c || /^n\/?d$/i.test(c) ? tipoDe(i)?.nome || 'Outros' : c
}
function JanelaLanc({ titulo, linha, conta, explica, mes, setor, onFechar }: { titulo: string; linha: LinhaLanc; conta?: string; explica?: string; mes: string; setor: SetorD; onFechar: () => void }) {
  const { d, erro } = useJson<{ itens: Lanc[]; total: number; qtd: number; parteReceita: number | null }>(urlLanc(setor, mes, linha, conta))
  const [cat, setCat] = useState<string | null>(null)
  const [nota, setNota] = useState<{ numero: string; empresa: string; nome: string } | null>(null)
  useEffect(() => { const t = (e: KeyboardEvent) => { if (e.key === 'Escape' && !nota) onFechar() }; window.addEventListener('keydown', t); return () => window.removeEventListener('keydown', t) }, [onFechar, nota])
  const porTipo = linha === 'todas' && !conta
  const cats = d ? [...d.itens.reduce((mp, i) => mp.set(catDe(i, porTipo), (mp.get(catDe(i, porTipo)) || 0) + Math.abs(i.valor)), new Map<string, number>()).entries()].sort((a, b) => b[1] - a[1]) : []
  const lista = (d?.itens || []).filter((i) => !cat || catDe(i, porTipo) === cat)
  return (
    <div className="cmw-fundo cml-janela-fundo cmp-fundo" onClick={onFechar}>
      <div className="cml-janela cmp-janela" onClick={(e) => e.stopPropagation()}>
        <div className="cml-janela-cab"><h3>{titulo}</h3><span>{cap(nomeMes(mes, true))}{d ? ` · ${d.qtd} lançamentos · ${compacto(Math.abs(d.total))}` : ''}</span><button className="cma-x" onClick={onFechar} aria-label="Fechar"><i className="fas fa-xmark" /></button></div>
        <div className="cml-janela-corpo">
          {explica && <div className="cmx-explica">{explica}{linha === 'geral' && d?.parteReceita != null ? <> Os valores abaixo são da empresa toda; o {NOME_S[setor]} leva <b>{Math.round(d.parteReceita * 100)}%</b> deles.</> : null}</div>}
          {erro && <div className="cm-aviso">{erro}</div>}
          {!d && !erro && <div className="ce-mudo">Lendo os lançamentos…</div>}
          {cats.length > 1 && (
            <div className="cmdp-chips">
              <button className={!cat ? 'on' : ''} onClick={() => setCat(null)}>Todas</button>
              {cats.slice(0, 14).map(([c, v]) => <button key={c} className={cat === c ? 'on' : ''} onClick={() => setCat(cat === c ? null : c)}>{c}<b>{compacto(v)}</b></button>)}
            </div>
          )}
          <div className="cmdp-lista">
            {lista.map((i, k) => (
              <div key={k} className="cmdp-l cdp-lanc">
                <span className="cmdp-o">{i.nome}<small>{tipoDe(i) && <em className="cdp-tipo" style={{ color: tipoDe(i).cor }}>{tipoDe(i).nome}</em>}{[i.data, catDe(i, false) === tipoDe(i)?.nome ? '' : catDe(i, false), i.detalhe, i.departamento, i.empresa === 'castro' ? 'Castro' : ''].filter(Boolean).join(' · ')}</small></span>
                <b>{brl(Math.abs(i.valor))}</b>
                {i.doc && /\d/.test(i.doc) ? <button className="cmnf-bt" onClick={() => setNota({ numero: i.doc.split('/')[0].trim(), empresa: i.empresa, nome: i.nome })}><i className="fas fa-file-pdf" /> nota {i.doc.split('/')[0].trim()}</button> : <span className="cdp-semdoc">sem nota</span>}
              </div>
            ))}
            {d && !lista.length && <div className="ce-mudo">Nenhum lançamento.</div>}
          </div>
        </div>
      </div>
      {nota && <JanelaNotaNumero {...nota} onFechar={() => setNota(null)} />}
    </div>
  )
}

function JanelaNotaNumero({ numero, empresa, nome, onFechar }: { numero: string; empresa: string; nome: string; onFechar: () => void }) {
  const [url, setUrl] = useState<string | null>(null), [erro, setErro] = useState<string | null>(null)
  useEffect(() => {
    let vivo = true, criado: string | null = null
    ;(async () => {
      try {
        const r = await fetch(`/api/empresa/nota-numero?conta=${empresa}&numero=${encodeURIComponent(numero)}&nome=${encodeURIComponent(nome)}`, { headers: await authHeaders() })
        if (!r.ok) { const j = await r.json().catch(() => ({})); if (vivo) setErro(j.erro || `Erro ${r.status}`); return }
        criado = URL.createObjectURL(await r.blob())
        if (vivo) setUrl(criado)
      } catch { if (vivo) setErro('Não deu para buscar a nota agora.') }
    })()
    return () => { vivo = false; if (criado) URL.revokeObjectURL(criado) }
  }, [numero, empresa, nome])
  return (
    <div className="cmw-fundo cmpdf-fundo" onClick={(e) => { e.stopPropagation(); onFechar() }}>
      <div className="cmpdf" onClick={(e) => e.stopPropagation()}>
        <div className="cml-janela-cab"><h3>Nota nº {numero}</h3><span>{nome}</span>{url && <a className="cm-bt" href={url} download={`NF_${numero}.pdf`}><i className="fas fa-download" /> Baixar</a>}<button className="cma-x" onClick={onFechar} aria-label="Fechar"><i className="fas fa-xmark" /></button></div>
        {url ? <iframe className="cmpdf-frame" src={url} title="Nota" /> : <div className="cmnf-msg">{erro || 'Abrindo a nota…'}</div>}
      </div>
    </div>
  )
}

export const CSS_CDP = `
.cdp-mes{display:flex;align-items:center;gap:8px;align-self:flex-start}
.cdp-mes select{padding:8px 12px;border:1px solid #cbd5e1;border-radius:12px;font:inherit;font-size:15px;background:#fefefe;color:#0f172a;min-width:220px}
.cdp-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}
.cdp-dot{display:inline-block;width:9px;height:9px;border-radius:3px;margin-right:6px}
.ce .cdp-geral{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:18px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:18px;padding:18px 22px;cursor:pointer;text-align:left;font-family:inherit}
.ce .cdp-geral:hover{border-color:#64748b;box-shadow:0 12px 26px -20px rgba(15,23,42,.6)}
.cdp-geral-ic{width:48px;height:48px;border-radius:14px;background:#e2e8f0;color:#475569;display:grid;place-items:center;font-size:20px}
.cdp-geral-txt{display:flex;flex-direction:column;gap:2px}
.cdp-geral-txt small{font-size:13px;color:#64748b}
.cdp-geral-txt > b{font-size:30px;font-weight:500;color:#0f172a;font-variant-numeric:tabular-nums}
.cdp-geral-txt em{font-style:normal;font-size:14.5px;color:#334155;line-height:1.5;max-width:900px}
.cdp-geral-txt strong{font-weight:600;color:#0f172a}
.cdp-geral-ver{font-size:13.5px;font-weight:500;color:#475569;white-space:nowrap}
.cdp-pz{display:flex;align-items:center;gap:18px}
.cdp-pz .cmpz-svg{width:180px;height:180px;flex:none}
.cdp-pz-n{font-size:17px;font-weight:600;fill:#0f172a}
.cdp-pz-t{font-size:10.5px;fill:#64748b}
.cdp-tipo{font-style:normal;font-weight:600;margin-right:8px}
.cdp-blocos{flex:1;display:flex;flex-direction:column;gap:6px;min-width:0}
.ce .cdp-bloco{display:grid;grid-template-columns:12px 1fr auto;align-items:center;gap:10px;padding:10px 12px;border:1px solid #e2e8f0;border-radius:12px;background:#fefefe;cursor:pointer;text-align:left;font-family:inherit}
.ce .cdp-bloco:hover:not(:disabled),.ce .cdp-bloco.on{border-color:#94a3b8;background:#f8fafc}
.ce .cdp-bloco:disabled{cursor:default}
.cdp-bloco i{width:12px;height:12px;border-radius:4px}
.cdp-bloco span{display:flex;flex-direction:column;font-size:14px;color:#0f172a}
.cdp-bloco small{font-size:12px;color:#64748b}
.cdp-bloco b{font-size:15px;font-weight:500;color:#0f172a;font-variant-numeric:tabular-nums}
.cdp-falta{font-size:13px;color:#b91c1c;padding:4px 2px}
.cdp-falta b{font-weight:600}
.cdp-contas{display:flex;flex-direction:column;gap:10px}
.cdp-cg-tit{display:flex;align-items:center;gap:8px;font-size:12.5px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:#64748b;padding:2px 4px}
.cdp-cg-tit i{width:10px;height:10px;border-radius:3px}
.cdp-cg-tit b{margin-left:auto;font-size:13px;color:#0f172a;letter-spacing:0}
.ce .cdp-conta{width:100%;display:grid;grid-template-columns:minmax(150px,1fr) 1fr 40px 90px 12px;align-items:center;gap:12px;padding:9px 6px;border-bottom:1px solid #f1f5f9;cursor:pointer;text-align:left;font-family:inherit;font-size:14px;color:#0f172a}
.ce .cdp-conta:hover{background:#f8fafc}
.cdp-conta-bar{height:8px;background:#f1f5f9;border-radius:99px;overflow:hidden}
.cdp-conta-bar span{display:block;height:100%;border-radius:99px}
.cdp-conta small{font-size:12px;color:#64748b;text-align:right}
.cdp-conta b{font-weight:500;text-align:right;font-variant-numeric:tabular-nums}
.cdp-conta i{font-size:10px;color:#94a3b8}
.cdp-g{display:flex;flex-direction:column;gap:10px}
.cdp-g-ctrl{display:flex;align-items:center;gap:14px;flex-wrap:wrap}
.cdp-g-ctrl .cm-abas{margin:0}
.cdp-ano{display:flex;align-items:center;gap:10px}
.cdp-ano b{font-size:18px;font-weight:600;color:#0f172a;min-width:48px;text-align:center;font-variant-numeric:tabular-nums}
.cdp-comp{display:flex;align-items:center;gap:6px;font-size:13.5px;color:#334155;cursor:pointer}
.cdp-g-leg{margin-left:auto;display:flex;gap:14px;font-size:12.5px;color:#475569}
.cdp-g-leg i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px}
.cdp-g-leg i.ant,.cdp-g-barras span.ant{background:repeating-linear-gradient(45deg,#cbd5e1 0 3px,#e2e8f0 3px 6px)}
.cdp-g-cols{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:8px;height:280px}
.ce .cdp-g-col{display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:3px;border-radius:12px;padding:6px 2px;cursor:pointer;font-family:inherit}
.ce .cdp-g-col:hover:not(:disabled){background:#f8fafc}
.ce .cdp-g-col.on{background:#eff6ff;box-shadow:inset 0 0 0 1px #93c5fd}
.ce .cdp-g-col:disabled{cursor:default}
.cdp-g-barras{flex:1;width:100%;display:flex;align-items:flex-end;justify-content:center;gap:2px}
.cdp-g-barras span{width:min(16px,24%);border-radius:5px 5px 2px 2px;min-height:0;animation:btCresce .7s cubic-bezier(.22,1,.36,1) both;transform-origin:bottom}
.cdp-g-col b,.cdp-g-col em{font-size:12px;font-weight:600;font-style:normal;font-variant-numeric:tabular-nums;white-space:nowrap}
.cdp-g-col em{font-weight:500;opacity:.6}
.cdp-g-col .bom{color:#15803d}.cdp-g-col .ruim{color:#dc2626}
.cdp-g-col small{font-size:12px;color:#475569}
.ce .cdp-lanc{grid-template-columns:1fr auto auto;cursor:default}
.cdp-semdoc{font-size:12px;color:#94a3b8;white-space:nowrap}
@media (max-width:760px){.cdp-pz{flex-direction:column}.ce .cdp-geral{grid-template-columns:1fr}.cdp-geral-ic{display:none}.ce .cdp-conta{grid-template-columns:1fr 70px 12px}.cdp-conta-bar,.cdp-conta small{display:none}.cdp-g-cols{gap:2px;height:220px}.cdp-g-col b,.cdp-g-col em{display:none}.cdp-g-leg{margin-left:0}}
`
