'use client'
// Faturamento de Peças no MESMO jeito da Gestão Pós-Vendas (src/components/mecanicos/FaturamentoPeriodo.tsx, forma "escada").
// Ortiz, 18/11/2026: "colocar exatamente como está o do Pós-Vendas: clicando abre as ordens, modais e tudo mais",
// para quem olha a tela do diretor entender Peças do mesmo jeito que entende o Pós-Vendas.
//  - em cima: Dia / Semana / Mês / Ano, setas para andar e os 4 cartões de período (o ⇄ compara lado a lado)
//  - "O que entra na conta": os canais (Balcão, Oficina, Revisões, Com máquina, Outros) — liga/desliga
//  - cartões: Faturado, Balcão, Oficina, os 2 pecistas e as Peças paradas — clicar abre a lista
//  - na lista, clicar num pedido abre a janela dele: as peças e a nota fiscal
//  - embaixo: "Os N pedidos do período", com filtro de canal, datas e busca
// Os pedidos vêm de /api/empresa/pecas (só os últimos 13 meses — antes disso não há como comparar).
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import type { DadosPecas, PedidoPc, Canal, ParadaPc } from '@/lib/empresa/pecas'
import { periodos, andarPeriodo, somarDias, type Escala } from '@/lib/mecanicos/painel'
import { brl, brl2, Numero } from '@/components/mecanicos/ui'
import { ESTILO_FP, useOcultosSalvos } from '@/components/mecanicos/FaturamentoPeriodo'
import { authHeaders } from '@/lib/auth/client'
import { useJson } from './comercial-telas'

// ── os canais (no lugar dos tipos de OS do Pós-Vendas) ───────────────────────
const CANAIS_PC: { canal: Canal; cor: string; dica: string }[] = [
  { canal: 'Balcão', cor: '#c2410c', dica: 'Peças vendidas no balcão (categoria "Revenda de Peças Balcão").' },
  { canal: 'Oficina', cor: '#f97316', dica: 'Peças vendidas junto com o serviço da oficina (OS de manutenção).' },
  { canal: 'Revisões', cor: '#0f766e', dica: 'Peças das revisões (categoria "Revenda de Peças Revisão").' },
  { canal: 'Com máquina', cor: '#78716c', dica: 'Peças que saíram no mesmo pedido de uma máquina.' },
  { canal: 'Outros', cor: '#94a3b8', dica: 'Pedidos ainda sem categoria no relatório (os mais novos) ou de outra categoria.' },
]
const COR_CANAL = Object.fromEntries(CANAIS_PC.map((x) => [x.canal, x.cor])) as Record<Canal, string>
const TODOS_LIGADOS: Record<Canal, boolean> = { 'Balcão': true, 'Oficina': true, 'Revisões': true, 'Com máquina': true, 'Outros': true }

// ── nomes e datas ────────────────────────────────────────────────────────────
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const MES3 = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
const dia = (d: string) => Number(d.slice(8, 10))
const mes = (d: string) => Number(d.slice(5, 7)) - 1
const dm = (d: string) => d.split('-').reverse().slice(0, 2).join('/')
const br = (d: string) => d.split('-').reverse().join('/')
const diasEntre = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000)
const NOME_ANT: Record<Escala, string> = { dia: 'dia anterior', semana: 'semana anterior', mes: 'mês anterior', ano: 'ano anterior' }
const VS: Record<Escala, string> = { dia: 'ontem', semana: 'semana passada', mes: 'mês passado', ano: 'ano passado' }

/** o nome do período: "Novembro de 2026", "Semana de 16 a 22 de novembro"… (igual ao Pós-Vendas) */
function titulo(e: Escala, de: string, ate: string): string {
  if (e === 'ano') return de.slice(0, 4)
  if (e === 'mes') return `${MESES[mes(de)][0].toUpperCase()}${MESES[mes(de)].slice(1)} de ${de.slice(0, 4)}`
  if (e === 'dia') { const w = new Date(`${de}T12:00:00Z`).getUTCDay(); return `${SEMANA[w][0].toUpperCase()}${SEMANA[w].slice(1)}, ${dia(de)} de ${MESES[mes(de)]}` }
  return mes(de) === mes(ate) ? `Semana de ${dia(de)} a ${dia(ate)} de ${MESES[mes(ate)]}` : `Semana de ${dia(de)} de ${MES3[mes(de)]} a ${dia(ate)} de ${MES3[mes(ate)]}`
}
const curto = (e: Escala, de: string) => (e === 'ano' ? de.slice(0, 4) : e === 'mes' ? `${MES3[mes(de)]}/${de.slice(2, 4)}` : `${dia(de)}/${String(mes(de) + 1).padStart(2, '0')}`)

/** quem faturou o pedido (vendedor no Omie). Pecista = quem vende no balcão; nos pedidos de OS vem o técnico. */
const quemFaturou = (v: string) => v.replace(/^([^-]{1,15}?)\s-\s(.+)$/, '$1 ($2)').replace(/^T[ée]cnicos?( Externos?)?:\s*/i, '').replace(/^Motorista:\s*/i, '').trim() || 'sem vendedor'
const ehTecnico = (v: string) => /^(t[ée]cnic|motorista|#)/i.test(v.trim()) || !v.trim()
// só o primeiro nome no cartão ("Danilo Correa" → "Danilo"): o nome inteiro quebrava em duas linhas
const nomeCurto = (n: string) => n.replace(/\s*\(.*\)$/, '').split(' ')[0]

// ── a soma de um período ─────────────────────────────────────────────────────
/** o "pacote" que a soma devolve: total, custo, quantos pedidos e quanto foi de cada canal */
interface SomaPeriodo {
  venda: number
  custo: number
  quantidade: number
  porCanal: Record<Canal, number>
  qtdCanal: Record<Canal, number>
}

/** soma os pedidos que estão entre `inicio` e `fim` (o mesmo for + if da somarPeriodo) */
function somar(pedidos: PedidoPc[], inicio: string, fim: string): SomaPeriodo {
  const soma: SomaPeriodo = {
    venda: 0, custo: 0, quantidade: 0,
    porCanal: { 'Balcão': 0, 'Oficina': 0, 'Revisões': 0, 'Com máquina': 0, 'Outros': 0 },
    qtdCanal: { 'Balcão': 0, 'Oficina': 0, 'Revisões': 0, 'Com máquina': 0, 'Outros': 0 },
  }
  // para cada pedido da lista...
  for (const pedido of pedidos) {
    // ...se a data estiver dentro do período, soma ele
    if (pedido.data >= inicio && pedido.data <= fim) {
      soma.venda = soma.venda + pedido.venda
      soma.custo = soma.custo + pedido.custo
      soma.quantidade = soma.quantidade + 1
      soma.porCanal[pedido.canal] = soma.porCanal[pedido.canal] + pedido.venda
      soma.qtdCanal[pedido.canal] = soma.qtdCanal[pedido.canal] + 1
    }
  }
  return soma
}

/** os 2 vendedores que mais faturaram no balcão nos pedidos que temos (hoje: Zezo e Danilo) — pelo nome do Omie, sem adivinhar */
function acharPecistas(pedidos: PedidoPc[]): string[] {
  const totalPorNome = new Map<string, number>()
  for (const pedido of pedidos) {
    if (pedido.canal === 'Balcão' && !ehTecnico(pedido.vendedor)) {
      const nome = quemFaturou(pedido.vendedor)
      totalPorNome.set(nome, (totalPorNome.get(nome) || 0) + pedido.venda)
    }
  }
  return [...totalPorNome.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([nome]) => nome)
}

// ── as métricas (os cartões que abrem a lista) ───────────────────────────────
interface Metrica {
  chave: string
  titulo: string
  icone: string
  cor: string
  dica: string
  /** quais pedidos entram nesta métrica */
  entra: (pedido: PedidoPc) => boolean
}

function montarMetricas(pecistas: string[]): Metrica[] {
  const coresPecista = ['#2563eb', '#7c3aed']
  return [
    { chave: 'fat', titulo: 'Faturado', icone: 'fa-sack-dollar', cor: '#ea580c', dica: 'Tudo o que foi vendido de peças nos canais que estão na conta (veja "O que entra na conta").', entra: () => true },
    { chave: 'bal', titulo: 'Balcão', icone: 'fa-store', cor: COR_CANAL['Balcão'], dica: CANAIS_PC[0].dica, entra: (p) => p.canal === 'Balcão' },
    { chave: 'ofi', titulo: 'Oficina', icone: 'fa-screwdriver-wrench', cor: COR_CANAL['Oficina'], dica: CANAIS_PC[1].dica, entra: (p) => p.canal === 'Oficina' },
    ...pecistas.map((nome, i): Metrica => ({
      chave: `pec${i}`, titulo: nomeCurto(nome), icone: 'fa-user-tie', cor: coresPecista[i],
      dica: `Pedidos faturados por ${nome} (pecista do balcão), em todos os canais que estão na conta.`,
      entra: (p) => !ehTecnico(p.vendedor) && quemFaturou(p.vendedor) === nome,
    })),
  ]
}

const somaDe = (pedidos: PedidoPc[], m: Metrica, de: string, ate: string) => {
  let venda = 0, quantidade = 0
  for (const pedido of pedidos) if (pedido.data >= de && pedido.data <= ate && m.entra(pedido)) { venda += pedido.venda; quantidade++ }
  return { venda, quantidade }
}

// ════════════════════════════════════════════════════════════════════════════
export function FaturamentoPecas({ dados }: { dados: DadosPecas }) {
  const hoje = dados.hoje
  const [escala, setEscala] = useState<Escala>('mes')
  const [refDia, setRefDia] = useState(hoje)
  const [ligados, setLigados] = useState<Record<Canal, boolean>>(TODOS_LIGADOS)
  const [comparando, setComparando] = useState(false)
  const [comp, setComp] = useState<'anterior' | 'ano'>('anterior')
  const [bRef, setBRef] = useState<string | null>(null) // B escolhido com as setas (null = o anterior/ano passado)
  const [lista, setLista] = useState<null | { lado: 'a' | 'b'; metrica: Metrica }>(null)
  const [verParados, setVerParados] = useState(false)
  const [verPedidos, setVerPedidos] = useState(false)

  // o primeiro dia que temos pedidos: antes dele não dá para comparar (a API manda só 13 meses)
  const inicioDados = useMemo(() => dados.pedidos.reduce((menor, p) => (p.data < menor ? p.data : menor), hoje), [dados.pedidos, hoje])
  const pecistas = useMemo(() => acharPecistas(dados.pedidos), [dados.pedidos])
  const metricas = useMemo(() => montarMetricas(pecistas), [pecistas])
  // só os pedidos dos canais ligados
  const pedidos = useMemo(() => dados.pedidos.filter((p) => ligados[p.canal]), [dados.pedidos, ligados])

  // período escolhido (A) — em andamento, conta só até hoje
  const sel = periodos(escala, refDia, 1)[0]
  const andamento = sel.ate > hoje
  const ateSel = andamento ? hoje : sel.ate
  const s = somar(pedidos, sel.de, ateSel)
  const sTodos = somar(dados.pedidos, sel.de, ateSel)
  // período B: o anterior ou o mesmo do ano passado — em andamento, só até o mesmo dia
  const passos: Record<Escala, number> = { dia: -364, semana: -52, mes: -12, ano: -1 }
  const prev = bRef ? periodos(escala, bRef, 1)[0] : periodos(escala, andarPeriodo(escala, refDia, comp === 'ano' ? passos[escala] : -1), 1)[0]
  const ateAnt = andamento ? somarDias(prev.de, Math.min(diasEntre(sel.de, hoje), diasEntre(prev.de, prev.ate))) : prev.ate
  const temAnt = prev.de >= inicioDados
  const ant = temAnt ? somar(pedidos, prev.de, ateAnt) : null
  const doPeriodo = pedidos.filter((p) => p.data >= sel.de && p.data <= ateSel).sort((a, b) => b.data.localeCompare(a.data) || b.venda - a.venda)
  const doB = pedidos.filter((p) => p.data >= prev.de && p.data <= ateAnt).sort((a, b) => b.data.localeCompare(a.data))

  const mudarEscala = (e: Escala) => { setEscala(e); setBRef(null) }
  const ir = (n: number) => { const r = andarPeriodo(escala, refDia, n); setBRef(null); setRefDia(r > hoje ? hoje : r) }
  const podeVoltar = periodos(escala, andarPeriodo(escala, refDia, -1), 1)[0].ate >= inicioDados

  return (
    <div className="fp foco">
      <style>{ESTILO_FP + CSS_PCP}</style>
      <div className="fp-topo">
        <div className="fp-esc" role="tablist">
          {([['dia', 'Dia'], ['semana', 'Semana'], ['mes', 'Mês'], ['ano', 'Ano']] as const).map(([k, r]) => <button key={k} type="button" role="tab" aria-selected={escala === k} className={escala === k ? 'on' : ''} onClick={() => mudarEscala(k)}>{r}</button>)}
        </div>
        <div className="fp-nav">
          <button type="button" onClick={() => ir(-1)} disabled={!podeVoltar} aria-label="período anterior">‹</button>
          <div><b>{titulo(escala, sel.de, sel.ate)}</b><small>{andamento ? 'em andamento · até hoje' : `${br(sel.de)} a ${br(sel.ate)}`}</small></div>
          <button type="button" onClick={() => ir(1)} disabled={sel.ate >= hoje} aria-label="próximo período">›</button>
          {!andamento && <button type="button" className="fp-hoje" onClick={() => { setRefDia(hoje); setBRef(null) }}>voltar para hoje</button>}
        </div>
      </div>

      <NavEscada escala={escala} refDia={refDia} hoje={hoje} pedidos={pedidos} inicioDados={inicioDados} comparando={comparando}
        onEscolher={mudarEscala}
        onComparar={(k) => { if (comparando && k === escala) { setComparando(false); return } mudarEscala(k); setComparando(true) }} />

      <div className="fp-ctl">
        <Filtros ligados={ligados} setLigados={setLigados} s={sTodos} />
      </div>

      {sel.de < inicioDados && <div className="pcp-aviso">Os pedidos de peças começam em {br(inicioDados)}: antes disso o período fica incompleto.</div>}

      {comparando ? (
        ant ? (
          <div className="fp-lados">
            <PainelPeriodo lado="b" titulo={titulo(escala, prev.de, prev.ate)} sub={ateAnt < prev.ate ? `até ${dm(ateAnt)}, o mesmo trecho do A` : 'período comparado'} s={ant} metricas={metricas} pedidos={doB}
              onLista={(m) => setLista({ lado: 'b', metrica: m })}
              topo={<div className="fp-pp-ctl">
                <button type="button" onClick={() => setBRef(andarPeriodo(escala, prev.de, -1))} disabled={periodos(escala, andarPeriodo(escala, prev.de, -1), 1)[0].de < inicioDados} aria-label="B um período para trás">‹</button>
                <button type="button" className={!bRef && comp === 'anterior' ? 'on' : ''} onClick={() => { setComp('anterior'); setBRef(null) }}>{NOME_ANT[escala]}</button>
                <button type="button" className={!bRef && comp === 'ano' ? 'on' : ''} onClick={() => { setComp('ano'); setBRef(null) }}>ano passado</button>
                <button type="button" onClick={() => setBRef(andarPeriodo(escala, prev.de, 1))} disabled={andarPeriodo(escala, prev.de, 1) >= sel.de} aria-label="B um período para frente">›</button>
              </div>} />
            <div className="fp-lados-vs" aria-hidden><span>vs</span></div>
            <PainelPeriodo lado="a" titulo={titulo(escala, sel.de, sel.ate)} sub={andamento ? 'em andamento · até hoje' : 'período escolhido'} s={s} outro={ant} metricas={metricas} pedidos={doPeriodo}
              onLista={(m) => setLista({ lado: 'a', metrica: m })}
              topo={<button type="button" className="fp-pp-sair" onClick={() => setComparando(false)}>× sair da comparação</button>} />
          </div>
        ) : <div className="pcp-aviso">Sem pedidos de {titulo(escala, prev.de, prev.ate)} para comparar (os dados começam em {br(inicioDados)}). <button type="button" onClick={() => setComparando(false)}>sair da comparação</button></div>
      ) : (
        <Cartoes key={`${escala}|${sel.de}|${comp}`} metricas={metricas} pedidos={pedidos}
          de={sel.de} ate={ateSel} antDe={prev.de} antAte={ateAnt} temAnt={temAnt} nomeA={curto(escala, sel.de)} nomeB={curto(escala, prev.de)}
          parados={dados.estoque} onAbrir={(m) => setLista({ lado: 'a', metrica: m })} onParados={() => setVerParados(true)} />
      )}

      {lista && <ModalLista metrica={lista.metrica} periodo={lista.lado === 'a' ? titulo(escala, sel.de, sel.ate) : titulo(escala, prev.de, prev.ate)}
        pedidos={(lista.lado === 'a' ? doPeriodo : doB).filter(lista.metrica.entra)} onFechar={() => setLista(null)} />}
      {verParados && <ModalParados paradas={dados.estoque.paradas} onFechar={() => setVerParados(false)} />}

      <ListaDoPeriodo aberta={verPedidos} onAbrir={() => setVerPedidos((v) => !v)} de={sel.de} ate={ateSel}
        todos={dados.pedidos.filter((p) => p.data >= sel.de && p.data <= ateSel)} ligados={ligados} qtdNaConta={doPeriodo.length} />
    </div>
  )
}

// ── os 4 cartões de período (Hoje, Esta semana, Este mês, Este ano) ───────────
function NavEscada({ escala, refDia, hoje, pedidos, inicioDados, comparando, onEscolher, onComparar }: { escala: Escala; refDia: string; hoje: string; pedidos: PedidoPc[]; inicioDados: string; comparando: boolean; onEscolher: (e: Escala) => void; onComparar: (e: Escala) => void }) {
  const COR_ESC: Record<Escala, string> = { dia: '#0891b2', semana: '#7c3aed', mes: '#2563eb', ano: '#0f766e' }
  const NOMES: Record<Escala, [string, string]> = { dia: ['Hoje', 'Dia'], semana: ['Esta semana', 'Semana'], mes: ['Este mês', 'Mês'], ano: ['Este ano', 'Ano'] }
  const ESCALAS: Escala[] = ['dia', 'semana', 'mes', 'ano']
  // o Ano começa oculto (Ortiz, 18/11/2026); quem quiser abre em "ocultos" e fica salvo para ele
  const [ocultos, setOcultos] = useOcultosSalvos<Escala>('pc-escada-ocultos', ['ano'], ESCALAS, 3)
  const visiveis = ESCALAS.filter((k) => !ocultos.includes(k))
  // os que sobram dividem a linha, mantendo a proporção (o ano maior que o dia)
  const PESO: Record<Escala, number> = { dia: 1, semana: 1.2, mes: 1.45, ano: 1.75 }
  return (
    <>
    {ocultos.length > 0 && (
      <div className="fp-esc-ocultos"><span><i className="fas fa-eye-slash" aria-hidden /> ocultos:</span>
        {ocultos.map((k) => <button key={k} type="button" onClick={() => setOcultos(ocultos.filter((x) => x !== k))} style={{ '--c': COR_ESC[k] } as CSSProperties} title="mostrar de novo">{NOMES[k][1]} <b>+</b></button>)}
      </div>
    )}
    <div className="fp-escada" style={{ gridTemplateColumns: visiveis.map((k) => `${PESO[k]}fr`).join(' ') }}>
      {visiveis.map((k) => {
        const i = ESCALAS.indexOf(k)
        const b = periodos(k, refDia, 1)[0]
        const agora = b.de <= hoje && b.ate >= hoje
        const sv = somar(pedidos, b.de, b.ate > hoje ? hoje : b.ate)
        // o anterior, até o mesmo dia quando está em andamento
        const p = periodos(k, andarPeriodo(k, refDia, -1), 1)[0]
        const ateP = agora ? somarDias(p.de, Math.min(diasEntre(b.de, hoje), diasEntre(p.de, p.ate))) : p.ate
        const sp = p.de >= inicioDados ? somar(pedidos, p.de, ateP) : null
        const serie = periodos(k, refDia, 8).filter((x) => x.ate >= inicioDados).map((x) => somar(pedidos, x.de, x.ate > hoje ? hoje : x.ate).venda)
        const d = sp ? sv.venda - sp.venda : 0, pc = sp && sp.venda ? Math.round((d / sp.venda) * 100) : null
        const ativo = k === escala
        return (
          <div key={k} role="button" tabIndex={0} className={`fp-deg d${i} ${ativo ? 'on' : ''} ${agora ? 'agora' : ''}`} style={{ '--c': COR_ESC[k] } as CSSProperties} onClick={() => onEscolher(k)} onKeyDown={(ev) => { if (ev.key === 'Enter') onEscolher(k) }} aria-pressed={ativo}
            data-dica={`${titulo(k, b.de, b.ate)}: ${brl(sv.venda)} em ${sv.quantidade} pedidos.${sp ? ` ${NOME_ANT[k][0].toUpperCase()}${NOME_ANT[k].slice(1)}${agora ? ' (até o mesmo dia)' : ''}: ${brl(sp.venda)}.` : ''} Clique para ver os detalhes.`}>
            <div className="fp-deg-t"><span>{agora ? NOMES[k][0] : NOMES[k][1]}{agora && <i className="fp-vivo" />}</span><span className="fp-deg-d">{ativo && <em>{comparando ? 'comparando' : 'mostrando'}</em>}<button type="button" className={`fp-deg-cmp ${ativo && comparando ? 'on' : ''}`} onClick={(ev) => { ev.stopPropagation(); onComparar(k) }} data-dica="Comparar com outro período: a tela se divide, o atual à direita e o comparado à esquerda." aria-label="comparar"><span className="fp-deg-cmp-i">⇄</span></button>{visiveis.length > 1 && <button type="button" className="fp-deg-oc" onClick={(ev) => { ev.stopPropagation(); setOcultos([...ocultos, k]) }} onKeyDown={(ev) => ev.stopPropagation()} aria-label={`ocultar ${NOMES[k][1]}`} data-dica={`Ocultar o cartão ${NOMES[k][1]}. Fica salvo para você; para voltar, clique nele em "ocultos".`}><i className="fas fa-eye-slash" aria-hidden /></button>}</span></div>
            <small>{titulo(k, b.de, b.ate)}</small>
            <b><Numero valor={sv.venda} formato={brl2} /></b>
            <div className="fp-deg-p">
              <span>{sv.quantidade} pedidos{pc != null && Math.abs(d) >= 0.5 && <> · <i className={d >= 0 ? 'bom' : 'ruim'}>{d >= 0 ? '▲' : '▼'} {Math.abs(pc)}%</i> vs {VS[k]}</>}</span>
              {serie.length > 1 && <Area vals={serie} rotulos={periodos(k, refDia, 8).filter((x) => x.ate >= inicioDados).map((x) => titulo(k, x.de, x.ate))} cor={COR_ESC[k]} />}
            </div>
          </div>
        )
      })}
    </div>
    </>
  )
}

/** gráfico de área dos últimos períodos; passar o mouse num ponto mostra o período e o valor (igual ao Pós-Vendas) */
function Area({ vals, rotulos, cor }: { vals: number[]; rotulos: string[]; cor: string }) {
  const id = useId().replace(/:/g, '')
  const max = Math.max(1, ...vals), W = 240, H = 56
  const x = (i: number) => (i / Math.max(1, vals.length - 1)) * W
  const y = (v: number) => H - (v / max) * (H - 8) - 4
  const linha = vals.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(' ')
  return (
    <div className="fp-area">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
        <defs><linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={cor} stopOpacity=".28" /><stop offset="100%" stopColor={cor} stopOpacity="0" /></linearGradient></defs>
        <path d={`${linha} L${W},${H} L0,${H} Z`} fill={`url(#g${id})`} />
        <path d={linha} fill="none" stroke={cor} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" pathLength={1} className="fp-area-l" />
      </svg>
      <span className="fp-area-pt" style={{ left: '100%', top: `${(y(vals[vals.length - 1]) / H) * 100}%`, background: cor }} />
      <div className="fp-area-h">{vals.map((v, i) => <span key={i} data-dica={`${rotulos[i]}: ${brl(v)}`} />)}</div>
    </div>
  )
}

// ── "O que entra na conta": os canais ────────────────────────────────────────
function Filtros({ ligados, setLigados, s }: { ligados: Record<Canal, boolean>; setLigados: (x: Record<Canal, boolean>) => void; s: SomaPeriodo }) {
  let dentro = 0
  for (const x of CANAIS_PC) if (ligados[x.canal]) dentro = dentro + s.porCanal[x.canal]
  const quantosLigados = CANAIS_PC.filter((x) => ligados[x.canal]).length
  return (
    <div className="fp-linha-ctl">
      <span className="fp-ctl-t">O que entra na conta</span>
      <div className="fp-ctl-c">
        <div className="fp-mix" data-dica={`Na conta: ${brl(dentro)} de ${brl(s.venda)} vendidos no período. Cada pedaço é um canal; os apagados estão fora da conta.`}>
          {CANAIS_PC.filter((x) => s.porCanal[x.canal] > 0.5).map((x) => <i key={x.canal} className={ligados[x.canal] ? '' : 'fora'} style={{ flexGrow: s.porCanal[x.canal], '--c': x.cor } as CSSProperties} />)}
        </div>
        <div className="fp-chips pcp-chips">
          {CANAIS_PC.map((x) => {
            const ligado = ligados[x.canal]
            // o último ligado não desliga (a conta não pode ficar vazia)
            const fixo = ligado && quantosLigados === 1
            return (
              <button key={x.canal} type="button" className={`fp-chip ${ligado ? 'on' : ''} ${fixo ? 'fixo' : ''}`} style={{ '--c': x.cor } as CSSProperties} onClick={() => !fixo && setLigados({ ...ligados, [x.canal]: !ligado })} aria-pressed={ligado} data-dica={`${x.canal.toUpperCase()} — ${x.dica}${ligado ? ' Clique para tirar da conta.' : ' Clique para somar na conta.'}`}>
                <span className="fp-chip-ic" aria-hidden>{ligado ? '✓' : '+'}</span>
                <span className="fp-chip-n">{x.canal}<small>{s.qtdCanal[x.canal]} pedidos · {s.venda ? Math.round((s.porCanal[x.canal] / s.venda) * 100) : 0}%</small></span>
                <span className="fp-chip-v">{brl2(s.porCanal[x.canal])}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── os cartões (Faturado, Balcão, Oficina, pecistas, Peças paradas) ──────────
function Cartoes({ metricas, pedidos, de, ate, antDe, antAte, temAnt, nomeA, nomeB, parados, onAbrir, onParados }: {
  metricas: Metrica[]; pedidos: PedidoPc[]; de: string; ate: string; antDe: string; antAte: string; temAnt: boolean
  nomeA: string; nomeB: string; parados: DadosPecas['estoque']; onAbrir: (m: Metrica) => void; onParados: () => void
}) {
  // estoque parado = as faixas sem vender há mais de 90 dias (a [0] é "vendeu nos últimos 90 dias")
  let valorParado = 0, codigosParados = 0
  for (const faixa of parados.faixas.slice(1)) { valorParado += faixa.valor; codigosParados += faixa.itens }
  // Peças paradas começa oculto (Ortiz, 18/11/2026: "deixa oculto, mas para o usuário abrir se quiser")
  const todasChaves = [...metricas.map((m) => m.chave), 'par']
  const [ocultos, setOcultos] = useOcultosSalvos<string>('pc-cartoes-ocultos', ['par'], todasChaves, todasChaves.length - 1)
  const visiveis = metricas.filter((m) => !ocultos.includes(m.chave))
  const verParados = !ocultos.includes('par')
  const quantos = visiveis.length + (verParados ? 1 : 0)
  // o botão de ocultar (some quando só sobra um cartão)
  const botaoOcultar = (chave: string, nome: string) => quantos > 1 && (
    <button type="button" className="fp-card-oc" onClick={(ev) => { ev.stopPropagation(); setOcultos([...ocultos, chave]) }} onKeyDown={(ev) => ev.stopPropagation()} aria-label={`ocultar ${nome}`} data-dica={`Ocultar o cartão ${nome}. Fica salvo para você; para voltar, clique nele em "ocultos".`}><i className="fas fa-eye-slash" aria-hidden /></button>
  )
  const nomeDe = (chave: string) => (chave === 'par' ? 'Peças paradas' : metricas.find((m) => m.chave === chave)?.titulo || chave)
  const corDe = (chave: string) => (chave === 'par' ? '#78716c' : metricas.find((m) => m.chave === chave)?.cor || '#64748b')
  return (
    <>
    {ocultos.length > 0 && (
      <div className="fp-esc-ocultos"><span><i className="fas fa-eye-slash" aria-hidden /> ocultos:</span>
        {ocultos.map((k) => <button key={k} type="button" onClick={() => setOcultos(ocultos.filter((x) => x !== k))} style={{ '--c': corDe(k) } as CSSProperties} title="mostrar de novo">{nomeDe(k)} <b>+</b></button>)}
      </div>
    )}
    <div className="fp-cards seis" style={{ '--n': quantos } as CSSProperties}>
      {visiveis.map((m, i) => {
        const atual = somaDe(pedidos, m, de, ate)
        const anterior = temAnt ? somaDe(pedidos, m, antDe, antAte) : null
        const fat = m.chave === 'fat'
        const custo = fat ? pedidos.filter((p) => p.data >= de && p.data <= ate).reduce((t, p) => t + p.custo, 0) : 0
        const sub = fat ? `${atual.quantidade} pedidos${atual.venda ? ` · margem ${Math.round(((atual.venda - custo) / atual.venda) * 100)}%` : ''}` : `${atual.quantidade} pedidos no período`
        const d = anterior ? atual.venda - anterior.venda : 0, p = anterior && anterior.venda ? (d / anterior.venda) * 100 : null, bom = d >= 0
        const mx = Math.max(atual.venda, anterior?.venda || 0, 1)
        return (
          <div key={m.chave} className="fp-card clica" style={{ '--c': m.cor, animationDelay: `${i * 60}ms` } as CSSProperties} role="button" tabIndex={0} onClick={() => onAbrir(m)} onKeyDown={(ev) => { if (ev.key === 'Enter') onAbrir(m) }}>
            <div className="fp-card-t">
              <span className="fp-card-n" data-dica={`${m.titulo.toUpperCase()} — ${m.dica}`}><i className={`fas ${m.icone}`} aria-hidden />{m.titulo}</span>
              <span className="fp-card-d">
                {p != null && Math.abs(d) >= 0.5 && <em className={`fp-pill ${bom ? 'bom' : 'ruim'}`}>{bom ? '▲' : '▼'} {Math.abs(Math.round(p))}%</em>}
                {botaoOcultar(m.chave, m.titulo)}
              </span>
            </div>
            <b className="fp-card-v"><Numero valor={atual.venda} formato={brl} /></b>
            <small className="fp-card-s">{sub}</small>
            <span className="fp-card-ver">ver os pedidos ›</span>
            {anterior ? (
              <div className="fp-vs" data-dica={`${nomeA}: ${brl(atual.venda)} · ${nomeB}: ${brl(anterior.venda)} · diferença ${bom ? '+' : '−'}${brl(Math.abs(d))}`}>
                <div><span>{nomeA}</span><i><u style={{ width: `${(atual.venda / mx) * 100}%` }} /></i><b>{brl(atual.venda)}</b></div>
                <div className="b"><span>{nomeB}</span><i><u style={{ width: `${(anterior.venda / mx) * 100}%` }} /></i><b>{brl(anterior.venda)}</b></div>
              </div>
            ) : <div className="fp-vs vazio">sem comparação</div>}
          </div>
        )
      })}
      {/* Peças paradas: é o estoque de HOJE, não depende do período */}
      {verParados && (
        <div className="fp-card clica" style={{ '--c': '#78716c', animationDelay: `${visiveis.length * 60}ms` } as CSSProperties} role="button" tabIndex={0} onClick={onParados} onKeyDown={(ev) => { if (ev.key === 'Enter') onParados() }}>
          <div className="fp-card-t"><span className="fp-card-n" data-dica="PEÇAS PARADAS — peças no estoque que não vendem há mais de 90 dias, pelo preço de custo. É o estoque de hoje (não muda com o período)."><i className="fas fa-box-archive" aria-hidden />Peças paradas</span><span className="fp-card-d">{botaoOcultar('par', 'Peças paradas')}</span></div>
          <b className="fp-card-v"><Numero valor={valorParado} formato={brl} /></b>
          <small className="fp-card-s">{codigosParados.toLocaleString('pt-BR')} códigos sem vender há +90 dias</small>
          <span className="fp-card-ver">ver as peças ›</span>
          <div className="fp-vs vazio">estoque de hoje</div>
        </div>
      )}
    </div>
    </>
  )
}

// ── comparação lado a lado ───────────────────────────────────────────────────
function PainelPeriodo({ lado, titulo: tit, sub, s, outro, metricas, pedidos, onLista, topo }: { lado: 'a' | 'b'; titulo: string; sub: string; s: SomaPeriodo; outro?: SomaPeriodo | null; metricas: Metrica[]; pedidos: PedidoPc[]; onLista: (m: Metrica) => void; topo?: React.ReactNode }) {
  const valorDe = (m: Metrica) => { let v = 0; for (const p of pedidos) if (m.entra(p)) v += p.venda; return v }
  const qtd = (v: number) => String(Math.round(v))
  const M: { m?: Metrica; t: string; v: number; o?: number; f: (v: number) => string; sub: string; cor: string }[] = [
    ...metricas.map((m) => ({ m, t: m.titulo, v: valorDe(m), f: brl, sub: m.chave === 'fat' ? `${s.quantidade} pedidos` : 'clique para ver os pedidos', cor: m.cor })),
    { t: 'Pedidos', v: s.quantidade, o: outro?.quantidade, f: qtd, sub: 'quantidade no período', cor: '#0f172a' },
    { t: 'Ticket médio', v: s.quantidade ? s.venda / s.quantidade : 0, o: outro ? (outro.quantidade ? outro.venda / outro.quantidade : 0) : undefined, f: brl, sub: 'faturado ÷ pedidos', cor: '#475569' },
  ]
  // a diferença para o B só no lado A, e só no Faturado (os outros o B não somou)
  if (outro) M[0].o = outro.venda
  return (
    <section className={`fp-pp ${lado}`}>
      <div className="fp-pp-cab"><em>{lado === 'a' ? 'A' : 'B'}</em><div><b>{tit}</b><small>{sub}</small></div></div>
      {topo}
      <div className="fp-pp-g">
        {M.map((x, i) => {
          const d = x.o != null ? x.v - x.o : null, p = d != null && x.o ? (d / x.o) * 100 : null
          return (
            <div key={x.t} className={`fp-pp-m ${x.m ? 'clica' : ''}`} style={{ '--c': x.cor, animationDelay: `${i * 50}ms` } as CSSProperties} role={x.m ? 'button' : undefined} tabIndex={x.m ? 0 : undefined} onClick={() => x.m && onLista(x.m)}>
              <div className="fp-pp-mt"><span>{x.t}</span>{p != null && Math.abs(d!) >= 0.5 && <i className={`fp-pill ${d! >= 0 ? 'bom' : 'ruim'}`}>{d! >= 0 ? '▲' : '▼'} {Math.abs(Math.round(p))}%</i>}</div>
              <b><Numero valor={x.v} formato={x.f} /></b>
              <small>{x.sub}</small>
              {d != null && Math.abs(d) >= 0.5 && <small className={d >= 0 ? 'bom' : 'ruim'}>{d >= 0 ? '+' : '−'}{x.f(Math.abs(d))} em relação ao B</small>}
            </div>
          )
        })}
      </div>
      <div className="fp-pp-mix">{CANAIS_PC.filter((x) => s.porCanal[x.canal] > 0.5).map((x) => <i key={x.canal} style={{ flexGrow: s.porCanal[x.canal], background: x.cor }} title={`${x.canal}: ${brl(s.porCanal[x.canal])} (${s.qtdCanal[x.canal]} pedidos)`} />)}</div>
      <div className="fp-pp-leg">{CANAIS_PC.filter((x) => s.qtdCanal[x.canal] > 0).map((x) => <span key={x.canal}><i style={{ background: x.cor }} />{x.canal} <b>{brl(s.porCanal[x.canal])}</b></span>)}</div>
    </section>
  )
}

// ── a lista de pedidos de um cartão ──────────────────────────────────────────
function ModalLista({ metrica, periodo, pedidos, onFechar }: { metrica: Metrica; periodo: string; pedidos: PedidoPc[]; onFechar: () => void }) {
  const [aberto, setAberto] = useState<PedidoPc | null>(null)
  const [nota, setNota] = useState<PedidoPc | null>(null)
  const [busca, setBusca] = useState('')
  const linhas = pedidos.filter((p) => !busca || `${p.numero} ${p.cliente} ${p.vendedor}`.toLowerCase().includes(busca.toLowerCase())).sort((a, b) => b.venda - a.venda)
  let total = 0
  for (const p of linhas) total = total + p.venda
  if (typeof document === 'undefined') return null
  return createPortal(
    <div className="fp-modal-fundo pcp-fundo" role="presentation" onClick={() => !aberto && !nota && onFechar()}>
      <div className="fp-modal fp-lista" role="dialog" aria-modal="true" aria-label={`${metrica.titulo} — ${periodo}`} onClick={(ev) => ev.stopPropagation()}>
        <div className="fp-modal-cab">
          <div><small>{periodo}</small><b>{metrica.titulo}: {brl(total)}</b><small>{linhas.length} pedidos · clique num pedido para ver as peças e a nota fiscal</small></div>
          <button type="button" className="fp-modal-x" onClick={onFechar} aria-label="fechar">×</button>
        </div>
        <input className="fp-lista-busca" placeholder="buscar por pedido, cliente ou vendedor…" aria-label="buscar por pedido, cliente ou vendedor" autoComplete="off" value={busca} onChange={(ev) => setBusca(ev.target.value)} />
        <div className="fp-lista-l">
          <div className="fp-lista-r cab"><span>Data</span><span>Pedido</span><span>Cliente · vendedor</span><span>Canal</span><span className="n">Venda</span><span /></div>
          {linhas.map((p) => (
            <div key={`${p.conta}|${p.numero}`} className="fp-lista-r" role="button" tabIndex={0} onClick={() => setAberto(p)} onKeyDown={(ev) => { if (ev.key === 'Enter') setAberto(p) }} title="abrir o pedido: as peças e a nota fiscal">
              <span>{dm(p.data)}</span>
              <span><b>{p.numero}</b><small>{p.conta === 'NOVA' ? 'Nova Tratores' : p.conta === 'CASTRO' ? 'Castro' : p.conta}</small></span>
              <span><b>{p.cliente || '—'}</b><small>{quemFaturou(p.vendedor)} · {p.itens} {p.itens === 1 ? 'peça' : 'peças'}</small></span>
              <span><em style={{ '--c': COR_CANAL[p.canal] } as CSSProperties}>{p.canal}</em></span>
              <span className="v"><b>{brl2(p.venda)}</b><small>{p.venda ? `margem ${Math.round(((p.venda - p.custo) / p.venda) * 100)}%` : ''}</small></span>
              <span><button type="button" className="fp-lista-pdf" onClick={(ev) => { ev.stopPropagation(); setNota(p) }}>NF</button></span>
            </div>
          ))}
          {!linhas.length && <p className="fp-lista-vazio">Nenhum pedido{busca ? ' com essa busca' : ''} neste período.</p>}
        </div>
      </div>
      {aberto && <JanelaPedido pedido={aberto} onFechar={() => setAberto(null)} />}
      {nota && <JanelaNotaPedido p={nota} onFechar={() => setNota(null)} />}
    </div>,
    document.body,
  )
}

// ── a janela de um pedido (no lugar da janela da OS) ─────────────────────────
type ItemPed = { codigo: string; descricao: string; familia: string; qtd: number; unitario: number; total: number; custo: number; desconto: number }
function JanelaPedido({ pedido, onFechar }: { pedido: PedidoPc; onFechar: () => void }) {
  const [verNota, setVerNota] = useState(false)
  const { d, erro } = useJson<{ itens: ItemPed[] }>(`/api/empresa/pedido-itens?conta=${pedido.conta}&pedido=${encodeURIComponent(pedido.numero)}`)
  const ficou = pedido.venda - pedido.custo
  return (
    <div className="fp-modal-fundo pcp-fundo pcp-fundo2" role="presentation" onClick={(ev) => { ev.stopPropagation(); if (!verNota) onFechar() }}>
      <div className="fp-modal" role="dialog" aria-modal="true" aria-label={`Pedido ${pedido.numero}`} onClick={(ev) => ev.stopPropagation()}>
        <div className="fp-modal-cab">
          <div><small>{br(pedido.data)} · <em className="pcp-canal" style={{ '--c': COR_CANAL[pedido.canal] } as CSSProperties}>{pedido.canal}</em></small><b>Pedido {pedido.numero} · {pedido.cliente || 'sem nome'}</b><small>{quemFaturou(pedido.vendedor)}{pedido.categoria ? ` · ${pedido.categoria}` : ''}</small></div>
          <button type="button" className="fp-modal-x" onClick={onFechar} aria-label="fechar">×</button>
        </div>
        <div className="pcp-conta">
          <span>Venda<b>{brl2(pedido.venda)}</b></span>
          <span>Custo<b>{brl2(pedido.custo)}</b></span>
          <span>Ficou<b style={{ color: ficou >= 0 ? '#15803d' : '#dc2626' }}>{brl2(ficou)}</b></span>
          <button type="button" className="pcp-nota" onClick={() => setVerNota(true)}><i className="fas fa-file-pdf" /> Nota fiscal</button>
        </div>
        {erro && <div className="pcp-aviso">{erro}</div>}
        {!d && !erro && <p className="fp-lista-vazio">Buscando as peças…</p>}
        {d && (
          <div className="fp-lista-l">
            <div className="pcp-it cab"><span>Peça</span><span>Qtd × unitário</span><span>Custo</span><span>Total</span></div>
            {d.itens.map((item, j) => (
              <div key={j} className="pcp-it">
                <span><b>{item.descricao}</b><small>{item.codigo}{item.familia && !/pe[çc]a/i.test(item.familia) ? ` · ${item.familia}` : ''}</small></span>
                <span>{item.qtd.toLocaleString('pt-BR')} × {brl2(item.unitario)}</span>
                <span>{brl2(item.custo)}</span>
                <b>{brl2(item.total)}</b>
              </div>
            ))}
            {!d.itens.length && <p className="fp-lista-vazio">Sem itens.</p>}
          </div>
        )}
      </div>
      {verNota && <JanelaNotaPedido p={pedido} onFechar={() => setVerNota(false)} />}
    </div>
  )
}

/** a nota do pedido (DANFE) — lê a nota guardada no portal; sem ela, o Omie */
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
    <div className="cmw-fundo cmpdf-fundo" onClick={(ev) => { ev.stopPropagation(); onFechar() }}>
      <div className="cmpdf" onClick={(e) => e.stopPropagation()}>
        <div className="cml-janela-cab"><h3>{num ? `Nota nº ${num}` : `Pedido ${p.numero}`}</h3><span>{p.cliente}</span>{url && <a className="cm-bt" href={url} download={`NF_${num || p.numero}.pdf`}><i className="fas fa-download" /> Baixar</a>}<button className="cma-x" onClick={onFechar} aria-label="Fechar"><i className="fas fa-xmark" /></button></div>
        {url ? <iframe className="cmpdf-frame" src={url} title="Nota fiscal" /> : <div className="cmnf-msg">{erro || 'Abrindo a nota…'}</div>}
      </div>
    </div>
  )
}

// ── as peças paradas no estoque ──────────────────────────────────────────────
function ModalParados({ paradas, onFechar }: { paradas: ParadaPc[]; onFechar: () => void }) {
  const [busca, setBusca] = useState('')
  const linhas = paradas.filter((p) => !busca || `${p.codigo} ${p.descricao}`.toLowerCase().includes(busca.toLowerCase()))
  let total = 0
  for (const p of linhas) total = total + p.valor
  if (typeof document === 'undefined') return null
  return createPortal(
    <div className="fp-modal-fundo pcp-fundo" role="presentation" onClick={onFechar}>
      <div className="fp-modal fp-lista" role="dialog" aria-modal="true" aria-label="Peças paradas" onClick={(ev) => ev.stopPropagation()}>
        <div className="fp-modal-cab">
          <div><small>estoque de hoje · pelo preço de custo</small><b>Peças paradas: {brl(total)}</b><small>{linhas.length} códigos sem vender há mais de 90 dias (os de maior valor primeiro)</small></div>
          <button type="button" className="fp-modal-x" onClick={onFechar} aria-label="fechar">×</button>
        </div>
        <input className="fp-lista-busca" placeholder="buscar por código ou descrição…" aria-label="buscar por código ou descrição" autoComplete="off" value={busca} onChange={(ev) => setBusca(ev.target.value)} />
        <div className="fp-lista-l">
          <div className="fp-lista-r cab pcp-par"><span>Código</span><span>Peça</span><span className="n">Estoque</span><span className="n">Valor</span><span>Última venda</span></div>
          {linhas.map((p) => (
            <div key={`${p.conta}|${p.codigo}`} className="fp-lista-r pcp-par">
              <span>{p.codigo}</span>
              <span><b>{p.descricao || '—'}</b><small>{p.conta === 'CASTRO' ? 'Castro' : 'Nova Tratores'}</small></span>
              <span className="v"><b>{p.estoque.toLocaleString('pt-BR')}</b></span>
              <span className="v"><b>{brl2(p.valor)}</b></span>
              <span>{p.ultimaVenda ? br(p.ultimaVenda) : 'nunca vendeu'}</span>
            </div>
          ))}
          {!linhas.length && <p className="fp-lista-vazio">Nenhuma peça{busca ? ' com essa busca' : ''}.</p>}
        </div>
      </div>
    </div>,
    document.body,
  )
}

// ── "Os N pedidos do período" (embaixo, abre e fecha) ─────────────────────────
function ListaDoPeriodo({ aberta, onAbrir, de, ate, todos, ligados, qtdNaConta }: { aberta: boolean; onAbrir: () => void; de: string; ate: string; todos: PedidoPc[]; ligados: Record<Canal, boolean>; qtdNaConta: number }) {
  const [marcado, setMarcado] = useState<Partial<Record<Canal, boolean>>>({})
  const [dDe, setDDe] = useState(de)
  const [dAte, setDAte] = useState(ate)
  const [busca, setBusca] = useState('')
  const [aberto, setAberto] = useState<PedidoPc | null>(null)
  // trocou o período lá em cima: as datas acompanham
  const [doPeriodo, setDoPeriodo] = useState(`${de}|${ate}`)
  if (doPeriodo !== `${de}|${ate}`) { setDoPeriodo(`${de}|${ate}`); setDDe(de); setDAte(ate) }
  // abriu: a tela desce até a lista
  const caixa = useRef<HTMLDivElement>(null)
  useEffect(() => { if (aberta) requestAnimationFrame(() => caixa.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })) }, [aberta])
  const ligado = (c: Canal) => marcado[c] ?? ligados[c]
  const linhas = todos
    .filter((p) => ligado(p.canal) && p.data >= dDe && p.data <= dAte)
    .filter((p) => !busca || `${p.numero} ${p.cliente} ${p.vendedor}`.toLowerCase().includes(busca.toLowerCase()))
    .sort((a, b) => b.data.localeCompare(a.data) || b.venda - a.venda)
  let total = 0
  for (const p of linhas) total = total + p.venda
  return (
    <div ref={caixa} className={`fp-os ${aberta ? 'aberta' : ''}`}>
      <button type="button" className="fp-os-t" onClick={onAbrir} aria-expanded={aberta}>
        <span><i className="fas fa-list-ul" /> Os {todos.length} pedidos do período<small>{qtdNaConta} na conta · filtre por canal e datas e abra cada pedido</small></span>
        <em>{aberta ? 'fechar' : 'abrir a lista'} <i className={`fas fa-chevron-${aberta ? 'up' : 'down'}`} /></em>
      </button>
      {aberta && (
        <div className="fp-lo">
          <div className="fp-lo-filtros">
            <div className="fp-lo-linha"><b>Canal</b><div className="fp-lo-chips">
              {CANAIS_PC.map((x) => {
                let n = 0, v = 0
                for (const p of todos) if (p.canal === x.canal) { n++; v += p.venda }
                return (
                  <button key={x.canal} type="button" className={`fp-lo-chip ${ligado(x.canal) ? 'on' : ''}`} style={{ '--c': x.cor } as CSSProperties} onClick={() => setMarcado({ ...marcado, [x.canal]: !ligado(x.canal) })} aria-pressed={ligado(x.canal)}>
                    <i>{ligado(x.canal) ? '✓' : ''}</i>{x.canal}<small>{n} · {brl2(v)}</small>
                  </button>
                )
              })}
            </div></div>
            <div className="fp-lo-linha"><b>Datas</b><div className="fp-lo-chips">
              <label>de <input type="date" value={dDe} min={de} max={dAte} onChange={(ev) => setDDe(ev.target.value || de)} /></label>
              <label>até <input type="date" value={dAte} min={dDe} max={ate} onChange={(ev) => setDAte(ev.target.value || ate)} /></label>
              <input className="fp-lo-busca" placeholder="buscar pedido, cliente ou vendedor…" aria-label="buscar pedido, cliente ou vendedor" autoComplete="off" value={busca} onChange={(ev) => setBusca(ev.target.value)} />
            </div></div>
          </div>
          <div className="fp-os-l">
            <div className="fp-os-r cab"><span>Data</span><span>Pedido</span><span>Cliente</span><span>Vendedor</span><span>Canal</span><span>Valor</span></div>
            {linhas.map((p) => (
              <div key={`${p.conta}|${p.numero}`} className="fp-os-r abre" role="button" tabIndex={0} onClick={() => setAberto(p)} onKeyDown={(ev) => { if (ev.key === 'Enter') setAberto(p) }} title="clique para abrir o pedido">
                <span>{dm(p.data)}</span>
                <span>{p.numero}</span>
                <span>{p.cliente || '—'}</span>
                <span>{quemFaturou(p.vendedor)}</span>
                <span><em style={{ '--c': COR_CANAL[p.canal] } as CSSProperties}>{p.canal}</em></span>
                <span>{brl2(p.venda)}<i className="fas fa-chevron-right fp-lo-seta" /></span>
              </div>
            ))}
            {!linhas.length && <p className="fp-lista-vazio">Nenhum pedido com esses filtros.</p>}
          </div>
          {linhas.length > 0 && <div className="fp-lo-tot"><div className="fp-os-r tot"><span /><span /><span>{linhas.length} pedidos</span><span /><span>Total</span><span>{brl2(total)}<i className="fas fa-chevron-right fp-lo-seta" style={{ visibility: 'hidden' }} /></span></div></div>}
        </div>
      )}
      {aberto && typeof document !== 'undefined' && createPortal(<JanelaPedido pedido={aberto} onFechar={() => setAberto(null)} />, document.body)}
    </div>
  )
}

// ── só o que é de Peças; o resto vem do ESTILO_FP do Pós-Vendas ──────────────
// as janelas ficam acima da tela cheia do diretor (.cma = 100060) e abaixo da nota fiscal (.cmpdf-fundo = 100085)
const CSS_PCP = `
.pcp-fundo { z-index: 100066 }
.pcp-fundo2 { z-index: 100068; background: rgba(15,23,42,.35) }
.pcp-chips { grid-template-columns: repeat(5, minmax(0, 1fr)) }
/* 5 canais numa linha: o valor desce para baixo do nome (lado a lado o texto encavalava — print de 18/11) */
.pcp-chips .fp-chip { grid-template-columns: auto minmax(0, 1fr); align-items: start; row-gap: 2px }
.pcp-chips .fp-chip-n { white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
.pcp-chips .fp-chip-n small { overflow: hidden; text-overflow: ellipsis }
.pcp-chips .fp-chip-v { grid-column: 2; text-align: left }
@media (max-width: 1200px) { .pcp-chips { grid-template-columns: repeat(2, minmax(0, 1fr)) } }
@media (max-width: 760px) { .pcp-chips { grid-template-columns: 1fr } }
.pcp-aviso { background: #fff7ed; border: 1px solid #fed7aa; color: #9a3412; border-radius: 12px; padding: 10px 14px; font-size: 14px }
.pcp-aviso button { border: 0; background: transparent; color: #9a3412; text-decoration: underline; font: inherit; cursor: pointer }
.pcp-conta { display: flex; flex-wrap: wrap; gap: 10px; align-items: center }
.pcp-conta > span { display: grid; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 8px 14px; font-size: 12.5px; color: #475569; min-width: 120px }
.pcp-conta > span b { font-size: 18px; color: #0f172a }
.pcp-nota { margin-left: auto; border: 1px solid #fca5a5; background: #fefefe; color: #b91c1c; border-radius: 99px; padding: 8px 16px; font: inherit; font-size: 14px; font-weight: 600; cursor: pointer }
.pcp-nota:hover { background: #fef2f2 }
.pcp-canal { font-style: normal; color: var(--c); font-weight: 600 }
.pcp-it { display: grid; grid-template-columns: minmax(0, 1fr) 150px 100px 100px; gap: 10px; align-items: center; padding: 9px 4px; border-top: 1px solid #f1f5f9; font-size: 14px }
.pcp-it > span { display: grid; min-width: 0 } .pcp-it > span:not(:first-child), .pcp-it > b { text-align: right }
.pcp-it small { font-size: 12.5px; color: #475569 } .pcp-it span b { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.pcp-it.cab { font-size: 13px; color: #475569; border-top: 0 }
.fp-lista-r.pcp-par { grid-template-columns: 90px minmax(0, 1fr) 80px 110px 110px; cursor: default }
.fp-lista-r.pcp-par:hover { background: transparent }
@media (max-width: 760px) { .pcp-it { grid-template-columns: minmax(0, 1fr) 90px } .pcp-it > span:nth-child(2), .pcp-it > span:nth-child(3) { display: none } .fp-lista-r.pcp-par { grid-template-columns: minmax(0, 1fr) 90px } .fp-lista-r.pcp-par > span:nth-child(1), .fp-lista-r.pcp-par > span:nth-child(3), .fp-lista-r.pcp-par > span:nth-child(5) { display: none } }
`
