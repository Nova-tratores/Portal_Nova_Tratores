import { NextResponse } from 'next/server';
import { supabase } from '@/lib/estoque/supabase';
import { parseDataBR } from '@/lib/estoque/utils';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Última sync do Supabase (lendo cache_controle). Versão simplificada de
// GET /api/versao (server.js:1527) — só retorna { ultimaSync }.
export async function GET() {
  let ultimaSync: string | null = null;
  try {
    const { data } = await supabase.from('cache_controle').select('ultima_data,tipo,conta_omie');
    if (data && data.length > 0) {
      let maxDt: Date | null = null;
      for (const row of data as Array<{ ultima_data: string }>) {
        const dt = parseDataBR(row.ultima_data);
        if (dt && (!maxDt || dt > maxDt)) maxDt = dt;
      }
      if (maxDt) ultimaSync = maxDt.toISOString();
    }
  } catch {
    /* silencioso */
  }
  return NextResponse.json({ ultimaSync });
}
