// Registro de uso do Tratorilson (assistente IA). Grava cada solicitação:
// quem pediu, o quê, a resposta, o modelo e os tokens consumidos. Best-effort —
// nunca quebra o chat. Escreve pelo servidor com service role (a tabela tem RLS
// e é lida só pelo painel /tratorilson, via rota com checagem de admin).
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  { auth: { persistSession: false, autoRefreshToken: false } }
)

export interface UsoTratorilson {
  userId?: string
  userName?: string
  tipo: string        // 'chat', 'chat:propor_os', etc. — categoriza a função usada
  pergunta: string
  resposta: string
  modelo: string
  tokens: number      // total de tokens da solicitação (soma das chamadas à IA)
}

export async function logTratorilson(dados: UsoTratorilson): Promise<void> {
  try {
    await supabase.from('tratorilson_log').insert({
      user_id: dados.userId || null,
      user_nome: dados.userName || null,
      tipo: dados.tipo || 'chat',
      pergunta: (dados.pergunta || '').slice(0, 8000),
      resposta: (dados.resposta || '').slice(0, 8000),
      modelo: dados.modelo || null,
      tokens: Number(dados.tokens) || 0,
    })
  } catch {
    // best-effort: não interrompe a resposta do assistente
  }
}
