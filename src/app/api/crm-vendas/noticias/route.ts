// Notícias REAIS das cidades do vendedor (app de vendas, aba Início).
// Cidades = as que o supervisor atribuiu (vendedor_cidades), casadas com o IBGE.
// Uma busca no Google Notícias por cidade, guardada 1 h; só entra matéria que
// cita a cidade (lib/vendas-app/noticias-cidades).
//
// Login: token do Supabase Auth. Vendedor vê as cidades DELE; supervisor do app
// (ou CRM Vendas / Supervisor de Vendas no portal) passa ?vendedor=<id>.
//
//   GET [?vendedor=<id>] -> { cidades: [{ ibge, nome, uf, total }], noticias: NoticiaCidade[], geradoEm }
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { autenticar } from '@/lib/auth/server';
import { corsVendas } from '@/lib/vendas-app/cors';
import { municipiosIBGE } from '@/lib/inteligencia-vendas/ibge-server';
import { emCache } from '@/lib/inteligencia-vendas/server';
import { parseRSS } from '@/lib/inteligencia-vendas/noticias';
import { juntarNoticias, municipiosDoVendedor, noticiasDaCidade, urlBuscaCidade, type MunicipioIBGE, type NoticiaCidade } from '@/lib/vendas-app/noticias-cidades';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const MAX_CIDADES = 15;

function json(req: NextRequest, body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: corsVendas(req, 'GET, OPTIONS') });
}

export function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsVendas(req, 'GET, OPTIONS') });
}

type Quem = { tipo: 'vendedor'; vendedorId: number } | { tipo: 'supervisor' } | null;

async function validarTokenNoticias(req: NextRequest): Promise<Quem> {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) return null;
  const uid = data.user.id;
  const [{ data: sup }, { data: vend }] = await Promise.all([
    supabaseAdmin.from('supervisores').select('ativo').eq('auth_uid', uid).maybeSingle(),
    supabaseAdmin.from('vendedores').select('id, ativo').eq('auth_uid', uid).maybeSingle(),
  ]);
  if (vend && vend.ativo !== false) return { tipo: 'vendedor', vendedorId: Number(vend.id) };
  if (sup && sup.ativo !== false) return { tipo: 'supervisor' };
  const auth = await autenticar(req);
  if (auth && (auth.isAdmin || auth.modulos.some((m) => m === 'crm-vendas' || m.startsWith('supervisor-vendas')))) return { tipo: 'supervisor' };
  return null;
}

async function noticiasDe(m: MunicipioIBGE): Promise<NoticiaCidade[]> {
  return emCache(`vendas-noticias-${m.ibge}`, 60 * 60_000, async () => {
    const r = await fetch(urlBuscaCidade(m), {
      headers: { 'User-Agent': UA, Accept: 'application/rss+xml, */*', 'Accept-Language': 'pt-BR,pt;q=0.9' },
      signal: AbortSignal.timeout(15_000), cache: 'no-store',
    });
    if (!r.ok) throw new Error(`Google Notícias HTTP ${r.status}`);
    return noticiasDaCidade(parseRSS(await r.text()), m);
  });
}

export async function GET(req: NextRequest) {
  const quem = await validarTokenNoticias(req);
  if (!quem) return json(req, { error: 'Não autorizado' }, 401);
  const vendedorId = quem.tipo === 'vendedor' ? quem.vendedorId : Number(req.nextUrl.searchParams.get('vendedor')) || null;
  if (!vendedorId) return json(req, { cidades: [], noticias: [], geradoEm: new Date().toISOString() });

  const { data: cids, error } = await supabaseAdmin.from('vendedor_cidades').select('cidade').eq('vendedor_id', vendedorId);
  if (error) return json(req, { error: error.message }, 500);
  const ibge = await municipiosIBGE(['SP', 'PR']);
  const municipios = municipiosDoVendedor((cids || []).map((c: { cidade: string }) => c.cidade), ibge).slice(0, MAX_CIDADES);

  const listas = await Promise.all(municipios.map((m) => noticiasDe(m).catch(() => null)));
  const noticias = juntarNoticias(listas.map((l) => l || []));
  return json(req, {
    cidades: municipios.map((m, i) => ({ ...m, total: listas[i]?.length ?? null })),
    noticias,
    geradoEm: new Date().toISOString(),
  });
}
