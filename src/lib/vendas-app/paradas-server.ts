// Situação das paradas longas de um carro num dia (servidor): explicada pelo
// vendedor, coberta por visita registrada perto, ou a explicar.
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { PARADA_LONGA_MIN, temVisitaPerto, type MotivoParada, type VisitaPonto } from './paradas';

export type SituacaoParada = 'curta' | 'visita' | 'explicada' | 'a_explicar';

export interface ParadaComSituacao {
  lat: number; lng: number; inicio: string; fim: string | null; duracao_min: number; local?: string | null;
  situacao?: SituacaoParada | string; motivo?: MotivoParada | string | null; observacao?: string | null;
}

export async function situacaoDasParadas<T extends ParadaComSituacao>(
  placa: string, data: string, vendedorId: number | null, paradas: T[],
): Promise<T[]> {
  const longas = paradas.filter((p) => p.duracao_min >= PARADA_LONGA_MIN);
  if (!longas.length) return paradas.map((p) => ({ ...p, situacao: 'curta' as const }));

  const [expl, vis] = await Promise.all([
    supabaseAdmin.from('vendas_paradas_explicadas').select('inicio, motivo, observacao')
      .eq('placa', placa).in('inicio', longas.map((p) => p.inicio)),
    vendedorId != null
      ? supabaseAdmin.from('visitas').select('latitude, longitude, data_visita')
        .eq('vendedor_id', vendedorId).is('deleted_at', null)
        .gte('data_visita', `${data}T00:00:00-03:00`).lte('data_visita', `${data}T23:59:59-03:00`)
      : Promise.resolve({ data: [] as VisitaPonto[] }),
  ]);
  // tabela ainda não criada (sql/vendas-paradas-explicadas.sql): ninguém explicou nada
  const porInicio = new Map(((expl.error ? [] : expl.data) || []).map((e) => [new Date(e.inicio).getTime(), e]));
  const visitas = (vis.data || []) as VisitaPonto[];

  return paradas.map((p) => {
    if (p.duracao_min < PARADA_LONGA_MIN) return { ...p, situacao: 'curta' as const };
    const e = porInicio.get(new Date(p.inicio).getTime());
    if (e) return { ...p, situacao: 'explicada' as const, motivo: e.motivo as MotivoParada, observacao: e.observacao || null };
    if (temVisitaPerto(p, visitas)) return { ...p, situacao: 'visita' as const };
    return { ...p, situacao: 'a_explicar' as const };
  });
}
