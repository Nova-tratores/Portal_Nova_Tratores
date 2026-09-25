/* eslint-disable @typescript-eslint/no-explicit-any */
// GET  /api/agro/vinculos/sugestoes?status=pendente&municipio=&q=  — sugestões de vínculo CAR↔cliente (visitas do CRM)
// POST /api/agro/vinculos/sugestoes { cod_car, cliente_ref, aceitar }  — decisão humana (RPC agro_decidir_sugestao)
//
// Primeira rota /api/agro/*. As tabelas agro_* têm RLS ON sem policy: só o
// service role lê/escreve, e o usuário vem do token (autenticar). Gate = mesma
// permissão da página /dashboard-agro (módulo 'agro' próprio fica pra Fase 4).
import { NextResponse } from 'next/server';
import { autenticar, type Autenticado } from '@/lib/auth/server';
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { registrarAuditLog } from '@/lib/server/audit-notify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MSG_MIGRATION = 'Migration sql/agro-visitas-vinculo.sql não aplicada (tabela agro_car_vinculo_sugestao não existe).';

function temAcessoAgro(auth: Autenticado): boolean {
  return auth.isAdmin || auth.modulos.includes('dashboard-agro') || auth.modulos.some((m) => m.startsWith('agro'));
}

async function guardar(req: Request) {
  const auth = await autenticar(req);
  if (!auth) return { resposta: NextResponse.json({ error: 'Não autenticado' }, { status: 401 }) };
  if (!temAcessoAgro(auth)) return { resposta: NextResponse.json({ error: 'Sem permissão para o Dashboard Agro' }, { status: 403 }) };
  return { auth };
}

async function nomeDoUsuario(auth: Autenticado): Promise<string> {
  try {
    const { data } = await supabaseAdmin.from('financeiro_usu').select('nome').eq('id', auth.userId).maybeSingle();
    if (data?.nome) return String(data.nome);
  } catch { /* fallback abaixo */ }
  return auth.email || 'Usuário do portal';
}

function migrationFaltou(e: any): boolean {
  const m = String(e?.message || e || '');
  return /agro_car_vinculo_sugestao|agro_v_vinculo_sugestao|agro_decidir_sugestao/.test(m) && /does not exist|not find|schema cache/i.test(m);
}

export async function GET(req: Request) {
  const g = await guardar(req);
  if (g.resposta) return g.resposta;
  try {
    const url = new URL(req.url);
    const status = url.searchParams.get('status') || 'pendente';
    const municipio = url.searchParams.get('municipio');
    const q = (url.searchParams.get('q') || '').trim();

    let query = supabaseAdmin
      .from('agro_v_vinculo_sugestao')
      .select('*')
      .order('score', { ascending: false })
      .order('ultima_visita', { ascending: false })
      .limit(500);
    if (status !== 'todas') query = query.eq('status', status);
    if (municipio) query = query.eq('municipio_ibge', Number(municipio));
    if (q) query = query.or(`cliente_nome.ilike.%${q}%,propriedade_nome.ilike.%${q}%,cod_car.ilike.%${q}%`);
    const { data, error } = await query;
    if (error) throw error;

    // resumo pra tela (totais por status + municípios disponíveis), sem 2ª rodada de queries pesadas
    const { data: tot } = await supabaseAdmin.from('agro_car_vinculo_sugestao').select('status');
    const totais: Record<string, number> = {};
    for (const r of tot || []) totais[r.status] = (totais[r.status] || 0) + 1;
    const municipios = Array.from(new Map((data || []).map((r: any) => [r.municipio_ibge, r.municipio])).entries())
      .map(([ibge, nome]) => ({ ibge, nome })).sort((a, b) => String(a.nome).localeCompare(String(b.nome)));

    return NextResponse.json({ sugestoes: data || [], totais, municipios });
  } catch (e: any) {
    if (migrationFaltou(e)) return NextResponse.json({ error: MSG_MIGRATION, migracaoFaltando: true }, { status: 503 });
    console.error('[agro] sugestoes GET:', e);
    return NextResponse.json({ error: e?.message || 'Erro inesperado' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const g = await guardar(req);
  if (g.resposta) return g.resposta;
  const auth = g.auth!;
  try {
    const body = await req.json().catch(() => ({}));
    const cod_car = String(body?.cod_car || '').trim();
    const cliente_ref = String(body?.cliente_ref || '').trim();
    const aceitar = body?.aceitar === true;
    if (!cod_car || !cliente_ref) return NextResponse.json({ error: 'cod_car e cliente_ref são obrigatórios' }, { status: 400 });

    const usuario = auth.email || (await nomeDoUsuario(auth));
    const { data, error } = await supabaseAdmin.rpc('agro_decidir_sugestao', {
      p_cod_car: cod_car, p_cliente_ref: cliente_ref, p_aceitar: aceitar, p_usuario: usuario,
    });
    if (error) throw error;

    await registrarAuditLog({
      userId: auth.userId, userName: await nomeDoUsuario(auth), sistema: 'dashboard-agro',
      acao: aceitar ? 'vinculo_aceito' : 'vinculo_rejeitado', entidade: 'car', entidadeId: cod_car,
      entidadeLabel: `${cod_car} ↔ cliente ${cliente_ref}`, detalhes: { cliente_ref, resultado: data },
    });
    return NextResponse.json({ ok: true, status: data });
  } catch (e: any) {
    if (migrationFaltou(e)) return NextResponse.json({ error: MSG_MIGRATION, migracaoFaltando: true }, { status: 503 });
    console.error('[agro] sugestoes POST:', e);
    return NextResponse.json({ error: e?.message || 'Erro inesperado' }, { status: 500 });
  }
}
