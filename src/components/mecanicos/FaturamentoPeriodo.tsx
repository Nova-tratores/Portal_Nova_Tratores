'use client'
// "Faturamento por período" renovado — PÁGINA DE TESTE (José, 21/10/2026: "quero inovar essa tela… melhorar os
// cartões ali embaixo, melhorar a forma de trocar de mês, ter a opção de tirar e colocar ordens de serviço interno
// e garantia, encaixando ali junto com as OS não faturadas"). Usa a mesma base do Painel.
//  - "O que entra na conta": OS faturadas (sempre), garantia, internas e ainda não faturadas — liga/desliga.
//  - Trocar de período: duas formas (linha do tempo com barras | grade que desce do ano ao dia).
//  - Cartões: valor, comparação com o período anterior (até o mesmo dia) e mini-gráfico dos últimos períodos.
import { useId, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { BaseDados, Escala } from '@/lib/mecanicos/painel'
import { periodos, andarPeriodo, somarDias, diasUteis, montarPainel, SEM_META, SEM_TECNICO } from '@/lib/mecanicos/painel'
import { brl, Numero } from './ui'
import { JanelaOSParada } from './ParadoOpcoes'
import { useComAguardando, definirComAguardando } from './useComAguardando'
import VisualizadorDocumento, { type DocumentoVisualizavel } from '@/components/comum/VisualizadorDocumento'

const TXT = '#0f172a', SEG = '#334155', CLARO = '#64748b'
export type Grupo = 'faturada' | 'garantia' | 'interna' | 'aguardando'
export const GRUPOS_FAT: { g: Grupo; rot: string; cor: string; dica: string }[] = [
  { g: 'faturada', rot: 'OS faturadas', cor: '#2563eb', dica: 'OS faturadas para o cliente (com nota ou recibo).' },
  { g: 'garantia', rot: 'Garantia', cor: '#db2777', dica: 'OS de garantia faturadas: quem paga é a montadora (hora no teto da fábrica).' },
  { g: 'interna', rot: 'Internas', cor: '#64748b', dica: 'OS internas fechadas (serviço da loja, cortesia, entrega técnica): valor de referência, não entra dinheiro de cliente.' },
  { g: 'aguardando', rot: 'Ainda não faturadas', cor: '#f59e0b', dica: 'OS com o relatório preenchido que ainda esperam faturar (pela data do relatório).' },
]
const COR: Record<Grupo, string> = Object.fromEntries(GRUPOS_FAT.map((x) => [x.g, x.cor])) as Record<Grupo, string>

export interface ItemFat { os: string; numero: string | null; cliente: string; tecnicos: string[]; data: string; grupo: Grupo; bruto: number; servico: number; horas: number; kmValor: number; km: number; pecas: number; outros: number }

/** Junta faturadas, internas fechadas e as OS preenchidas esperando faturar numa lista só. */
export function itensDaBase(base: BaseDados): ItemFat[] {
  const out: ItemFat[] = []
  const faturadasIds = new Set(base.faturadas.map((o) => o.os))
  for (const o of base.faturadas) out.push({ os: o.os, numero: o.numeroOmie, cliente: o.cliente, tecnicos: o.tecnicos, data: o.data, grupo: o.garantia ? 'garantia' : 'faturada', bruto: o.bruto, servico: o.servico, horas: o.horasCobradas, kmValor: o.kmValor, km: o.km, pecas: o.pecas, outros: o.outros })
  for (const x of base.internasFechadas || []) {
    if (faturadasIds.has(x.os)) continue
    out.push({ os: x.os, numero: x.numeroOmie, cliente: x.cliente, tecnicos: x.tecnicos, data: x.data, grupo: 'interna', bruto: x.valor, servico: x.valorHoras ?? x.valor, horas: x.horas, kmValor: 0, km: 0, pecas: 0, outros: 0 })
  }
  for (const p of base.pendencias || []) {
    if (p.tipo !== 'preenchida' || !p.dataRef || faturadasIds.has(p.os)) continue
    out.push({ os: p.os, numero: null, cliente: p.cliente, tecnicos: p.tecnicos, data: p.dataRef.slice(0, 10), grupo: 'aguardando', bruto: Math.max(0, p.total - p.pecas), servico: p.maoDeObra, horas: 0, kmValor: p.deslocamento, km: 0, pecas: p.pecas, outros: 0 })
  }
  return out
}

type Soma = { bruto: number; servico: number; horas: number; kmValor: number; km: number; pecas: number; outros: number; n: number; porGrupo: Record<Grupo, number>; nGrupo: Record<Grupo, number> }
const vazio = (): Soma => ({ bruto: 0, servico: 0, horas: 0, kmValor: 0, km: 0, pecas: 0, outros: 0, n: 0, porGrupo: { faturada: 0, garantia: 0, interna: 0, aguardando: 0 }, nGrupo: { faturada: 0, garantia: 0, interna: 0, aguardando: 0 } })
function somar(itens: ItemFat[], de: string, ate: string): Soma {
  const s = vazio()
  for (const o of itens) {
    if (o.data < de || o.data > ate) continue
    s.bruto += o.bruto; s.servico += o.servico; s.horas += o.horas; s.kmValor += o.kmValor; s.km += o.km; s.pecas += o.pecas; s.outros += o.outros; s.n++
    s.porGrupo[o.grupo] += o.bruto; s.nGrupo[o.grupo]++
  }
  return s
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const MES3 = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
const dia = (d: string) => Number(d.slice(8, 10)), mes = (d: string) => Number(d.slice(5, 7)) - 1
function titulo(e: Escala, de: string, ate: string) {
  if (e === 'ano') return de.slice(0, 4)
  if (e === 'mes') return `${MESES[mes(de)][0].toUpperCase()}${MESES[mes(de)].slice(1)} de ${de.slice(0, 4)}`
  if (e === 'dia') { const w = new Date(`${de}T12:00:00Z`).getUTCDay(); return `${SEMANA[w][0].toUpperCase()}${SEMANA[w].slice(1)}, ${dia(de)} de ${MESES[mes(de)]}` }
  return mes(de) === mes(ate) ? `Semana de ${dia(de)} a ${dia(ate)} de ${MESES[mes(ate)]}` : `Semana de ${dia(de)} de ${MES3[mes(de)]} a ${dia(ate)} de ${MES3[mes(ate)]}`
}
const curto = (e: Escala, de: string) => (e === 'ano' ? de.slice(0, 4) : e === 'mes' ? `${MES3[mes(de)]}/${de.slice(2, 4)}` : `${dia(de)}/${String(mes(de) + 1).padStart(2, '0')}`)
const NOME_ANT: Record<Escala, string> = { dia: 'dia anterior', semana: 'semana anterior', mes: 'mês anterior', ano: 'ano anterior' }
const NOME_ANO: Record<Escala, string> = { dia: 'mesmo dia do ano passado', semana: 'mesma semana do ano passado', mes: 'mesmo mês do ano passado', ano: 'ano anterior' }
export type Comp = 'anterior' | 'ano' | 'outro' | 'datas' | 'nao'
const diasEntre = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000)

// ---------------------------------------------------------------- filtros

function Filtros({ on, setOn, s }: { on: Record<Grupo, boolean>; setOn: (g: Grupo) => void; s: Soma }) {
  const dentro = GRUPOS_FAT.filter((x) => on[x.g]).reduce((t, x) => t + s.porGrupo[x.g], 0)
  return (
    <div className="fp-linha-ctl">
      <span className="fp-ctl-t">O que entra na conta</span>
      <div className="fp-ctl-c">
        <div className="fp-mix" data-dica={`Na conta: ${brl(dentro)} de ${brl(s.bruto)} possíveis no período. Cada pedaço é um tipo de OS; os apagados estão fora da conta.`}>
          {GRUPOS_FAT.filter((x) => s.porGrupo[x.g] > 0.5).map((x) => <i key={x.g} className={on[x.g] ? '' : 'fora'} style={{ flexGrow: s.porGrupo[x.g], '--c': x.cor } as React.CSSProperties} />)}
        </div>
        <div className="fp-chips">
          {GRUPOS_FAT.map((x) => {
            const fixo = x.g === 'faturada', ligado = on[x.g]
            return (
              <button key={x.g} type="button" className={`fp-chip ${ligado ? 'on' : ''} ${fixo ? 'fixo' : ''}`} style={{ '--c': x.cor } as React.CSSProperties} onClick={() => !fixo && setOn(x.g)} aria-pressed={ligado} data-dica={`${x.rot.toUpperCase()} — ${x.dica}${fixo ? ' Sempre entra.' : ligado ? ' Clique para tirar da conta.' : ' Clique para somar na conta.'}`}>
                <span className="fp-chip-ic" aria-hidden>{ligado ? '✓' : '+'}</span>
                <span className="fp-chip-n">{x.rot}<small>{s.nGrupo[x.g]} OS · {s.bruto ? Math.round((s.porGrupo[x.g] / s.bruto) * 100) : 0}%</small></span>
                <span className="fp-chip-v">{brl(s.porGrupo[x.g])}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- trocar de período

function Escalas({ e, onE }: { e: Escala; onE: (e: Escala) => void }) {
  return (
    <div className="fp-esc" role="tablist">
      {([['dia', 'Dia'], ['semana', 'Semana'], ['mes', 'Mês'], ['ano', 'Ano']] as const).map(([k, r]) => <button key={k} type="button" role="tab" aria-selected={e === k} className={e === k ? 'on' : ''} onClick={() => onE(k)}>{r}</button>)}
    </div>
  )
}

/** Forma 1: ◀ título ▶ e uma linha do tempo de barras (empilhadas por tipo de OS); clicar escolhe o período. */
function NavLinha({ e, refDia: ref, hoje, itens, on, onRef }: { e: Escala; refDia: string; hoje: string; itens: ItemFat[]; on: Record<Grupo, boolean>; onRef: (r: string) => void }) {
  // o escolhido fica NO CENTRO; os que ainda não chegaram aparecem apagados
  const N = { dia: 15, semana: 13, mes: 13, ano: 7 }[e]
  const ancora = andarPeriodo(e, ref, Math.floor(N / 2))
  const lista = periodos(e, ancora, N).map((b) => ({ ...b, s: somar(itens, b.de, b.ate > hoje ? hoje : b.ate), futuro: b.de > hoje }))
  const max = Math.max(1, ...lista.map((x) => x.s.bruto))
  const sel = periodos(e, ref, 1)[0]
  return (
    <div className="fp-linha">
      {lista.map((b) => {
        const ativo = b.de === sel.de
        return (
          <button key={b.de} type="button" disabled={b.futuro} className={`fp-barra ${ativo ? 'on' : ''}`} onClick={() => onRef(b.de)} data-dica={`${titulo(e, b.de, b.ate)}: ${brl(b.s.bruto)} em ${b.s.n} OS${b.ate > hoje ? ' (em andamento)' : ''}. Clique para ver.`}>
            <span className="fp-barra-v">{b.s.bruto >= 1000 ? `${Math.round(b.s.bruto / 1000)}k` : Math.round(b.s.bruto)}</span>
            <span className="fp-barra-col">
              {GRUPOS_FAT.filter((x) => on[x.g]).map((x) => <i key={x.g} style={{ height: `${(b.s.porGrupo[x.g] / max) * 100}%`, background: x.cor }} />)}
            </span>
            <small>{curto(e, b.de)}{b.ate > hoje && b.de <= hoje ? ' •' : ''}</small>
          </button>
        )
      })}
    </div>
  )
}

/** Forma 2: grade que desce — ano → meses → semanas → dias; cada quadro mostra o valor e uma barrinha. */
function NavGrade({ e, refDia: ref, hoje, itens, onEscolher }: { e: Escala; refDia: string; hoje: string; itens: ItemFat[]; onEscolher: (e: Escala, r: string) => void }) {
  // o que mostrar na grade: os "irmãos" do período escolhido dentro do nível de cima
  const ano = ref.slice(0, 4)
  let quadros: { rot: string; sub?: string; de: string; ate: string; e: Escala }[]
  if (e === 'ano') quadros = periodos('ano', hoje, 6).map((b) => ({ rot: b.rotulo, de: b.de, ate: b.ate, e: 'ano' as Escala }))
  else if (e === 'mes') quadros = Array.from({ length: 12 }, (_, i) => { const de = `${ano}-${String(i + 1).padStart(2, '0')}-01`; const ate = somarDias(i === 11 ? `${Number(ano) + 1}-01-01` : `${ano}-${String(i + 2).padStart(2, '0')}-01`, -1); return { rot: `${MESES[i][0].toUpperCase()}${MESES[i].slice(1)}`, de, ate, e: 'mes' as Escala } })
  else if (e === 'semana') {
    const ini = `${ref.slice(0, 7)}-01`, fimM = somarDias(mes(ref) === 11 ? `${Number(ano) + 1}-01-01` : `${ano}-${String(mes(ref) + 2).padStart(2, '0')}-01`, -1)
    const semanas = periodos('semana', fimM, 6).filter((b) => b.ate >= ini)
    quadros = semanas.map((b) => ({ rot: `${dia(b.de)}/${String(mes(b.de) + 1).padStart(2, '0')} a ${dia(b.ate)}/${String(mes(b.ate) + 1).padStart(2, '0')}`, de: b.de, ate: b.ate, e: 'semana' as Escala }))
  } else {
    const sem = periodos('semana', ref, 1)[0]
    quadros = Array.from({ length: 7 }, (_, i) => { const d = somarDias(sem.de, i); const w = new Date(`${d}T12:00:00Z`).getUTCDay(); return { rot: `${SEMANA[w].slice(0, 3)} ${dia(d)}`, de: d, ate: d, e: 'dia' as Escala } })
  }
  const somas = quadros.map((q) => ({ ...q, s: somar(itens, q.de, q.ate > hoje ? hoje : q.ate) }))
  const max = Math.max(1, ...somas.map((q) => q.s.bruto))
  const sel = periodos(e, ref, 1)[0]
  const subir: Record<Escala, Escala | null> = { dia: 'semana', semana: 'mes', mes: 'ano', ano: null }
  const descer: Record<Escala, Escala | null> = { ano: 'mes', mes: 'semana', semana: 'dia', dia: null }
  return (
    <div className="fp-grade-w">
      <div className="fp-grade-cam">
        <button type="button" onClick={() => onEscolher('ano', `${ano}-06-15`)} className={e === 'ano' ? 'on' : ''}>{ano}</button>
        {e !== 'ano' && <><i>›</i><button type="button" onClick={() => onEscolher('mes', ref)} className={e === 'mes' ? 'on' : ''}>{MESES[mes(ref)]}</button></>}
        {(e === 'semana' || e === 'dia') && <><i>›</i><button type="button" onClick={() => onEscolher('semana', ref)} className={e === 'semana' ? 'on' : ''}>semana de {dia(periodos('semana', ref, 1)[0].de)}</button></>}
        {e === 'dia' && <><i>›</i><span className="on">dia {dia(ref)}</span></>}
        {subir[e] && <button type="button" className="fp-grade-sobe" onClick={() => onEscolher(subir[e]!, ref)}>ver {subir[e] === 'ano' ? 'o ano' : subir[e] === 'mes' ? 'o mês' : 'a semana'} inteiro{subir[e] === 'semana' ? 'a' : ''}</button>}
      </div>
      <div className={`fp-grade n${somas.length}`}>
        {somas.map((q) => {
          const ativo = q.de === sel.de, futuro = q.de > hoje
          return (
            <div key={q.de} className={`fp-q ${ativo ? 'on' : ''} ${futuro ? 'futuro' : ''}`}>
              <button type="button" disabled={futuro} onClick={() => onEscolher(q.e, q.de)} data-dica={`${titulo(q.e, q.de, q.ate)}: ${brl(q.s.bruto)} em ${q.s.n} OS. Clique para escolher.`}>
                <small>{q.rot}</small>
                <b>{futuro ? '—' : brl(q.s.bruto)}</b>
                <span className="fp-q-barra"><i style={{ width: `${(q.s.bruto / max) * 100}%` }} /></span>
              </button>
              {descer[q.e] && !futuro && <button type="button" className="fp-q-abre" onClick={() => onEscolher(descer[q.e]!, q.de)} title="abrir por dentro">abrir ›</button>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Forma 3 (José, 21/10/2026: "coloca 4 cartões, e vai aumentando de tamanho: o dia, a semana, o mês e o ano;
 *  clicando num deles aparece faturadas, OS, peças… e dá opção de comparar"). Cada cartão é o período que contém
 *  a data escolhida; o clicado fica em destaque e o resto da tela mostra ele. */
function NavEscada({ e, refDia: ref, hoje, itens, onE, onComparar, comparando }: { e: Escala; refDia: string; hoje: string; itens: ItemFat[]; onE: (e: Escala) => void; onComparar: (e: Escala) => void; comparando: boolean }) {
  // uma cor para cada cartão (José, 21/10/2026: "colocar uma cor diferente em cada cartão")
  const COR_ESC: Record<Escala, string> = { dia: '#0891b2', semana: '#7c3aed', mes: '#2563eb', ano: '#0f766e' }
  const NOMES: Record<Escala, [string, string]> = { dia: ['Hoje', 'Dia'], semana: ['Esta semana', 'Semana'], mes: ['Este mês', 'Mês'], ano: ['Este ano', 'Ano'] }
  return (
    <div className="fp-escada">
      {(['dia', 'semana', 'mes', 'ano'] as Escala[]).map((k, i) => {
        const b = periodos(k, ref, 1)[0]
        const agora = b.de <= hoje && b.ate >= hoje
        const ate = b.ate > hoje ? hoje : b.ate
        const sv = somar(itens, b.de, ate)
        const p = periodos(k, andarPeriodo(k, ref, -1), 1)[0]
        const ateP = agora ? somarDias(p.de, Math.min(diasEntre(b.de, hoje), diasEntre(p.de, p.ate))) : p.ate
        const sp = somar(itens, p.de, ateP)
        const serie = periodos(k, ref, 8).map((x) => somar(itens, x.de, x.ate > hoje ? hoje : x.ate).bruto)
        const d = sv.bruto - sp.bruto, pc = sp.bruto ? Math.round((d / sp.bruto) * 100) : null
        const ativo = k === e
        return (
          <div key={k} role="button" tabIndex={0} className={`fp-deg d${i} ${ativo ? 'on' : ''} ${agora ? 'agora' : ''}`} style={{ '--c': COR_ESC[k] } as React.CSSProperties} onClick={() => onE(k)} onKeyDown={(ev) => { if (ev.key === 'Enter') onE(k) }} aria-pressed={ativo}
            data-dica={`${titulo(k, b.de, b.ate)}: ${brl(sv.bruto)} faturados em ${sv.n} OS. ${NOME_ANT[k][0].toUpperCase()}${NOME_ANT[k].slice(1)}${agora ? ' (até o mesmo dia)' : ''}: ${brl(sp.bruto)}. Clique para ver os detalhes ${k === 'dia' ? 'do dia' : k === 'semana' ? 'da semana' : k === 'mes' ? 'do mês' : 'do ano'} e comparar.`}>
            <div className="fp-deg-t"><span>{agora ? NOMES[k][0] : NOMES[k][1]}{agora && <i className="fp-vivo" />}</span><span className="fp-deg-d">{ativo && <em>{comparando ? 'comparando' : 'mostrando'}</em>}<button type="button" className={`fp-deg-cmp ${ativo && comparando ? 'on' : ''}`} onClick={(ev) => { ev.stopPropagation(); onComparar(k) }} data-dica={`Comparar ${k === 'dia' ? 'este dia' : k === 'semana' ? 'esta semana' : k === 'mes' ? 'este mês' : 'este ano'} com outro: a tela se divide, o atual à direita e o comparado à esquerda.`} aria-label="comparar"><span className="fp-deg-cmp-i">⇄</span></button></span></div>
            <small>{titulo(k, b.de, b.ate)}</small>
            <b><Numero valor={sv.bruto} formato={brl} /></b>
            <div className="fp-deg-p">
              <span>{sv.n} OS{pc != null && Math.abs(d) >= 0.5 && <> · <i className={d >= 0 ? 'bom' : 'ruim'}>{d >= 0 ? '▲' : '▼'} {Math.abs(pc)}%</i> vs {NOME_ANT[k].replace(' anterior', '').replace('dia', 'ontem').replace('semana', 'semana passada').replace('mês', 'mês passado').replace('ano', 'ano passado')}</>}</span>
              <Area vals={serie} rotulos={periodos(k, ref, 8).map((x) => titulo(k, x.de, x.ate))} cor={COR_ESC[k]} fmt={brl} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------- cartões

/** Gráfico de área dos últimos períodos; passar o mouse num ponto mostra o período e o valor. */
function Area({ vals, rotulos, cor, fmt }: { vals: number[]; rotulos: string[]; cor: string; fmt: (v: number) => string }) {
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
      <div className="fp-area-h">{vals.map((v, i) => <span key={i} data-dica={`${rotulos[i]}: ${fmt(v)}`} />)}</div>
    </div>
  )
}

function Cartoes({ s, ant, serie, nomeA, nomeB, onAbrir }: { s: Soma; ant: Soma | null; serie: Soma[]; rotulos: string[]; nomeA: string; nomeB: string; onAbrir: (m: Metrica) => void }) {
  const vh = s.horas > 0 ? s.servico / s.horas : 0
  const ticket = s.n ? s.bruto / s.n : 0, ticketA = ant?.n ? ant.bruto / ant.n : 0
  const qtd = (v: number) => String(Math.round(v))
  const ICONE: Record<string, string> = { fat: 'fa-sack-dollar', mo: 'fa-screwdriver-wrench', km: 'fa-route', pec: 'fa-gears', os: 'fa-file-lines' }
  const C: { k: string; t: string; n: number; a: number; sub: string; cor: string; dica: string; serie: number[]; fmt: (v: number) => string }[] = [
    { k: 'fat', t: 'Faturado', n: s.bruto, a: ant ? ant.bruto : 0, sub: `${s.n} OS no período`, cor: '#2563eb', dica: 'Tudo o que entrou nas OS que estão na conta (veja "O que entra na conta"): mão de obra + km + peças + outros.', serie: serie.map((x) => x.bruto), fmt: brl },
    { k: 'mo', t: 'Mão de obra', n: s.servico, a: ant ? ant.servico : 0, sub: s.horas > 0 ? `${(Math.round(s.horas * 10) / 10).toLocaleString('pt-BR')} h cobradas · ${brl(vh)}/h` : 'sem horas registradas', cor: '#7c3aed', dica: 'R$ das horas cobradas nas OS. O valor médio por hora fica abaixo da tabela por causa dos descontos e da garantia (R$ 100/h).', serie: serie.map((x) => x.servico), fmt: brl },
    { k: 'km', t: 'Deslocamento', n: s.kmValor, a: ant ? ant.kmValor : 0, sub: s.km > 0 ? `${Math.round(s.km).toLocaleString('pt-BR')} km cobrados` : 'sem km cobrado', cor: '#0891b2', dica: 'R$ dos quilômetros cobrados nas OS.', serie: serie.map((x) => x.kmValor), fmt: brl },
    { k: 'pec', t: 'Peças', n: s.pecas, a: ant ? ant.pecas : 0, sub: 'à parte · não entra no faturado', cor: '#ea580c', dica: 'Peças vendidas junto com as OS (pedido de peças faturado), pelo valor de venda. Ficam à parte: o faturado da oficina é mão de obra + deslocamento + outros. As peças de cada OS estão no PDF dela.', serie: serie.map((x) => x.pecas), fmt: brl },
    { k: 'os', t: 'Ordens de serviço', n: s.n, a: ant ? ant.n : 0, sub: `ticket médio ${brl(ticket)}${ticketA ? ` · antes ${brl(ticketA)}` : ''}`, cor: '#0f172a', dica: 'Quantas OS entraram na conta e quanto cada uma trouxe, em média (ticket médio).', serie: serie.map((x) => x.n), fmt: qtd },
  ]
  return (
    <div className="fp-cards">
      {C.map((c, i) => {
        const d = c.n - c.a, p = ant && c.a ? (d / c.a) * 100 : null, bom = d >= 0
        const mx = Math.max(c.n, c.a, 1)
        return (
          <div key={c.k} className="fp-card clica" style={{ '--c': c.cor, animationDelay: `${i * 60}ms` } as React.CSSProperties} role="button" tabIndex={0} onClick={() => onAbrir(c.k as Metrica)} onKeyDown={(ev) => { if (ev.key === 'Enter') onAbrir(c.k as Metrica) }}>
            <div className="fp-card-t">
              <span className="fp-card-n" data-dica={`${c.t.toUpperCase()} — ${c.dica}`}><i className={`fas ${ICONE[c.k]}`} aria-hidden />{c.t}</span>
              {p != null && Math.abs(d) >= 0.5 && <em className={`fp-pill ${bom ? 'bom' : 'ruim'}`}>{bom ? '▲' : '▼'} {Math.abs(Math.round(p))}%</em>}
            </div>
            <b className="fp-card-v"><Numero valor={c.n} formato={c.fmt} /></b>
            <small className="fp-card-s">{c.sub}</small>
            <span className="fp-card-ver">ver as OS ›</span>
            {ant ? (
              <div className="fp-vs" data-dica={`${nomeA}: ${c.fmt(c.n)} · ${nomeB}: ${c.fmt(c.a)} · diferença ${bom ? '+' : '−'}${c.fmt(Math.abs(d))}`}>
                <div><span>{nomeA}</span><i><u style={{ width: `${(c.n / mx) * 100}%` }} /></i><b>{c.fmt(c.n)}</b></div>
                <div className="b"><span>{nomeB}</span><i><u style={{ width: `${(c.a / mx) * 100}%` }} /></i><b>{c.fmt(c.a)}</b></div>
              </div>
            ) : <div className="fp-vs vazio">sem comparação</div>}
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------- metas do período

/** Metas da equipe no período (José, 21/10/2026: "do lado do mês, a meta básica de horas e valor, e a ideal, e
 *  quantos por cento foi das duas"). Por mecânico de campo, por semana: básica 20 h e R$ 4 mil; ideal 40 h e
 *  R$ 8 mil. Semanas do período = dias úteis ÷ 5 (o período inteiro, mesmo em andamento). */
function Metas({ base, e, refDia, hoje, s }: { base: BaseDados; e: Escala; refDia: string; hoje: string; s: Soma }) {
  const sel = periodos(e, refDia, 1)[0]
  const [abre, setAbre] = useState<string | null>(null)
  const tecs = useMemo(() => montarPainel(base, e, refDia, hoje, false).linhas.filter((l) => l.tecnico !== SEM_TECNICO && !SEM_META.has(l.tecnico) && l.meta > 0).length, [base, e, refDia, hoje])
  const semanas = diasUteis(sel.de, sel.ate) / 5
  if (!tecs || !semanas) return null
  const m = (h: number, r: number) => ({ h: h * semanas * tecs, r: r * semanas * tecs })
  const metas = [{ k: 'basica', t: 'Meta básica', ...m(20, 4000), cor: '#0f766e' }, { k: 'ideal', t: 'Meta ideal', ...m(40, 8000), cor: '#7c3aed' }]
  const hh = (v: number) => `${Math.round(v).toLocaleString('pt-BR')} h`
  const semTxt = (Math.round(semanas * 10) / 10).toLocaleString('pt-BR')
  return (
    <div className="fp-metas">
      {metas.map((x) => {
        const ph = x.h ? (s.horas / x.h) * 100 : 0, pr = x.r ? (s.bruto / x.r) * 100 : 0
        const aberto = abre === x.k
        return (
          <div key={x.k} className={`fp-meta ${aberto ? 'aberto' : ''}`} style={{ '--c': x.cor } as React.CSSProperties}>
            <button type="button" className="fp-meta-b" onClick={() => setAbre(aberto ? null : x.k)} aria-expanded={aberto} title="clique para ver horas e valor">
              <span>{x.t}</span><b className={pr >= 100 ? 'ok' : ''}>{Math.round(pr)}%</b>
            </button>
            {aberto && (
              <div className="fp-meta-pop" role="dialog" aria-label={x.t}>
                <div className="fp-meta-t"><b>{x.t}</b><small>{x.k === 'basica' ? '20 h e R$ 4 mil' : '40 h e R$ 8 mil'} por semana × {tecs} mecânicos × {semTxt} semanas</small></div>
                {([['Horas', hh(s.horas), hh(x.h), ph], ['Valor', brl(s.bruto), brl(x.r), pr]] as const).map(([r, feito, meta, p]) => (
                  <div key={r} className="fp-meta-l">
                    <span>{r}</span>
                    <div><small><b>{feito}</b> de {meta}</small><i><u style={{ width: `${Math.min(100, p)}%` }} /></i></div>
                    <b className={p >= 100 ? 'ok' : ''}>{Math.round(p)}%</b>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------- comparação lado a lado

/** Todos os números de um período num lado da comparação (José, 21/10/2026: "quando comparar, a data atual vai
 *  para a direita mostrando todos os dados dela, e na esquerda o outro"). Do lado A, a diferença para o B. */
function PainelPeriodo({ lado, titulo: tit, sub, s, outro, onLista, topo }: { lado: 'a' | 'b'; titulo: string; sub: string; s: Soma; outro?: Soma | null; onLista: (m: Metrica) => void; topo?: React.ReactNode }) {
  const hh = (v: number) => `${(Math.round(v * 10) / 10).toLocaleString('pt-BR')} h`
  const qtd = (v: number) => String(Math.round(v))
  const vh = s.horas > 0 ? s.servico / s.horas : 0
  const M: { k: Metrica | 'h' | 't'; t: string; v: number; o?: number; f: (v: number) => string; sub: string; cor: string }[] = [
    { k: 'fat', t: 'Faturado', v: s.bruto, o: outro?.bruto, f: brl, sub: `${s.n} OS`, cor: '#2563eb' },
    { k: 'mo', t: 'Mão de obra', v: s.servico, o: outro?.servico, f: brl, sub: s.horas ? `${hh(s.horas)} · ${brl(vh)}/h` : '—', cor: '#7c3aed' },
    { k: 'km', t: 'Deslocamento', v: s.kmValor, o: outro?.kmValor, f: brl, sub: s.km ? `${Math.round(s.km).toLocaleString('pt-BR')} km` : '—', cor: '#0891b2' },
    { k: 'pec', t: 'Peças', v: s.pecas, o: outro?.pecas, f: brl, sub: 'à parte · não entra no faturado', cor: '#ea580c' },
    { k: 'os', t: 'Ordens de serviço', v: s.n, o: outro?.n, f: qtd, sub: 'clique para ver a lista', cor: '#0f172a' },
    { k: 't', t: 'Ticket médio', v: s.n ? s.bruto / s.n : 0, o: outro ? (outro.n ? outro.bruto / outro.n : 0) : undefined, f: brl, sub: 'faturado ÷ OS', cor: '#475569' },
  ]
  return (
    <section className={`fp-pp ${lado}`}>
      <div className="fp-pp-cab">
        <em>{lado === 'a' ? 'A' : 'B'}</em>
        <div><b>{tit}</b><small>{sub}</small></div>
      </div>
      {topo}
      <div className="fp-pp-g">
        {M.map((x, i) => {
          const d = x.o != null ? x.v - x.o : null, p = d != null && x.o ? (d / x.o) * 100 : null
          const clica = x.k !== 'h' && x.k !== 't'
          return (
            <div key={x.k} className={`fp-pp-m ${clica ? 'clica' : ''}`} style={{ '--c': x.cor, animationDelay: `${i * 50}ms` } as React.CSSProperties} role={clica ? 'button' : undefined} tabIndex={clica ? 0 : undefined} onClick={() => clica && onLista(x.k as Metrica)}>
              <div className="fp-pp-mt"><span>{x.t}</span>{p != null && Math.abs(d!) >= 0.5 && <i className={`fp-pill ${d! >= 0 ? 'bom' : 'ruim'}`}>{d! >= 0 ? '▲' : '▼'} {Math.abs(Math.round(p))}%</i>}</div>
              <b><Numero valor={x.v} formato={x.f} /></b>
              <small>{x.sub}</small>
              {d != null && Math.abs(d) >= 0.5 && <small className={d >= 0 ? 'bom' : 'ruim'}>{d >= 0 ? '+' : '−'}{x.f(Math.abs(d))} em relação ao B</small>}
            </div>
          )
        })}
      </div>
      <div className="fp-pp-mix">{GRUPOS_FAT.filter((x) => s.porGrupo[x.g] > 0.5).map((x) => <i key={x.g} style={{ flexGrow: s.porGrupo[x.g], background: x.cor }} title={`${x.rot}: ${brl(s.porGrupo[x.g])} (${s.nGrupo[x.g]} OS)`} />)}</div>
      <div className="fp-pp-leg">{GRUPOS_FAT.filter((x) => s.nGrupo[x.g] > 0).map((x) => <span key={x.g}><i style={{ background: x.cor }} />{x.rot} <b>{brl(s.porGrupo[x.g])}</b></span>)}</div>
    </section>
  )
}

// ---------------------------------------------------------------- lista de OS de um cartão

type Metrica = 'fat' | 'mo' | 'km' | 'pec' | 'os'
const VALOR_DE: Record<Metrica, (o: ItemFat) => number> = { fat: (o) => o.bruto, mo: (o) => o.servico, km: (o) => o.kmValor, pec: (o) => o.pecas, os: (o) => o.bruto }
const NOME_MET: Record<Metrica, string> = { fat: 'Faturado', mo: 'Mão de obra', km: 'Deslocamento', pec: 'Peças', os: 'Ordens de serviço' }

/** José, 21/10/2026: "quando clicar aqui, mostra as ordens, os pedidos de venda, e quando clicar neles abre o modal
 *  com os PDFs". Clicar numa OS abre a janela dela (pedidos de peças com os itens e o PDF de cada um, e o PDF da OS). */
function ModalLista({ met, periodo, lista, onFechar }: { met: Metrica; periodo: string; lista: ItemFat[]; onFechar: () => void }) {
  const [os, setOs] = useState<ItemFat | null>(null)
  const [doc, setDoc] = useState<DocumentoVisualizavel | null>(null)
  const [busca, setBusca] = useState('')
  const val = VALOR_DE[met]
  const linhas = lista.filter((o) => met === 'os' || val(o) > 0.5).filter((o) => !busca || `${o.os} ${o.numero || ''} ${o.cliente} ${o.tecnicos.join(' ')}`.toLowerCase().includes(busca.toLowerCase())).sort((a, b) => val(b) - val(a))
  const total = linhas.reduce((t, o) => t + val(o), 0)
  const doPortal = (o: ItemFat) => !/^OMIE /.test(o.os)
  // direto no <body> (27/10/2026: "clico no cartão e não abre nada"): dentro da Janela Mecânicos o bloco tem
  // animação (transform) e corte nas bordas — a janela fixa ficava presa e cortada fora da tela
  if (typeof document === 'undefined') return null
  return createPortal(
    <div className="fp-modal-fundo" role="presentation" onClick={() => !os && !doc && onFechar()}>
      <div className="fp-modal fp-lista" role="dialog" aria-modal="true" aria-label={`${NOME_MET[met]} — ${periodo}`} onClick={(ev) => ev.stopPropagation()}>
        <div className="fp-modal-cab">
          <div><small>{periodo}</small><b>{NOME_MET[met]}: {met === 'os' ? `${linhas.length} OS` : brl(total)}</b><small>{linhas.length} ordens de serviço{met === 'pec' ? ' com pedido de peças' : ''} · clique numa OS para ver os pedidos de venda e os PDFs</small></div>
          <button type="button" className="fp-modal-x" onClick={onFechar} aria-label="fechar">×</button>
        </div>
        <input className="fp-lista-busca" placeholder="buscar por OS, cliente ou técnico" value={busca} onChange={(ev) => setBusca(ev.target.value)} />
        <div className="fp-lista-l">
          {/* todas as colunas; a do cartão clicado fica em destaque (José, 27/10/2026: "clicou em horas, abre dando
              destaque às horas; clicou em peças, às peças") */}
          <div className="fp-lista-r cab fp-lista-6"><span>Data</span><span>OS</span><span>Cliente · técnicos</span><span>Tipo</span>
            <span className={`n ${met === 'mo' ? 'dest' : ''}`}>Horas · M. obra</span><span className={`n ${met === 'km' ? 'dest' : ''}`}>Km · Desloc.</span>
            <span className={`n ${met === 'pec' ? 'dest' : ''}`}>Peças</span><span className={`n ${met === 'fat' || met === 'os' ? 'dest' : ''}`}>Faturado <small>sem peças</small></span><span /></div>
          {linhas.map((o) => (
            <div key={`${o.grupo}|${o.os}`} className={`fp-lista-r fp-lista-6 ${doPortal(o) ? '' : 'omie'}`} role="button" tabIndex={0} onClick={() => doPortal(o) && setOs(o)} onKeyDown={(ev) => { if (ev.key === 'Enter' && doPortal(o)) setOs(o) }} title={doPortal(o) ? 'abrir a OS, os pedidos de venda e os PDFs' : 'OS que existe só no Omie (sem a janela do portal)'}>
              <span>{o.data.split('-').reverse().slice(0, 2).join('/')}</span>
              <span><b>{o.numero ? `OS ${o.numero}` : o.os}</b>{o.numero && <small>{o.os}</small>}</span>
              <span><b>{o.cliente || '—'}</b><small>{o.tecnicos.join(', ') || 'sem técnico'}</small></span>
              <span><em style={{ '--c': COR[o.grupo] } as React.CSSProperties}>{GRUPOS_FAT.find((x) => x.g === o.grupo)?.rot}</em></span>
              <span className={`v ${met === 'mo' ? 'dest' : ''}`}><b>{o.horas ? `${String(Math.round(o.horas * 10) / 10).replace('.', ',')} h` : '—'}</b><small>{o.servico ? brl(o.servico) : ''}</small></span>
              <span className={`v ${met === 'km' ? 'dest' : ''}`}><b>{o.km ? `${Math.round(o.km).toLocaleString('pt-BR')} km` : '—'}</b><small>{o.kmValor ? brl(o.kmValor) : ''}</small></span>
              <span className={`v ${met === 'pec' ? 'dest' : ''}`}>{o.pecas && doPortal(o) ? <button type="button" className="fp-lista-pec" title="ver as peças no PDF da OS" onClick={(ev) => { ev.stopPropagation(); setDoc({ titulo: `${o.os} · ${o.cliente}`, url: `/api/pos/ordens/${encodeURIComponent(o.os)}/print`, nome: o.os }) }}><b>{brl(o.pecas)}</b><small>ver no PDF</small></button> : <b>{o.pecas ? brl(o.pecas) : '—'}</b>}</span>
              <span className={`v ${met === 'fat' || met === 'os' ? 'dest' : ''}`}><b>{brl(o.bruto)}</b></span>
              <span>{doPortal(o) && <button type="button" className="fp-lista-pdf" onClick={(ev) => { ev.stopPropagation(); setDoc({ titulo: `${o.os} · ${o.cliente}`, url: `/api/pos/ordens/${encodeURIComponent(o.os)}/print`, nome: o.os }) }}>PDF</button>}</span>
            </div>
          ))}
          {!linhas.length && <p className="fp-lista-vazio">Nenhuma OS{busca ? ' com essa busca' : ''} neste período.</p>}
        </div>
      </div>
      {os && <JanelaOSParada key={os.os} faturadaEm={os.grupo === 'aguardando' ? undefined : os.data} onFechar={() => setOs(null)}
        p={{ os: os.os, tipo: 'preenchida', status: os.grupo === 'aguardando' ? 'Aguardando faturar' : 'Faturada', cliente: os.cliente, tecnicos: os.tecnicos, dataRef: os.data, dias: 0, maoDeObra: os.servico, deslocamento: os.kmValor, pecas: os.pecas, total: os.bruto, garantia: os.grupo === 'garantia' }} />}
      {doc && <div className="fp-doc" onClick={(ev) => ev.stopPropagation()}><VisualizadorDocumento key={doc.url} doc={doc} onClose={() => setDoc(null)} /></div>}
    </div>,
    document.body,
  )
}

// ---------------------------------------------------------------- modal da comparação

/** Escolher o período B (José, 21/10/2026: "faz um modal bonitinho para a comparação"): grade de períodos com o
 *  valor de cada um, ou datas livres; embaixo a prévia A × B antes de confirmar. */
function ModalComparar({ e, a, hoje, itens, inicial, onOk, onFechar }: {
  e: Escala; a: { de: string; ate: string }; hoje: string; itens: ItemFat[]
  inicial: { tipo: 'outro' | 'datas'; ref: string; de: string; ate: string }
  onOk: (r: { tipo: 'outro' | 'datas'; ref: string; de: string; ate: string }) => void; onFechar: () => void
}) {
  const [aba, setAba] = useState<'outro' | 'datas'>(inicial.tipo)
  const [bRef, setBRef] = useState(inicial.ref)
  const [de, setDe] = useState(inicial.de), [ate, setAte] = useState(inicial.ate)
  const N = { dia: 14, semana: 12, mes: 12, ano: 6 }[e]
  const [ancora, setAncora] = useState(() => (e === 'mes' ? `${inicial.ref.slice(0, 4)}-12-15` : a.de))
  const lista = periodos(e, ancora, N)
  const ateA = a.ate > hoje ? hoje : a.ate
  const sA = somar(itens, a.de, ateA)
  const somaB = (de2: string, ate2: string) => somar(itens, de2, ate2 > hoje ? hoje : ate2)
  const vals = lista.map((b) => ({ ...b, s: somaB(b.de, b.ate) }))
  const max = Math.max(1, ...vals.map((x) => x.s.bruto), sA.bruto)
  const bSel = aba === 'outro' ? periodos(e, bRef, 1)[0] : { de, ate }
  const sB = somaB(bSel.de, bSel.ate)
  const d = sA.bruto - sB.bruto, pc = sB.bruto ? Math.round((d / sB.bruto) * 100) : null
  const passo = e === 'mes' ? 12 : N
  const nomeEsc = ({ dia: 'dia', semana: 'semana', mes: 'mês', ano: 'ano' } as Record<Escala, string>)[e]
  const atalhos: [string, number][] = [['últimos 7 dias', 7], ['últimos 30 dias', 30], ['últimos 90 dias', 90]]
  return (
    <div className="fp-modal-fundo" role="presentation" onClick={onFechar}>
      <div className="fp-modal" role="dialog" aria-modal="true" aria-label="Escolher o período para comparar" onClick={(ev) => ev.stopPropagation()}>
        <div className="fp-modal-cab">
          <div><small>Comparar</small><b>{titulo(e, a.de, a.ate)}</b><small>com qual período?</small></div>
          <button type="button" className="fp-modal-x" onClick={onFechar} aria-label="fechar">×</button>
        </div>
        <div className="fp-seg fp-modal-abas">
          <button type="button" className={aba === 'outro' ? 'on' : ''} onClick={() => setAba('outro')}>Escolher {e === 'semana' ? 'uma' : 'um'} {nomeEsc}</button>
          <button type="button" className={aba === 'datas' ? 'on' : ''} onClick={() => setAba('datas')}>Escolher as datas</button>
        </div>

        {aba === 'outro' ? (
          <div className="fp-modal-corpo">
            <div className="fp-modal-nav">
              <button type="button" onClick={() => setAncora(andarPeriodo(e, ancora, -passo))} aria-label="mais antigos">‹</button>
              <span>{e === 'mes' ? ancora.slice(0, 4) : `${titulo(e, lista[0].de, lista[0].ate)} até ${titulo(e, lista[lista.length - 1].de, lista[lista.length - 1].ate)}`}</span>
              <button type="button" onClick={() => setAncora(andarPeriodo(e, ancora, passo))} disabled={lista[lista.length - 1].ate >= hoje} aria-label="mais recentes">›</button>
            </div>
            <div className={`fp-modal-grade n${N}`}>
              {vals.map((b) => {
                const ehA = b.de === a.de, ehB = b.de === bSel.de, futuro = b.de > hoje
                return (
                  <button key={b.de} type="button" disabled={futuro || ehA} className={`fp-mq ${ehA ? 'a' : ''} ${ehB ? 'b' : ''}`} onClick={() => setBRef(b.de)}>
                    {ehA && <em className="ta">A</em>}{ehB && <em className="tb">B</em>}
                    <small>{e === 'mes' ? MESES[mes(b.de)][0].toUpperCase() + MESES[mes(b.de)].slice(1) : titulo(e, b.de, b.ate).replace('Semana de ', '')}</small>
                    <b>{futuro ? '—' : brl(b.s.bruto)}</b>
                    <span><i style={{ width: `${(b.s.bruto / max) * 100}%` }} /></span>
                  </button>
                )
              })}
            </div>
          </div>
        ) : (
          <div className="fp-modal-corpo">
            <div className="fp-modal-datas">
              <label><small>De</small><input type="date" value={de} max={ate} onChange={(ev) => setDe(ev.target.value)} /></label>
              <label><small>Até</small><input type="date" value={ate} min={de} max={hoje} onChange={(ev) => setAte(ev.target.value)} /></label>
            </div>
            <div className="fp-modal-atalhos">{atalhos.map(([r, dias]) => <button key={r} type="button" onClick={() => { setAte(somarDias(a.de, -1)); setDe(somarDias(a.de, -dias)) }}>{r} antes do período A</button>)}</div>
          </div>
        )}

        <div className="fp-modal-prev">
          <div className="pa"><em>A</em><span><small>{titulo(e, a.de, a.ate)}</small><b>{brl(sA.bruto)}</b><i>{sA.n} OS</i></span></div>
          <div className={`pdif ${d >= 0 ? 'bom' : 'ruim'}`}>{pc == null ? '—' : <>{d >= 0 ? '▲' : '▼'} {Math.abs(pc)}%<small>{d >= 0 ? '+' : '−'}{brl(Math.abs(d))}</small></>}</div>
          <div className="pb"><em>B</em><span><small>{aba === 'outro' ? titulo(e, bSel.de, bSel.ate) : `${bSel.de.split('-').reverse().join('/')} a ${bSel.ate.split('-').reverse().join('/')}`}</small><b>{brl(sB.bruto)}</b><i>{sB.n} OS</i></span></div>
        </div>
        <div className="fp-modal-pe">
          <button type="button" className="fp-bt-sec" onClick={onFechar}>Cancelar</button>
          <button type="button" className="fp-bt" onClick={() => onOk({ tipo: aba, ref: bRef, de, ate })}>Comparar</button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- a seção

/** No Painel o período é controlado de fora (`escala`/`refDia`/`onMudar`): o resto da tela segue o escolhido aqui.
 *  "Ainda não faturadas" é a MESMA caixinha do módulo (useComAguardando). */
export function FaturamentoPeriodo({ base, hoje, forma, escala, refDia, onMudar }: { base: BaseDados; hoje: string; forma: 'linha' | 'grade' | 'escada'; escala?: Escala; refDia?: string; onMudar?: (e: Escala, ref: string) => void }) {
  const [eL, setEL] = useState<Escala>('mes')
  const [refL, setRefL] = useState(hoje)
  const e = escala ?? eL, ref = refDia ?? refL
  const setE = (x: Escala) => { if (onMudar) onMudar(x, ref); else setEL(x) }
  const setRef = (r: string) => { if (onMudar) onMudar(e, r); else setRefL(r) }
  const comAg = useComAguardando()
  const [onL, setOnS] = useState<Record<Grupo, boolean>>({ faturada: true, garantia: true, interna: false, aguardando: false })
  const on = useMemo(() => ({ ...onL, aguardando: comAg }), [onL, comAg])
  const [verOS, setVerOS] = useState(false)
  const [foco, setFoco] = useState(true)
  const [comp, setComp] = useState<Comp>('anterior')
  const [bRef, setBRef] = useState(() => andarPeriodo('mes', hoje, -2))
  const [modal, setModal] = useState<null | 'outro' | 'datas'>(null)
  const [listaDe, setListaDe] = useState<Metrica | null>(null)
  const [listaB, setListaB] = useState<Metrica | null>(null)
  const [comparando, setComparando] = useState(false)
  const [bDe, setBDe] = useState(() => somarDias(hoje, -60))
  const [bAte, setBAte] = useState(() => somarDias(hoje, -31))
  const todos = useMemo(() => itensDaBase(base), [base])
  const itens = useMemo(() => todos.filter((o) => on[o.grupo]), [todos, on])
  const sel = periodos(e, ref, 1)[0]
  const andamento = sel.ate > hoje
  const ateSel = andamento ? hoje : sel.ate
  const s = somar(itens, sel.de, ateSel)
  const sTodos = somar(todos, sel.de, ateSel)
  // período B: anterior, o mesmo do ano passado ou datas livres — em andamento, só até o mesmo dia
  const prev = comp === 'datas' ? { de: bDe, ate: bAte } : comp === 'outro' ? periodos(e, bRef, 1)[0] : periodos(e, andarPeriodo(e, ref, comp === 'ano' ? ({ dia: -364, semana: -52, mes: -12, ano: -1 } as Record<Escala, number>)[e] : -1), 1)[0]
  const ateAnt = comp !== 'datas' && andamento ? somarDias(prev.de, Math.min(diasEntre(sel.de, hoje), diasEntre(prev.de, prev.ate))) : prev.ate
  const ant = comp === 'nao' ? null : somar(itens, prev.de, ateAnt)
  const br = (d: string) => d.split('-').reverse().join('/')
  const serie = periodos(e, ref, 8).map((b) => somar(itens, b.de, b.ate > hoje ? hoje : b.ate))
  const lista = itens.filter((o) => o.data >= sel.de && o.data <= ateSel).sort((a, b) => b.data.localeCompare(a.data) || b.bruto - a.bruto)
  const ir = (n: number) => { const r = andarPeriodo(e, ref, n); if (r <= hoje || n < 0) setRef(r > hoje ? hoje : r) }
  return (
    <div className={`fp ${foco ? 'foco' : ''}`}>
      <div className="fp-topo">
        <Escalas e={e} onE={(x) => setE(x)} />
        <div className="fp-nav">
          <button type="button" onClick={() => ir(-1)} aria-label="período anterior">‹</button>
          <div><b>{titulo(e, sel.de, sel.ate)}</b><small>{andamento ? `em andamento · até hoje` : `${sel.de.split('-').reverse().join('/')} a ${sel.ate.split('-').reverse().join('/')}`}</small></div>
          <button type="button" onClick={() => ir(1)} disabled={sel.ate >= hoje} aria-label="próximo período">›</button>
          {!andamento && <button type="button" className="fp-hoje" onClick={() => setRef(hoje)}>voltar para hoje</button>}
          <Metas base={base} e={e} refDia={ref} hoje={hoje} s={s} />
          {forma !== 'escada' && <button type="button" className={`fp-foco ${foco ? 'on' : ''}`} onClick={() => setFoco((v) => !v)} title="desfocar os outros períodos e destacar o escolhido"><span aria-hidden><i /></span>destacar o escolhido</button>}
        </div>
      </div>

      {forma === 'escada' ? <NavEscada e={e} refDia={ref} hoje={hoje} itens={itens} onE={setE} comparando={comparando} onComparar={(k) => { if (comparando && k === e) { setComparando(false); return } setE(k); if (comp === 'nao') setComp('anterior'); setComparando(true) }} /> : forma === 'linha'
        ? <NavLinha e={e} refDia={ref} hoje={hoje} itens={itens} on={on} onRef={setRef} />
        : <NavGrade e={e} refDia={ref} hoje={hoje} itens={itens} onEscolher={(x, r) => { const rr = r > hoje ? hoje : r; if (onMudar) onMudar(x, rr); else { setEL(x); setRefL(rr) } }} />}

      <div className="fp-ctl">
      {forma !== 'escada' && <div className="fp-linha-ctl">
        <span className="fp-ctl-t">Comparar com</span>
        <div className="fp-ctl-c fp-ctl-row">
          <div className="fp-seg">
            {([['anterior', NOME_ANT[e]], ['ano', NOME_ANO[e]], ['outro', `outro ${({ dia: 'dia', semana: 'semana', mes: 'mês', ano: 'ano' } as Record<Escala, string>)[e]}`], ['datas', 'outras datas'], ['nao', 'não comparar']] as const).map(([k, r]) => <button key={k} type="button" className={comp === k ? 'on' : ''} onClick={() => (k === 'outro' || k === 'datas' ? setModal(k) : setComp(k))}>{r}{(k === 'outro' || k === 'datas') && ' …'}</button>)}
          </div>
          {ant && <button type="button" className="fp-b" onClick={() => setModal(comp === 'datas' ? 'datas' : 'outro')} data-dica="Clique para escolher outro período para comparar."><em>B</em>{comp === 'datas' ? `${br(bDe)} a ${br(bAte)}` : titulo(e, prev.de, prev.ate)}{comp !== 'datas' && ateAnt < prev.ate ? ` · até ${br(ateAnt).slice(0, 5)}` : ''}<u>trocar</u></button>}
        </div>
      </div>}
      <Filtros on={on} setOn={(g) => (g === 'aguardando' ? definirComAguardando(!comAg) : setOnS((x) => ({ ...x, [g]: !x[g] })))} s={sTodos} />
      </div>

      {modal && <ModalComparar e={e} a={sel} hoje={hoje} itens={itens} inicial={{ tipo: modal, ref: comp === 'outro' ? bRef : andarPeriodo(e, ref, -1), de: bDe, ate: bAte }} onFechar={() => setModal(null)} onOk={(r) => { if (r.tipo === 'outro') setBRef(r.ref); else { setBDe(r.de); setBAte(r.ate) } setComp(r.tipo); setModal(null) }} />}

      {listaDe && <ModalLista met={listaDe} periodo={titulo(e, sel.de, sel.ate)} lista={lista} onFechar={() => setListaDe(null)} />}
      {forma === 'escada' && comparando && ant ? (
        <div className="fp-lados">
          <PainelPeriodo lado="b" titulo={comp === 'datas' ? `${br(bDe)} a ${br(bAte)}` : titulo(e, prev.de, prev.ate)} sub={comp !== 'datas' && ateAnt < prev.ate ? `até ${br(ateAnt).slice(0, 5)}, o mesmo trecho do A` : 'período comparado'} s={ant} onLista={setListaB}
            topo={<div className="fp-pp-ctl">
              <button type="button" onClick={() => { setComp('outro'); setBRef(andarPeriodo(e, prev.de, -1)) }} aria-label="B um período para trás">‹</button>
              <button type="button" className={comp === 'anterior' ? 'on' : ''} onClick={() => setComp('anterior')}>{NOME_ANT[e]}</button>
              <button type="button" className={comp === 'ano' ? 'on' : ''} onClick={() => setComp('ano')}>ano passado</button>
              <button type="button" className={comp === 'outro' || comp === 'datas' ? 'on' : ''} onClick={() => setModal('outro')}>escolher…</button>
              <button type="button" onClick={() => { setComp('outro'); setBRef(andarPeriodo(e, prev.de, 1)) }} disabled={andarPeriodo(e, prev.de, 1) >= sel.de} aria-label="B um período para frente">›</button>
            </div>} />
          <div className="fp-lados-vs" aria-hidden><span>vs</span></div>
          <PainelPeriodo lado="a" titulo={titulo(e, sel.de, sel.ate)} sub={andamento ? 'em andamento · até hoje' : 'período escolhido'} s={s} outro={ant} onLista={setListaDe}
            topo={<button type="button" className="fp-pp-sair" onClick={() => setComparando(false)}>× sair da comparação</button>} />
        </div>
      ) : <Cartoes onAbrir={setListaDe} key={`${e}|${sel.de}|${comp}`} s={s} ant={ant} serie={serie} rotulos={periodos(e, ref, 8).map((b) => titulo(e, b.de, b.ate))} nomeA={curto(e, sel.de)} nomeB={comp === 'datas' ? `${br(bDe).slice(0, 5)} a ${br(bAte).slice(0, 5)}` : curto(e, prev.de)} />}
      {listaB && ant && <ModalLista met={listaB} periodo={comp === 'datas' ? `${br(bDe)} a ${br(bAte)}` : titulo(e, prev.de, prev.ate)} lista={itens.filter((o) => o.data >= prev.de && o.data <= ateAnt).sort((a, b) => b.data.localeCompare(a.data))} onFechar={() => setListaB(null)} />}

      <div className="fp-os">
        <button type="button" className="fp-os-t" onClick={() => setVerOS((v) => !v)}><span>As {lista.length} OS do período</span><small>{verOS ? 'fechar' : 'ver a lista'}</small></button>
        {verOS && (
          <div className="fp-os-l">
            <div className="fp-os-r cab"><span>Data</span><span>OS</span><span>Cliente</span><span>Técnicos</span><span>Tipo</span><span>Valor</span></div>
            {lista.map((o) => (
              <div key={`${o.grupo}|${o.os}`} className="fp-os-r">
                <span>{o.data.split('-').reverse().slice(0, 2).join('/')}</span>
                <span>{o.numero ? `OS ${o.numero}` : o.os}</span>
                <span>{o.cliente || '—'}</span>
                <span>{o.tecnicos.join(', ') || '—'}</span>
                <span><em style={{ '--c': COR[o.grupo] } as React.CSSProperties}>{GRUPOS_FAT.find((x) => x.g === o.grupo)?.rot}</em></span>
                <span>{brl(o.bruto)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export const ESTILO_FP = `
.fp { display: grid; gap: 14px; color: ${TXT}; font-size: 15px; font-variant-numeric: tabular-nums }
.fp b { font-weight: 700 } .fp .bom { color: #166534; font-style: normal } .fp .ruim { color: #991b1b; font-style: normal }
.fp [data-dica] { position: relative }
/* balão dentro de balão: com o mouse num filho que tem o seu, o do pai não aparece junto */
.fp [data-dica]:has([data-dica]:hover)::after { display: none }
.fp [data-dica]:hover::after { content: attr(data-dica); position: absolute; left: 50%; bottom: calc(100% + 10px); transform: translateX(-50%); z-index: 60; width: max-content; max-width: 340px; white-space: normal; text-align: left; background: #0f172a; color: #f8fafc; font-size: 14px; font-weight: 400; line-height: 1.5; padding: 10px 12px; border-radius: 10px; box-shadow: 0 10px 30px rgba(15,23,42,.3); pointer-events: none }

.fp-topo { display: flex; gap: 14px; align-items: center; flex-wrap: wrap }
.fp-esc { display: inline-flex; gap: 2px; background: #eef2f6; border-radius: 12px; padding: 4px }
.fp-esc button { border: 0; background: transparent; border-radius: 9px; padding: 8px 16px; font-family: inherit; font-size: 14.5px; font-weight: 500; color: ${SEG}; cursor: pointer; transition: all .2s } .fp-esc button.on { background: #fefefe; color: ${TXT}; font-weight: 700; box-shadow: 0 1px 3px rgba(15,23,42,.12) }
.fp-nav { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 280px }
.fp-nav > button:not(.fp-hoje) { width: 40px; height: 40px; border-radius: 50%; border: 1px solid #cbd5e1; background: #fefefe; font-size: 22px; line-height: 1; color: ${TXT}; cursor: pointer; transition: all .2s } .fp-nav > button:not(.fp-hoje):hover:not(:disabled) { border-color: #2563eb; color: #2563eb } .fp-nav > button:disabled { opacity: .35; cursor: default }
.fp-nav > div { display: grid; min-width: 230px; text-align: center } .fp-nav > div b { font-size: 21px } .fp-nav > div small { font-size: 13.5px; color: ${SEG} }
.fp-hoje { border: 1px solid #cbd5e1; background: #fefefe; border-radius: 99px; padding: 7px 14px; font-family: inherit; font-size: 13.5px; color: ${TXT}; cursor: pointer }

.fp-linha { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); gap: 6px; align-items: end; background: #fefefe; border: 1px solid #e2e8f0; border-radius: 14px; padding: 12px 12px 8px }
.fp-barra { display: grid; gap: 4px; justify-items: center; border: 0; background: transparent; border-radius: 10px; padding: 6px 2px; cursor: pointer; font-family: inherit; color: ${TXT}; transition: background .2s }
.fp-barra, .fp-q { transition: filter .25s, opacity .25s, background .2s, box-shadow .2s }
.fp.foco .fp-linha .fp-barra:not(.on):not(:hover):not(:focus-visible):not(:disabled), .fp.foco .fp-grade .fp-q:not(.on):not(:hover):not(.futuro) { filter: blur(1.4px) grayscale(.35); opacity: .5 }
.fp-barra:hover:not(:disabled) { background: #f1f5f9 } .fp-barra.on { background: #eff6ff; box-shadow: inset 0 0 0 2px #2563eb } .fp-barra:disabled { opacity: .3; cursor: default }
.fp-barra-v { font-size: 12.5px; color: ${SEG} } .fp-barra.on .fp-barra-v { color: #1d4ed8; font-weight: 700 }
.fp-barra-col { display: flex; flex-direction: column-reverse; width: 70%; max-width: 46px; height: 110px; border-radius: 6px; overflow: hidden; background: #f1f5f9 } .fp-barra-col i { display: block; transition: height .5s cubic-bezier(.2,.8,.2,1) }
.fp-barra small { font-size: 12.5px; color: ${SEG} } .fp-barra.on small { color: ${TXT}; font-weight: 700 }

.fp-grade-w { display: grid; gap: 10px; background: #fefefe; border: 1px solid #e2e8f0; border-radius: 14px; padding: 12px 14px }
.fp-grade-cam { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 14.5px } .fp-grade-cam > i { font-style: normal; color: ${CLARO} }
.fp-grade-cam button, .fp-grade-cam span { border: 0; background: transparent; font-family: inherit; font-size: 14.5px; color: #2563eb; cursor: pointer; padding: 2px 4px; border-radius: 6px } .fp-grade-cam .on { color: ${TXT}; font-weight: 700; cursor: default }
.fp-grade-sobe { margin-left: auto; border: 1px solid #cbd5e1 !important; border-radius: 99px !important; padding: 5px 12px !important; color: ${TXT} !important; font-size: 13.5px !important }
.fp-grade { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 8px } .fp-grade.n7 { grid-template-columns: repeat(7, minmax(0, 1fr)) } .fp-grade.n4, .fp-grade.n5, .fp-grade.n6 { grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)) }
.fp-q { position: relative; display: grid; border: 1px solid #e2e8f0; border-radius: 12px; background: #f8fafc; transition: all .2s } .fp-q:hover:not(.futuro) { border-color: #93c5fd } .fp-q.on { background: #eff6ff; border-color: #2563eb; box-shadow: 0 0 0 1px #2563eb } .fp-q.futuro { opacity: .4 }
.fp-q > button:first-child { display: grid; gap: 4px; text-align: left; border: 0; background: transparent; padding: 10px 12px 12px; font-family: inherit; color: ${TXT}; cursor: pointer } .fp-q small { font-size: 13px; color: ${SEG} } .fp-q b { font-size: 17px }
.fp-q-barra { height: 6px; border-radius: 99px; background: #e2e8f0; overflow: hidden } .fp-q-barra i { display: block; height: 100%; background: #2563eb; border-radius: 99px; transition: width .5s }
.fp-q-abre { position: absolute; top: 8px; right: 8px; border: 0; background: transparent; font-family: inherit; font-size: 12.5px; color: #2563eb; cursor: pointer; opacity: 0; transition: opacity .2s } .fp-q:hover .fp-q-abre, .fp-q.on .fp-q-abre { opacity: 1 }

.fp-escada { display: grid; grid-template-columns: 1fr 1.2fr 1.45fr 1.75fr; gap: 12px; align-items: stretch }
.fp-deg { display: grid; gap: 4px; align-content: start; text-align: left; background: #fefefe; border: 1px solid #e2e8f0; border-radius: 16px; padding: 14px 16px; font-family: inherit; color: ${TXT}; cursor: pointer; transition: transform .25s, box-shadow .25s, border-color .25s, filter .25s, opacity .25s }
.fp-deg:hover { transform: translateY(-2px); box-shadow: 0 10px 24px -12px rgba(15,23,42,.35) }
.fp-deg { --c: #2563eb; background: linear-gradient(180deg, color-mix(in srgb, var(--c) 7%, #fefefe), #fefefe 55%) }
.fp-deg-t span { color: var(--c) }
.fp-deg:hover { border-color: color-mix(in srgb, var(--c) 45%, #e2e8f0) }
.fp-deg.on { border-color: var(--c); box-shadow: 0 0 0 2px var(--c), 0 14px 30px -14px color-mix(in srgb, var(--c) 70%, transparent); background: linear-gradient(180deg, color-mix(in srgb, var(--c) 12%, #fefefe), #fefefe 60%) }
.fp-deg-t { display: flex; justify-content: space-between; align-items: center; gap: 8px; font-size: 14px; font-weight: 600; color: ${SEG} } .fp-deg-t span { display: inline-flex; align-items: center; gap: 6px } .fp-deg-t em { font-style: normal; font-size: 12px; color: #fefefe; background: var(--c); border-radius: 99px; padding: 2px 9px }
.fp-vivo { width: 8px; height: 8px; border-radius: 50%; background: #16a34a; box-shadow: 0 0 0 3px #16a34a33 }
.fp-deg > small { font-size: 13px; color: ${SEG} }
.fp-deg > b { line-height: 1.15; margin-top: 4px } .fp-deg.d0 > b { font-size: 22px } .fp-deg.d1 > b { font-size: 26px } .fp-deg.d2 > b { font-size: 30px } .fp-deg.d3 > b { font-size: 34px }
.fp-deg-p { display: grid; gap: 4px; margin-top: 6px; padding-top: 8px; border-top: 1px solid #f1f5f9 } .fp-deg-p span { font-size: 13px; color: ${SEG} } .fp-deg-p i { font-style: normal; font-weight: 600 }
.fp-foco { display: inline-flex; align-items: center; gap: 8px; border: 1px solid #cbd5e1; background: #fefefe; border-radius: 99px; padding: 5px 12px 5px 6px; font-family: inherit; font-size: 13.5px; color: ${TXT}; cursor: pointer }
.fp-foco > span { position: relative; width: 30px; height: 18px; border-radius: 99px; background: #cbd5e1; transition: background .2s } .fp-foco > span i { position: absolute; top: 3px; left: 3px; width: 12px; height: 12px; border-radius: 50%; background: #fefefe; transition: transform .25s } .fp-foco.on > span { background: #2563eb } .fp-foco.on > span i { transform: translateX(12px) }
.fp-outro { display: inline-flex; align-items: center; gap: 8px; background: #fff7ed; border: 1px solid #fdba74; border-radius: 99px; padding: 3px 6px } .fp-outro b { font-size: 14px; min-width: 150px; text-align: center } .fp-outro button { width: 28px; height: 28px; border-radius: 50%; border: 1px solid #fdba74; background: #fefefe; font-size: 18px; line-height: 1; color: #c2410c; cursor: pointer } .fp-outro button:disabled { opacity: .35; cursor: default }
@media (max-width: 1000px) { .fp-escada { grid-template-columns: 1fr 1fr } }
.fp-comp-l { display: flex; gap: 10px; align-items: center; flex-wrap: wrap } .fp-comp-l .fp-esc button { font-size: 13.5px; padding: 7px 12px }
.fp-datas { display: inline-flex; gap: 6px; align-items: center; font-size: 14px } .fp-datas input { border: 1px solid #cbd5e1; border-radius: 8px; padding: 5px 8px; font-family: inherit; font-size: 14px; color: ${TXT} }
.fp-comp-ate { font-size: 13.5px; color: ${SEG} }
.fp-ctl { position: relative; z-index: 3; display: grid; background: #fefefe; border: 1px solid #e2e8f0; border-radius: 16px }
/* explicações das chaves e da barra abrem para BAIXO (para cima ficavam atrás dos cartões) */
.fp .fp-ctl [data-dica]:hover::after { bottom: auto; top: calc(100% + 10px) }
.fp-chip:hover, .fp-mix:hover { z-index: 30 }
.fp-linha-ctl { display: grid; grid-template-columns: 190px minmax(0, 1fr); gap: 16px; align-items: center; padding: 14px 18px }
.fp-linha-ctl + .fp-linha-ctl { border-top: 1px solid #eef2f6 }
.fp-ctl-t { font-size: 14px; font-weight: 700; color: ${TXT} }
.fp-ctl-c { display: grid; gap: 10px; min-width: 0 } .fp-ctl-row { display: flex; gap: 12px; align-items: center; flex-wrap: wrap }
.fp-seg { display: inline-flex; gap: 2px; background: #f1f5f9; border-radius: 12px; padding: 4px; flex-wrap: wrap }
.fp-seg button { border: 0; background: transparent; border-radius: 9px; padding: 8px 14px; font-family: inherit; font-size: 14px; font-weight: 500; color: ${SEG}; cursor: pointer; transition: background .25s, color .25s, box-shadow .25s }
.fp-seg button:hover { color: ${TXT} } .fp-seg button.on { background: #fefefe; color: ${TXT}; font-weight: 700; box-shadow: 0 1px 2px rgba(15,23,42,.1), 0 4px 12px -4px rgba(15,23,42,.18) }
.fp-b { display: inline-flex; align-items: center; gap: 8px; font-size: 14px; color: ${TXT}; background: #fff7ed; border: 1px solid #fed7aa; border-radius: 99px; padding: 4px 12px 4px 4px; animation: fpEntra .3s both }
.fp-b em { font-style: normal; width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center; background: #ea580c; color: #fefefe; font-size: 12px; font-weight: 700 }
.fp-mix { display: flex; height: 10px; border-radius: 99px; overflow: hidden; gap: 2px }
.fp-mix i { background: var(--c); transition: flex-grow .5s, opacity .3s, filter .3s } .fp-mix i.fora { opacity: .18; filter: grayscale(1) }
.fp-chips { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px }
.fp-chip { position: relative; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 10px; align-items: center; border: 1.5px dashed #cbd5e1; background: #fefefe; border-radius: 14px; padding: 10px 14px; font-family: inherit; color: ${SEG}; cursor: pointer; text-align: left; transition: background .3s, border-color .3s, color .3s, box-shadow .3s, transform .2s }
.fp-chip:hover:not(.fixo) { transform: translateY(-2px); border-color: var(--c); color: ${TXT}; box-shadow: 0 10px 22px -14px var(--c) }
.fp-chip-ic { width: 26px; height: 26px; border-radius: 8px; display: grid; place-items: center; font-size: 15px; font-weight: 700; background: #f1f5f9; color: ${SEG}; transition: all .3s }
.fp-chip-n { display: grid; font-size: 14.5px; font-weight: 600; line-height: 1.25 } .fp-chip-n small { font-size: 12.5px; font-weight: 400; opacity: .85 }
.fp-chip-v { font-size: 16px; font-weight: 700; text-align: right; white-space: nowrap }
.fp-chip.on { border: 1.5px solid transparent; background: linear-gradient(135deg, var(--c), color-mix(in srgb, var(--c) 70%, #0f172a)); color: #fefefe; box-shadow: 0 10px 24px -14px var(--c) }
.fp-chip.on .fp-chip-ic { background: rgba(255,255,255,.22); color: #fefefe }
.fp-chip.on:hover { box-shadow: 0 14px 28px -12px var(--c) }
.fp-chip.fixo { cursor: default }
.fp-nav > .fp-metas, .fp-metas { display: flex; flex-wrap: nowrap; gap: 8px; min-width: 0; text-align: left; align-items: center }
.fp-meta { position: relative }
.fp-meta-b { display: inline-flex; align-items: baseline; gap: 8px; border: 1px solid color-mix(in srgb, var(--c) 35%, #e2e8f0); background: color-mix(in srgb, var(--c) 7%, #fefefe); border-radius: 99px; padding: 7px 14px; font-family: inherit; cursor: pointer; transition: box-shadow .2s, transform .2s }
.fp-meta-b:hover, .fp-meta.aberto .fp-meta-b { box-shadow: 0 6px 16px -10px var(--c); transform: translateY(-1px) }
.fp-meta-b span { font-size: 14px; font-weight: 600; color: var(--c) } .fp-meta-b b { font-size: 17px; color: ${TXT} } .fp-meta-b b.ok { color: #166534 }
.fp-meta-pop { position: absolute; top: calc(100% + 8px); left: 0; z-index: 40; width: 330px; display: grid; gap: 10px; background: #fefefe; border: 1px solid #e2e8f0; border-radius: 14px; padding: 14px 16px; box-shadow: 0 18px 40px -16px rgba(15,23,42,.4); animation: fpEntra .2s both }
.fp-meta-t { display: grid; gap: 2px } .fp-meta-t b { font-size: 15px; color: var(--c) } .fp-meta-t small { font-size: 12.5px; color: ${SEG} }
.fp-meta-l { display: grid; grid-template-columns: 46px minmax(0, 1fr) 46px; gap: 10px; align-items: center }
.fp-meta-l > span { font-size: 13px; color: ${SEG} } .fp-meta-l > div { display: grid; gap: 4px } .fp-meta-l small { font-size: 13px; color: ${SEG} } .fp-meta-l small b { color: ${TXT} }
.fp-meta-l i { height: 7px; border-radius: 99px; background: #eef2f6; overflow: hidden } .fp-meta-l u { display: block; height: 100%; border-radius: 99px; background: var(--c); transition: width .7s cubic-bezier(.2,.8,.2,1) }
.fp-meta-l > b { text-align: right; font-size: 15px } .fp-meta-l > b.ok { color: #166534 }
.fp-cards { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px }
.fp-card { position: relative; display: grid; gap: 2px; align-content: start; background: #fefefe; border: 1px solid #e2e8f0; border-radius: 16px; padding: 16px 18px 14px; animation: fpEntra .45s both; transition: box-shadow .25s, transform .25s, border-color .25s }
.fp-card:hover { z-index: 5; transform: translateY(-2px); box-shadow: 0 14px 30px -18px rgba(15,23,42,.45); border-color: color-mix(in srgb, var(--c, #94a3b8) 40%, #e2e8f0) }
.fp-card.largo { grid-column: 1 / -1 }
.fp-card-t { display: flex; justify-content: space-between; align-items: center; gap: 8px; font-size: 14px; font-weight: 600; color: ${SEG} }
.fp-card-n { display: inline-flex; align-items: center; gap: 10px; font-size: 16.5px; font-weight: 500; color: ${TXT} }
.fp .fp-card-v, .fp .fp-vs b, .fp .fp-card .fp-pill { font-weight: 500 }
.fp-card-n > i { width: 38px; height: 38px; border-radius: 11px; display: grid; place-items: center; font-size: 16px; color: var(--c); background: color-mix(in srgb, var(--c) 12%, #fefefe); border: 1px solid color-mix(in srgb, var(--c) 22%, #fefefe) }
.fp-card .fp-vs { margin-top: 10px }
.fp-pill { font-style: normal; font-size: 12.5px; font-weight: 700; border-radius: 99px; padding: 3px 9px } .fp-pill.bom { color: #166534; background: #dcfce7 } .fp-pill.ruim { color: #991b1b; background: #fee2e2 }
.fp-card-v { font-size: 30px; line-height: 1.15; margin-top: 12px; letter-spacing: -.01em }
.fp-card-s { font-size: 13.5px; color: ${SEG} }
.fp-area { position: relative; height: 56px; margin: 10px -2px 4px }
.fp-area svg { width: 100%; height: 100% }
.fp-area-l { stroke-dasharray: 1; stroke-dashoffset: 1; animation: fpTraca 1s .15s cubic-bezier(.3,.8,.3,1) forwards }
.fp-area-pt { position: absolute; width: 9px; height: 9px; border-radius: 50%; transform: translate(-50%, -50%); box-shadow: 0 0 0 4px color-mix(in srgb, var(--c, #2563eb) 22%, transparent); animation: fpPulso 2s 1.1s infinite }
.fp-area-h { position: absolute; inset: 0; display: flex }
.fp .fp-area-h span:first-child:hover::after { left: 0; transform: none } .fp .fp-area-h span:last-child:hover::after { left: auto; right: 0; transform: none }
.fp .fp-card-t span[data-dica]:hover::after { left: 0; transform: none } .fp-area-h span { flex: 1 } .fp-area-h span:hover { background: linear-gradient(to bottom, transparent, rgba(15,23,42,.05)) }
.fp-vs { display: grid; gap: 6px; padding-top: 10px; border-top: 1px solid #f1f5f9 }
.fp-vs > div { display: grid; grid-template-columns: 52px minmax(0, 1fr) auto; gap: 8px; align-items: center; font-size: 13px }
.fp-vs > div > span { color: ${SEG} } .fp-vs > div > b { font-size: 13.5px; text-align: right }
.fp-vs i { height: 8px; border-radius: 99px; background: #f1f5f9; overflow: hidden } .fp-vs u { display: block; height: 100%; border-radius: 99px; background: var(--c); transition: width .7s cubic-bezier(.2,.8,.2,1) }
.fp-vs .b u { background: #cbd5e1 } .fp-vs .b b { color: ${SEG}; font-weight: 600 }
.fp-vs.vazio { font-size: 13px; color: ${CLARO} }
.fp-comp { display: flex; height: 26px; border-radius: 8px; overflow: hidden; gap: 2px; margin-top: 8px } .fp-comp i { display: flex; align-items: center; justify-content: center; font-style: normal; font-size: 12.5px; font-weight: 600; color: #fefefe; transition: flex-grow .5s }
.fp-comp-leg { display: flex; gap: 8px 22px; flex-wrap: wrap; font-size: 14px; margin-top: 8px } .fp-comp-leg span { display: inline-flex; align-items: center; gap: 6px } .fp-comp-leg i { width: 10px; height: 10px; border-radius: 3px } .fp-comp-leg small { color: ${SEG} }
.fp-b { cursor: pointer; font-family: inherit } .fp-b u { text-decoration: none; font-size: 12.5px; color: #c2410c; margin-left: 4px } .fp-b:hover { box-shadow: 0 4px 12px -6px rgba(234,88,12,.5) }
.fp-modal-fundo { position: fixed; inset: 0; z-index: 9500; background: rgba(15,23,42,.45); backdrop-filter: blur(4px); display: grid; place-items: center; padding: 16px; animation: fpFundo .2s both }
.fp-modal { width: min(820px, 100%); max-height: calc(100vh - 32px); overflow: auto; background: #fefefe; border-radius: 20px; box-shadow: 0 30px 80px -20px rgba(15,23,42,.55); display: grid; gap: 16px; padding: 22px 24px; animation: fpModal .3s cubic-bezier(.2,.9,.3,1.1) both }
.fp-modal-cab { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px } .fp-modal-cab > div { display: grid } .fp-modal-cab small { font-size: 13.5px; color: ${SEG} } .fp-modal-cab b { font-size: 22px; color: #1d4ed8 }
.fp-modal-x { width: 36px; height: 36px; border-radius: 50%; border: 1px solid #e2e8f0; background: #fefefe; font-size: 22px; line-height: 1; color: ${SEG}; cursor: pointer } .fp-modal-x:hover { background: #f1f5f9; color: ${TXT} }
.fp-modal-abas { justify-self: start }
.fp-modal-corpo { display: grid; gap: 12px; animation: fpEntra .25s both }
.fp-modal-nav { display: flex; align-items: center; justify-content: center; gap: 14px; font-size: 15px; font-weight: 700 }
.fp-modal-nav button { width: 34px; height: 34px; border-radius: 50%; border: 1px solid #cbd5e1; background: #fefefe; font-size: 20px; line-height: 1; color: ${TXT}; cursor: pointer } .fp-modal-nav button:disabled { opacity: .35; cursor: default }
.fp-modal-grade { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px } .fp-modal-grade.n14 { grid-template-columns: repeat(7, minmax(0, 1fr)) } .fp-modal-grade.n6 { grid-template-columns: repeat(3, minmax(0, 1fr)) }
.fp-mq { position: relative; display: grid; gap: 4px; text-align: left; border: 1px solid #e2e8f0; background: #f8fafc; border-radius: 12px; padding: 10px 12px; font-family: inherit; color: ${TXT}; cursor: pointer; transition: all .2s }
.fp-mq:hover:not(:disabled) { border-color: #fdba74; background: #fff7ed; transform: translateY(-1px) } .fp-mq:disabled { cursor: default } .fp-mq:disabled:not(.a) { opacity: .35 }
.fp-mq small { font-size: 13px; color: ${SEG} } .fp-mq b { font-size: 16px } .fp-mq > span { height: 5px; border-radius: 99px; background: #e2e8f0; overflow: hidden } .fp-mq > span i { display: block; height: 100%; border-radius: 99px; background: #94a3b8 }
.fp-mq.a { background: #eff6ff; border-color: #93c5fd } .fp-mq.a > span i { background: #2563eb }
.fp-mq.b { background: #fff7ed; border-color: #ea580c; box-shadow: 0 0 0 1px #ea580c } .fp-mq.b > span i { background: #ea580c }
.fp-mq em { position: absolute; top: 8px; right: 8px; width: 20px; height: 20px; border-radius: 50%; display: grid; place-items: center; font-style: normal; font-size: 11px; font-weight: 700; color: #fefefe } .fp-mq em.ta { background: #2563eb } .fp-mq em.tb { background: #ea580c }
.fp-modal-datas { display: flex; gap: 14px; flex-wrap: wrap } .fp-modal-datas label { display: grid; gap: 4px } .fp-modal-datas small { font-size: 13px; color: ${SEG} } .fp-modal-datas input { border: 1px solid #cbd5e1; border-radius: 10px; padding: 9px 12px; font-family: inherit; font-size: 15px; color: ${TXT} }
.fp-modal-atalhos { display: flex; gap: 8px; flex-wrap: wrap } .fp-modal-atalhos button { border: 1px solid #e2e8f0; background: #f8fafc; border-radius: 99px; padding: 6px 12px; font-family: inherit; font-size: 13px; color: ${TXT}; cursor: pointer } .fp-modal-atalhos button:hover { border-color: #fdba74; background: #fff7ed }
.fp-modal-prev { display: grid; grid-template-columns: 1fr auto 1fr; gap: 12px; align-items: center; background: #f8fafc; border: 1px solid #eef2f6; border-radius: 14px; padding: 12px 14px }
.fp-modal-prev > div:not(.pdif) { display: flex; gap: 10px; align-items: center } .fp-modal-prev > div span { display: grid } .fp-modal-prev small { font-size: 13px; color: ${SEG} } .fp-modal-prev b { font-size: 20px } .fp-modal-prev i { font-style: normal; font-size: 12.5px; color: ${SEG} }
.fp-modal-prev em { font-style: normal; width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; font-size: 13px; font-weight: 700; color: #fefefe; flex: none } .fp-modal-prev .pa em { background: #2563eb } .fp-modal-prev .pb em { background: #ea580c }
.fp-modal-prev .pb { justify-content: flex-end; text-align: right } .fp-modal-prev .pb span { order: -1 }
.pdif { display: grid; justify-items: center; font-size: 18px; font-weight: 700; border-radius: 12px; padding: 6px 12px } .pdif small { font-size: 12.5px; font-weight: 500 } .pdif.bom { color: #166534; background: #dcfce7 } .pdif.ruim { color: #991b1b; background: #fee2e2 }
.fp-modal-pe { display: flex; justify-content: flex-end; gap: 10px }
.fp-bt { border: 0; background: #0f172a; color: #fefefe; border-radius: 10px; padding: 10px 22px; font-family: inherit; font-size: 14.5px; font-weight: 600; cursor: pointer } .fp-bt:hover { background: #1e293b }
.fp-bt-sec { border: 1px solid #cbd5e1; background: #fefefe; color: ${TXT}; border-radius: 10px; padding: 10px 18px; font-family: inherit; font-size: 14.5px; cursor: pointer }
.fp-card.clica { cursor: pointer } .fp-card-ver { position: absolute; right: 16px; bottom: 8px; font-size: 12px; color: var(--c); opacity: 0; transition: opacity .2s } .fp-card.clica:hover .fp-card-ver { opacity: 1 }
.fp-lista { width: min(1100px, 100%) }
.fp-lista-busca { border: 1px solid #cbd5e1; border-radius: 10px; padding: 9px 12px; font-family: inherit; font-size: 14.5px; color: ${TXT} } .fp-lista-busca:focus { outline: 2px solid #2563eb; border-color: #2563eb }
.fp-lista-l { display: grid; max-height: 60vh; overflow: auto }
.fp-lista-r { display: grid; grid-template-columns: 60px 120px minmax(0, 1fr) 150px 120px 58px; gap: 12px; align-items: center; padding: 10px 8px; border-top: 1px solid #f1f5f9; font-size: 14px; border-radius: 10px; cursor: pointer; transition: background .15s }
.fp-lista-r:not(.cab):hover { background: #f8fafc } .fp-lista-r.omie { cursor: default; opacity: .75 }
.fp-lista-r > span { display: grid; min-width: 0 } .fp-lista-r b { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap } .fp-lista-r small { font-size: 12.5px; color: ${SEG}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.fp-lista-r .v { text-align: right; font-weight: 700 }
.fp-lista-r.fp-lista-6 { grid-template-columns: 54px 110px minmax(0, 1fr) 120px 100px 100px 96px 100px 50px; gap: 10px }
.fp-lista-r.fp-lista-6 .v { justify-items: end } .fp-lista-r.fp-lista-6 .v b { font-weight: 500 } .fp-lista-r.cab .n { text-align: right }
.fp-lista-r .dest { background: color-mix(in srgb, #2563eb 8%, transparent); border-radius: 8px; padding: 4px 8px; margin: -4px -8px } .fp-lista-r .dest b { font-weight: 700 !important; color: #1d4ed8 }
.fp-lista-r.cab .dest { color: #1d4ed8; font-weight: 700; padding: 2px 8px; margin: -2px -8px }
@media (max-width: 900px) { .fp-lista-r.fp-lista-6 { grid-template-columns: 50px minmax(0, 1fr) 90px 90px; } .fp-lista-r.fp-lista-6 > span:nth-child(3), .fp-lista-r.fp-lista-6 > span:nth-child(4), .fp-lista-r.fp-lista-6 > span:nth-child(6), .fp-lista-r.fp-lista-6 > span:nth-child(9) { display: none } }
.fp-lista-r em { justify-self: start; font-style: normal; font-size: 12.5px; color: var(--c); background: color-mix(in srgb, var(--c) 10%, #fefefe); border-radius: 99px; padding: 2px 9px }
.fp-lista-r.cab { position: sticky; top: 0; background: #fefefe; font-size: 13px; color: ${SEG}; border-top: 0; cursor: default; z-index: 1 } .fp-lista-r.cab span:nth-child(5) { text-align: right }
.fp-lista-pdf { border: 1px solid #fca5a5; background: #fefefe; color: #b91c1c; border-radius: 99px; padding: 3px 10px; font-family: inherit; font-size: 12px; font-weight: 700; cursor: pointer } .fp-lista-pdf:hover { background: #fee2e2 }
.fp-lista-pec { display: grid; justify-items: end; gap: 1px; border: none; background: none; padding: 0; font: inherit; color: inherit; cursor: pointer } .fp-lista-pec small { font-size: 11px; color: #b91c1c } .fp-lista-pec:hover b { text-decoration: underline }
.fp-lista-vazio { margin: 12px 0; color: ${SEG} }
.fp-doc { position: fixed; inset: 0; z-index: 9700 }
@media (max-width: 760px) { .fp-lista-r { grid-template-columns: 50px minmax(0, 1fr) 90px 50px } .fp-lista-r > span:nth-child(2), .fp-lista-r > span:nth-child(4) { display: none } }
.fp-deg-d { display: inline-flex; align-items: center; gap: 6px }
.fp-deg-cmp { width: 30px; height: 30px; border-radius: 50%; border: 1px solid color-mix(in srgb, var(--c) 35%, #e2e8f0); background: #fefefe; color: var(--c); font-size: 15px; font-weight: 700; line-height: 1; cursor: pointer; transition: all .2s }
.fp-deg-cmp:hover { background: var(--c); color: #fefefe } .fp-deg-cmp-i { display: inline-block; transition: transform .25s } .fp-deg-cmp:hover .fp-deg-cmp-i { transform: rotate(180deg) } .fp-deg-cmp.on { background: #ea580c; border-color: #ea580c; color: #fefefe }
.fp-lados { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); gap: 0; align-items: stretch; animation: fpEntra .35s both }
.fp-lados-vs { display: grid; place-items: center; width: 40px } .fp-lados-vs span { width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center; background: ${TXT}; color: #fefefe; font-size: 12.5px; font-weight: 700; box-shadow: 0 6px 16px -6px rgba(15,23,42,.5) }
.fp-pp { display: grid; gap: 12px; align-content: start; background: #fefefe; border: 1px solid #e2e8f0; border-radius: 18px; padding: 16px 18px }
.fp-pp.a { border-color: #93c5fd; box-shadow: 0 0 0 1px #93c5fd; background: linear-gradient(180deg, #f5f9ff, #fefefe 140px) } .fp-pp.b { border-color: #fdba74; background: linear-gradient(180deg, #fff8f1, #fefefe 140px) }
.fp-pp-cab { display: flex; gap: 12px; align-items: center } .fp-pp-cab em { width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; font-style: normal; font-weight: 700; color: #fefefe; flex: none } .fp-pp.a .fp-pp-cab em { background: #2563eb } .fp-pp.b .fp-pp-cab em { background: #ea580c }
.fp-pp-cab > div { display: grid } .fp-pp-cab b { font-size: 19px } .fp-pp-cab small { font-size: 13px; color: ${SEG} }
.fp-pp-ctl { display: flex; gap: 6px; flex-wrap: wrap; align-items: center }
.fp-pp-ctl button { border: 1px solid #fed7aa; background: #fefefe; color: ${TXT}; border-radius: 99px; padding: 6px 12px; font-family: inherit; font-size: 13px; cursor: pointer; transition: all .2s } .fp-pp-ctl button:hover:not(:disabled) { border-color: #ea580c } .fp-pp-ctl button.on { background: #ea580c; border-color: #ea580c; color: #fefefe } .fp-pp-ctl button:disabled { opacity: .35; cursor: default }
.fp-pp-ctl button[aria-label] { width: 32px; height: 32px; padding: 0; font-size: 18px; line-height: 1 }
.fp-pp-sair { justify-self: end; border: 1px solid #cbd5e1; background: #fefefe; color: ${TXT}; border-radius: 99px; padding: 6px 12px; font-family: inherit; font-size: 13px; cursor: pointer; margin-top: -46px } .fp-pp-sair:hover { border-color: #b91c1c; color: #b91c1c }
.fp-pp-g { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px }
.fp-pp-m { display: grid; gap: 2px; align-content: start; background: #fefefe; border: 1px solid #eef2f6; border-radius: 14px; padding: 12px 14px; animation: fpEntra .4s both; transition: transform .2s, box-shadow .2s, border-color .2s }
.fp-pp-m.clica { cursor: pointer } .fp-pp-m.clica:hover { transform: translateY(-2px); border-color: color-mix(in srgb, var(--c) 40%, #e2e8f0); box-shadow: 0 10px 22px -16px rgba(15,23,42,.5) }
.fp-pp-mt { display: flex; justify-content: space-between; align-items: center; gap: 6px; font-size: 13.5px; color: ${SEG} } .fp-pp-mt span::before { content: ''; display: inline-block; width: 8px; height: 8px; border-radius: 3px; background: var(--c); margin-right: 7px }
.fp-pp-m > b { font-size: 24px; line-height: 1.2 } .fp-pp-m > small { font-size: 13px; color: ${SEG} } .fp-pp-m > small.bom { color: #166534 } .fp-pp-m > small.ruim { color: #991b1b }
.fp-pp-m .fp-pill { font-style: normal }
.fp-pp-mix { display: flex; height: 10px; border-radius: 99px; overflow: hidden; gap: 2px } .fp-pp-mix i { transition: flex-grow .5s }
.fp-pp-leg { display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 13px; color: ${SEG} } .fp-pp-leg i { display: inline-block; width: 9px; height: 9px; border-radius: 3px; margin-right: 5px } .fp-pp-leg b { color: ${TXT} }
@media (max-width: 900px) { .fp-lados { grid-template-columns: 1fr } .fp-lados-vs { width: auto; height: 40px } .fp-pp-sair { margin-top: 0 } }
@keyframes fpFundo { from { opacity: 0 } }
@keyframes fpModal { from { opacity: 0; transform: translateY(14px) scale(.97) } }
@media (max-width: 700px) { .fp-modal-grade, .fp-modal-grade.n14 { grid-template-columns: repeat(2, minmax(0, 1fr)) } .fp-modal-prev { grid-template-columns: 1fr } .fp-modal-prev .pb { justify-content: flex-start; text-align: left } }
@keyframes fpEntra { from { opacity: 0; transform: translateY(10px) } }
@keyframes fpTraca { to { stroke-dashoffset: 0 } }
@keyframes fpPulso { 50% { box-shadow: 0 0 0 7px color-mix(in srgb, var(--c, #2563eb) 10%, transparent) } }
@media (max-width: 1200px) { .fp-cards { grid-template-columns: repeat(3, minmax(0, 1fr)) } .fp-chips { grid-template-columns: repeat(2, minmax(0, 1fr)) } }
@media (max-width: 760px) { .fp-cards { grid-template-columns: 1fr } .fp-linha-ctl { grid-template-columns: 1fr; gap: 8px } .fp-chips { grid-template-columns: 1fr } }

.fp-dias { background: #fefefe; border: 1px solid #e2e8f0; border-radius: 14px; padding: 14px 16px; display: grid; gap: 10px }
.fp-dias-t { font-size: 15px; font-weight: 700 } .fp-dias-t small { font-weight: 400; font-size: 13px; color: ${SEG}; margin-left: 6px }
.fp-dias-g { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); gap: 3px; align-items: end; height: 140px }
.fp-dia { display: grid; gap: 4px; justify-items: center; height: 100%; grid-template-rows: 1fr auto } .fp-dia.futuro { opacity: .3 }
.fp-dia-col { display: flex; flex-direction: column-reverse; width: 80%; max-width: 30px; height: 100%; border-radius: 4px; overflow: hidden; background: #f8fafc } .fp-dia-col i { display: block; transition: height .5s }
.fp-dia small { font-size: 11.5px; color: ${SEG} }

.fp-os { background: #fefefe; border: 1px solid #e2e8f0; border-radius: 14px; overflow: hidden }
.fp-os-t { width: 100%; display: flex; justify-content: space-between; align-items: center; border: 0; background: transparent; padding: 12px 16px; font-family: inherit; font-size: 15px; font-weight: 700; color: ${TXT}; cursor: pointer } .fp-os-t small { font-weight: 400; color: #2563eb; font-size: 14px }
.fp-os-l { display: grid; padding: 0 16px 12px; max-height: 420px; overflow: auto }
.fp-os-r { display: grid; grid-template-columns: 64px 110px minmax(0, 2fr) minmax(0, 1.4fr) 150px 110px; gap: 10px; padding: 7px 0; border-top: 1px solid #f1f5f9; font-size: 14px; align-items: center }
.fp-os-r > span:last-child { text-align: right; font-weight: 600 } .fp-os-r > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.fp-os-r.cab { font-size: 13px; color: ${SEG}; border-top: 0; position: sticky; top: 0; background: #fefefe }
.fp-os-r em { font-style: normal; font-size: 12.5px; color: var(--c); background: color-mix(in srgb, var(--c) 10%, #fefefe); border-radius: 99px; padding: 2px 9px }
@media (max-width: 1100px) { .fp-cards { grid-template-columns: repeat(2, minmax(0, 1fr)) } .fp-grade { grid-template-columns: repeat(4, minmax(0, 1fr)) } }
@media (max-width: 700px) { .fp-cards { grid-template-columns: 1fr } .fp-grade { grid-template-columns: repeat(2, minmax(0, 1fr)) } .fp-os-r { grid-template-columns: 56px minmax(0, 1fr) 90px } .fp-os-r > span:nth-child(2), .fp-os-r > span:nth-child(4), .fp-os-r > span:nth-child(5) { display: none } }
`
