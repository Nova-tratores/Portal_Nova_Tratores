// Pedidos que ainda aceitam item — lista curta pro seletor da retirada
// (página /p/[id], venda balcão e uso interno).
//
// Existe separado de /api/ppv/pedidos porque aquele devolve o kanban INTEIRO
// (todos os pedidos de sempre + o último log de cada um): peso demais pra um
// celular no balcão. Aqui vai só o que serve pra escolher.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/pos/supabase';
import { exigirSessao } from '@/lib/pecas/unidades-server';
import { PPV_STATUS_TERMINAIS } from '@/lib/pecas/ppv-conferencia';
import { ppvAceitaItem } from '@/lib/pecas/os-ppv';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TETO = 300;

export async function GET(req: NextRequest) {
  try {
    await exigirSessao(req);
    const termo = (req.nextUrl.searchParams.get('q') || '').trim().toLowerCase();

    // O status terminal é descartado NO BANCO, não depois: sem faturamento há
    // ~440 pedidos (quase todos Fechado/Cancelada) e só ~47 abertos — filtrar
    // em JS depois do limit deixaria de fora os abertos mais antigos, sem
    // ninguém perceber. Ordena por id_pedido porque a coluna `data` é texto BR
    // "DD/MM/AAAA hh:mm", que ordenado como string embaralha os meses.
    const terminais = `(${PPV_STATUS_TERMINAIS.map((s) => `"${s}"`).join(',')})`;
    const { data, error } = await supabase
      .from('pedidos')
      .select('id_pedido, cliente, tecnico, status, valor_total, Tipo_Pedido, pedido_omie, faturado_omie_em')
      .is('faturado_omie_em', null)
      .not('status', 'in', terminais)
      .order('id_pedido', { ascending: false })
      .limit(TETO);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const lista = ((data as any[]) || [])
      .filter((p) => ppvAceitaItem(p))
      .map((p) => ({
        id: String(p.id_pedido || ''),
        cliente: String(p.cliente || ''),
        tecnico: String(p.tecnico || ''),
        status: String(p.status || ''),
        tipo: String(p.Tipo_Pedido || ''),
        valor: Number(p.valor_total) || 0,
      }))
      .filter((p) => !termo || `${p.id} ${p.cliente} ${p.tecnico}`.toLowerCase().includes(termo));

    return NextResponse.json({ pedidos: lista });
  } catch (e) {
    const status = (e as { http?: number })?.http || 500;
    return NextResponse.json({ error: e instanceof Error ? e.message : 'erro' }, { status });
  }
}
