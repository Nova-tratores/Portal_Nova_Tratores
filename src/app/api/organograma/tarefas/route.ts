// PATCH /api/organograma/tarefas — telas que a tarefa pede e com qual nível. Só admin.
// Corpo { id, telas: [{ tela, nivel: 'ver' | 'editar' }] }. É registro: não muda permissão de ninguém.
import { NextRequest, NextResponse } from 'next/server';
import { autenticar } from '@/lib/auth/server';
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { registrarAuditLog } from '@/lib/server/audit-notify';
import { gravarTelasDaTarefa, telasParaMarcar } from '@/lib/organograma/server';
import type { TelaMarcada } from '@/lib/organograma/acessos';

export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!auth.isAdmin) return NextResponse.json({ error: 'Só administrador marca as telas' }, { status: 403 });

  const b = await req.json().catch(() => null) as { id?: unknown; telas?: unknown } | null;
  if (!Number.isInteger(b?.id)) return NextResponse.json({ error: 'Tarefa inválida' }, { status: 400 });
  const validas = new Set(telasParaMarcar().map((t) => t.id));
  if (!Array.isArray(b?.telas) || b!.telas.length > 30) return NextResponse.json({ error: 'Telas inválidas' }, { status: 400 });
  const porTela = new Map<string, TelaMarcada>();
  for (const m of b!.telas as Array<Partial<TelaMarcada>>) {
    if (!m?.tela || !validas.has(m.tela) || (m.nivel !== 'ver' && m.nivel !== 'editar')) {
      return NextResponse.json({ error: 'Telas inválidas' }, { status: 400 });
    }
    porTela.set(m.tela, { tela: m.tela, nivel: m.nivel });
  }
  const telas = [...porTela.values()];
  try {
    await gravarTelasDaTarefa(b!.id as number, telas);
    const { data: eu } = await supabaseAdmin.from('financeiro_usu').select('nome').eq('id', auth.userId).maybeSingle();
    await registrarAuditLog({
      userId: auth.userId, userName: eu?.nome || auth.email || 'admin', sistema: 'organograma', acao: 'tarefa_telas',
      entidade: 'tarefa', entidadeId: String(b!.id), entidadeLabel: String(b!.id), detalhes: { telas },
    }).catch(() => {});
    return NextResponse.json({ ok: true, telas });
  } catch (e) {
    if ((e as { faltando?: boolean }).faltando) {
      return NextResponse.json({ error: 'Falta aplicar sql/organograma-tarefa-telas.sql no Supabase.', telasFaltando: true }, { status: 503 });
    }
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
