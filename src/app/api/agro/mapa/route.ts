/* eslint-disable @typescript-eslint/no-explicit-any */
// GET /api/agro/mapa                    — municípios carregados (contagens + centro)
// GET /api/agro/mapa?municipio=<ibge>   — FeatureCollection dos CARs ativos do município (polígonos simplificados
//                                          no banco: sql/agro-mapa.sql) + perfil + vínculos + visitas do CRM
import { NextResponse } from 'next/server';
import { autenticar, type Autenticado } from '@/lib/auth/server';
import { supabaseAdmin } from '@/lib/server/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MSG_MIGRATION = 'Migration sql/agro-mapa.sql não aplicada (funções agro_mapa_*).';

function temAcessoAgro(auth: Autenticado): boolean {
  return auth.isAdmin || auth.modulos.includes('dashboard-agro') || auth.modulos.some((m) => m.startsWith('agro'));
}

export async function GET(req: Request) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!temAcessoAgro(auth)) return NextResponse.json({ error: 'Sem permissão para o Dashboard Agro' }, { status: 403 });

  try {
    const url = new URL(req.url);
    const municipio = url.searchParams.get('municipio');
    if (!municipio) {
      const { data, error } = await supabaseAdmin.rpc('agro_mapa_municipios');
      if (error) throw error;
      return NextResponse.json({ municipios: data || [] });
    }
    const ibge = Number(municipio);
    if (!Number.isInteger(ibge)) return NextResponse.json({ error: 'municipio inválido' }, { status: 400 });
    const tol = Number(url.searchParams.get('tol') || 0.00005);
    const { data, error } = await supabaseAdmin.rpc('agro_mapa_municipio', { p_ibge: ibge, p_tol: tol });
    if (error) throw error;
    return NextResponse.json(data, { headers: { 'Cache-Control': 'private, max-age=300' } });
  } catch (e: any) {
    const m = String(e?.message || '');
    if (/agro_mapa_/.test(m) && /not find|does not exist|schema cache/i.test(m)) {
      return NextResponse.json({ error: MSG_MIGRATION, migracaoFaltando: true }, { status: 503 });
    }
    console.error('[agro] mapa:', e);
    return NextResponse.json({ error: e?.message || 'Erro inesperado' }, { status: 500 });
  }
}
