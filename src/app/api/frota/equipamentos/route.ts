// Catálogo de EQUIPAMENTOS da frota (rastreador, insulfilm, suporte...).
// O item é cadastrado UMA vez aqui e anexado por seleção na Ficha de cada
// carro (frota_veiculos.equipamentos TEXT[] guarda os nomes).
//   GET          lista (módulo frota)
//   POST {nome}  cadastra item novo (frota:veiculos:editar)
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { autenticar } from '@/lib/auth/server';
import { logFrota, podeFrota, temModuloFrota } from '@/lib/frota/server';

export const runtime = 'nodejs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } },
);

export async function GET(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!temModuloFrota(auth)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

  const { data, error } = await supabase.from('frota_equipamentos').select('id, nome').order('nome');
  if (error) {
    const msg = /frota_equipamentos/.test(error.message)
      ? 'Aplique a migração sql/frota-venda.sql no Supabase (tabela frota_equipamentos).'
      : error.message;
    return NextResponse.json({ error: msg }, { status: 500 });
  }
  return NextResponse.json({ equipamentos: data || [] });
}

export async function POST(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!podeFrota(auth, 'veiculos:editar')) {
    return NextResponse.json({ error: 'Sem permissão para cadastrar equipamentos.' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const nome = String(body?.nome || '').trim().toUpperCase();
  if (!nome) return NextResponse.json({ error: 'Informe o nome do equipamento.' }, { status: 400 });
  if (nome.length > 60) return NextResponse.json({ error: 'Nome longo demais (máx. 60).' }, { status: 400 });

  const { data, error } = await supabase
    .from('frota_equipamentos')
    .upsert({ nome }, { onConflict: 'nome' })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logFrota(auth, { acao: 'criar', entidade: 'equipamento', entidadeId: data.id, entidadeLabel: nome });
  return NextResponse.json({ ok: true, equipamento: data });
}
