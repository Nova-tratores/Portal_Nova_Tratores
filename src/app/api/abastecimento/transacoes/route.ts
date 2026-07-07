// GET /api/abastecimento/transacoes — lista abastecimentos individuais com
// filtros. Alimenta: a tabela de "últimos abastecimentos", o popup de
// drill-down dos gráficos e o relatório PDF.
//
// Params: de, ate (YYYY-MM-DD) | mes (YYYY-MM, atalho que vira de/ate) |
//         filial, placa, motorista, posto, combustivel, os |
//         limit (padrão 100, máx 1000; 0 = tudo p/ PDF), offset

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { localBR } from '@/lib/abastecimento/agregacoes';
import type { TransacaoRow, TransacoesResp } from '@/lib/abastecimento/tipos';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const COLS =
  'id, data_transacao, placa, modelo_veiculo, departamento, filial_nome, motorista_nome, posto_nome, combustivel, litros, valor_unitario, valor_total, hodometro, ordem_servico';

const PAGINA = 1000;

function proximoMes(mes: string): string {
  const [ano, m] = mes.split('-').map(Number);
  return m === 12 ? `${ano + 1}-01` : `${ano}-${String(m + 1).padStart(2, '0')}`;
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    let de = sp.get('de') || '';
    let ate = sp.get('ate') || '';
    const mes = sp.get('mes') || '';
    if (/^\d{4}-\d{2}$/.test(mes)) {
      de = `${mes}-01`;
      ate = ''; // usa lt do próximo mês, abaixo
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filtros = (q: any) => {
      let x = q;
      if (de) x = x.gte('data_transacao', `${de}T00:00:00-03:00`);
      if (mes) x = x.lt('data_transacao', `${proximoMes(mes)}-01T00:00:00-03:00`);
      else if (ate) x = x.lte('data_transacao', `${ate}T23:59:59-03:00`);
      for (const [param, col] of [
        ['filial', 'filial_nome'],
        ['placa', 'placa'],
        ['motorista', 'motorista_nome'],
        ['posto', 'posto_nome'],
        ['combustivel', 'combustivel'],
        ['os', 'ordem_servico'],
        ['departamento', 'departamento'],
      ] as const) {
        const v = sp.get(param);
        if (v) x = v === '__sem__' && param === 'motorista' ? x.is(col, null) : x.eq(col, v);
      }
      return x;
    };

    const limit = Math.min(Math.max(parseInt(sp.get('limit') || '100', 10) || 0, 0), 10000);
    const offset = Math.max(parseInt(sp.get('offset') || '0', 10) || 0, 0);
    const tudo = limit === 0; // PDF: busca tudo (paginado internamente)

    // Filtro dia da semana (0=dom) / hora (0-23, Brasília) — drill-down do
    // heatmap. PostgREST não filtra por dow/hora, então busca o período e
    // filtra em JS (volumes pequenos).
    const diaParam = sp.get('dia');
    const horaParam = sp.get('hora');
    if (diaParam != null || horaParam != null) {
      const dia = diaParam != null ? parseInt(diaParam, 10) : null;
      const hora = horaParam != null ? parseInt(horaParam, 10) : null;
      const todas: TransacaoRow[] = [];
      for (let off = 0; ; off += PAGINA) {
        const { data, error } = await filtros(supabase.from('abastecimentos').select(COLS))
          .order('data_transacao', { ascending: false })
          .range(off, off + PAGINA - 1);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        for (const l of (data || []) as unknown as TransacaoRow[]) {
          const br = localBR(l.data_transacao);
          if ((dia == null || br.dia === dia) && (hora == null || br.hora === hora)) {
            todas.push({
              ...l,
              litros: Number(l.litros) || 0,
              valor_unitario: l.valor_unitario == null ? null : Number(l.valor_unitario),
              valor_total: l.valor_total == null ? null : Number(l.valor_total),
              hodometro: l.hodometro == null ? null : Number(l.hodometro),
            });
          }
        }
        if (!data || data.length < PAGINA) break;
      }
      const resp: TransacoesResp = {
        linhas: tudo ? todas : todas.slice(offset, offset + limit),
        total: todas.length,
        somaValor: todas.reduce((s, l) => s + (l.valor_total || 0), 0),
        somaLitros: todas.reduce((s, l) => s + l.litros, 0),
      };
      return NextResponse.json(resp);
    }

    // totais do filtro (contagem + somas) — uma passada paginada leve
    let total = 0;
    let somaValor = 0;
    let somaLitros = 0;
    const linhas: TransacaoRow[] = [];

    for (let off = 0; ; off += PAGINA) {
      const { data, error, count } = await filtros(
        supabase.from('abastecimentos').select('litros, valor_total', { count: off === 0 ? 'exact' : undefined }),
      )
        .order('data_transacao', { ascending: false })
        .range(off, off + PAGINA - 1);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      if (off === 0 && typeof count === 'number') total = count;
      for (const l of data || []) {
        somaValor += Number((l as { valor_total: unknown }).valor_total) || 0;
        somaLitros += Number((l as { litros: unknown }).litros) || 0;
      }
      if (!data || data.length < PAGINA) break;
    }

    // linhas pedidas (janela limit/offset, ou tudo para o PDF)
    const fim = tudo ? total : Math.min(offset + limit, total);
    for (let off = offset; off < fim; off += PAGINA) {
      const { data, error } = await filtros(supabase.from('abastecimentos').select(COLS))
        .order('data_transacao', { ascending: false })
        .range(off, Math.min(off + PAGINA, fim) - 1);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      for (const l of (data || []) as unknown as TransacaoRow[]) {
        linhas.push({
          ...l,
          litros: Number(l.litros) || 0,
          valor_unitario: l.valor_unitario == null ? null : Number(l.valor_unitario),
          valor_total: l.valor_total == null ? null : Number(l.valor_total),
          hodometro: l.hodometro == null ? null : Number(l.hodometro),
        });
      }
      if (!data || data.length < PAGINA) break;
    }

    const resp: TransacoesResp = { linhas, total, somaValor, somaLitros };
    return NextResponse.json(resp);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
