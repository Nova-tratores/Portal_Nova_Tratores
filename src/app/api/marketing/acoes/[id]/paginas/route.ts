/* eslint-disable @typescript-eslint/no-explicit-any */
// "Páginas conectadas" da campanha (24/11/2026, José): o que está ligado a ela fora da ficha.
// Hoje: páginas do consórcio no evento (consorcio_eventos.acao_id). A roleta e o grupo de requisições
// já chegam pela ficha e pela rota /grupo; a tela junta tudo num bloco só.
// Sem a tabela do consórcio (SQL ainda não rodado) devolve lista vazia — a ficha nunca quebra por isso.
import { NextResponse } from 'next/server';
import { guardar } from '@/lib/marketing/rota';
import { db } from '@/lib/marketing/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardar(req, 'marketing');
  if (g.resposta) return g.resposta;
  const { id } = await params;
  const { data: evs, error } = await db.from('consorcio_eventos').select('id, slug, nome, ativo').eq('acao_id', id);
  if (error || !evs?.length) return NextResponse.json({ consorcio: [] });
  const consorcio = await Promise.all(evs.map(async (e: any) => {
    const { count } = await db.from('consorcio_inscricoes').select('id', { count: 'exact', head: true }).eq('evento_id', e.id);
    return { ...e, inscritos: count ?? 0 };
  }));
  return NextResponse.json({ consorcio });
}
