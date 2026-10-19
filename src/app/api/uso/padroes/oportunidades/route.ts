// Decisão sobre um padrão de uso (aba Padrões de /atividades): nova · em análise ·
// feito · descartado + nota. "Feito" guarda a data para comparar antes × depois.
import { NextRequest, NextResponse } from 'next/server';
import { autenticar } from '@/lib/auth/server';
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { registrarAuditLog } from '@/lib/server/audit-notify';
import { diaLocal } from '@/lib/uso/rota';

export const dynamic = 'force-dynamic';

const STATUS = ['nova', 'em_analise', 'feito', 'descartado'] as const;
const ISO_DIA = /^\d{4}-\d{2}-\d{2}$/;

export async function PATCH(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!auth.isAdmin && !auth.modulos.includes('atividades')) return NextResponse.json({ erro: 'Sem permissão' }, { status: 403 });

  let b: Record<string, unknown> = {};
  try { b = (await req.json()) || {}; } catch { /* vazio */ }
  const chave = String(b.chave || '').slice(0, 420);
  const status = String(b.status || '') as (typeof STATUS)[number];
  if (!chave || !STATUS.includes(status)) return NextResponse.json({ erro: 'chave e status são obrigatórios' }, { status: 400 });
  const nota = typeof b.nota === 'string' ? b.nota.slice(0, 2000) : null;

  const { data: atual, error: errAtual } = await supabaseAdmin
    .from('portal_uso_oportunidades').select('status,feito_em').eq('chave', chave).maybeSingle();
  if (errAtual) {
    const falta = /PGRST205|42P01|schema cache|does not exist/i.test(`${errAtual.code} ${errAtual.message}`);
    return NextResponse.json(
      { erro: falta ? 'Aplicar sql/portal-uso-transicoes.sql no Supabase' : errAtual.message, migracaoFaltando: falta },
      { status: falta ? 503 : 500 },
    );
  }
  const feitoEm = status === 'feito'
    ? (ISO_DIA.test(String(b.feito_em || '')) ? String(b.feito_em) : (atual?.status === 'feito' && atual.feito_em) || diaLocal())
    : null;

  const { data: usu } = await supabaseAdmin.from('financeiro_usu').select('nome').eq('id', auth.userId).maybeSingle();
  const por = (usu?.nome as string) || auth.email || auth.userId;

  const { error } = await supabaseAdmin.from('portal_uso_oportunidades').upsert({
    chave, status, nota, feito_em: feitoEm, por, atualizado_em: new Date().toISOString(),
  }, { onConflict: 'chave' });
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

  await registrarAuditLog({
    userId: auth.userId, userName: por, sistema: 'atividades', acao: 'oportunidade_status',
    entidade: 'padrao_uso', entidadeId: chave, entidadeLabel: chave,
    detalhes: { de: atual?.status || 'nova', para: status, nota, feito_em: feitoEm },
  });
  return NextResponse.json({ ok: true, chave, status, nota, feito_em: feitoEm, por });
}
