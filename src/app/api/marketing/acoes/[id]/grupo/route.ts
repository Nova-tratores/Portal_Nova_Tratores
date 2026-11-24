/* eslint-disable @typescript-eslint/no-explicit-any */
// Grupo de requisições da campanha (24/11/2026).
// GET  → o grupo ligado (ou null)
// POST → cria o grupo se ainda não tem (campanhas criadas antes da regra, ou quando a criação automática falhou)
import { NextResponse } from 'next/server';
import { guardar, erroResposta } from '@/lib/marketing/rota';
import { db } from '@/lib/marketing/db';
import { logMarketing, nomeDoUsuario } from '@/lib/marketing/server';
import { grupoLigado, grupoDaCampanha } from '@/lib/marketing/grupo-da-campanha';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardar(req, 'marketing');
  if (g.resposta) return g.resposta;
  try {
    const { id } = await params;
    return NextResponse.json({ grupo: await grupoLigado(id) });
  } catch (e: any) {
    // sem a coluna mkt_acao_id a ficha só não mostra o grupo
    if (/mkt_acao_id/.test(e?.message || '')) return NextResponse.json({ grupo: null });
    return erroResposta(e, 'GET /acoes/[id]/grupo');
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardar(req, 'marketing', 'acoes:editar');
  if (g.resposta) return g.resposta;
  try {
    const { id } = await params;
    const { data: acao } = await db.from('mkt_acoes').select('id, nome').eq('id', id).is('deleted_at', null).maybeSingle();
    if (!acao) return NextResponse.json({ error: 'Campanha não encontrada' }, { status: 404 });
    const r = await grupoDaCampanha(acao, await nomeDoUsuario(g.auth));
    if (r.criado) {
      await logMarketing(g.auth, { acao: 'editar', entidade: 'acao', entidadeId: acao.id, entidadeLabel: acao.nome, detalhes: { grupo_requisicoes: r.grupo.id } });
    }
    return NextResponse.json(r);
  } catch (e) {
    return erroResposta(e, 'POST /acoes/[id]/grupo');
  }
}
