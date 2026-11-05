// GET /api/frota/locais — os LUGARES conhecidos da operação, para a camada de
// pins do /frota/mapa e para o rótulo "onde o carro está":
//   - geocercas da Rota Exata (loja, clientes, oficinas, estacionamentos)
//   - propriedades de clientes do portal com coordenada (fazendas/sítios)
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { autenticar } from '@/lib/auth/server';
import { temAcessoMapa } from '@/lib/frota/server';
import { carregarPropriedades } from '@/lib/frota/propriedades';
import { carregarGeocercasAtivas } from '@/lib/frota/geocercas-server';

export const runtime = 'nodejs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } },
);

export async function GET(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!temAcessoMapa(auth)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

  const [geo, props] = await Promise.all([
    carregarGeocercasAtivas<{ id: string; nome: string; classe: string; latitude: number; longitude: number; raio_m: number; endereco: string | null }>(
      supabase, 'id, nome, classe, latitude, longitude, raio_m, endereco'),
    carregarPropriedades(supabase).catch(() => []),
  ]);

  return NextResponse.json({
    geocercas: (geo.data || []).filter((g) => g.latitude && g.longitude),
    propriedades: props,
  });
}
