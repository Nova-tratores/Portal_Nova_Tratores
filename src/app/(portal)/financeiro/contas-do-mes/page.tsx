// Área Contas do mês: abre nas Fixas.
import { redirect } from 'next/navigation'

export default function ContasDoMesPage() {
  redirect('/financeiro/contas-do-mes/fixas')
}
