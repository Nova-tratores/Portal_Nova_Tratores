// QUADRO AUTOMÁTICO (24/11/2026). José: "esse negócio de bloco ficou uma confusão só".
// Ninguém precisa mais escolher quadro para aceitar ou trabalhar num ticket: quando o
// pedido não diz, o ticket vai para o quadro em que a pessoa trabalhou por último; se ela
// não tem nenhum, nasce o quadro pessoal "Meu trabalho". Quem quiser ainda troca depois.
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import type { Autenticado } from '@/lib/auth/server'
import { criarQuadro } from './quadros-server'

export async function quadroPadraoDe(auth: Autenticado): Promise<string> {
  const eu = auth.userId
  // Quadros (não arquivados) em que a pessoa é integrante.
  const { data: mem } = await supabaseAdmin.from('tickets_quadro_membros').select('quadro_id').eq('user_id', eu)
  const ids = (mem || []).map((m) => m.quadro_id as string)
  const { data: qs } = ids.length
    ? await supabaseAdmin.from('tickets_quadros').select('id, updated_at').in('id', ids).eq('arquivado', false)
    : { data: [] as { id: string; updated_at: string }[] }
  const ativos = new Set((qs || []).map((q) => q.id as string))

  if (ativos.size) {
    // 1º: o quadro do ticket dela mexido por último.
    const { data: ult } = await supabaseAdmin.from('tickets').select('quadro_id')
      .eq('responsavel_id', eu).in('quadro_id', [...ativos]).order('updated_at', { ascending: false }).limit(1)
    const q = ult?.[0]?.quadro_id as string | undefined
    if (q) return q
    // 2º: o quadro dela atualizado por último.
    const maisNovo = [...(qs || [])].sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))[0]
    if (maisNovo) return maisNovo.id as string
  }
  // 3º: não tem nenhum → cria o pessoal.
  const novo = await criarQuadro(auth, { nome: 'Meu trabalho', visibilidade: 'privado', descricao: 'Quadro pessoal, criado sozinho ao aceitar um pedido.' }, [])
  return novo.id
}
