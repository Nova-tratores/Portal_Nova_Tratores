// Histórico do que uma pessoa autorizou/recusou (19/11/2026) — aba Autorizações › Histórico.
// GET [?de=<userId>] → { alvo, eu, pessoas, itens, avisos, completo }
// Diretor/Dev: sem ?de (ou ?de=todos) = de todo mundo, cada linha com quem decidiu; ?de=<id> = só daquela pessoa.
// Quem só autoriza requisições: sempre o próprio histórico.
import { NextResponse } from 'next/server';
import { autenticar } from '@/lib/auth/server';
import { supabaseAdmin as sb } from '@/lib/server/supabase-admin';
import { quemAutoriza, listarAutorizadores } from '@/lib/autorizacoes/server';
import { historicoDecisoes } from '@/lib/autorizacoes/historico';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const eu = await quemAutoriza(await autenticar(req));
  if (!eu) return NextResponse.json({ error: 'Só o Diretor, um Dev ou quem tem "Autorizar requisições" vê o histórico.' }, { status: 403 });
  const pedido = new URL(req.url).searchParams.get('de');
  let alvo: { id: string; nome: string } | null = { id: eu.id, nome: eu.nome };
  if (eu.completo && (!pedido || pedido === 'todos')) alvo = null;
  else if (pedido && pedido !== eu.id) {
    if (!eu.completo) return NextResponse.json({ error: 'Você só pode ver o seu próprio histórico.' }, { status: 403 });
    const { data } = await sb.from('financeiro_usu').select('id, nome').eq('id', pedido).maybeSingle();
    if (!data) return NextResponse.json({ error: 'Pessoa não encontrada' }, { status: 404 });
    alvo = { id: String((data as { id: string }).id), nome: (data as { nome: string }).nome };
  }
  const [{ itens, avisos }, pessoas] = await Promise.all([
    historicoDecisoes(alvo, eu.completo),
    eu.completo
      ? listarAutorizadores().then((l) => l.filter((p) => p.decide).map((p) => ({ id: p.id, nome: p.nome })))
      : Promise.resolve([] as { id: string; nome: string }[]),
  ]);
  if (!pessoas.some((p) => p.id === eu.id)) pessoas.unshift({ id: eu.id, nome: eu.nome });
  return NextResponse.json({ alvo, eu: eu.id, pessoas, itens, avisos, completo: eu.completo });
}
