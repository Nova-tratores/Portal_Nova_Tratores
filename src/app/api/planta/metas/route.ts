// /api/planta/metas — metas dos números da Planta Viva (sql/planta-termometros.sql).
// Decisão do usuário (21/10/2026): SÓ ADMIN define; UMA meta por número, que vale para
// a visão "Todas". GET lista; PUT { kpi_id, meta (número ou null = tirar a meta),
// tolerancia_pct }. Cada mudança vai para o audit_log com o valor de antes e o de depois.
import { NextRequest, NextResponse } from 'next/server';
import { protegerRota, autorDe } from '@/lib/ajustes/permissao-server';
import { supabaseAdmin as sb } from '@/lib/server/supabase-admin';
import { registrarAuditLog } from '@/lib/server/audit-notify';
import { CATALOGO } from '@/lib/planta/regras';

export const dynamic = 'force-dynamic';
const faltando = (e: { code?: string; message?: string } | null) => !!e && (e.code === 'PGRST205' || e.code === '42P01' || /planta_metas/.test(e.message || ''));

export async function GET(req: NextRequest) {
  const g = await protegerRota(req, [{ admin: true }]);
  if (g.resposta) return g.resposta;
  const { data, error } = await sb.from('planta_metas').select('*');
  if (faltando(error)) return NextResponse.json({ migracaoFaltando: true, metas: [] }, { status: 503 });
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ metas: data || [] });
}

export async function PUT(req: NextRequest) {
  const g = await protegerRota(req, [{ admin: true }]);
  if (g.resposta) return g.resposta;
  const body = await req.json().catch(() => ({}));
  const kpi = String(body?.kpi_id || '');
  if (!CATALOGO[kpi] || kpi === 'robos') return NextResponse.json({ erro: 'número desconhecido' }, { status: 400 });
  const tirar = body.meta === null || body.meta === '';
  const meta = Number(body.meta);
  if (!tirar && !Number.isFinite(meta)) return NextResponse.json({ erro: 'a meta precisa ser um número' }, { status: 400 });
  const tol = body.tolerancia_pct == null || body.tolerancia_pct === '' ? 10 : Number(body.tolerancia_pct);
  if (!Number.isFinite(tol) || tol < 0 || tol > 100) return NextResponse.json({ erro: 'a tolerância vai de 0 a 100%' }, { status: 400 });

  const { data: antes, error: e1 } = await sb.from('planta_metas').select('meta,tolerancia_pct').eq('kpi_id', kpi).maybeSingle();
  if (faltando(e1)) return NextResponse.json({ migracaoFaltando: true }, { status: 503 });
  const autor = autorDe(g.user);
  const { error } = tirar
    ? await sb.from('planta_metas').delete().eq('kpi_id', kpi)
    : await sb.from('planta_metas').upsert({ kpi_id: kpi, meta, tolerancia_pct: tol, atualizado_por: autor, atualizado_em: new Date().toISOString() }, { onConflict: 'kpi_id' });
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

  await registrarAuditLog({
    userId: g.user.id, userName: autor, sistema: 'planta', acao: tirar ? 'meta_removida' : 'meta', entidade: 'kpi', entidadeId: kpi, entidadeLabel: CATALOGO[kpi].rotulo,
    detalhes: { de: antes || null, para: tirar ? null : { meta, tolerancia_pct: tol } },
  });
  return NextResponse.json({ ok: true });
}
