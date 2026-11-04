'use client'
// Página de TESTE da Agenda (30/10/2026): o José compara as opções com os dados reais antes de trocar a tela.
import { useState } from 'react'
import FinanceiroNav from '@/components/financeiro/FinanceiroNav'
import AgendaOpcoes, { type OpcaoAgenda } from '@/components/financeiro/AgendaOpcoes'

const OPCOES: { n: OpcaoAgenda; nome: string; ideia: string }[] = [
  { n: 2, nome: 'Opção 2 · Dia a dia', ideia: 'Escolhe o dia e vê o que entra e o que sai' },
  { n: 3, nome: 'Opção 3 · Semana em barras', ideia: 'O dinheiro da semana num gráfico; clique no dia' },
  { n: 4, nome: 'Opção 4 · O que fazer', ideia: 'Atrasado, hoje, próximos dias e resolvido' },
  { n: 5, nome: 'Opção 5 · Hoje e semana', ideia: 'Primeiro só o dia de hoje; a semana vem logo abaixo' },
  { n: 6, nome: 'Opção 6 · Bolinhas dos dias', ideia: 'Clique na bolinha do dia para ver os dados dele' },
]

export default function AgendaTeste() {
  const [opcao, setOpcao] = useState<OpcaoAgenda>(6)
  const atual = OPCOES.find((o) => o.n === opcao)
  return (
    <div style={{ minHeight: 'calc(100vh - 64px)', background: 'var(--portal-bg-secondary)' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, padding: '10px clamp(12px, 2vw, 28px)', background: 'var(--surface, #fefefe)', borderBottom: '1px solid var(--border, #e2e8f0)' }}>
        {OPCOES.map((o) => (
          <button key={o.n} type="button" onClick={() => setOpcao(o.n)} style={{
            border: `1px solid ${o.n === opcao ? '#2563eb' : 'var(--border, #e2e8f0)'}`, borderRadius: 10, padding: '7px 12px', fontSize: 13, cursor: 'pointer',
            background: o.n === opcao ? 'color-mix(in srgb, #2563eb 10%, var(--surface, #fefefe))' : 'var(--surface, #fefefe)', color: o.n === opcao ? '#2563eb' : 'var(--portal-text, #0f172a)',
          }}>{o.nome}</button>
        ))}
        <span style={{ fontSize: 12.5, color: 'var(--portal-text-muted, #64748b)', marginLeft: 6 }}>{atual?.ideia}</span>
      </div>
      <FinanceiroNav />
      <AgendaOpcoes opcao={opcao} />
    </div>
  )
}
