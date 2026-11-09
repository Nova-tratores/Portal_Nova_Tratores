// =============================================================================
// API: área Compras do Financeiro novo (09/11/2026): as contas a pagar do Omie (espelho) dos blocos C1 a C6, pelo
// vencimento no mês, da empresa escolhida, cada uma com a origem do boleto:
//   - 'omie': o Omie tem o código de barras (raw.codigo_barras_ficha_compensacao) — quase nunca acontece;
//   - 'portal': a conta lançada pelo portal (finan_pagar.omie_cod_lancamento) tem a foto ou o código do boleto;
//   - 'agrupado': a duplicata entrou num boleto agrupado de fornecedor (boleto_titulos, Ajustes);
//   - null: não achamos boleto nenhum.
// Só lê. Mesma trava das telas do Caixa. O DDA do banco (boleto que chega sozinho) ainda não está no portal.
// =============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { guardarDre } from '@/lib/dre-financeiro/rota'
import { supabaseAdmin as supabase } from '@/lib/dre-financeiro/supabase'
import { emLotes } from '@/lib/db/paginar'
import { BLOCOS_COMPRAS, type OrigemBoleto } from '@/lib/financeiro/modulosContas'
import { lerContasModulo, mesDeHoje, mesValido } from '@/lib/financeiro/modulosContas-server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const g = await guardarDre(request, 'calendario')
  if (g.resposta) return g.resposta
  if (!supabase) return NextResponse.json({ erro: 'Supabase nao configurado' }, { status: 500 })
  const sb = supabase
  try {
    const sp = request.nextUrl.searchParams
    const mes = mesValido(sp.get('mes')) || mesDeHoje()
    const conta = sp.get('conta') === 'castro' ? 'castro' : 'nova'
    const contas = await lerContasModulo(BLOCOS_COMPRAS, mes, conta)
    const codigos = contas.map((c) => c.codigo_lancamento).filter(Boolean)
    const rotulo = conta === 'castro' ? 'CASTRO' : 'NOVA'

    const [omie, portal, agrupado] = await Promise.all([
      emLotes(codigos, (l) => sb.from('contas_pagar').select('codigo_lancamento, bar:raw->>codigo_barras_ficha_compensacao').eq('conta_omie', rotulo).in('codigo_lancamento', l)),
      emLotes(codigos, (l) => sb.from('finan_pagar').select('omie_cod_lancamento, anexo_boleto, boleto_codigo_barras').in('omie_cod_lancamento', l)),
      emLotes(codigos, (l) => sb.from('boleto_titulos').select('codigo_lancamento').eq('conta_omie', rotulo).neq('status', 'estornado').in('codigo_lancamento', l)),
    ])
    for (const r of [omie, portal]) if (r.error) throw new Error(r.error.message)
    // boleto_titulos só existe depois do SQL dos boletos de fornecedor: sem a tabela, segue sem essa origem

    const origem = new Map<number, OrigemBoleto>()
    for (const r of (agrupado.error ? [] : agrupado.data) as { codigo_lancamento: number }[]) origem.set(Number(r.codigo_lancamento), 'agrupado')
    for (const r of portal.data as { omie_cod_lancamento: number; anexo_boleto: string | null; boleto_codigo_barras: string | null }[]) {
      if ((r.anexo_boleto || r.boleto_codigo_barras) && !origem.has(Number(r.omie_cod_lancamento))) origem.set(Number(r.omie_cod_lancamento), 'portal')
    }
    for (const r of omie.data as { codigo_lancamento: number; bar: string | null }[]) {
      if (r.bar && String(r.bar).trim()) origem.set(Number(r.codigo_lancamento), 'omie')
    }

    return NextResponse.json({ mes, conta, contas: contas.map((c) => ({ ...c, boleto: origem.get(c.codigo_lancamento) ?? null })) })
  } catch (e) {
    return NextResponse.json({ erro: e instanceof Error ? e.message : 'Erro' }, { status: 500 })
  }
}
