// "Aprovar compra" da requisição (12/11/2026). Quem aprova = usuário do login
// (nunca do corpo); permissão explícita requisicoes:aprovar_compra (o módulo
// inteiro não dá). POST { acao: 'aprovar' | 'retirar' }.
import { NextRequest, NextResponse } from 'next/server';
import { protegerRota, autorDe } from '@/lib/ajustes/permissao-server';
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { registrarAuditLog } from '@/lib/server/audit-notify';
import { erroColunaFaltando } from '@/lib/requisicoes/cotacoes';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await protegerRota(req, [{ modulo: 'requisicoes', acao: 'aprovar_compra' }]);
  if (g.resposta) return g.resposta;
  const { id } = await params;
  const reqId = Number(id);
  if (!Number.isInteger(reqId) || reqId <= 0) return NextResponse.json({ error: 'requisição inválida' }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const acao = body?.acao === 'retirar' ? 'retirar' : 'aprovar';

  const { data: atual, error: errLer } = await supabaseAdmin
    .from('Requisicao')
    .select('id, titulo, status, compra_aprovada_por, compra_aprovada_em')
    .eq('id', reqId)
    .maybeSingle();
  if (errLer) {
    if (erroColunaFaltando(errLer)) {
      return NextResponse.json({ error: 'Falta aplicar a migration sql/req-cotacao-escolhas.sql.', migracaoFaltando: true }, { status: 503 });
    }
    return NextResponse.json({ error: errLer.message }, { status: 500 });
  }
  if (!atual) return NextResponse.json({ error: 'requisição não encontrada' }, { status: 404 });
  if (atual.status === 'lixeira') return NextResponse.json({ error: 'requisição está na lixeira' }, { status: 409 });

  const autor = autorDe(g.user);
  const campos = acao === 'aprovar'
    ? { compra_aprovada_por: autor, compra_aprovada_email: g.user.email || null, compra_aprovada_em: new Date().toISOString() }
    : { compra_aprovada_por: null, compra_aprovada_email: null, compra_aprovada_em: null };

  const { error } = await supabaseAdmin.from('Requisicao').update(campos).eq('id', reqId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await registrarAuditLog({
    userId: g.user.id,
    userName: autor,
    sistema: 'requisicoes',
    acao: acao === 'aprovar' ? 'aprovar_compra' : 'retirar_aprovacao',
    entidade: 'requisicao',
    entidadeId: String(reqId),
    entidadeLabel: atual.titulo || `Req #${reqId}`,
    detalhes: acao === 'retirar' ? { antes: atual.compra_aprovada_por } : {},
  }).catch(() => {});

  return NextResponse.json({ ok: true, ...campos });
}
