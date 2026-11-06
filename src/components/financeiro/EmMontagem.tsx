'use client'
// Abas do Financeiro novo que ainda não foram montadas (06/11/2026; ver docs/financeiro-novo-06-11.md).
// Mostram o que vai ter dentro, na ordem de montagem: topo → Hoje → Compras → Pessoas → Contas do mês → Banco.
import FinanceiroNav from '@/components/financeiro/FinanceiroNav'
import { NOME_EMPRESA_FIN, useEmpresaFinanceiro } from './empresaFinanceiro'

export type Bloco = { codigo?: string; nome: string; detalhe: string }

export default function EmMontagem({ titulo, resumo, blocos }: { titulo: string; resumo: string; blocos: Bloco[] }) {
  const [empresa] = useEmpresaFinanceiro()
  return (
    <div style={{ minHeight: 'calc(100vh - 64px)', background: 'var(--portal-bg-secondary)' }}>
      <FinanceiroNav />
      <style>{ESTILO}</style>
      <div className="emm">
        <section className="emm-card emm-topo">
          <span className="emm-selo">em montagem</span>
          <span className="emm-titulo">{titulo} · {NOME_EMPRESA_FIN[empresa]}</span>
          <span className="emm-resumo">{resumo}</span>
        </section>
        <div className="emm-grade">
          {blocos.map((b) => (
            <section key={b.nome} className="emm-card emm-bloco">
              <span className="emm-nome">{b.codigo && <span className="emm-cod">{b.codigo}</span>}{b.nome}</span>
              <span className="emm-det">{b.detalhe}</span>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}

const ESTILO = `
.emm { padding: clamp(12px, 2vw, 28px); display: flex; flex-direction: column; gap: 12px; color: var(--portal-text, #0f172a) }
.emm-card { background: var(--surface, #fefefe); border: 1px solid var(--border, #e2e8f0); border-radius: 16px; padding: 14px 16px; min-width: 0 }
.emm-topo { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px }
.emm-selo { font-size: 12.5px; color: #7c3aed; background: #f5f3ff; border: 1px dashed #c4b5fd; border-radius: 99px; padding: 3px 10px }
.emm-titulo { font-size: 18px } .emm-resumo { font-size: 14.5px; color: var(--portal-text-secondary, #475569) }
.emm-grade { display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(min(280px, 100%), 1fr)) }
.emm-bloco { display: grid; gap: 6px; align-content: start; animation: emm-entra .35s ease both }
.emm-nome { display: flex; align-items: center; gap: 8px; font-size: 16px }
.emm-cod { font-size: 12.5px; color: #2563eb; background: #eff6ff; border-radius: 6px; padding: 2px 7px }
.emm-det { font-size: 14px; color: var(--portal-text-secondary, #475569) }
@keyframes emm-entra { from { opacity: 0; transform: translateY(6px) } }
@media (prefers-reduced-motion: reduce) { .emm-bloco { animation: none } }
`
