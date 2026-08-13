import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/pos/supabase';
import { TBL_OS } from '@/lib/pos/constants';

export const dynamic = 'force-dynamic';

// Resolve o Id_Ordem do Pós-vendas (ex.: "OS-0395") a partir do NÚMERO da OS na
// Omie (o `numero_os` do dashboard, ex.: "301"). A OS só existe aqui se passou
// pelo módulo Pós-vendas — senão devolve { idOrdem: null } (o dashboard avisa).
// Campos de ligação em Ordem_Servico: `id_omie` (nº Omie sem zeros) ou
// `Ordem_Omie` (às vezes zero-padded p/ 15, ex.: "000000000004873").
export async function GET(req: NextRequest) {
  const num = (req.nextUrl.searchParams.get('num') || '').replace(/\D/g, '');
  if (!num) return NextResponse.json({ idOrdem: null });
  const n = parseInt(num, 10);
  const padded = num.padStart(15, '0');
  try {
    let { data } = await supabase.from(TBL_OS).select('Id_Ordem').eq('id_omie', n).limit(1);
    if (!data || !data.length) {
      ({ data } = await supabase.from(TBL_OS).select('Id_Ordem').in('Ordem_Omie', [num, padded]).limit(1));
    }
    const idOrdem = data && data.length ? (data[0] as { Id_Ordem: string }).Id_Ordem : null;
    return NextResponse.json({ idOrdem });
  } catch (e) {
    return NextResponse.json({ idOrdem: null, erro: (e as Error).message }, { status: 500 });
  }
}
