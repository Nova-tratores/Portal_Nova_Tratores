import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/pos/supabase';
import { TBL_OS } from '@/lib/pos/constants';
import { TBL_GARANTIAS, STATUS_FINALIZADOS } from '@/lib/garantias/constants';
import type { OSElegivel } from '@/lib/garantias/types';

// GET /api/garantias/os-elegiveis?tecnico=<nome>
// OS do técnico que ainda podem abrir uma garantia.
export async function GET(req: NextRequest) {
  const tecnico = (req.nextUrl.searchParams.get('tecnico') || '').trim();
  if (!tecnico) return NextResponse.json({ ordens: [] });

  const { data: ordens, error } = await supabase
    .from(TBL_OS)
    .select('Id_Ordem, Os_Cliente, Data, Tipo_Servico, Serv_Solicitado, Status')
    .or(`Os_Tecnico.eq.${tecnico},Os_Tecnico2.eq.${tecnico}`)
    .neq('Status', 'Cancelada')
    .order('Data', { ascending: false })
    .limit(120);
  if (error) {
    console.error('Erro ao listar OS elegíveis:', error.message);
    return NextResponse.json({ error: 'Falha ao listar OS.' }, { status: 500 });
  }

  const ids = (ordens || []).map((o) => o.Id_Ordem);
  if (ids.length === 0) return NextResponse.json({ ordens: [] });

  // Exclui OS que já têm garantia ativa
  const { data: garativas } = await supabase
    .from(TBL_GARANTIAS)
    .select('id_ordem')
    .in('id_ordem', ids)
    .not('status', 'in', `(${STATUS_FINALIZADOS.join(',')})`);
  const comGarantia = new Set((garativas || []).map((g) => g.id_ordem));

  // Chassi do relatório técnico
  const { data: tecs } = await supabase
    .from('Ordem_Servico_Tecnicos')
    .select('Ordem_Servico, Chassis')
    .in('Ordem_Servico', ids);
  const chassiPorOS: Record<string, string> = {};
  (tecs || []).forEach((t) => {
    if (t.Ordem_Servico) chassiPorOS[t.Ordem_Servico] = t.Chassis || '';
  });

  const lista: OSElegivel[] = (ordens || [])
    .filter((o) => !comGarantia.has(o.Id_Ordem))
    .map((o) => ({
      id_ordem: o.Id_Ordem,
      cliente: o.Os_Cliente || '',
      chassis: chassiPorOS[o.Id_Ordem] || null,
      data: o.Data || '',
      tipo_servico: o.Tipo_Servico || '',
      serv_solicitado: o.Serv_Solicitado || '',
    }));

  return NextResponse.json({ ordens: lista });
}
