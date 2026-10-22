// Território gamificado do app de vendas (vendedor e supervisor): os imóveis do
// CAR de um município, cada um com o nível de conquista (lib/vendas-app/territorio).
// Reaproveita a RPC do Dashboard Agro (agro_mapa_municipio), que já simplifica os
// polígonos no banco e cruza as visitas com GPS dentro de cada imóvel.
//
// Login: token do Supabase Auth. Vendedor ativo vê só as conquistas DELE;
// supervisor do app (ou CRM Vendas / Supervisor de Vendas no portal) vê a
// equipe toda ou filtra ?vendedor=<id>.
//
//   GET                        -> { municipios: [{ ibge, nome, imoveis, centro }] }
//   GET ?municipio=<ibge>      -> { municipio, features (GeoJSON c/ nivel), resumo, niveis }
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { autenticar } from '@/lib/auth/server';
import { corsVendas } from '@/lib/vendas-app/cors';
import { NIVEIS_TERRITORIO, nivelDoImovel, resumoTerritorio, type NegocioProp, type VisitaCar } from '@/lib/vendas-app/territorio';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function json(req: NextRequest, body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: corsVendas(req, 'GET, OPTIONS') });
}

export function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsVendas(req, 'GET, OPTIONS') });
}

type Quem = { tipo: 'vendedor'; vendedorId: number } | { tipo: 'supervisor' } | null;

async function validarTokenTerritorio(req: NextRequest): Promise<Quem> {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) return null;
  const uid = data.user.id;
  const [{ data: sup }, { data: vend }] = await Promise.all([
    supabaseAdmin.from('supervisores').select('ativo').eq('auth_uid', uid).maybeSingle(),
    supabaseAdmin.from('vendedores').select('id, ativo').eq('auth_uid', uid).maybeSingle(),
  ]);
  if (sup && sup.ativo !== false) return { tipo: 'supervisor' };
  if (vend && vend.ativo !== false) return { tipo: 'vendedor', vendedorId: Number(vend.id) };
  const auth = await autenticar(req);
  if (auth && (auth.isAdmin || auth.modulos.some((m) => m === 'crm-vendas' || m.startsWith('supervisor-vendas')))) return { tipo: 'supervisor' };
  return null;
}

type Feature = { type: 'Feature'; geometry: unknown; properties: Record<string, unknown> };

export async function GET(req: NextRequest) {
  const quem = await validarTokenTerritorio(req);
  if (!quem) return json(req, { error: 'Entre no app para ver o território.' }, 401);

  try {
    const municipio = req.nextUrl.searchParams.get('municipio');
    if (!municipio) {
      const { data, error } = await supabaseAdmin.rpc('agro_mapa_municipios');
      if (error) return json(req, { error: error.message }, 500);
      return json(req, { municipios: data || [], niveis: NIVEIS_TERRITORIO });
    }
    const ibge = Number(municipio);
    if (!Number.isInteger(ibge)) return json(req, { error: 'município inválido' }, 400);

    // ~20 m de tolerância: o mapa fica leve no celular e continua legível
    const { data, error } = await supabaseAdmin.rpc('agro_mapa_municipio', { p_ibge: ibge, p_tol: 0.0002 });
    if (error) return json(req, { error: error.message }, 500);
    const fc = (data || {}) as { municipio?: string; features?: Feature[]; visitas?: { id: number; cod_car: string; dia: string }[] };

    // quem fez cada visita e em que propriedade (a RPC só traz o nome)
    const ids = (fc.visitas || []).map((v) => v.id);
    const { data: detalhes } = ids.length
      ? await supabaseAdmin.from('visitas').select('id, vendedor_id, propriedade_id').in('id', ids)
      : { data: [] as { id: number; vendedor_id: number | null; propriedade_id: number | null }[] };
    const porId = new Map((detalhes || []).map((d) => [Number(d.id), d]));
    const filtroVendedor = quem.tipo === 'vendedor'
      ? quem.vendedorId
      : (req.nextUrl.searchParams.get('vendedor') ? Number(req.nextUrl.searchParams.get('vendedor')) : null);

    const visitas: VisitaCar[] = (fc.visitas || [])
      .map((v) => ({ id: v.id, cod_car: v.cod_car, dia: v.dia, vendedor_id: porId.get(Number(v.id))?.vendedor_id ?? null, propriedade_id: porId.get(Number(v.id))?.propriedade_id ?? null }))
      .filter((v) => filtroVendedor == null || v.vendedor_id === filtroVendedor);

    const props = [...new Set(visitas.map((v) => v.propriedade_id).filter((x): x is number => x != null))];
    let negQuery = props.length
      ? supabaseAdmin.from('negocios').select('propriedade_id, status, temperatura, vendedor_id').in('propriedade_id', props)
      : null;
    if (negQuery && filtroVendedor != null) negQuery = negQuery.eq('vendedor_id', filtroVendedor);
    const { data: negs } = negQuery ? await negQuery : { data: [] };
    const negocios = (negs || []) as NegocioProp[];

    const visitasPorCar = new Map<string, VisitaCar[]>();
    for (const v of visitas) visitasPorCar.set(v.cod_car, [...(visitasPorCar.get(v.cod_car) || []), v]);

    const features = (fc.features || []).map((f) => {
      const cod = String(f.properties.cod_car);
      const vs = visitasPorCar.get(cod) || [];
      const nivel = nivelDoImovel(vs, negocios);
      return {
        type: 'Feature' as const,
        geometry: f.geometry,
        properties: {
          cod_car: cod,
          area_ha: f.properties.area_ha,
          cultura: f.properties.cultura_nome || null,
          nivel,
          visitas: vs.length,
          ultima_visita: vs.map((v) => v.dia).sort().pop() || null,
        },
      };
    });

    return json(req, {
      municipio: fc.municipio || null,
      ibge,
      features,
      resumo: resumoTerritorio(features.map((f) => f.properties.nivel), features.map((f) => Number(f.properties.area_ha) || 0)),
      niveis: NIVEIS_TERRITORIO,
      escopo: filtroVendedor != null ? 'vendedor' : 'equipe',
    });
  } catch (e) {
    return json(req, { error: e instanceof Error ? e.message : String(e) }, 500);
  }
}
