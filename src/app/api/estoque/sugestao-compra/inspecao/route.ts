import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/estoque/supabase';
import { exigirAcessoModulo } from '@/lib/ajustes/permissao-server';
import { montarSerie12m, type MovimentoCru } from '@/lib/estoque/sugestao-compra/serie';
import {
  analisarConta, consolidar, type IndiceSazonal, type ParamsConta, type Curva, type SaidaConta,
} from '@/lib/estoque/sugestao-compra/motor';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Inspeção de um SKU: costura vw_saida_mensal_item (série crua) + índice sazonal
// + params + motor, e devolve a decomposição para validar o pipeline contra a
// Movimentação de Produto ao vivo. NÃO grava nada; a curva ABC real vem do job
// (aqui aceita ?curva= para não varrer vendas_itens; default 'B').

const CV_REGULARIDADE: Record<string, number> = { regular: 0.15, irregular: 0.30, muito_irregular: 0.50 };

async function paginarTodos<T>(monta: (off: number) => Promise<T[]>): Promise<T[]> {
  const out: T[] = [];
  let off = 0;
  for (;;) {
    const b = await monta(off);
    out.push(...b);
    if (b.length < 1000) break;
    off += 1000;
  }
  return out;
}

export async function GET(req: NextRequest) {
  try {
    await exigirAcessoModulo(req, 'estoque');
  } catch (e) {
    const st = (e as { status?: number }).status ?? 401;
    return NextResponse.json({ erro: (e as Error).message }, { status: st });
  }

  const sku = (req.nextUrl.searchParams.get('sku') || '').trim();
  const curva = ((req.nextUrl.searchParams.get('curva') || 'B').toUpperCase() as Curva);
  if (!sku) return NextResponse.json({ erro: 'informe ?sku=' }, { status: 400 });

  const hoje = new Date();

  try {
    // 1) produtos das duas contas para esse SKU
    const { data: prods } = await supabase
      .from('produtos')
      .select('conta_omie, codigo, codigo_produto, descricao, marca, familia_nome, tipo, estoque')
      .eq('codigo', sku);
    if (!prods || prods.length === 0) return NextResponse.json({ erro: `SKU ${sku} não encontrado em produtos` }, { status: 404 });

    const porConta: Record<string, SaidaConta> = {};
    const detalhe: Record<string, unknown> = {};
    const curvaUsada: Curva = curva; // inspeção: a curva real vem do job (ABC persistida)
    let paramsLider: ParamsConta | null = null;

    for (const p of prods) {
      const conta = String(p.conta_omie); // minúsculo
      const cp = p.codigo_produto as number;

      // 2) razão cru do item (todos os movimentos p/ o saldo; ~dezenas de linhas)
      const movs = await paginarTodos<MovimentoCru>(async (off) => {
        const { data } = await supabase
          .from('estoque_movimentos')
          .select('data, ano, mes, cod_origem, qtde_saida, qtde_anterior, qtde_atual')
          .eq('conta_omie', conta).eq('grupo', 'peca').eq('codigo_produto', cp).eq('cancelado', false)
          .order('data', { ascending: true }).range(off, off + 999);
        return (data ?? []) as MovimentoCru[];
      });
      const serie = montarSerie12m(movs, hoje);

      // 3) índice sazonal do Tipo (produto_tipo é MAIÚSCULO; a view expõe minúsculo)
      const { data: pt } = await supabase
        .from('produto_tipo').select('tipo').eq('conta_omie', conta.toUpperCase()).eq('codigo_produto', String(cp)).maybeSingle();
      const tipo = (pt?.tipo && String(pt.tipo).trim()) || 'Sem tipo';
      const { data: idxRows } = await supabase
        .from('vw_indice_sazonal_tipo').select('mes, indice, anos_observados').eq('conta_omie', conta).eq('tipo', tipo);
      const indice: IndiceSazonal = {};
      for (let m = 1; m <= 12; m++) indice[m] = 1;
      // aplicabilidade simples: só aplica se houver pico >= 1.5 e >= 3 anos observados
      const picos = (idxRows ?? []).filter((r) => Number(r.anos_observados) >= 3);
      const aplicavel = picos.some((r) => Number(r.indice) >= 1.5);
      if (aplicavel) for (const r of picos) indice[Number(r.mes)] = Number(r.indice);

      // 4) params (item_param + fornecedor_param), com defaults determinísticos
      const { data: ip } = await supabase
        .from('item_param').select('*').eq('conta_omie', conta).eq('codigo_produto', cp).maybeSingle();
      const codForn = ip?.codigo_fornecedor_preferencial ?? null;
      const { data: fp } = codForn
        ? await supabase.from('fornecedor_param').select('*').eq('conta_omie', conta).eq('codigo_fornecedor', codForn).maybeSingle()
        : { data: null };
      const leadDeclarado = ip?.lead_time_override ?? fp?.lead_time_declarado ?? 30;
      const regularidade = (fp?.regularidade ?? 'regular') as ParamsConta['regularidade'];
      const params: ParamsConta = {
        multiploEmbalagem: ip?.multiplo_embalagem ?? 1,
        minimoManual: ip?.minimo_manual ?? null,
        minimoManualValidade: ip?.minimo_manual_validade ?? null,
        critico: ip?.critico ?? false,
        sobEncomenda: ip?.sob_encomenda ?? false,
        leadTimeUsado: leadDeclarado,
        leadTimeOrigem: 'declarado',
        sigmaLead: leadDeclarado * (CV_REGULARIDADE[regularidade] ?? 0.15),
        cicloDias: fp?.ciclo_dias ?? 15,
        regularidade,
        nivelServicoOverride: null,
      };
      if (!paramsLider) paramsLider = params;

      // Estoque negativo é erro de reconciliação (não disponibilidade real).
      // Clampa a 0 para o cálculo (não inflar a compra), mas mostra o valor cru.
      const estoqueCru = Number(p.estoque) || 0;
      const saida = analisarConta({ serie12m: serie, estoqueAtual: Math.max(0, estoqueCru), emTransito: 0 }, indice, hoje);
      porConta[conta] = saida;
      detalhe[conta] = {
        codigo_produto: cp, tipo, descricao: p.descricao, marca: p.marca, familia: p.familia_nome,
        estoque: estoqueCru,
        estoque_negativo: estoqueCru < 0,
        indice_sazonal_aplicavel: aplicavel,
        cmd_diario: round(saida.cmdDiario), demanda_45d: round(saida.demanda45d),
        meses_com_saida: saida.mesesComSaida, dias_ruptura_12m: saida.diasRuptura12m,
        serie12m: serie,
      };
    }

    const consolidado = consolidar({
      nova: porConta['nova'], castro: porConta['castro'],
      curva: curvaUsada, params: paramsLider!, hoje,
    });

    return NextResponse.json({ sku, curva_usada: curvaUsada, por_conta: detalhe, consolidado });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}

function round(n: number): number { return Math.round(n * 100) / 100; }
