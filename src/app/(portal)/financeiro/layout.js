// Estilo POS NewPortal em todas as telas do Financeiro (ver components/financeiro/visualFinanceiro.ts).
import { ESTILO_FINANCEIRO_VN } from '@/components/financeiro/visualFinanceiro'

export default function FinanceiroLayout({ children }) {
  return (
    <div className="fin-vn">
      <style>{ESTILO_FINANCEIRO_VN}</style>
      {children}
    </div>
  )
}
