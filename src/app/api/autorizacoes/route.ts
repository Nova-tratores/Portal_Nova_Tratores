// Central de Autorizações (aba da Visão da empresa, 17/11/2026). Só Diretor ou Dev.
// GET → { itens (pendentes de todas as fontes), regras, decididas, avisos }
import { NextResponse } from 'next/server';
import { autenticar } from '@/lib/auth/server';
import { quemAutoriza, listarPendentes, lerRegras, decididasRequisicoes } from '@/lib/autorizacoes/server';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const autor = await quemAutoriza(await autenticar(req));
  if (!autor) return NextResponse.json({ error: 'Só o Diretor, um Dev ou quem tem "Autorizar requisições" vê as autorizações.' }, { status: 403 });
  const [{ itens, avisos }, { regras, falta }, decididas] = await Promise.all([listarPendentes(autor.completo, autor), lerRegras(), decididasRequisicoes()]);
  if (falta) avisos.unshift('Falta rodar o SQL sql/autorizacoes-requisicao.sql (projeto do portal): sem ele as requisições não travam.');
  // o limite (R$ 200) só o Diretor/Dev muda
  return NextResponse.json({ itens, regras, decididas, avisos, migracaoFaltando: falta, podeMudarLimite: autor.completo });
}
