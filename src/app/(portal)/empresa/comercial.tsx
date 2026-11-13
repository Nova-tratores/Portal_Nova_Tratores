'use client'
// Área COMERCIAL da tela do diretor (/empresa), José 11/11: vendas de tratores e implementos, estoque, propostas e
// vendedores — no "guia de apresentação para leigo": cada cartão é uma conclusão com um número, uma linha concreta e a
// ação; o detalhe fica na janela. Dados: /api/empresa/comercial (src/lib/empresa/comercial.ts).
import { useState, type ReactNode } from 'react'
import { authHeaders } from '@/lib/auth/client'
import type { LinhasDre } from '@/lib/empresa/dre-gerencial'
import { PainelAssuntos } from './comercial-assuntos'
import type { DadosComercial, MetaVendedor, PropostaCm, TipoMaq, VendaMaq } from '@/lib/empresa/comercial'

export type JanelaCm = 'vendas' | 'estoque' | 'propostas' | 'vendedores'

export const compacto = (v: number) => {
  const a = Math.abs(v), s = v < 0 ? '−' : ''
  if (a >= 1e6) return `${s}R$ ${(a / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} mi`
  if (a >= 1e3) return `${s}R$ ${Math.round(a / 1e3).toLocaleString('pt-BR')} mil`
  return `${s}R$ ${Math.round(a).toLocaleString('pt-BR')}`
}
export const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
export const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)
export const nomeMes = (k: string, ano = false) => (/^\d{4}-\d{2}$/.test(k || '') ? new Date(`${k}-15T12:00:00`).toLocaleDateString('pt-BR', ano ? { month: 'long', year: 'numeric' } : { month: 'long' }) : '…')
const mesAtual = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
export const plural = (n: number, um: string, varios: string) => `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`
export const TIPO_NOME: Record<TipoMaq, string> = { trator: 'Tratores', implemento: 'Implementos e outras máquinas', precisao: 'GPS e agricultura de precisão' }
export const TIPO_UM: Record<TipoMaq, string> = { trator: 'Trator', implemento: 'Implemento', precisao: 'GPS / precisão' }

/** "1 trator e 3 implementos" (o que tiver) */
export function frasePecas(tr: number, im: number): string {
  const p = [tr ? plural(tr, 'trator', 'tratores') : '', im ? plural(im, 'implemento', 'implementos') : ''].filter(Boolean)
  return p.length ? p.join(' e ') : 'nenhuma máquina'
}
export const contar = (l: VendaMaq[], t: TipoMaq) => l.filter((v) => v.tipo === t).reduce((a, v) => a + v.qtd, 0)
/** só as vendas dos últimos 12 meses (a rota traz desde 2022 para a Vendas por modelo por ano) */
export const ult12 = (d: DadosComercial) => d.vendas.filter((v) => d.meses.includes(v.mes))
export const somar = (l: Array<{ valor: number }>) => l.reduce((a, v) => a + v.valor, 0)

// ── as contas (iguais no cartão e na janela) ─────────────────────────────────
export function contas(d: DadosComercial) {
  const mes = mesAtual()
  const ant = d.meses[d.meses.indexOf(mes) - 1] || d.meses[d.meses.length - 2]
  const doMes = d.vendas.filter((v) => v.mes === mes), doAnt = d.vendas.filter((v) => v.mes === ant)
  const est = d.estoque
  const estQtd = est.filter((e) => e.tipo !== 'precisao').reduce((a, e) => a + e.qtd, 0)
  const abertas = d.propostas.filter((p) => p.aberta)
  // vendedores: máquinas vendidas nos últimos 3 meses (mês atual e os 2 anteriores)
  const tres = d.meses.slice(-3)
  const porVend = new Map<string, VendaMaq[]>()
  for (const v of d.vendas.filter((x) => tres.includes(x.mes))) { const k = v.vendedor || '(sem vendedor no pedido)'; porVend.set(k, [...(porVend.get(k) || []), v]) }
  const ranking = [...porVend.entries()].map(([nome, l]) => ({ nome, l, valor: somar(l) })).sort((a, b) => b.valor - a.valor)
  // metas do mês: vale a última gravada até este mês (0 = sem meta)
  const metaDe = (nome: string) => d.metas.filter((m) => m.vendedor === nome && m.mes <= mes).sort((a, b) => a.mes.localeCompare(b.mes)).pop()?.valor || 0
  const nomesMeta = [...new Set([...d.vendedores, ...ranking.map((r) => r.nome).filter((n) => !n.startsWith('(')), ...d.metas.map((m) => m.vendedor)])]
  const metas = nomesMeta.map((nome) => ({ nome, meta: metaDe(nome), vendeu: somar(doMes.filter((v) => v.vendedor === nome)) }))
    .sort((a, b) => b.meta - a.meta || b.vendeu - a.vendeu || a.nome.localeCompare(b.nome))
  const metaEquipe = metas.reduce((a, m) => a + m.meta, 0)
  return { mes, ant, doMes, doAnt, est, estQtd, abertas, tres, ranking, metas, metaEquipe }
}

// ── a área Comercial: cartões por assunto (escolhido pelo José em 11/11 entre as opções A–L) ──
export function PainelComercial({ d, setD, dreG }: { d: DadosComercial | null; setD?: SetD; erro?: string | null; dreG?: MesDre[] | null }) {
  return <PainelAssuntos d={d} setD={setD} dreG={dreG || null} />
}

// ── conta do mês do Comercial pelo DRE gerencial (usada pelos cartões por assunto) ──────────
// José, 11/11: "logo de cara quanto faturou e as despesas; ao clicar abre tela cheia com tudo certinho; clicando no
// faturamento mostra quem vendeu" + "algo meio PowerPoint, uma página mostra uma coisa de cada vez".
// Faturou/despesas/resultado = DRE GERENCIAL do Comercial (src/lib/empresa/dre-gerencial.ts); quem vendeu, estoque,
// propostas e metas = /api/empresa/comercial.
export type MesDre = { mes: string; parcial?: boolean; setores: { comercial: LinhasDre } }
export const COR_ENTROU = '#0369a1', COR_SAIU = '#be123c', COR_FICOU = '#15803d'

/** a conta do mês, em positivo (o DRE guarda as saídas negativas) */
export function contaMes(l: LinhasDre) {
  const custo = Math.max(0, -l.custos), impostos = Math.max(0, -l.deducoes), setor = Math.max(0, -(l.despesas + l.outrasReceitas)), gerais = Math.max(0, -l.rateio)
  const gastou = l.receita - l.resultado
  return {
    faturou: l.receita, gastou, resultado: l.resultado,
    partes: [
      { k: 'custo', nome: 'Custo das máquinas vendidas', valor: custo, cor: '#f87171' },
      { k: 'impostos', nome: 'Impostos e devoluções', valor: impostos, cor: '#fb923c' },
      { k: 'setor', nome: 'Despesas do Comercial', valor: setor, cor: '#a78bfa' },
      { k: 'gerais', nome: 'Parte das despesas gerais da empresa', valor: gerais, cor: '#94a3b8' },
    ].filter((p) => p.valor > 0.5),
  }
}

export const mesCurto = (k: string) => new Date(`${k}-15T12:00:00`).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')

/** B · gráfico das vendas mês a mês em cima; embaixo, três linhas que levam ao detalhe */
// ── janelas ──────────────────────────────────────────────────────────────────
export type Grupo = { chave: string; rotulo: string; quando?: string; total: number; cor: string; itens: Array<{ k: string; tit: string; sub: string; valor: number }> }
export function Grupos({ grupos, vazio }: { grupos: Grupo[]; vazio?: string }) {
  const max = Math.max(1, ...grupos.map((g) => Math.abs(g.total)))
  if (!grupos.length) return <div className="ce-mudo">{vazio || 'Nada aqui agora.'}</div>
  return (
    <div className="kd">
      {grupos.map((g) => (
        <section key={g.chave} className="kd-dia">
          <div className="kd-cab">
            <span className="kd-data"><b>{g.rotulo}</b>{g.quando && <small>{g.quando}</small>}</span>
            <span className="kd-trilho"><span style={{ width: `${(Math.abs(g.total) / max) * 100}%`, background: g.cor }} /></span>
            <span className="kd-total" style={{ color: g.cor }}>{brl(g.total)}</span>
          </div>
          {g.itens.map((it) => (
            <div key={it.k} className="kd-item"><span className="kd-tit">{it.tit}</span><span className="kd-val">{brl(it.valor)}</span><span className="kd-sub">{it.sub}</span></div>
          ))}
        </section>
      ))}
    </div>
  )
}
function Cabeca({ titulo, valor, sub, cor }: { titulo: string; valor?: string; sub?: ReactNode; cor?: string }) {
  return (
    <div className="ce-m-cab">
      <div className="ce-m-tit">{titulo}</div>
      {valor && <div className="ce-m-val" style={{ color: cor }}>{valor}</div>}
      {sub && <div className="ce-m-sub">{sub}</div>}
    </div>
  )
}
function Abas<T extends string>({ op, v, set }: { op: Array<[T, string]>; v: T; set: (x: T) => void }) {
  return <div className="cm-abas">{op.map(([k, n]) => <button key={k} className={v === k ? 'on' : ''} onClick={() => set(k)}>{n}</button>)}</div>
}

export type SetD = (f: (x: DadosComercial | null) => DadosComercial | null) => void
export function JanelaComercial({ id, d, setD }: { id: JanelaCm; d: DadosComercial | null | undefined; setD?: SetD }) {
  const [vista, setVista] = useState<'mes' | 'modelo'>('mes')
  const [fase, setFase] = useState<'abertas' | 'fechadas'>('abertas')
  if (!d) return <><Cabeca titulo="Comercial" sub="Carregando…" /><div className="ce-m-corpo" /></>
  const c = contas(d)

  if (id === 'vendas') {
    const v12 = ult12(d), tot = somar(v12), nTr = contar(v12, 'trator'), nIm = contar(v12, 'implemento')
    const porMes: Grupo[] = [...d.meses].reverse().map((m) => {
      const l = d.vendas.filter((v) => v.mes === m)
      const ag = new Map<string, { qtd: number; valor: number; tipo: TipoMaq; quem: Set<string>; cli: Set<string> }>()
      for (const v of l) {
        const x = ag.get(v.modelo) || { qtd: 0, valor: 0, tipo: v.tipo, quem: new Set<string>(), cli: new Set<string>() }
        x.qtd += v.qtd; x.valor += v.valor; if (v.vendedor) x.quem.add(v.vendedor); if (v.cliente) x.cli.add(v.cliente)
        ag.set(v.modelo, x)
      }
      return {
        chave: m, rotulo: cap(nomeMes(m, true)), quando: m === c.mes ? `até hoje · ${frasePecas(contar(l, 'trator'), contar(l, 'implemento'))}` : frasePecas(contar(l, 'trator'), contar(l, 'implemento')),
        total: somar(l), cor: '#15803d',
        itens: [...ag.entries()].sort((a, b) => (a[1].tipo === 'trator' ? 0 : 1) - (b[1].tipo === 'trator' ? 0 : 1) || b[1].valor - a[1].valor).map(([mod, x]) => ({
          k: mod, tit: `${mod}${x.qtd > 1 ? ` · ${x.qtd} unidades` : ''}`, valor: x.valor,
          sub: [TIPO_UM[x.tipo], [...x.quem].join(', '), x.cli.size === 1 ? [...x.cli][0] : x.cli.size > 1 ? `${x.cli.size} clientes` : ''].filter(Boolean).join(' · '),
        })),
      }
    }).filter((g) => g.itens.length || g.chave === c.mes)
    const porModelo: Grupo[] = (['trator', 'implemento', 'precisao'] as TipoMaq[]).map((t) => {
      const l = ult12(d).filter((v) => v.tipo === t)
      const ag = new Map<string, { qtd: number; valor: number; ult: string }>()
      for (const v of l) { const x = ag.get(v.modelo) || { qtd: 0, valor: 0, ult: '' }; x.qtd += v.qtd; x.valor += v.valor; if (v.mes > x.ult) x.ult = v.mes; ag.set(v.modelo, x) }
      return {
        chave: t, rotulo: TIPO_NOME[t], quando: plural(l.reduce((a, v) => a + v.qtd, 0), 'vendido', 'vendidos'), total: somar(l), cor: '#15803d',
        itens: [...ag.entries()].sort((a, b) => b[1].valor - a[1].valor).map(([mod, x]) => ({ k: mod, tit: mod, valor: x.valor, sub: `${plural(x.qtd, 'vendido', 'vendidos')} · o último em ${nomeMes(x.ult)}` })),
      }
    }).filter((g) => g.itens.length)
    return (
      <><Cabeca titulo="Máquinas vendidas nos últimos 12 meses" valor={compacto(tot)} cor="#15803d"
        sub={<>{frasePecas(nTr, nIm)} · média de {compacto(tot / d.meses.length)} por mês. Cancelados e devolvidos já saíram da conta; peças não entram.</>} />
        <div className="ce-m-corpo">
          <Abas op={[['mes', 'Mês a mês'], ['modelo', 'Por modelo']]} v={vista} set={setVista} />
          <Grupos grupos={vista === 'mes' ? porMes : porModelo} />
        </div></>
    )
  }

  if (id === 'estoque') {
    const grupos: Grupo[] = (['trator', 'implemento', 'precisao'] as TipoMaq[]).map((t) => {
      const l = c.est.filter((e) => e.tipo === t).sort((a, b) => b.dias - a.dias)
      return {
        chave: t, rotulo: TIPO_NOME[t], quando: plural(l.reduce((a, e) => a + e.qtd, 0), 'unidade', 'unidades'), total: somar(l), cor: '#b45309',
        itens: l.map((e, i) => ({
          k: `${e.descricao}-${i}`, tit: `${e.modelo}${e.qtd > 1 ? ` · ${e.qtd} unidades` : ''}`, valor: e.valor,
          sub: [e.dias > 365 ? `parada há ${(e.dias / 365).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} anos` : `há ${e.dias} dias`, e.familia, e.conta === 'CASTRO' ? 'na Castro' : ''].filter(Boolean).join(' · '),
        })),
      }
    }).filter((g) => g.itens.length)
    return (
      <><Cabeca titulo="Máquinas no estoque" valor={compacto(somar(c.est))} cor="#b45309"
        sub="Pelo preço de custo. Os dias contam da data em que o produto foi cadastrado no Omie; as que estão há mais tempo aparecem primeiro." />
        <div className="ce-m-corpo"><Grupos grupos={grupos} vazio="Nenhuma máquina no estoque." /></div></>
    )
  }

  if (id === 'propostas') {
    const fechadas = d.propostas.filter((p) => p.vendida || p.perdida)
    const vend = fechadas.filter((p) => p.vendida).length, perd = fechadas.length - vend
    const desde = d.propostas.map((p) => p.criadaEm).filter(Boolean).sort()[0]
    const item = (p: PropostaCm) => ({
      k: String(p.id), tit: p.cliente, valor: p.valor,
      sub: [p.equipamento, p.vendedor || 'sem vendedor marcado', p.aberta ? `há ${p.diasNaFase} dias nesta fase` : '', p.perdida && p.motivoPerda ? `motivo: ${p.motivoPerda.toLowerCase()}` : '', p.cidade].filter(Boolean).join(' · '),
    })
    const ORDEM = ['enviar', 'banco', 'cliente']
    const fases = [...new Set(c.abertas.map((p) => p.fase))].sort((a, b) => ORDEM.findIndex((o) => a.toLowerCase().includes(o)) - ORDEM.findIndex((o) => b.toLowerCase().includes(o)))
    const gAbertas: Grupo[] = fases.map((f) => {
      const l = c.abertas.filter((p) => p.fase === f).sort((a, b) => b.valor - a.valor)
      return { chave: f, rotulo: cap(f.toLowerCase()), quando: `${plural(l.length, 'proposta', 'propostas')} · ${plural(l.filter((p) => p.diasNaFase > 30).length, 'parada', 'paradas')} há mais de 30 dias`, total: somar(l), cor: '#2563eb', itens: l.map(item) }
    })
    const gFechadas: Grupo[] = [
      { chave: 'v', rotulo: 'Viraram venda', quando: plural(vend, 'proposta', 'propostas'), total: somar(fechadas.filter((p) => p.vendida)), cor: '#15803d', itens: fechadas.filter((p) => p.vendida).sort((a, b) => b.valor - a.valor).map(item) },
      { chave: 'p', rotulo: 'Não vendemos', quando: plural(perd, 'proposta', 'propostas'), total: somar(fechadas.filter((p) => p.perdida)), cor: '#b91c1c', itens: fechadas.filter((p) => p.perdida).sort((a, b) => b.valor - a.valor).map(item) },
    ].filter((g) => g.itens.length)
    const semVend = c.abertas.filter((p) => !p.vendedor).length
    return (
      <><Cabeca titulo="Propostas comerciais" valor={compacto(somar(c.abertas))} cor="#2563eb"
        sub={<>{plural(c.abertas.length, 'proposta aberta', 'propostas abertas')}. {fechadas.length ? <>Desde {desde ? nomeMes(desde.slice(0, 7)) : 'o início'}, das {fechadas.length} que fecharam, <b>{vend} viraram venda</b> e {perd} não ({Math.round((vend / fechadas.length) * 100)}% de acerto).</> : null}{semVend ? <> {plural(semVend, 'proposta aberta está', 'propostas abertas estão')} sem vendedor marcado.</> : null}</>} />
        <div className="ce-m-corpo">
          <Abas op={[['abertas', `Abertas (${c.abertas.length})`], ['fechadas', `Fechadas (${fechadas.length})`]]} v={fase} set={setFase} />
          <Grupos grupos={fase === 'abertas' ? gAbertas : gFechadas} />
        </div></>
    )
  }

  // vendedores
  const props = (nome: string) => c.abertas.filter((p) => p.vendedor === nome)
  const grupos: Grupo[] = c.ranking.map((r) => {
    const pa = props(r.nome)
    return {
      chave: r.nome, rotulo: r.nome, total: r.valor, cor: '#7c3aed',
      quando: [frasePecas(contar(r.l, 'trator'), contar(r.l, 'implemento')), pa.length ? `${plural(pa.length, 'proposta aberta', 'propostas abertas')} (${compacto(somar(pa))})` : ''].filter(Boolean).join(' · '),
      itens: [...r.l].sort((a, b) => b.mes.localeCompare(a.mes) || b.valor - a.valor).map((v, i) => ({ k: `${v.pedido}-${i}`, tit: `${v.modelo}${v.qtd > 1 ? ` · ${v.qtd} unidades` : ''}`, valor: v.valor, sub: [cap(nomeMes(v.mes)), v.cliente || ''].filter(Boolean).join(' · ') })),
    }
  })
  // quem tem proposta aberta e não vendeu nada no período também aparece
  const semVenda = [...new Set(c.abertas.map((p) => p.vendedor).filter((n): n is string => !!n))].filter((n) => !c.ranking.some((r) => r.nome === n))
  for (const n of semVenda) {
    const pa = props(n)
    grupos.push({ chave: n, rotulo: n, total: 0, cor: '#7c3aed', quando: `nenhuma máquina vendida · ${plural(pa.length, 'proposta aberta', 'propostas abertas')} (${compacto(somar(pa))})`, itens: [] })
  }
  return (
    <><Cabeca titulo="Vendedores · últimos 3 meses" valor={compacto(somar(c.ranking))} cor="#7c3aed"
      sub={`Máquinas vendidas de ${nomeMes(c.tres[0])} até hoje, pelo vendedor do pedido no Omie. As propostas abertas são as da tela de Propostas.`} />
      <div className="ce-m-corpo">
        <Metas c={c} d={d} setD={setD} />
        <div className="cm-sec">Máquinas vendidas nos últimos 3 meses</div>
        <Grupos grupos={grupos} vazio="Nenhuma venda de máquina no período." />
      </div></>
  )
}

// metas do mês, com lápis para o diretor definir (José, 11/11: "pode deixar para definir ali")
export function Metas({ c, d, setD }: { c: ReturnType<typeof contas>; d: DadosComercial; setD?: SetD }) {
  const [editando, setEditando] = useState<string | null>(null)
  const [texto, setTexto] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const salvar = async (nome: string) => {
    // "500.000" / "500000" / "1.250.000,50"
    const valor = Number(texto.replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, ''))
    if (!texto.trim() || !Number.isFinite(valor)) { setErro('Digite o valor da meta em reais.'); return }
    setSalvando(true); setErro(null)
    try {
      const r = await fetch('/api/empresa/comercial/meta', { method: 'POST', headers: { ...(await authHeaders()), 'Content-Type': 'application/json' }, body: JSON.stringify({ vendedor: nome, valor }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setErro(j.erro || `Erro ${r.status}`); return }
      const nova: MetaVendedor = { vendedor: nome, mes: j.mes, valor, alteradoPor: null, alteradoEm: new Date().toISOString() }
      setD?.((x) => (x ? { ...x, metas: [...x.metas.filter((m) => !(m.vendedor === nome && m.mes === j.mes)), nova] } : x))
      setEditando(null)
    } catch { setErro('Não deu para salvar agora.') } finally { setSalvando(false) }
  }
  const dia = new Date().getDate(), diasMes = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate()
  const comMeta = c.metas.filter((m) => m.meta > 0)
  const metaEq = comMeta.reduce((a, m) => a + m.meta, 0), vendEq = c.metas.reduce((a, m) => a + m.vendeu, 0)
  const editor = (nome: string) => (
    <div className="cmm-ed">
      <span>R$</span>
      <input autoFocus inputMode="numeric" value={texto} placeholder="500.000" onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') salvar(nome); if (e.key === 'Escape') setEditando(null) }} />
      <button className="cm-bt cm-bt-ok" disabled={salvando} onClick={() => salvar(nome)}>{salvando ? 'Salvando…' : 'Salvar'}</button>
      <button className="cm-bt" onClick={() => setEditando(null)}>Cancelar</button>
    </div>
  )
  return (
    <div className="cmm">
      <div className="cmm-topo">
        <span>Máquinas vendidas em {nomeMes(c.mes)} (dia {dia} de {diasMes}). A meta continua valendo nos próximos meses até você trocar.</span>
        {metaEq > 0 && <span className="cmm-eq">Equipe: <b>{compacto(vendEq)}</b> de {compacto(metaEq)} · <b>{Math.round((vendEq / metaEq) * 100)}%</b></span>}
      </div>
      {!d.metasProntas && <div className="cm-aviso">Para guardar as metas falta criar a tabela no banco (sql/empresa-metas-vendedor.sql).</div>}
      {erro && <div className="cm-aviso">{erro}</div>}
      <div className="cmm-grade">
        {c.metas.map((m) => {
          const pc = m.meta ? Math.round((m.vendeu / m.meta) * 100) : 0
          const ritmo = m.meta ? m.meta * (dia / diasMes) : 0 // onde deveria estar hoje
          const bateu = m.meta > 0 && m.vendeu >= m.meta
          return (
            <div key={m.nome} className={`cmm-card${bateu ? ' bateu' : ''}`}>
              <div className="cmm-cab"><b>{m.nome}</b>{m.meta > 0 && editando !== m.nome && <button className="cm-lapis" disabled={!d.metasProntas} title="Trocar a meta" onClick={() => { setEditando(m.nome); setTexto(Math.round(m.meta).toLocaleString('pt-BR')); setErro(null) }}><i className="fas fa-pen" /></button>}</div>
              <div className="cmm-vendeu"><small>Vendeu no mês</small><strong>{compacto(m.vendeu)}</strong></div>
              {editando === m.nome ? editor(m.nome) : m.meta > 0 ? (
                <>
                  <div className="cmm-barra"><span style={{ width: `${Math.min(100, pc)}%` }} /><i style={{ left: `${Math.min(100, (ritmo / m.meta) * 100)}%` }} title="onde deveria estar hoje" /></div>
                  <div className="cmm-info"><span><b>{pc}%</b> da meta de {compacto(m.meta)}</span><span className={bateu ? 'ok' : m.vendeu >= ritmo ? 'ok' : 'atras'}>{bateu ? 'bateu a meta' : `falta ${compacto(m.meta - m.vendeu)}`}</span></div>
                </>
              ) : (
                <button className="cmm-definir" disabled={!d.metasProntas} onClick={() => { setEditando(m.nome); setTexto(''); setErro(null) }}><i className="fas fa-bullseye" /> Definir meta</button>
              )}
            </div>
          )
        })}
      </div>
      {comMeta.length > 0 && <p className="cma-nota">O tracinho na barra mostra onde o vendedor deveria estar hoje para bater a meta no fim do mês.</p>}
    </div>
  )
}

export const CSS_CM = `
/* metas em cartões */
.cmm{display:flex;flex-direction:column;gap:12px}
.cmm-topo{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;font-size:13.5px;color:#64748b}
.cmm-eq{font-size:14px;color:#334155;background:#f5f3ff;border:1px solid #ddd6fe;border-radius:99px;padding:5px 14px}
.cmm-eq b{font-weight:600;color:#5b21b6}
.cmm-grade{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px}
.cmm-card{border:1px solid #e2e8f0;border-radius:16px;padding:16px 18px;display:flex;flex-direction:column;gap:10px;background:#fefefe}
.cmm-card.bateu{background:#f0fdf4;border-color:#86efac}
.cmm-cab{display:flex;justify-content:space-between;align-items:center;gap:8px}
.cmm-cab b{font-size:16px;font-weight:500;color:#0f172a}
.cmm-vendeu{display:flex;flex-direction:column}
.cmm-vendeu small{font-size:12.5px;color:#64748b}
.cmm-vendeu strong{font-size:28px;font-weight:500;color:#0f172a;font-variant-numeric:tabular-nums;line-height:1.15}
.cmm-barra{position:relative;height:12px;background:#ede9fe;border-radius:99px}
.cmm-barra span{display:block;height:100%;background:#7c3aed;border-radius:99px;animation:btCresce .8s cubic-bezier(.22,1,.36,1) both;transform-origin:left}
.cmm-card.bateu .cmm-barra span{background:#16a34a}
.cmm-barra i{position:absolute;top:-4px;width:2px;height:20px;background:#0f172a;border-radius:2px;transform:translateX(-1px)}
.cmm-info{display:flex;justify-content:space-between;gap:8px;font-size:13px;color:#475569}
.cmm-info b{font-weight:600;color:#0f172a}
.cmm-info .ok{color:#15803d;font-weight:500}
.cmm-info .atras{color:#b45309;font-weight:500}
.ce .cmm-definir{align-self:flex-start;display:inline-flex;align-items:center;gap:8px;padding:8px 14px;border:1px dashed #a78bfa;border-radius:99px;color:#6d28d9;font-size:13.5px;cursor:pointer;background:#faf5ff;font-family:inherit}
.ce .cmm-definir:hover{border-style:solid}
.cmm-ed{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:14px;color:#475569}
.cmm-ed input{width:130px;padding:7px 10px;border:1px solid #cbd5e1;border-radius:10px;font:inherit;font-size:15px}

/* K · resumo (estilo Gestão Pós-Vendas) */
.cmk{gap:14px}
.cmk-meses{display:flex;gap:6px;flex-wrap:wrap}
.ce .cmk-meses button{padding:7px 14px;border-radius:99px;border:1px solid #e2e8f0;font-size:13.5px;color:#475569;cursor:pointer;background:#fefefe}
.ce .cmk-meses button.on{background:#0f172a;border-color:#0f172a;color:#fff}
.cmk-caixa{background:#fefefe;border:1px solid #e2e8f0;border-radius:20px;padding:24px 28px;cursor:pointer;display:flex;flex-direction:column;gap:14px;transition:box-shadow .25s,border-color .25s;animation:ceFade .3s both}
.cmk-caixa:hover{border-color:#cbd5e1;box-shadow:0 18px 36px -26px rgba(15,23,42,.6)}
.cmk-rot{font-size:13px;color:#64748b}
.cmk-frase{font-size:22px;color:#0f172a;line-height:1.35}
.cmk-frase b{font-weight:500}
.cmk-conta{display:flex;align-items:center;gap:18px;flex-wrap:wrap}
.cmk-conta > i{color:#94a3b8;font-size:16px}
.ce .cmk-conta button{display:flex;flex-direction:column;align-items:flex-start;gap:2px;padding:10px 14px;border-radius:14px;cursor:pointer;text-align:left}
.ce .cmk-conta button:hover{background:#f1f5f9}
.cmk-conta small{font-size:13px;color:#64748b}
.cmk-conta b{font-size:34px;font-weight:500;letter-spacing:-.02em;font-variant-numeric:tabular-nums;line-height:1.1}
.cmk-conta em{font-style:normal;font-size:12.5px;color:#64748b}
.cmk-barra{display:flex;height:16px;border-radius:99px;overflow:hidden;gap:2px;background:#f1f5f9}
.cmk-barra span{display:block;height:100%;animation:btCresce .8s cubic-bezier(.22,1,.36,1) both;transform-origin:left}
.cmk-leg{display:flex;flex-wrap:wrap;gap:6px 16px;font-size:12.5px;color:#475569}
.cmk-leg i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px;vertical-align:-1px}
.cmk-abrir{align-self:flex-end;font-size:14px;font-weight:500;color:#0369a1;display:inline-flex;gap:8px;align-items:center}
.cmk-mais{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.ce .cmk-mais button{display:flex;align-items:center;gap:14px;background:#fefefe;border:1px solid #e2e8f0;border-radius:16px;padding:16px 18px;cursor:pointer;text-align:left}
.ce .cmk-mais button:hover{border-color:#cbd5e1}
.cmk-mais i{font-size:20px}
.cmk-mais span{display:flex;flex-direction:column}
.cmk-mais b{font-size:15px;font-weight:500;color:#0f172a}
.cmk-mais small{font-size:13px;color:#64748b}
/* apresentação em tela cheia */
.cma-raiz{display:contents}
.cma{position:fixed;inset:0;z-index:100060;background:#f8fafc;display:flex;flex-direction:column;animation:ceFade .2s both}
.cma-topo{display:flex;align-items:center;gap:16px;padding:14px 24px;border-bottom:1px solid #e2e8f0;background:#fefefe}
.cma-cont{font-size:13px;color:#64748b;font-variant-numeric:tabular-nums}
.cma-mes{flex:1;font-size:14px;color:#334155}
.ce .cma-x{width:40px;height:40px;border-radius:12px;border:1px solid #e2e8f0;cursor:pointer;font-size:17px;color:#475569;display:grid;place-items:center}
.ce .cma-x:hover{background:#f1f5f9}
.cma-slide{flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;align-items:center;padding:40px 32px 24px;animation:cmaEntra .35s cubic-bezier(.22,1,.36,1) both}
@keyframes cmaEntra{from{opacity:0;transform:translateX(24px)}to{opacity:1;transform:none}}
.cma-tit{font-size:34px;font-weight:500;color:#0f172a;letter-spacing:-.02em;margin:0 0 36px;text-align:center}
.cma-centro{display:flex;flex-direction:column;align-items:center;gap:36px;margin:auto 0}
.cma-conta{display:flex;align-items:center;gap:28px;flex-wrap:wrap;justify-content:center}
.cma-conta > i{color:#94a3b8;font-size:22px}
.ce .cma-conta button{display:flex;flex-direction:column;align-items:center;gap:4px;padding:18px 24px;border-radius:20px;cursor:pointer;background:#fefefe;border:1px solid #e2e8f0}
.ce .cma-conta button:hover{border-color:#94a3b8;box-shadow:0 18px 36px -26px rgba(15,23,42,.6)}
.cma-conta small{font-size:16px;color:#64748b}
.cma-conta b{font-size:56px;font-weight:500;letter-spacing:-.03em;font-variant-numeric:tabular-nums;line-height:1.1}
.cma-conta em{font-style:normal;font-size:13.5px;color:#64748b}
.cma-frase{font-size:24px;color:#334155;text-align:center;max-width:780px;line-height:1.4;margin:0}
.cma-frase b{font-weight:500}
.cma-largo{width:100%;max-width:980px;display:flex;flex-direction:column;gap:14px}
.cma-barra{display:flex;height:42px;border-radius:14px;overflow:hidden;gap:3px}
.cma-barra span{display:block;height:100%;animation:btCresce .9s cubic-bezier(.22,1,.36,1) both;transform-origin:left}
.cma-lista{display:flex;flex-direction:column;gap:6px;margin-top:10px}
.cma-li{display:grid;grid-template-columns:18px 1fr auto 170px;align-items:center;gap:14px;background:#fefefe;border:1px solid #e2e8f0;border-radius:14px;padding:14px 18px;font-size:18px;color:#0f172a}
.cma-li > i{width:16px;height:16px;border-radius:5px}
.cma-li b{font-size:22px;font-weight:500;font-variant-numeric:tabular-nums}
.cma-li small{font-size:13.5px;color:#64748b;text-align:right}
.cma-li2{grid-template-columns:1fr auto auto}
.cma-li2 span{display:flex;flex-direction:column}
.cma-li2 span small{text-align:left}
.cma-li2 em{font-style:normal;font-size:14px;color:#b45309}
.cma-vend{display:grid;grid-template-columns:minmax(160px,260px) 1fr 130px;align-items:center;gap:18px;padding:10px 0;border-bottom:1px solid #eef2f7}
.cma-v-nome{display:flex;flex-direction:column;font-size:19px;color:#0f172a}
.cma-v-nome small{font-size:13.5px;color:#64748b}
.cma-v-bar{height:22px;background:#eef2f7;border-radius:99px;overflow:hidden}
.cma-v-bar span{display:block;height:100%;background:#0369a1;border-radius:99px;animation:btCresce .8s cubic-bezier(.22,1,.36,1) both;transform-origin:left}
.cma-v-saiu span{background:#fb7185}
.cma-vend > b{font-size:22px;font-weight:500;text-align:right;font-variant-numeric:tabular-nums;color:#0f172a}
.cma-nota{font-size:14px;color:#64748b;margin:8px 0 0}
.cma-grade{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.cma-maq{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:16px;background:#fefefe;border:1px solid #e2e8f0;border-radius:16px;padding:18px 20px}
.cma-maq i{font-size:26px;color:#15803d}
.cma-maq span{display:flex;flex-direction:column;font-size:18px;color:#0f172a}
.cma-maq small{font-size:13.5px;color:#64748b}
.cma-maq b{font-size:22px;font-weight:500;font-variant-numeric:tabular-nums}
.cma-cols{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:18px;height:min(46vh,380px)}
.cma-col{display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:6px}
.cma-par{flex:1;width:100%;display:flex;align-items:flex-end;justify-content:center;gap:6px}
.cma-par span{width:min(36px,40%);border-radius:8px 8px 3px 3px;animation:btCresce .8s cubic-bezier(.22,1,.36,1) both;transform-origin:bottom}
.cma-col b{font-size:17px;font-weight:500;font-variant-numeric:tabular-nums}
.cma-col small{font-size:15px;color:#475569}
.cma-col.on small{color:#0f172a;font-weight:500}
.cma-leg{justify-content:center;font-size:14px}
.cma-tres{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-bottom:10px}
.cma-tres div{background:#fefefe;border:1px solid #e2e8f0;border-radius:18px;padding:20px 22px;display:flex;flex-direction:column;gap:4px}
.cma-tres small{font-size:15px;color:#64748b}
.cma-tres b{font-size:40px;font-weight:500;color:#0f172a;font-variant-numeric:tabular-nums;letter-spacing:-.02em}
.cma-sub{font-size:15px;color:#64748b;margin-top:6px}
.cma-vazio{margin:auto 0;font-size:20px;color:#64748b;text-align:center}
.cma .cm-metas{font-size:16px}
.cma-nav{display:flex;align-items:center;justify-content:center;gap:20px;padding:16px 24px 22px;background:#fefefe;border-top:1px solid #e2e8f0}
.ce .cma-seta{width:52px;height:52px;border-radius:99px;border:1px solid #e2e8f0;font-size:18px;color:#0f172a;cursor:pointer;display:grid;place-items:center;background:#fefefe}
.ce .cma-seta:hover:not(:disabled){background:#0f172a;color:#fff;border-color:#0f172a}
.ce .cma-seta:disabled{opacity:.3;cursor:default}
.cma-pontos{display:flex;gap:8px}
.ce .cma-pontos button{width:10px;height:10px;border-radius:99px;background:#cbd5e1;cursor:pointer;transition:width .25s,background .25s}
.ce .cma-pontos button.on{width:30px;background:#0f172a}
@media (max-width:760px){.cmk-mais{grid-template-columns:1fr}.cma-grade{grid-template-columns:1fr}}
@media (max-width:620px){
  .cmk-caixa{padding:18px}.cmk-frase{font-size:18px}.cmk-conta{gap:6px}.cmk-conta > i{display:none}.cmk-conta b{font-size:26px}.ce .cmk-conta button{padding:8px 6px}
  .cma-topo{padding:10px 14px}.cma-slide{padding:22px 14px 16px}.cma-tit{font-size:24px;margin-bottom:20px}
  .cma-conta{flex-direction:column;gap:10px}.cma-conta > i{display:none}.cma-conta b{font-size:40px}.ce .cma-conta button{width:100%}.cma-frase{font-size:18px}
  .cma-li{grid-template-columns:14px 1fr auto;font-size:15px;padding:12px}.cma-li small{display:none}.cma-li b{font-size:17px}.cma-li2{grid-template-columns:1fr auto}.cma-li2 em{display:none}
  .cma-vend{grid-template-columns:1fr auto;gap:6px 12px}.cma-v-bar{grid-column:1/-1;grid-row:2;height:14px}.cma-v-nome{font-size:16px}.cma-vend > b{font-size:17px}
  .cma-cols{gap:6px;height:44vh}.cma-col b{font-size:12px}.cma-col small{font-size:12px}
  .cma-tres{grid-template-columns:1fr}.cma-tres b{font-size:30px}
  .cma-nav{gap:12px;padding:12px}.ce .cma-seta{width:44px;height:44px}.cma-pontos{gap:5px}.ce .cma-pontos button.on{width:20px}
}
/* I · abas */
.cmi{display:flex;flex-direction:column;min-height:0;flex:1;overflow-y:auto}
.cmi-abas{display:flex;gap:4px;padding:14px 22px 0;border-bottom:1px solid #e2e8f0;overflow-x:auto;position:sticky;top:0;background:var(--portal-bg,#f8fafc);z-index:2}
.ce .cmi-abas button{display:flex;align-items:center;gap:8px;padding:10px 18px 12px;border-radius:12px 12px 0 0;font-size:15px;color:#475569;cursor:pointer;white-space:nowrap;border:1px solid transparent;border-bottom:0;margin-bottom:-1px}
.ce .cmi-abas button i{color:var(--c);font-size:14px}
.ce .cmi-abas button small{font-size:12.5px;color:#64748b;background:#f1f5f9;border-radius:99px;padding:2px 8px}
.ce .cmi-abas button:hover{color:#0f172a;background:#f1f5f9}
.ce .cmi-abas button.on{background:#fefefe;color:#0f172a;border-color:#e2e8f0;box-shadow:inset 0 3px 0 var(--c)}
.cmi-frase{margin:16px 22px 0;padding:14px 18px;border-radius:14px;background:color-mix(in srgb,var(--c) 7%,#fefefe);border:1px solid color-mix(in srgb,var(--c) 18%,transparent);font-size:15px;color:#334155;line-height:1.45}
.cmi-frase b{font-weight:500;color:#0f172a}
.cmi-corpo .ce-m-cab{padding:16px 22px 12px}
.cmi-corpo .ce-m-corpo{overflow:visible}
/* J · blocos */
.cmj{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.cmj-bloco{display:flex;flex-direction:column;background:#fefefe;border:1px solid #e2e8f0;border-radius:18px;overflow:hidden;animation:ceFade .3s both}
.cmj-cab{display:grid;grid-template-columns:auto 1fr;gap:14px;padding:18px 20px;background:linear-gradient(165deg,color-mix(in srgb,var(--c) 8%,#fefefe),#fefefe 70%);border-bottom:1px solid #f1f5f9}
.cmj-cab .cme-txt b{font-size:17px}.cmj-cab .cme-txt small{font-size:14px}
.cmj-lista{padding:10px 20px 4px;flex:1}
.cmj-sub{font-size:12.5px;color:#64748b;margin-bottom:4px}
.cmj-it{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:8px 0;border-top:1px solid #f1f5f9;font-size:14px;color:#0f172a}
.cmj-sub + .cmj-it{border-top:0}
.cmj-it span{display:flex;flex-direction:column;min-width:0}
.cmj-it small{font-size:12.5px;color:#64748b}
.cmj-it b{font-weight:500;font-variant-numeric:tabular-nums;white-space:nowrap}
.ce .cmj-ver{align-self:flex-start;margin:6px 20px 16px;font-size:14px;font-weight:500;color:var(--c);cursor:pointer;display:inline-flex;gap:8px;align-items:center}
@media (max-width:900px){.cmj{grid-template-columns:1fr}}
@media (max-width:620px){.cmi-abas{padding:10px 12px 0}.ce .cmi-abas button{padding:9px 12px 11px;font-size:14px}.cmi-frase{margin:12px 12px 0}.cmi-corpo .ce-m-cab{padding:14px 12px 10px}.cmi-corpo .ce-m-corpo{padding:12px}}
/* E · manchetes / G · semáforo */
.cme,.cmg{gap:12px}
.ce .cme-l,.ce .cmg-l{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:18px;background:#fefefe;border:1px solid #e2e8f0;border-radius:18px;padding:20px 22px;cursor:pointer;text-align:left;transition:border-color .2s,box-shadow .2s;animation:ceFade .3s both}
.ce .cme-l:hover,.ce .cmg-l:hover{border-color:#cbd5e1;box-shadow:0 12px 26px -20px rgba(15,23,42,.6)}
.cme-l .pf-ic{width:46px;height:46px;font-size:19px;border-radius:14px}
.cme-txt{display:flex;flex-direction:column;gap:4px;min-width:0}
.cme-txt b{font-size:19px;font-weight:500;color:#0f172a;line-height:1.35}
.cme-txt small{font-size:15px;color:#475569;line-height:1.4}
.cme-txt em{font-style:normal;font-size:12.5px;color:#64748b;text-transform:none}
.cmg-luz{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;width:92px;height:76px;border-radius:14px;background:var(--sf);color:var(--s)}
.cmg-luz i{font-size:24px}
.cmg-luz b{font-size:13.5px;font-weight:500}
/* H · perguntas */
.cmh{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.ce .cmh-q{display:flex;flex-direction:column;gap:6px;background:#fefefe;border:1px solid #e2e8f0;border-radius:18px;padding:22px 24px 18px;cursor:pointer;text-align:left;transition:border-color .2s,box-shadow .2s;animation:ceFade .3s both}
.ce .cmh-q:hover{border-color:color-mix(in srgb,var(--c) 35%,#e2e8f0);box-shadow:0 12px 26px -20px rgba(15,23,42,.6)}
.cmh-perg{font-size:16px;color:#475569;display:flex;align-items:center;gap:10px}
.cmh-perg i{color:var(--c)}
.cmh-resp{font-size:38px;font-weight:500;color:var(--c);letter-spacing:-.02em;line-height:1.15}
.cmh-frase{font-size:15px;color:#334155;line-height:1.45}
/* F · desenhos */
.cmf{gap:14px}
.ce .cmf-bloco{display:flex;flex-direction:column;gap:12px;background:#fefefe;border:1px solid #e2e8f0;border-radius:18px;padding:18px 22px;cursor:pointer;text-align:left}
.ce .cmf-bloco:hover{border-color:#cbd5e1}
.cmf-tit{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px 12px;font-size:17px;font-weight:500;color:#0f172a}
.cmf-tit small{font-size:12.5px;font-weight:400;color:#64748b}
.cmf-linha{display:grid;grid-template-columns:120px 1fr;align-items:center;gap:14px}
.cmf-rot{display:flex;flex-direction:column;font-size:15px;color:#0f172a}
.cmf-rot small{font-size:13px;color:#64748b}
.cmf-dois{display:flex;flex-wrap:wrap;gap:6px 18px}
.cmf-ics{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.cmf-ics i{font-size:26px;animation:ceFade .3s both}
.cmf-ics em{font-style:normal;font-size:13.5px;color:#64748b}
.cmf-quad i{font-size:22px}
.cmf-bolas{gap:4px}
.cmf-bolas i{font-size:14px}
.cmf-nota{font-size:13.5px;color:#475569}
@media (max-width:760px){.cmh{grid-template-columns:1fr}}
@media (max-width:620px){
  .ce .cme-l,.ce .cmg-l{gap:12px;padding:16px}.cme-txt b{font-size:16.5px}.cme-txt small{font-size:14px}
  .cme-l .pf-ic{width:38px;height:38px;font-size:16px}.cmg-luz{width:64px;height:60px}.cmg-luz i{font-size:19px}.cmg-luz b{font-size:12px}
  .cmh-resp{font-size:30px}.cmf-linha{grid-template-columns:1fr}.cmf-ics i{font-size:22px}
}
/* B · gráfico */
.cmb-graf,.cmc-funil{background:#fefefe;border:1px solid #e2e8f0;border-radius:18px;padding:20px 22px 14px}
.cmb-cab{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:14px}
.cmb-tit{font-size:17px;font-weight:500;color:#0f172a}
.cmb-sub{font-size:13.5px;color:#64748b;margin-top:2px}
.cmb-leg{display:flex;gap:14px;font-size:12.5px;color:#475569}
.cmb-leg i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px}
.cmb-cols{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:8px;height:240px}
.ce .cmb-col{display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:4px;cursor:pointer;border-radius:10px;padding:4px 0;min-width:0}
.ce .cmb-col:hover{background:#f1f5f9}
.cmb-val{font-size:11.5px;color:#475569;font-variant-numeric:tabular-nums;white-space:nowrap}
.cmb-pilha{width:70%;max-width:46px;display:flex;flex-direction:column;border-radius:7px 7px 3px 3px;overflow:hidden;min-height:2px;animation:btCresce .8s cubic-bezier(.22,1,.36,1) both;transform-origin:bottom}
.cmb-pilha span{display:block;width:100%}
.cmb-mes{font-size:12.5px;color:#475569}
.cmb-col.agora .cmb-mes{color:#0f172a;font-weight:500}
.cmb-n{font-size:11px;color:#94a3b8}
.cmb-linhas{display:flex;flex-direction:column;gap:10px}
.ce .cmb-linha{display:grid;grid-template-columns:auto 1fr auto auto;align-items:center;gap:14px;background:#fefefe;border:1px solid #e2e8f0;border-radius:16px;padding:14px 18px;cursor:pointer;text-align:left;transition:border-color .2s,box-shadow .2s}
.ce .cmb-linha:hover{border-color:#cbd5e1;box-shadow:0 10px 24px -20px rgba(15,23,42,.6)}
.cmb-l-txt{display:flex;flex-direction:column;gap:2px;min-width:0}
.cmb-l-txt b{font-size:15px;font-weight:500;color:#0f172a}
.cmb-l-txt small{font-size:13px;color:#64748b}
.cmb-l-num{font-size:22px;font-weight:500;color:#0f172a;font-variant-numeric:tabular-nums}
.cmb-vend{grid-template-columns:auto 1fr auto}
.cmb-rank{display:flex;flex-direction:column;gap:6px;margin-top:8px}
.cmb-rank > span{display:grid;grid-template-columns:130px 1fr 90px;align-items:center;gap:10px;font-size:13.5px}
.cmb-rank em{font-style:normal;color:#334155}
.cmb-rank b{font-size:13.5px;text-align:right}
.cmb-r-bar{height:8px;background:#eef2f7;border-radius:99px;overflow:hidden}
.cmb-r-bar span{display:block;height:100%;background:#a78bfa;border-radius:99px}
/* D · vendedores */
.cmd-topo{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.cmd-tab{background:#fefefe;border:1px solid #e2e8f0;border-radius:18px;overflow:hidden}
.cmd-l{display:grid;grid-template-columns:minmax(130px,1.1fr) minmax(180px,2fr) minmax(130px,1fr) minmax(110px,.8fr);align-items:center;gap:16px;padding:14px 20px;border-top:1px solid #f1f5f9;width:100%;box-sizing:border-box;text-align:left}
.ce button.cmd-l{cursor:pointer}
.ce button.cmd-l:hover{background:#f8fafc}
.cmd-h{border-top:0;background:#f8fafc;font-size:12.5px;color:#64748b;padding:10px 20px}
.cmd-nome{font-size:15px;color:#0f172a}
.cmd-meta{display:flex;flex-direction:column;gap:6px}
.cmd-meta small,.cmd-num small{font-size:12.5px;color:#64748b}
.cmd-meta b{font-weight:500;color:#0f172a}
.cmd-num{display:flex;flex-direction:column}
.cmd-num b{font-size:17px;font-weight:500;color:#0f172a;font-variant-numeric:tabular-nums}
@media (max-width:620px){
  .cmb-cols{gap:3px;height:200px}.cmb-val,.cmb-n{display:none}.cmb-mes{font-size:11px}
  .ce .cmb-linha{grid-template-columns:auto 1fr auto;padding:12px 14px}.cmb-l-num{grid-column:2;font-size:19px}.cmb-linha .pf-seta{grid-row:1;grid-column:3}
  .cmb-rank > span{grid-template-columns:100px 1fr 72px}
  .ce .cmc-etapa{grid-template-columns:1fr auto;gap:6px 10px}.cmc-e-barra{grid-column:1/-1;grid-row:2;height:28px}.cmc-e-val{grid-row:1;grid-column:2;font-size:14px}
  .cmc-lado,.cmd-topo{grid-template-columns:1fr}
  .cmd-h{display:none}.cmd-l{grid-template-columns:1fr 1fr;gap:8px 12px;padding:12px 14px}.cmd-nome{grid-column:1/-1}.cmd-meta{grid-column:1/-1}
}
/* metas e abas das janelas */
.cm-sec{font-size:15px;font-weight:500;color:#0f172a;margin:4px 0 10px;display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 10px}
.cm-sec small{font-size:12.5px;font-weight:400;color:#64748b}
.cm-metas{border:1px solid #e2e8f0;border-radius:16px;padding:14px 16px;margin-bottom:22px;background:#fefefe}
.cm-meta{display:grid;grid-template-columns:minmax(120px,170px) 1fr auto auto;align-items:center;gap:12px;padding:9px 0;border-top:1px solid #f1f5f9}
.cm-meta-nome{font-size:14.5px;color:#0f172a}
.cm-meta-trilho{height:10px;background:#eef2f7;border-radius:99px;overflow:hidden}
.cm-meta-trilho span{display:block;height:100%;border-radius:99px}
.cm-meta-txt{font-size:13.5px;color:#475569;white-space:nowrap;font-variant-numeric:tabular-nums}
.cm-meta-txt b{font-weight:500;color:#0f172a}
.ce .cm-lapis{width:32px;height:32px;border-radius:10px;border:1px solid #e2e8f0;color:#64748b;cursor:pointer;display:grid;place-items:center;font-size:12px}
.ce .cm-lapis:hover{border-color:#7c3aed;color:#7c3aed}
.ce .cm-lapis:disabled{opacity:.4;cursor:default}
.cm-meta-ed{grid-column:2/-1;display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:14px;color:#475569}
.cm-meta-ed input{width:140px;padding:7px 10px;border:1px solid #cbd5e1;border-radius:10px;font:inherit;font-size:15px;color:#0f172a;background:#fefefe}
.cm-meta-ed input:focus{outline:2px solid #c4b5fd;border-color:#7c3aed}
.ce .cm-bt{padding:7px 14px;border-radius:99px;border:1px solid #e2e8f0;font-size:13.5px;color:#475569;cursor:pointer}
.ce .cm-bt.cm-bt-ok{background:#7c3aed;border-color:#7c3aed;color:#fff}
.ce .cm-bt:disabled{opacity:.6}
.cm-aviso{font-size:13px;color:#b45309;padding:4px 0 8px}
@media (max-width:620px){.cm-meta{grid-template-columns:1fr auto;gap:6px 10px}.cm-meta-trilho{grid-column:1/-1;grid-row:2}.cm-meta-txt{grid-column:1;grid-row:3;white-space:normal}.ce .cm-lapis{grid-row:1;grid-column:2}.cm-meta-ed{grid-column:1/-1}}
.pf-quatro{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
@media (max-width:760px){.pf-quatro{grid-template-columns:1fr}.pf-quatro .pf-g .pf-num{font-size:38px}}
.cm-abas{display:inline-flex;gap:4px;padding:4px;background:#f1f5f9;border-radius:99px;margin-bottom:14px}
.ce .cm-abas button{padding:7px 16px;border-radius:99px;font-size:13.5px;color:#475569;cursor:pointer;font-family:inherit}
.ce .cm-abas button.on{background:#fefefe;color:#0f172a;box-shadow:0 1px 3px rgba(15,23,42,.12)}
`
