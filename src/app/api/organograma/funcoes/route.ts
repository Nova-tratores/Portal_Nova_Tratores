// PATCH /api/organograma/funcoes — quem ocupa cada função das listas de tarefas ("Auxiliar Adm 1"…).
// Só admin. Corpo { funcao, pessoas: ['u:<uid>' | 'rh:<id>'] }; lista vazia = ninguém (desliga a automática).
import { NextRequest, NextResponse } from 'next/server';
import { autenticar } from '@/lib/auth/server';
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { registrarAuditLog } from '@/lib/server/audit-notify';
import { gravarFuncao } from '@/lib/organograma/server';

export const dynamic = 'force-dynamic';

const CHAVE = /^(u|rh):[A-Za-z0-9-]{1,64}$/;

export async function PATCH(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!auth.isAdmin) return NextResponse.json({ error: 'Só administrador define as funções' }, { status: 403 });

  const b = await req.json().catch(() => null) as { funcao?: unknown; pessoas?: unknown } | null;
  const funcao = typeof b?.funcao === 'string' ? b.funcao.trim() : '';
  if (!funcao || funcao.length > 80) return NextResponse.json({ error: 'Função inválida' }, { status: 400 });
  if (!Array.isArray(b?.pessoas) || b!.pessoas.length > 30 || !b!.pessoas.every((c) => typeof c === 'string' && CHAVE.test(c))) {
    return NextResponse.json({ error: 'Pessoas inválidas' }, { status: 400 });
  }
  const pessoas = [...new Set(b!.pessoas as string[])];
  try {
    await gravarFuncao(funcao, pessoas, auth.userId);
    const { data: eu } = await supabaseAdmin.from('financeiro_usu').select('nome').eq('id', auth.userId).maybeSingle();
    await registrarAuditLog({
      userId: auth.userId, userName: eu?.nome || auth.email || 'admin', sistema: 'organograma', acao: 'funcao',
      entidade: 'funcao', entidadeId: funcao, entidadeLabel: funcao, detalhes: { pessoas },
    }).catch(() => {});
    return NextResponse.json({ ok: true, funcao, pessoas });
  } catch (e) {
    if ((e as { faltando?: boolean }).faltando) {
      return NextResponse.json({ error: 'Falta aplicar sql/organograma-tarefas.sql no Supabase.', tarefasFaltando: true }, { status: 503 });
    }
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
