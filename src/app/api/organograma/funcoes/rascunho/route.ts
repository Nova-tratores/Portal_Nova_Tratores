// POST /api/organograma/funcoes/rascunho { funcao } — a IA rascunha a ficha da função a partir das
// tarefas dela. NÃO grava: devolve o rascunho para o admin revisar e salvar na tela. Só admin.
import { NextRequest, NextResponse } from 'next/server';
import { autenticar } from '@/lib/auth/server';
import { lerTarefas } from '@/lib/organograma/server';
import { rascunharFicha } from '@/lib/organograma/fichas-ia';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!auth.isAdmin) return NextResponse.json({ error: 'Só administrador gera fichas' }, { status: 403 });
  const b = await req.json().catch(() => null) as { funcao?: unknown } | null;
  const funcao = typeof b?.funcao === 'string' ? b.funcao.trim() : '';
  if (!funcao) return NextResponse.json({ error: 'Função inválida' }, { status: 400 });
  try {
    const { tarefas, funcoes, tarefasFaltando } = await lerTarefas();
    if (tarefasFaltando) return NextResponse.json({ error: 'Falta aplicar sql/organograma-tarefas.sql.' }, { status: 503 });
    const minhas = tarefas.filter((t) => t.quem.includes(funcao));
    if (!minhas.length) return NextResponse.json({ error: 'Esta função não tem tarefas nas listas para a IA trabalhar.' }, { status: 400 });
    const nomes = [...new Set([...tarefas.flatMap((t) => t.quem), ...funcoes.map((f) => f.funcao)])]
      .filter((f) => !funcoes.find((x) => x.funcao === f && x.tipo === 'grupo'));
    const r = await rascunharFicha(funcao, minhas, nomes);
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
