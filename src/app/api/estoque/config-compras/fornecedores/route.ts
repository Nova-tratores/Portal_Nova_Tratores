import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/estoque/supabase';
import { exigirAcessoModulo, exigirPermissao } from '@/lib/ajustes/permissao-server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Config de Compras — parâmetros de suprimento por FORNECEDOR (e conta).
// conta_omie das tabelas do módulo é MINÚSCULO (alinhado a produtos/movimentos).
// O código Omie do fornecedor é por conta (id_omie / id_omie_castro).

function contaLower(v: string | null): 'nova' | 'castro' | null {
  const s = (v || '').toLowerCase();
  return s === 'nova' || s === 'castro' ? s : null;
}

export async function GET(req: NextRequest) {
  try {
    await exigirAcessoModulo(req, 'estoque');
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: (e as { status?: number }).status ?? 401 });
  }
  const conta = contaLower(req.nextUrl.searchParams.get('conta'));
  if (!conta) return NextResponse.json({ erro: 'conta obrigatória (nova|castro)' }, { status: 400 });

  try {
    const [{ data: forns }, { data: params }] = await Promise.all([
      supabase.from('Fornecedores').select('id, nome, id_omie, id_omie_castro').order('nome', { ascending: true }),
      supabase.from('fornecedor_param').select('*').eq('conta_omie', conta),
    ]);
    const pByForn = new Map((params ?? []).map((p) => [Number(p.codigo_fornecedor), p]));
    const codigoOmieCol = conta === 'castro' ? 'id_omie_castro' : 'id_omie';
    const lista = (forns ?? []).map((f) => ({
      id: f.id,
      nome: f.nome,
      cadastrado_na_conta: f[codigoOmieCol as 'id_omie'] != null, // tem código Omie nesta conta?
      param: pByForn.get(Number(f.id)) ?? null,
    }));
    return NextResponse.json({ conta, lista });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let user: { id: string; nome?: string };
  try {
    user = await exigirPermissao(req, 'estoque', 'config-compras');
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: (e as { status?: number }).status ?? 401 });
  }
  try {
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const conta = contaLower(String(b.conta ?? ''));
    const codigoFornecedor = Number(b.codigo_fornecedor);
    if (!conta) return NextResponse.json({ erro: 'conta obrigatória (nova|castro)' }, { status: 400 });
    if (!Number.isFinite(codigoFornecedor)) return NextResponse.json({ erro: 'codigo_fornecedor obrigatório' }, { status: 400 });

    const regularidade = ['regular', 'irregular', 'muito_irregular'].includes(String(b.regularidade))
      ? String(b.regularidade) : 'regular';
    const linha = {
      conta_omie: conta,
      codigo_fornecedor: codigoFornecedor,
      lead_time_declarado: numOrNull(b.lead_time_declarado),
      regularidade,
      ciclo_dias: numOrNull(b.ciclo_dias) ?? 15,
      nivel_servico_a: numOrNull(b.nivel_servico_a),
      nivel_servico_b: numOrNull(b.nivel_servico_b),
      nivel_servico_c: numOrNull(b.nivel_servico_c),
      pedido_minimo_valor: numOrNull(b.pedido_minimo_valor),
      ativo: b.ativo === false ? false : true,
      atualizado_em: new Date().toISOString(),
      atualizado_por: user.id,
    };
    const { data, error } = await supabase
      .from('fornecedor_param')
      .upsert(linha, { onConflict: 'conta_omie,codigo_fornecedor' })
      .select().maybeSingle();
    if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
    auditar(user, 'editar', 'fornecedor_param', `${conta}:${codigoFornecedor}`, linha);
    return NextResponse.json({ ok: true, param: data });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}

function numOrNull(v: unknown): number | null {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Auditoria best-effort (não bloqueia a resposta).
function auditar(user: { id: string; nome?: string }, acao: string, entidade: string, entidadeId: string, detalhes: unknown) {
  supabase.from('audit_log').insert({
    user_id: user.id, user_nome: user.nome || '—', sistema: 'Sugestão de Compra',
    acao, entidade, entidade_id: entidadeId, detalhes,
  }).then(() => {}, () => {});
}
