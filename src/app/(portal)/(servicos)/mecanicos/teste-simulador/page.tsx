'use client'
// Página de TESTE do simulador "Para onde foi o dinheiro" (José, 21/10/2026: "esse simulador está muito
// confuso, tem que deixar algo mais fácil de entender e profissional"). Dados reais do mês; nada aqui muda o Painel.
import { useMemo, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import SemPermissao from '@/components/SemPermissao'
import { useBasePosVendas } from '@/components/mecanicos/useBasePosVendas'
import { useCarreira } from '@/components/mecanicos/useCarreira'
import { EstilosCPV } from '@/components/mecanicos/ui'
import { DinheiroSimulador, contaDe, ESTILO_DX } from '@/components/mecanicos/DinheiroOpcoes'
import { SimuladorDemonstrativo, SimuladorAlavancas, ESTILO_SIM } from '@/components/mecanicos/SimuladorOpcoes'
import { SimuladorCascata, SimuladorCenarios, SimuladorMeta, SimuladorTendencia, SimuladorAcoes, ESTILO_SIM2 } from '@/components/mecanicos/SimuladorOpcoes2'
import { SimuladorHistoria, ESTILO_HX } from '@/components/mecanicos/SimuladorHistoria'
import { ESTILO_LD } from '@/components/mecanicos/LadoDireitoOpcoes'
import type { Conta } from '@/components/mecanicos/DinheiroOpcoes'
import { montarPainel } from '@/lib/mecanicos/painel'

const MUDO = 'var(--portal-text-muted, #64748b)'
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const hojeSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
const andar = (m: string, n: number) => { const [a, mm] = m.split('-').map(Number); return new Date(Date.UTC(a, mm - 1 + n, 1)).toISOString().slice(0, 7) }

function Op({ n, titulo, ideia, children }: { n: string; titulo: string; ideia: string; children: React.ReactNode }) {
  return <section className="ts-op"><div className="ts-cab"><span className="ts-n">{n}</span><b>{titulo}</b><small>{ideia}</small></div>{children}</section>
}

export default function TesteSimuladorPage() {
  const { userProfile } = useAuth()
  const { temAcesso, loading } = usePermissoes(userProfile?.id)
  const { base } = useBasePosVendas()
  const { dados: car } = useCarreira()
  const [mes, setMes] = useState(() => hojeSP().slice(0, 7))
  const oficial = useMemo(() => {
    if (!car) return undefined
    const [a, m] = car.mesAtual.split('-').map(Number)
    const ant = m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`
    const r: Record<string, Record<string, number>> = {}
    for (const c of car.comissoes) r[c.tecnico] = { [car.mesAtual]: c.atual.total, [ant]: c.anterior.total }
    return r
  }, [car])
  const c = useMemo(() => {
    if (!base) return null
    const d = montarPainel(base, 'mes', `${mes}-15`, hojeSP(), false, oficial)
    return contaDe(d, d.periodo.rotulo)
  }, [base, mes, oficial])
  if (!loading && userProfile && !temAcesso('mecanicos')) return <SemPermissao />
  const nome = `${MESES[Number(mes.slice(5, 7)) - 1]} de ${mes.slice(0, 4)}`
  return (
    <div style={{ padding: 'clamp(14px, 2vw, 24px) clamp(12px, 2vw, 28px)', background: 'var(--portal-bg, #f8fafc)', minHeight: '100vh' }}>
      <EstilosCPV />
      <style>{ESTILO_DX}</style>
      <style>{ESTILO_SIM}</style>
      <style>{ESTILO_SIM2}</style>
      <style>{ESTILO_HX}</style>
      <style>{ESTILO_LD}</style>
      <style>{ESTILO_TS}</style>
      <div className="ts-topo">
        <span className="ts-selo"><i className="fas fa-flask" /> página de teste</span>
        <h1>Simulador do mês — opções</h1>
        <p>Os mesmos números do Painel (mês inteiro, comissão pela regra da ficha, salário como conta fixa). Mexa nos valores e veja o resultado. Nada aqui muda o Painel.</p>
        <div className="ts-mes">
          <button type="button" onClick={() => setMes((m) => andar(m, -1))} aria-label="Mês anterior"><i className="fas fa-chevron-left" /></button>
          <b>{nome[0].toUpperCase() + nome.slice(1)}</b>
          <button type="button" disabled={mes >= hojeSP().slice(0, 7)} onClick={() => setMes((m) => andar(m, 1))} aria-label="Próximo mês"><i className="fas fa-chevron-right" /></button>
        </div>
      </div>
      {!c ? <div style={{ color: MUDO, padding: 40, textAlign: 'center' }}><i className="fas fa-circle-notch fa-spin" /> carregando…</div> : (
        <div key={`${mes}|${oficial ? 1 : 0}`} style={{ display: 'grid', gap: 22 }}>
          <Op n="Nova" titulo="O mês em uma página" ideia="tudo o que o simulador mostra, contado em ordem: o resumo do mês, de onde veio e para onde foi o dinheiro (fluxo animado), e lado a lado o simulador e as perguntas que a conta responde."><SimuladorHistoria c={c} /></Op>
          <Op n="★" titulo="O de hoje, mais claro" ideia="o simulador que você gostou, com tudo que ele tem: guia de 3 passos, a conta Entrou − Gastos − Pessoal = Sobrou nas abas, Como foi × Simulado em cada barra e o lado direito em blocos numerados."><EstrelaComFormas c={c} /></Op>
          <Op n="A" titulo="Demonstrativo" ideia="como um relatório financeiro: Real × Simulado × Diferença, linha a linha. Os campos para mexer ficam na própria linha."><SimuladorDemonstrativo c={c} /></Op>
          <Op n="B" titulo="Alavancas" ideia="à esquerda o que dá para mudar, em horas, R$ e técnicos; à direita o resultado do mês e o que ele significa."><SimuladorAlavancas c={c} /></Op>
          <Op n="C" titulo="Cascata" ideia="o faturamento descendo degrau por degrau até o resultado; mexa nos botões + e − e as barras se movem (o tracejado é o real)."><SimuladorCascata c={c} /></Op>
          <Op n="D" titulo="Três cenários lado a lado" ideia="mês fraco, como foi e mês bom, cada um com seus próprios ajustes; o melhor fica destacado."><SimuladorCenarios c={c} /></Op>
          <Op n="E" titulo="Meta" ideia="você diz quanto quer que sobre no mês e ele mostra os caminhos: mais horas, hora mais cara ou menos gastos."><SimuladorMeta c={c} /></Op>
          <Op n="F" titulo="Tendência" ideia="o resultado dos últimos meses com a média; o mês atual muda na hora quando você mexe."><SimuladorTendencia c={c} /></Op>
          <Op n="G" titulo="Ações rápidas" ideia="cartões com decisões prontas, cada um já mostra quanto muda; escolha vários e veja o total no mês e no ano."><SimuladorAcoes c={c} /></Op>
          <Op n="Atual" titulo="Simulador de hoje" ideia="para comparar"><DinheiroSimulador c={c} /></Op>
        </div>
      )}
    </div>
  )
}

/** ★ com o lado direito em 4 formas (José, 21/10/2026: "troca a forma que mostra essas informações"). */
function EstrelaComFormas({ c }: { c: Conta }) {
  const [forma, setForma] = useState<0 | 1 | 2 | 3>(1)
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="ts-formas">
        <span>Lado direito:</span>
        {([[1, '1 · Extrato'], [2, '2 · Medidor'], [3, '3 · Cascata'], [0, 'Como estava']] as const).map(([k, r]) => <button key={k} type="button" className={forma === k ? 'on' : ''} onClick={() => setForma(k)}>{r}</button>)}
      </div>
      <DinheiroSimulador key={forma} c={c} claro forma={forma || undefined} />
    </div>
  )
}

const ESTILO_TS = `
.ts-formas { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; font-size: 14px; color: #0f172a } .ts-formas button { border: 1px solid #cbd5e1; background: #fefefe; color: #0f172a; border-radius: 99px; padding: 6px 14px; font-family: inherit; font-size: 14px; cursor: pointer } .ts-formas button.on { background: #0f172a; color: #fefefe; border-color: #0f172a }
.ts-topo { margin-bottom: 18px; display: grid; gap: 8px } .ts-topo h1 { font-size: 22px; font-weight: 700; margin: 0; color: var(--portal-text, #0f172a) } .ts-topo p { margin: 0; font-size: 13.5px; color: ${MUDO}; max-width: 1000px }
.ts-selo { justify-self: start; font-size: 12px; font-weight: 700; color: #7c3aed; background: #f5f3ff; border: 1px dashed #c4b5fd; border-radius: 99px; padding: 3px 10px }
.ts-mes { display: inline-flex; align-items: center; gap: 8px } .ts-mes b { color: var(--portal-text, #0f172a); font-size: 14px } .ts-mes button { width: 30px; height: 30px; border-radius: 50%; border: 1px solid var(--portal-border, #e2e8f0); background: #fefefe; color: #2563eb; cursor: pointer } .ts-mes button:disabled { opacity: .35 }
.ts-op { border: 2px dashed var(--portal-border, #cbd5e1); border-radius: 20px; padding: 14px }
.ts-cab { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; color: var(--portal-text, #0f172a) } .ts-cab small { color: ${MUDO}; font-size: 12.5px }
.ts-n { background: #0f172a; color: #fefefe; font-weight: 700; font-size: 13px; border-radius: 8px; padding: 3px 10px }
`
