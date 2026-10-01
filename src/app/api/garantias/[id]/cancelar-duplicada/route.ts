import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/pos/supabase';
import { TBL_GARANTIAS, STATUS_FINALIZADOS } from '@/lib/garantias/constants';
import { registrarEvento, notificarGarantistas } from '@/lib/garantias/server';
import type { GarantiaStatus } from '@/lib/garantias/types';

// POST /api/garantias/[id]/cancelar-duplicada
// body: { duplicada_de: "GAR-0070" | "0070", ator }
//
// Cancela uma garantia SÓ por DUPLICAÇÃO (decisão do usuário, 01/10/2026 —
// caso GAR-0068 duplicada da GAR-0070): sempre aponta a garantia ORIGINAL,
// que fica gravada em duplicada_de (+ snapshot do número). Terminal: vai pra
// aba Finalizadas e não reabre pela tela.
// Migration: sql/garantias-cancelar-duplicada.sql (status 'cancelada' no CHECK).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const ator = String(body.ator || 'Garantista');

  // normaliza "0070" → "GAR-0070"
  const bruto = String(body.duplicada_de || '').trim().toUpperCase();
  const numeroOriginal = /^\d+$/.test(bruto) ? `GAR-${bruto.padStart(4, '0')}` : bruto;
  if (!numeroOriginal) {
    return NextResponse.json({ error: 'Informe o número da garantia ORIGINAL (ex: GAR-0070).' }, { status: 400 });
  }

  const { data: g } = await supabase
    .from(TBL_GARANTIAS)
    .select('id, numero, status, id_ordem, cliente')
    .eq('id', id)
    .maybeSingle();
  if (!g) return NextResponse.json({ error: 'Garantia não encontrada.' }, { status: 404 });
  if (STATUS_FINALIZADOS.includes(g.status as GarantiaStatus)) {
    return NextResponse.json({ error: 'Garantia já finalizada — não dá mais pra cancelar.' }, { status: 400 });
  }

  const { data: orig } = await supabase
    .from(TBL_GARANTIAS)
    .select('id, numero, status, id_ordem, cliente')
    .eq('numero', numeroOriginal)
    .maybeSingle();
  if (!orig) {
    return NextResponse.json({ error: `Garantia ${numeroOriginal} não encontrada — confira o número da original.` }, { status: 404 });
  }
  if (orig.id === g.id) {
    return NextResponse.json({ error: 'A original não pode ser a própria garantia.' }, { status: 400 });
  }
  if (orig.status === 'cancelada') {
    return NextResponse.json({ error: `${orig.numero} também está cancelada — aponte a garantia que FICOU valendo.` }, { status: 400 });
  }

  const { data: atualizada, error } = await supabase
    .from(TBL_GARANTIAS)
    .update({
      status: 'cancelada',
      duplicada_de: orig.id,
      duplicada_de_numero: orig.numero,
      cancelada_em: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();
  if (error) {
    console.error('Erro ao cancelar garantia duplicada:', error.message);
    const dica = /constraint|cancelada|duplicada_de/i.test(error.message)
      ? ' (migration sql/garantias-cancelar-duplicada.sql aplicada?)'
      : '';
    return NextResponse.json({ error: `Falha ao cancelar.${dica}` }, { status: 500 });
  }

  await registrarEvento(id, {
    tipo: 'cancelada',
    statusAnterior: g.status,
    statusNovo: 'cancelada',
    ator,
    detalhe: `Cancelada por DUPLICAÇÃO — este caso é o mesmo da ${orig.numero} (OS ${orig.id_ordem}), que segue valendo.`,
  });
  await registrarEvento(orig.id, {
    tipo: 'duplicada_cancelada',
    ator,
    detalhe: `A ${g.numero} (OS ${g.id_ordem}) foi cancelada como duplicata DESTA garantia.`,
  });
  await notificarGarantistas({
    titulo: `Garantia ${g.numero} cancelada (duplicada)`,
    descricao: `${g.numero} era duplicata da ${orig.numero} — quem segue valendo é a ${orig.numero}.`,
    link: `/garantias?id=${orig.id}`,
  });

  return NextResponse.json({ garantia: atualizada, original: { id: orig.id, numero: orig.numero } });
}
