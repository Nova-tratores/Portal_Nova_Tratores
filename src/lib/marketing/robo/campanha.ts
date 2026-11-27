// =============================================================================
// Posts da campanha (27/11/2026). José: "sempre que a gente criar uma campanha de feira que não seja interna, já tem
// que ir para o calendário e gerar os posts automáticos também no tempo determinado".
// Ao criar ou editar uma campanha de Feira, Ação de loja ou Campanha/promoção (com data), o robô roda SÓ para ela,
// depois da resposta (não trava a tela): 7 dias antes, véspera, 1º dia e 1 dia depois. Os posts nascem como "ideia".
// O robô diário (07:00) também confere as campanhas, então se algo falhar aqui ele completa no dia seguinte.
// =============================================================================
import { after } from 'next/server'

/** Igual a TIPOS_COM_POST do robo.ts (repetido aqui para a rota não carregar o robô inteiro só para checar o tipo). */
const TIPOS = ['feira', 'acao_loja', 'campanha']

/** Agenda os posts da campanha para depois da resposta. Devolve true se vai gerar. */
export function gerarPostsDaCampanha(a: { id: string; tipo?: string | null; data_inicio?: string | null; status?: string | null; deleted_at?: string | null }): boolean {
  if (!a.tipo || !TIPOS.includes(a.tipo) || !a.data_inicio || a.deleted_at || ['cancelada', 'realizada'].includes(a.status || '')) return false
  if (process.env.MARKETING_ROBO_POSTS === 'off' || !process.env.ANTHROPIC_API_KEY || !process.env.OPENAI_API_KEY) return false
  after(async () => {
    try {
      const { rodarRobo } = await import('./robo')
      const r = await rodarRobo(0, a.id)
      console.log('[robo] campanha', a.id, r.pulado || r.resumo)
    } catch (e) {
      console.warn('[robo] campanha', a.id, (e as Error).message)
    }
  })
  return true
}
