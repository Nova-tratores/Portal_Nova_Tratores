// Alertas do vigia de atividade suspeita (aba Alertas de /atividades).
// Ver e marcar: só quem recebe o aviso (Henri) e os Devs.
import { NextRequest, NextResponse } from 'next/server';
import { autenticar } from '@/lib/auth/server';
import { listarAlertas, marcarAlerta, podeVerAlertas, rodarVigiaAtividade } from '@/lib/vigia-atividade/server';

export const dynamic = 'force-dynamic';

const SITUACOES = ['novo', 'visto', 'normal', 'investigar'] as const;

export async function GET(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 });
  if (!podeVerAlertas(auth)) return NextResponse.json({ erro: 'Sem permissão' }, { status: 403 });
  const dias = Math.min(180, Math.max(1, Number(req.nextUrl.searchParams.get('dias')) || 30));
  try {
    return NextResponse.json(await listarAlertas(dias));
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}

/** Marca um alerta (visto / normal / investigar) ou, com {rodar:true}, roda o vigia agora. */
export async function PATCH(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 });
  if (!podeVerAlertas(auth)) return NextResponse.json({ erro: 'Sem permissão' }, { status: 403 });
  const b = await req.json().catch(() => ({} as Record<string, unknown>));
  try {
    if (b.rodar === true) return NextResponse.json(await rodarVigiaAtividade());
    const id = Number(b.id);
    const situacao = String(b.situacao || '') as (typeof SITUACOES)[number];
    if (!id || !SITUACOES.includes(situacao)) return NextResponse.json({ erro: 'id e situação são obrigatórios' }, { status: 400 });
    await marcarAlerta(id, situacao, auth.email || auth.userId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
