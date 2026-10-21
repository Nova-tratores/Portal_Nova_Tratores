// Senha do cartão Veloe de um veículo. Fica em frota_veiculo_segredos (RLS
// fechado) e só sai por aqui; cada visualização e cada alteração vão para o
// audit_log com quem e quando.
//
//   GET  -> { senha, vistas: [{ quem, quando }] }   (registra 'ver_senha_veloe')
//   POST { senha }                                   (registra 'alterar_senha_veloe')
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/server/supabase-admin';
import { autenticar } from '@/lib/auth/server';
import { temModuloFrota } from '@/lib/frota/server';
import { resolverPlaca, formatarPlaca } from '@/lib/frota/placa';
import { registrarAuditLog } from '@/lib/server/audit-notify';

async function nomeDe(userId: string, email: string | null) {
  const { data } = await supabase.from('financeiro_usu').select('nome').eq('id', userId).maybeSingle();
  return String(data?.nome || email || 'Usuário do portal');
}

export const dynamic = 'force-dynamic';

// tabela ainda não criada (sql/frota-senha-veloe-segredo.sql): lê a coluna antiga
const semTabela = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === '42P01' || e.code === 'PGRST205' || /frota_veiculo_segredos/.test(e.message || ''));

async function contexto(req: NextRequest, placaParam: string) {
  const auth = await autenticar(req);
  if (!auth) return { resposta: NextResponse.json({ error: 'Não autenticado' }, { status: 401 }) };
  if (!temModuloFrota(auth)) return { resposta: NextResponse.json({ error: 'Sem permissão' }, { status: 403 }) };
  const placa = resolverPlaca(decodeURIComponent(placaParam));
  const { data: v } = await supabase.from('frota_veiculos').select('id, placa, senha_cartao_veloe').eq('placa', placa).maybeSingle();
  if (!v) return { resposta: NextResponse.json({ error: 'Veículo não encontrado.' }, { status: 404 }) };
  return { auth, v };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ placa: string }> }) {
  const c = await contexto(req, (await params).placa);
  if ('resposta' in c) return c.resposta;
  const { auth, v } = c;

  const seg = await supabase.from('frota_veiculo_segredos').select('senha_cartao_veloe').eq('veiculo_id', v.id).maybeSingle();
  const senha = semTabela(seg.error) ? v.senha_cartao_veloe : seg.data?.senha_cartao_veloe ?? null;

  if (senha) {
    await registrarAuditLog({
      userId: auth.userId, userName: await nomeDe(auth.userId, auth.email),
      sistema: 'frota', acao: 'ver_senha_veloe', entidade: 'veiculo', entidadeId: v.id, entidadeLabel: formatarPlaca(v.placa),
    });
  }
  const { data: log } = await supabase.from('audit_log')
    .select('user_nome, created_at, acao')
    .eq('sistema', 'frota').eq('entidade_id', v.id).in('acao', ['ver_senha_veloe', 'alterar_senha_veloe'])
    .order('created_at', { ascending: false }).limit(10);
  return NextResponse.json({
    senha,
    vistas: (log || []).map((l) => ({ quem: l.user_nome, quando: l.created_at, acao: l.acao })),
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ placa: string }> }) {
  const c = await contexto(req, (await params).placa);
  if ('resposta' in c) return c.resposta;
  const { auth, v } = c;
  const body = await req.json().catch(() => ({}));
  const senha = String(body?.senha ?? '').trim() || null;
  const quem = await nomeDe(auth.userId, auth.email);

  const { error } = await supabase.from('frota_veiculo_segredos').upsert(
    { veiculo_id: v.id, senha_cartao_veloe: senha, atualizado_em: new Date().toISOString(), atualizado_por: quem },
    { onConflict: 'veiculo_id' },
  );
  if (semTabela(error)) {
    await supabase.from('frota_veiculos').update({ senha_cartao_veloe: senha }).eq('id', v.id);
  } else if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  } else if (v.senha_cartao_veloe) {
    // sobra da coluna antiga: não deixa a senha em dois lugares
    await supabase.from('frota_veiculos').update({ senha_cartao_veloe: null }).eq('id', v.id);
  }
  await registrarAuditLog({
    userId: auth.userId, userName: quem,
    sistema: 'frota', acao: 'alterar_senha_veloe', entidade: 'veiculo', entidadeId: v.id, entidadeLabel: formatarPlaca(v.placa),
    detalhes: { removida: !senha },
  });
  return NextResponse.json({ ok: true, tem_senha: !!senha });
}
