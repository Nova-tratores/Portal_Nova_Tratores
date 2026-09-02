import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/estoque/supabase';
import { exigirAcessoModulo, exigirPermissao } from '@/lib/ajustes/permissao-server';
import { mapaFornecedoresConta } from '@/lib/estoque/sugestao-compra/fornecedores';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Config de Compras — parâmetros por ITEM (e conta), com a cascata efetiva
// fornecedor→tipo→item resolvida para exibição ("34 dias, herdado de Mahindra").
const LEAD_DEFAULT = 30;

function contaLower(v: string | null): 'nova' | 'castro' | null {
  const s = (v || '').toLowerCase();
  return s === 'nova' || s === 'castro' ? s : null;
}
function numOrNull(v: unknown): number | null {
  if (v === '' || v == null) return null;
  const n = Number(v); return Number.isFinite(n) ? n : null;
}

export async function GET(req: NextRequest) {
  try {
    await exigirAcessoModulo(req, 'estoque');
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: (e as { status?: number }).status ?? 401 });
  }
  const conta = contaLower(req.nextUrl.searchParams.get('conta'));
  const q = (req.nextUrl.searchParams.get('q') || '').trim();
  if (!conta) return NextResponse.json({ erro: 'conta obrigatória (nova|castro)' }, { status: 400 });
  if (q.length < 2) return NextResponse.json({ erro: 'busque por ao menos 2 caracteres' }, { status: 400 });

  try {
    // 1) produtos (peça) da conta que casam por SKU ou descrição
    const like = `%${q}%`;
    const { data: prods } = await supabase
      .from('produtos')
      .select('codigo, codigo_produto, descricao, marca, familia_nome, tipo, estoque')
      .eq('conta_omie', conta)
      .or(`codigo.ilike.${like},descricao.ilike.${like}`)
      .limit(100);
    if (!prods || prods.length === 0) return NextResponse.json({ conta, lista: [] });

    const cps = prods.map((p) => p.codigo_produto);
    const { data: ips } = await supabase.from('item_param').select('*').eq('conta_omie', conta).in('codigo_produto', cps);
    const ipByCp = new Map((ips ?? []).map((p) => [Number(p.codigo_produto), p]));

    // 2) fornecedores referenciados (preferenciais) + seus leads na conta
    const fornIds = [...new Set((ips ?? []).map((p) => p.codigo_fornecedor_preferencial).filter((x) => x != null))] as number[];
    const [nomeForn, { data: fps }] = await Promise.all([
      mapaFornecedoresConta(conta),   // id_fornecedor Omie → nome (via recebimentos_nfe)
      fornIds.length ? supabase.from('fornecedor_param').select('codigo_fornecedor, lead_time_declarado').eq('conta_omie', conta).in('codigo_fornecedor', fornIds) : Promise.resolve({ data: [] }),
    ]);
    const leadForn = new Map((fps ?? []).map((f) => [Number(f.codigo_fornecedor), f.lead_time_declarado]));

    const lista = prods.map((p) => {
      const ip = ipByCp.get(Number(p.codigo_produto));
      const codForn = ip?.codigo_fornecedor_preferencial ?? null;
      // cascata do lead: item override → fornecedor → default
      let leadEfetivo = LEAD_DEFAULT, leadOrigem = 'padrão (30)';
      if (codForn != null && leadForn.get(Number(codForn)) != null) {
        leadEfetivo = Number(leadForn.get(Number(codForn))); leadOrigem = `fornecedor ${nomeForn.get(Number(codForn)) ?? codForn}`;
      }
      if (ip?.lead_time_override != null) { leadEfetivo = Number(ip.lead_time_override); leadOrigem = 'override do item'; }
      return {
        codigo: p.codigo, codigo_produto: p.codigo_produto, descricao: p.descricao,
        marca: p.marca, familia: p.familia_nome, tipo: p.tipo, estoque: p.estoque,
        param: ip ?? null,
        fornecedor_preferencial_nome: codForn != null ? (nomeForn.get(Number(codForn)) ?? null) : null,
        lead_efetivo: leadEfetivo, lead_origem: leadOrigem,
      };
    });
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
    const codigoProduto = Number(b.codigo_produto);
    if (!conta) return NextResponse.json({ erro: 'conta obrigatória (nova|castro)' }, { status: 400 });
    if (!Number.isFinite(codigoProduto)) return NextResponse.json({ erro: 'codigo_produto obrigatório' }, { status: 400 });

    const minimoManual = numOrNull(b.minimo_manual);
    // regra: mínimo manual exige motivo + validade (mínimo sem validade apodrece).
    if (minimoManual != null) {
      if (!String(b.minimo_manual_motivo || '').trim()) return NextResponse.json({ erro: 'mínimo manual exige um motivo' }, { status: 400 });
      if (!String(b.minimo_manual_validade || '').trim()) return NextResponse.json({ erro: 'mínimo manual exige validade' }, { status: 400 });
    }

    const linha = {
      conta_omie: conta,
      codigo_produto: codigoProduto,
      codigo_fornecedor_preferencial: numOrNull(b.codigo_fornecedor_preferencial),
      lead_time_override: numOrNull(b.lead_time_override),
      multiplo_embalagem: numOrNull(b.multiplo_embalagem) ?? 1,
      minimo_manual: minimoManual,
      minimo_manual_motivo: minimoManual != null ? String(b.minimo_manual_motivo).trim() : null,
      minimo_manual_validade: minimoManual != null ? String(b.minimo_manual_validade).trim() : null,
      critico: b.critico === true,
      sob_encomenda: b.sob_encomenda === true,
      atualizado_em: new Date().toISOString(),
      atualizado_por: user.id,
    };
    const { data, error } = await supabase
      .from('item_param').upsert(linha, { onConflict: 'conta_omie,codigo_produto' }).select().maybeSingle();
    if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
    supabase.from('audit_log').insert({
      user_id: user.id, user_nome: user.nome || '—', sistema: 'Sugestão de Compra',
      acao: 'editar', entidade: 'item_param', entidade_id: `${conta}:${codigoProduto}`, detalhes: linha,
    }).then(() => {}, () => {});
    return NextResponse.json({ ok: true, param: data });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
