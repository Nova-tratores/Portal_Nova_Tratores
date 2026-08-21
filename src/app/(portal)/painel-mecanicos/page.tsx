import { redirect } from 'next/navigation'

// Tela APOSENTADA (21/08/2026, pedido do usuário): o Painel Mecânicos saiu do
// portal — tudo acontece na Janela Mecânico (/mecanicos). Links antigos
// (notificações, favoritos) caem lá automaticamente.
export default function PainelMecanicosRedirect() {
  redirect('/mecanicos')
}
