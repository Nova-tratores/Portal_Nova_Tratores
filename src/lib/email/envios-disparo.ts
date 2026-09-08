/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================================
// Despacho "enviar agora" / "enviar teste" da tela Dev → Envios de e-mail.
// Mapeia a chave do envio para a função que gera e manda o relatório (as
// mesmas dos crons). Separado de envios-config.ts para evitar import circular.
// ============================================================================
import { cronRelacaoPPV } from '@/lib/ppv/relatorio-lista'
import { cronRelatorioListaSemanal } from '@/lib/dre-financeiro/cron-relatorio-lista'
import { cronApoiosVencendo } from '@/lib/marketing/apoios-vencendo'
import { enviarContrapartida } from '@/lib/marketing/relatorio-contrapartida'
import { envioDef, getConfigEnvio } from './envios-config'

export interface DispararArgs {
  chave: string
  /** 'manual' = pros destinatários configurados; 'teste' = só pro(s) e-mail(s) informado(s). */
  origem: 'manual' | 'teste'
  destinatariosTeste?: string[]
  usuario?: string
}

export async function dispararEnvio(a: DispararArgs): Promise<any> {
  const def = envioDef(a.chave)
  if (!def) throw new Error(`envio desconhecido: ${a.chave}`)
  const teste = a.origem === 'teste'
  if (teste && !a.destinatariosTeste?.length) throw new Error('informe o e-mail de teste')
  const comum = {
    origem: a.origem,
    usuario: a.usuario,
    forcar: true,
    ...(teste ? { to: a.destinatariosTeste, cc: [] as string[], bcc: [] as string[] } : {}),
  }
  switch (a.chave) {
    case 'ppv_relacao':
      return cronRelacaoPPV(comum)
    case 'dre_lista':
      return cronRelatorioListaSemanal(undefined, comum)
    case 'marketing_apoios_vencendo':
      return cronApoiosVencendo(comum)
    case 'marketing_contrapartida': {
      // O envio de verdade sai da ficha da ação (é lá que se sabe QUAL apoio).
      // Aqui só dá pra testar, apontando o apoio nos parâmetros da tela.
      const cfg = await getConfigEnvio('marketing_contrapartida')
      const apoioId = String(cfg.parametros?.apoio_id || '').trim()
      if (!apoioId) {
        throw new Error('Informe o apoio_id nos parâmetros — o envio normal sai da ficha da ação, em /marketing.')
      }
      return enviarContrapartida({
        apoioId,
        enviadoPor: a.usuario,
        origem: teste ? 'teste' : 'manual',
        ...(teste ? { to: a.destinatariosTeste } : {}),
      })
    }
    default:
      throw new Error(`envio sem despacho: ${a.chave}`)
  }
}
