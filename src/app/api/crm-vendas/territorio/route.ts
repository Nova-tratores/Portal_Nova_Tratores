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
import { NIVEIS_TERRITORIO, nivelDoImovel, resumoTerritorio, geometriaLeve, bboxVazio, type NegocioProp, type VisitaCar } from '@/lib/vendas-app/territorio';
import { chaveMunicipio, tratoresDoMunicipio, type TratorLocalizado, type TratorVendido } from '@/lib/vendas-app/tratores-territorio';
import { pinosProvaveis, type FonteLocal } from '@/lib/vendas-app/tratores-provaveis';
import { cidadeDoTrator, indexarClientesOmie, type ClienteOmieIdx } from '@/lib/vendas-app/tratores-cidade';
import { paginar } from '@/lib/db/paginar';

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

// Clientes_Omie (nome → cidade) para corrigir a cidade dos tratores vendidos.
// ~3 mil linhas, muda pouco: 6 h no processo. Falhou = cidade digitada (como antes).
let cacheOmie: { at: number; idx: ClienteOmieIdx[] } | null = null;
async function clientesOmie(): Promise<ClienteOmieIdx[]> {
  if (cacheOmie && Date.now() - cacheOmie.at < 6 * 3600_000) return cacheOmie.idx;
  try {
    const { data: rows, error } = await paginar<{ nome: string | null; cidade: string | null }>((de, ate) =>
      supabaseAdmin.from('Clientes_Omie').select('nome, cidade').order('id').range(de, ate));
    if (error) throw new Error(error.message);
    cacheOmie = { at: Date.now(), idx: indexarClientesOmie(rows) };
    return cacheOmie.idx;
  } catch (e) {
    console.warn('[territorio] Clientes_Omie:', e);
    return cacheOmie?.idx || [];
  }
}

// Pontos onde o dono do trator já foi achado: fazenda marcada pelo GPS do técnico
// (clientes_localizacoes) e visitas presenciais com GPS. 30 min no processo.
let cacheFontes: { at: number; fontes: FonteLocal[] } | null = null;
async function fontesLocais(): Promise<FonteLocal[]> {
  if (cacheFontes && Date.now() - cacheFontes.at < 30 * 60_000) return cacheFontes.fontes;
  const [faz, vis] = await Promise.all([
    supabaseAdmin.from('clientes_localizacoes').select('cliente_nome, nome, lat, lng, tecnico, confirmado_em, os_id').limit(5000),
    paginar<{ cliente_nome: string | null; propriedade_nome: string | null; latitude: number | null; longitude: number | null; data_visita: string | null; deleted_at: string | null; duplicada_de: number | null }>((de, ate) =>
      supabaseAdmin.from('vw_visitas_detalhadas')
        .select('id, cliente_nome, propriedade_nome, latitude, longitude, data_visita, deleted_at, duplicada_de')
        .eq('tipo', 'presencial').not('latitude', 'is', null).order('id').range(de, ate)),
  ]);
  const fontes: FonteLocal[] = [];
  type Faz = { cliente_nome: string | null; nome: string | null; lat: number; lng: number; tecnico: string | null; confirmado_em: string | null; os_id: string | null };
  const fazendas = (faz.error ? [] : faz.data || []) as Faz[];
  // a OS de cada local: o Projeto/serviço cita o chassi atendido → o trator estava ali
  const osIds = [...new Set(fazendas.map((f) => f.os_id).filter(Boolean))] as string[];
  const textoDaOS = new Map<string, string>();
  for (let i = 0; i < osIds.length; i += 200) {
    const { data } = await supabaseAdmin.from('Ordem_Servico').select('Id_Ordem, Projeto, Serv_Solicitado').in('Id_Ordem', osIds.slice(i, i + 200));
    for (const o of (data || []) as { Id_Ordem: string; Projeto: string | null; Serv_Solicitado: string | null }[]) {
      textoDaOS.set(o.Id_Ordem, `${o.Projeto || ''} ${o.Serv_Solicitado || ''}`);
    }
  }
  for (const f of fazendas) {
    if (f.lat == null || f.lng == null) continue;
    const texto = f.os_id ? textoDaOS.get(f.os_id) : null;
    if (texto) fontes.push({ nomes: [f.cliente_nome], textoChassi: texto, lat: f.lat, lng: f.lng, origem: 'atendimento', detalhe: [f.os_id, f.nome, f.tecnico].filter(Boolean).join(' · ') || null, quando: f.confirmado_em });
    fontes.push({ nomes: [f.cliente_nome], lat: f.lat, lng: f.lng, origem: 'fazenda', detalhe: [f.nome, f.tecnico ? `marcada pelo GPS do carro (${f.tecnico})` : null].filter(Boolean).join(' · ') || null, quando: f.confirmado_em });
  }
  for (const v of vis.data || []) {
    if (v.deleted_at || v.duplicada_de || v.latitude == null || v.longitude == null) continue;
    fontes.push({ nomes: [v.cliente_nome, v.propriedade_nome], lat: v.latitude, lng: v.longitude, origem: 'visita', detalhe: v.propriedade_nome, quando: v.data_visita });
  }
  cacheFontes = { at: Date.now(), fontes };
  return fontes;
}

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

// A lista de municípios custa 6–8 s no banco (extensão de ~35 mil polígonos) e
// às vezes estoura o tempo: fica 6 h em memória, compartilhada entre todos, e a
// cópia velha é usada se o banco falhar.
const TTL_MUNICIPIOS_MS = 6 * 3600_000;
let cacheMunicipios: { at: number; dados: unknown[] } | null = null;
let buscandoMunicipios: Promise<unknown[]> | null = null;
async function listaMunicipios(): Promise<unknown[]> {
  if (cacheMunicipios && Date.now() - cacheMunicipios.at < TTL_MUNICIPIOS_MS) return cacheMunicipios.dados;
  if (!buscandoMunicipios) {
    buscandoMunicipios = (async () => {
      const { data, error } = await supabaseAdmin.rpc('agro_mapa_municipios');
      if (error) {
        if (cacheMunicipios) return cacheMunicipios.dados;
        throw new Error(error.message);
      }
      cacheMunicipios = { at: Date.now(), dados: (data || []) as unknown[] };
      return cacheMunicipios.dados;
    })().finally(() => { buscandoMunicipios = null; });
  }
  return buscandoMunicipios;
}

export async function GET(req: NextRequest) {
  const quem = await validarTokenTerritorio(req);
  if (!quem) return json(req, { error: 'Entre no app para ver o território.' }, 401);

  try {
    const municipio = req.nextUrl.searchParams.get('municipio');
    if (!municipio) {
      return json(req, { municipios: await listaMunicipios(), niveis: NIVEIS_TERRITORIO });
    }
    // aquece a lista de municípios em segundo plano (a tela pede logo depois)
    void listaMunicipios().catch(() => {});
    const ibge = Number(municipio);
    if (!Number.isInteger(ibge)) return json(req, { error: 'município inválido' }, 400);

    // ~40 m de tolerância: o mapa fica leve no celular e continua legível
    const { data, error } = await supabaseAdmin.rpc('agro_mapa_municipio', { p_ibge: ibge, p_tol: 0.0004 });
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

    const bbox = bboxVazio(); // contorno do município, para o mapa enquadrar
    const features = (fc.features || []).map((f) => {
      const cod = String(f.properties.cod_car);
      const vs = visitasPorCar.get(cod) || [];
      const nivel = nivelDoImovel(vs, negocios);
      return {
        type: 'Feature' as const,
        geometry: geometriaLeve(f.geometry as { type: string; coordinates: unknown }, bbox),
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

    // tratores vendidos no município + os já localizados em campo (pinos)
    const [{ data: vendidos }, loc, omie] = await Promise.all([
      supabaseAdmin.from('tratores').select('Chassis, Modelo, Cliente, Cidade, Entrega').limit(5000),
      supabaseAdmin.from('trator_localizacao_atual').select('chassis, lat, lng, cod_car, confirmado_em, vendedor_nome').limit(5000),
      clientesOmie(),
    ]);
    const tratores = tratoresDoMunicipio(
      fc.municipio || '',
      (vendidos || []) as TratorVendido[],
      (loc.error ? [] : loc.data || []) as TratorLocalizado[], // sem a migration: ninguém localizado ainda
      new Set(features.map((f) => f.properties.cod_car)),
      (t) => cidadeDoTrator(t, omie).chave,
    );
    // os que ninguém localizou ainda: ponto PROVÁVEL (fazenda do técnico / visita ao dono)
    const alvo = chaveMunicipio(fc.municipio || '');
    const localizados = new Set(((loc.error ? [] : loc.data || []) as TratorLocalizado[]).map((l) => l.chassis));
    const semLocal = ((vendidos || []) as TratorVendido[])
      .filter((t) => t.Chassis && !localizados.has(t.Chassis) && cidadeDoTrator(t, omie).chave === alvo);
    const provaveis = semLocal.length ? pinosProvaveis(semLocal, await fontesLocais().catch(() => [])) : [];
    const carsComTrator = new Set(tratores.pinos.map((p) => p.cod_car).filter(Boolean));
    for (const f of features) (f.properties as Record<string, unknown>).trator = carsComTrator.has(f.properties.cod_car);

    return json(req, {
      tratores: { ...tratores, provaveis },
      municipio: fc.municipio || null,
      ibge,
      bbox: Number.isFinite(bbox[0]) ? bbox : null,
      features,
      resumo: resumoTerritorio(features.map((f) => f.properties.nivel), features.map((f) => Number(f.properties.area_ha) || 0)),
      niveis: NIVEIS_TERRITORIO,
      escopo: filtroVendedor != null ? 'vendedor' : 'equipe',
    });
  } catch (e) {
    return json(req, { error: e instanceof Error ? e.message : String(e) }, 500);
  }
}
