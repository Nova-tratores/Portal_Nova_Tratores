// SC — helpers que TOCAM O BANCO (service role). SERVER-ONLY: importar só nas
// rotas /api/tickets/*. As partes puras (tipos, transições) estão em ./compras.
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { parseValorBR } from '@/lib/requisicoes/autorizacao'
import type { ConfigCompras, PayloadSC } from './compras'

const CONFIG_VAZIA: ConfigCompras = {
  diretoria_id: null, financeiro_id: null, comprador_id: null,
  valor_limite_bloqueio: null, qtd_excesso_estoque: null,
}

// Lê a linha singleton de configuração (ou devolve tudo vazio se não existir).
export async function carregarConfigCompras(): Promise<ConfigCompras> {
  const { data } = await supabaseAdmin
    .from('tickets_compras_config')
    .select('diretoria_id, financeiro_id, comprador_id, valor_limite_bloqueio, qtd_excesso_estoque')
    .eq('id', true)
    .maybeSingle()
  return data ? { ...CONFIG_VAZIA, ...data } : { ...CONFIG_VAZIA }
}

// Gatilho de bloqueio (valor alto / excesso de estoque) — flag SUAVE: registra
// e avisa, não trava a progressão. Estoque é best-effort (só quando
// produto_codigo casa em `produtos`, conta MINÚSCULA — ver memória de casing).
export async function avaliarBloqueio(
  payload: PayloadSC,
  config: ConfigCompras,
): Promise<{ motivo: string; valor: number } | null> {
  const qtd = Number(payload.quantidade_aprovada ?? payload.quantidade_solicitada ?? 0)
  const unit = parseValorBR(payload.valor_unitario ?? payload.preco_alvo ?? 0)
  const valorTotal = payload.valor_total != null ? Number(payload.valor_total) : qtd * unit
  const motivos: string[] = []

  if (config.valor_limite_bloqueio != null && valorTotal > config.valor_limite_bloqueio) {
    motivos.push(`valor total (R$ ${valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}) acima do limite`)
  }

  if (config.qtd_excesso_estoque != null && payload.produto_codigo) {
    const { data: prod } = await supabaseAdmin
      .from('produtos')
      .select('estoque')
      .eq('codigo', payload.produto_codigo)
      .limit(1)
      .maybeSingle()
    const estoque = Number(prod?.estoque ?? NaN)
    if (Number.isFinite(estoque) && estoque > config.qtd_excesso_estoque) {
      motivos.push(`estoque atual (${estoque}) acima do alvo de ${config.qtd_excesso_estoque}`)
    }
  }

  return motivos.length ? { motivo: motivos.join('; '), valor: valorTotal } : null
}
