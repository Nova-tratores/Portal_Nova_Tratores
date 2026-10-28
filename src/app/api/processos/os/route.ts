// Fluxograma real das OS do Pós-venda (aba "Processos" de /atividades): lê as trocas de fase
// gravadas em logs_ppo e devolve o processo minerado (lib/processos/mineracao.ts).
// Mesmo público da aba Padrões que vê todo mundo: admin ou módulo `atividades`.
import { NextRequest, NextResponse } from 'next/server';
import { autenticar } from '@/lib/auth/server';
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { PHASES } from '@/lib/pos/constants';
import { eventosDasOS, minerarProcesso, ordemFasesOS, type LinhaLogOS } from '@/lib/processos/mineracao';

export const dynamic = 'force-dynamic';

const ISO_DIA = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!auth.isAdmin && !auth.modulos.includes('atividades')) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const de = ISO_DIA.test(sp.get('de') || '') ? sp.get('de')! : null;
  const ate = ISO_DIA.test(sp.get('ate') || '') ? sp.get('ate')! : null;

  try {
    const linhas: LinhaLogOS[] = [];
    for (let off = 0; off < 200000; off += 1000) {
      let q = supabaseAdmin.from('logs_ppo')
        .select('Id_ppo,UsuEmail,acao,Status_Anterior,Status_Atual,created_at')
        .not('Status_Atual', 'is', null).neq('Status_Atual', '')
        .order('id').range(off, off + 999);
      if (de) q = q.gte('created_at', `${de}T00:00:00-03:00`);
      if (ate) q = q.lte('created_at', `${ate}T23:59:59-03:00`);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      linhas.push(...((data || []) as LinhaLogOS[]));
      if (!data || data.length < 1000) break;
    }

    const { data: usu } = await supabaseAdmin.from('financeiro_usu').select('nome,email');
    const nomes: Record<string, string> = {};
    for (const u of usu || []) if (u.email && u.nome) nomes[String(u.email).toLowerCase()] = String(u.nome);

    // Robôs ficam no fluxo (separados por tipo): tirá-los abriria buracos no caminho das OS.
    const eventos = eventosDasOS(linhas, nomes);
    const resumo = minerarProcesso(eventos, { ordem: ordemFasesOS(PHASES), finais: ['Concluída', 'Cancelada'], maxCaminhos: 12, fasesReais: PHASES });
    return NextResponse.json({ processo: 'os', fonte: 'logs_ppo', linhasLidas: linhas.length, filtro: { de, ate }, ...resumo });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
