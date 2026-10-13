// Último recurso de resolução de nome de cliente no Gestão de Vendas.
// Quando o cliente não está em `clientes` nem em `portal_nt_clientes_cadastro_omie`,
// a venda mostrava o código interno da Omie. Aqui consultamos a Omie
// (ConsultarCliente) e guardamos o resultado em `gv_clientes_omie_cache` para
// não repetir a chamada. Best-effort: limitado por quantidade e por tempo, com
// concorrência baixa (a Omie estrangula em excesso de requisições).

import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { contaOmie } from '@/lib/omie/contas'
import { omie } from '@/lib/omie/porta'

const EMPRESA_POR_CONTA: Record<string, string> = { NOVA: 'Nova Tratores', CASTRO: 'Castro Peças' }

const MAX_CONSULTAS = 25 // teto por request (o resto resolve no próximo load, já em cache)
const CONCORRENCIA = 4
const TIMEOUT_CALL_MS = 12_000
const DEADLINE_MS = 20_000 // não segurar o /mes por mais que isto

export type ParCliente = { conta: string; codigo: number }

// Resolve nomes via Omie e grava no cache. Retorna Map `${CONTA}|${codigo}` → nome.
// Só devolve os que resolveram; os que falharam ficam cacheados como NULL para
// não reconsultar (não entram no Map).
export async function resolverClientesViaOmie(pares: ParCliente[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const alvo = pares.slice(0, MAX_CONSULTAS)
  if (alvo.length === 0) return out

  const inicio = Date.now()
  let i = 0

  async function worker() {
    while (i < alvo.length && Date.now() - inicio < DEADLINE_MS) {
      const { conta, codigo } = alvo[i++]
      const contaUp = conta.toUpperCase()
      const empresa = EMPRESA_POR_CONTA[contaUp]
      if (!empresa) continue
      let nome: string | null = null
      try {
        nome = await consultarNome(empresa, codigo)
      } catch {
        nome = null // best-effort: cacheia como NULL e segue
      }
      if (nome) out.set(`${contaUp}|${codigo}`, nome)
      // cache (inclui NULL, pra não reconsultar clientes sem retorno)
      await supabaseAdmin
        .from('gv_clientes_omie_cache')
        .upsert(
          { cod_cli: codigo, conta: contaUp, nome, atualizado_em: new Date().toISOString() },
          { onConflict: 'cod_cli,conta' },
        )
        .then(
          () => {},
          () => {},
        )
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCORRENCIA, alvo.length) }, worker))
  return out
}

async function consultarNome(empresa: string, codigo: number): Promise<string | null> {
  const acc = contaOmie(empresa)
  if (!acc.key || !acc.secret) return null
  const data = await omie<{ razao_social?: string; nome_fantasia?: string; faultstring?: string }>(
    { appKey: acc.key, appSecret: acc.secret, rotulo: empresa },
    '/geral/clientes/',
    'ConsultarCliente',
    { codigo_cliente_omie: codigo },
    // sem repetição: o /mes não pode segurar a resposta (best-effort, igual a antes)
    { timeoutMs: TIMEOUT_CALL_MS, tentativas: 0, lancarFault: false },
  )
  if (!data || data.faultstring) return null
  const nome = (data.razao_social || data.nome_fantasia || '').trim()
  return nome || null
}
