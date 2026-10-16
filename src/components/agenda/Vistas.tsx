'use client'
// AGENDA — vistas Mês e Programação + minicalendário da lateral (estilo Google Agenda).
import { useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  gradeDoMes, tocaDia, localDe, horaCurta, textoSobre, ultimoDia, addDias, somarMeses, diaDaSemana,
  DIAS_CURTOS, DIAS_LONGOS, MESES, type ItemAgenda,
} from '@/lib/agenda/regras'

const ordenar = (a: ItemAgenda, b: ItemAgenda) =>
  Number(b.diaInteiro) - Number(a.diaInteiro) || a.inicio.localeCompare(b.inicio) || a.titulo.localeCompare(b.titulo)

// ------------------------------------------------------------------ Mês
export function GradeMes({ dia, hoje, itens, corDe, onAbrir, onIrParaDia, onCriarNoDia, mostrarFds }: {
  dia: string; hoje: string; itens: ItemAgenda[]; corDe: (it: ItemAgenda) => string; mostrarFds: boolean
  onAbrir: (it: ItemAgenda, r: DOMRect) => void; onIrParaDia: (d: string) => void; onCriarNoDia: (d: string, r: DOMRect) => void
}) {
  const dias = useMemo(() => gradeDoMes(dia).filter((d) => mostrarFds || (diaDaSemana(d) !== 0 && diaDaSemana(d) !== 6)), [dia, mostrarFds])
  const nCols = mostrarFds ? 7 : 5
  const mes = dia.slice(0, 7)
  const MAX = 3
  return (
    <div className="gc-mes" style={{ gridTemplateColumns: `repeat(${nCols}, minmax(0, 1fr))` }}>
      {dias.map((d, i) => {
        const doDia = itens.filter((it) => tocaDia(it, d)).sort(ordenar)
        return (
          <div key={d} className={`gc-mes-cel${d.slice(0, 7) !== mes ? ' gc-fora' : ''}`} onClick={(e) => onCriarNoDia(d, (e.currentTarget as HTMLElement).getBoundingClientRect())}>
            {i < nCols && <div className="gc-mes-sem">{DIAS_CURTOS[diaDaSemana(d)]}</div>}
            <button className={`gc-mes-num${d === hoje ? ' gc-hoje-num' : ''}`} onClick={(e) => { e.stopPropagation(); onIrParaDia(d) }}>
              {d.endsWith('-01') ? `${Number(d.slice(8, 10))} de ${MESES[Number(d.slice(5, 7)) - 1].slice(0, 3)}.` : Number(d.slice(8, 10))}
            </button>
            {doDia.slice(0, MAX).map((it) => {
              const cor = corDe(it)
              const barra = it.diaInteiro || ultimoDia(it) !== localDe(it.inicio).dia
              return (
                <button key={it.id} data-item={it.id} className={`gc-mes-ev${barra ? ' gc-mes-barra' : ''}${it.esmaecido ? ' gc-esmaecido' : ''}`}
                  style={barra ? { background: cor, color: textoSobre(cor) } : undefined}
                  onClick={(e) => { e.stopPropagation(); onAbrir(it, e.currentTarget.getBoundingClientRect()) }}>
                  {!barra && <span className="gc-ponto" style={{ background: cor }} />}
                  {!barra && <span className="gc-mes-hora">{horaCurta(localDe(it.inicio).hora)}</span>}
                  <span className="gc-mes-tit">{it.titulo}</span>
                </button>
              )
            })}
            {doDia.length > MAX && (
              <button className="gc-mes-mais" onClick={(e) => { e.stopPropagation(); onIrParaDia(d) }}>Mais {doDia.length - MAX}</button>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ------------------------------------------------------------------ Programação (lista)
export function ListaProgramacao({ de, ate, hoje, itens, corDe, nomeDe, onAbrir, vazio }: {
  de: string; ate: string; hoje: string; itens: ItemAgenda[]; corDe: (it: ItemAgenda) => string
  nomeDe: (id: string) => string; onAbrir: (it: ItemAgenda, r: DOMRect) => void; vazio: string
}) {
  const dias: string[] = []
  for (let d = de; d <= ate; d = addDias(d, 1)) dias.push(d)
  const comItens = dias.map((d) => ({ d, lista: itens.filter((it) => tocaDia(it, d)).sort(ordenar) })).filter((x) => x.lista.length)
  if (!comItens.length) return <div className="gc-lista-vazia">{vazio}</div>
  return (
    <div className="gc-lista">
      {comItens.map(({ d, lista }) => (
        <div key={d} className="gc-lista-dia">
          <div className={`gc-lista-data${d === hoje ? ' gc-hoje' : ''}`}>
            <span className="gc-lista-num">{Number(d.slice(8, 10))}</span>
            <span className="gc-lista-sem">{MESES[Number(d.slice(5, 7)) - 1].slice(0, 3).toUpperCase()}., {DIAS_CURTOS[diaDaSemana(d)].replace('.', '')}</span>
          </div>
          <div className="gc-lista-itens">
            {lista.map((it) => {
              const a = localDe(it.inicio), z = localDe(it.fim)
              const quando = it.diaInteiro || ultimoDia(it) !== a.dia ? 'Dia inteiro' : `${horaCurta(a.hora)} – ${horaCurta(z.hora)}`
              return (
                <button key={it.id} className={`gc-lista-item${it.esmaecido ? ' gc-esmaecido' : ''}`} onClick={(e) => onAbrir(it, e.currentTarget.getBoundingClientRect())}>
                  <span className="gc-ponto gc-ponto-g" style={{ background: corDe(it) }} />
                  <span className="gc-lista-hora">{quando}</span>
                  <span className="gc-lista-tit">
                    <b>{it.titulo}</b>
                    <small>{it.pessoas.map(nomeDe).map((n) => n.split(' ')[0]).join(', ')}{it.local ? ` · ${it.local}` : ''}</small>
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

// ------------------------------------------------------------------ minicalendário
export function MiniCalendario({ mes, onMes, selecionado, hoje, destaque, onEscolher }: {
  mes: string; onMes: (m: string) => void; selecionado: string; hoje: string
  /** dias da faixa visível (semana/ dia) para pintar de leve */
  destaque: string[]; onEscolher: (d: string) => void
}) {
  const dias = gradeDoMes(mes)
  const doMes = mes.slice(0, 7)
  return (
    <div className="gc-mini">
      <div className="gc-mini-cab">
        <span>{MESES[Number(mes.slice(5, 7)) - 1]} de {mes.slice(0, 4)}</span>
        <button className="gc-icone gc-icone-p" aria-label="Mês anterior" onClick={() => onMes(somarMeses(mes, -1))}><ChevronLeft size={16} /></button>
        <button className="gc-icone gc-icone-p" aria-label="Próximo mês" onClick={() => onMes(somarMeses(mes, 1))}><ChevronRight size={16} /></button>
      </div>
      <div className="gc-mini-grade">
        {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((l, i) => <span key={i} className="gc-mini-sem">{l}</span>)}
        {dias.map((d) => (
          <button key={d} title={`${DIAS_LONGOS[diaDaSemana(d)]}, ${Number(d.slice(8, 10))} de ${MESES[Number(d.slice(5, 7)) - 1]}`}
            className={`gc-mini-dia${d.slice(0, 7) !== doMes ? ' gc-fora' : ''}${d === hoje ? ' gc-mini-hoje' : ''}${d === selecionado && d !== hoje ? ' gc-mini-sel' : ''}${destaque.includes(d) && d !== hoje && d !== selecionado ? ' gc-mini-faixa' : ''}`}
            onClick={() => onEscolher(d)}>
            {Number(d.slice(8, 10))}
          </button>
        ))}
      </div>
    </div>
  )
}
