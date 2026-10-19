// O Tratorilson está LIGADO no NovaZap? (chave-geral do botão do robô na lista
// de conversas — GET /api/v1/accounts/:id/tratorilson do fork, devolve {ativo}).
// Só server-side (usa o token de conta). Cache de 60 s.
// null = não deu pra saber (NovaZap fora/não configurado) → quem chama trata
// como ligado, que é o comportamento de antes.
import { baseApiConta, chatwootConfigurado, CHATWOOT_API_TOKEN } from '@/lib/chatwoot/config'

let cache: { em: number; ativo: boolean | null } | null = null

export async function roboLigado(): Promise<boolean | null> {
  if (cache && Date.now() - cache.em < 60_000) return cache.ativo
  let ativo: boolean | null = null
  if (chatwootConfigurado()) {
    try {
      const r = await fetch(`${baseApiConta()}/tratorilson`, { headers: { api_access_token: CHATWOOT_API_TOKEN }, cache: 'no-store', signal: AbortSignal.timeout(5000) })
      if (r.ok) {
        const j = await r.json()
        if (typeof j?.ativo === 'boolean') ativo = j.ativo
      }
    } catch { /* fica null */ }
  }
  cache = { em: Date.now(), ativo }
  return ativo
}

/** origem do card "precisa de atendimento" aberto pelo vigia com o Tratorilson
 *  DESLIGADO: não pede para atualizar a memória (José, 19/10/2026). */
export const ORIGEM_ROBO_DESLIGADO = 'vigia_robo_desligado'
