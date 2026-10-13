import { NextRequest, NextResponse } from 'next/server'
import { protegerRota } from '@/lib/ajustes/permissao-server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { grafiasParaBusca, lerCadastros } from '@/lib/opa-pecas/cadastro-server'
import { montarRelacao, type ItemRelacao } from '@/lib/opa-pecas/relacao'

export const dynamic = 'force-dynamic'

// Relação Opa × cadastro (Peças S/Estoque → botão "Relação"): para cada peça do
// Opa, o código (o CORRETO quando a embalagem estava errada, senão o "Código já
// existente") já está cadastrado (Omie/PPV)? Devolve as duas filas prontas
// (já cadastrados × só no Opa). Só leitura; módulo Opa Peças.

const COLUNAS = 'id, codigo, codigo_fabricante, descricao, quantidade, qualidade, status, local_id, local_tecnico, preco_sugerido, criado_em'

export async function GET(req: NextRequest) {
  const acesso = await protegerRota(req, [{ modulo: 'opa-pecas' }])
  if (acesso.resposta) return acesso.resposta
  try {
    // codigo_correto vem do sql/pni-13 — sem ele a relação segue só com o código da embalagem
    const comCorreto = await supabaseAdmin.from('pni_itens').select(`${COLUNAS}, codigo_correto`).is('deleted_at', null).order('criado_em', { ascending: false })
    const r = comCorreto.error?.code === '42703'
      ? await supabaseAdmin.from('pni_itens').select(COLUNAS).is('deleted_at', null).order('criado_em', { ascending: false })
      : comCorreto
    if (r.error) throw r.error
    const itens = (r.data || []) as unknown as ItemRelacao[]

    const { produtos, caracteristicas } = await lerCadastros(grafiasParaBusca(itens.flatMap((i) => [i.codigo_fabricante, i.codigo_correto])))
    return NextResponse.json({ ok: true, ...montarRelacao(itens, produtos, caracteristicas) })
  } catch (e) {
    const erro = e instanceof Error ? e.message : String((e as { message?: string })?.message || e)
    return NextResponse.json({ ok: false, erro }, { status: 500 })
  }
}
