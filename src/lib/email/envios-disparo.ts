/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================================
// Despacho "enviar agora" / "enviar teste" da tela Dev → Envios de e-mail.
// Mapeia a chave do envio para a função que gera e manda o relatório (as
// mesmas dos crons). Separado de envios-config.ts para evitar import circular.
// ============================================================================
import { cronRelacaoPPV } from '@/lib/ppv/relatorio-lista'
import { cronRelatorioListaSemanal } from '@/lib/dre-financeiro/cron-relatorio-lista'
import { envioDef } from './envios-config'

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
    default:
      throw new Error(`envio sem despacho: ${a.chave}`)
  }
}
