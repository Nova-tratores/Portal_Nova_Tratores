/* eslint-disable @typescript-eslint/no-explicit-any */
// =============================================================================
// SORTEIO do consórcio no evento (com login).
//
// POST  { evento_id }               -> sorteia NO BANCO (consorcio_sortear) um inscrito que ainda não saiu
// PATCH { sorteio_id, situacao }    -> 'ausente' (não estava lá: pode sortear de novo) ou 'valido'
//
// O navegador só faz a animação DEPOIS que o servidor já escolheu: ninguém escolhe o ganhador
// mexendo na página, e cada giro fica gravado com hora e quem apertou o botão.
// =============================================================================
import { NextResponse } from 'next/server';
import { guardar } from '@/lib/marketing/rota';
import { db } from '@/lib/marketing/db';
import { nomeDoUsuario } from '@/lib/marketing/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const g = await guardar(req, 'marketing', 'acoes:editar');
  if (g.resposta) return g.resposta;
  try {
    const { evento_id } = await req.json().catch(() => ({}));
    if (!evento_id) return NextResponse.json({ error: 'Informe o evento.' }, { status: 400 });
    const { data, error } = await db.rpc('consorcio_sortear', { p_evento: evento_id, p_por: await nomeDoUsuario(g.auth) });
    if (error) {
      if (/sem_participantes/.test(error.message)) {
        return NextResponse.json({ error: 'Não sobrou ninguém para sortear: todos os inscritos já saíram.' }, { status: 409 });
      }
      throw error;
    }
    const giro = Array.isArray(data) ? data[0] : data;
    const { data: insc } = await db.from('consorcio_inscricoes').select('cidade, telefone').eq('id', giro.inscricao_id).maybeSingle();
    return NextResponse.json({ sorteio: { ...giro, cidade: insc?.cidade ?? null, telefone: insc?.telefone ?? null } });
  } catch (e: any) {
    console.error('[consorcio] sortear', e);
    return NextResponse.json({ error: e?.message || 'Erro ao sortear' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const g = await guardar(req, 'marketing', 'acoes:editar');
  if (g.resposta) return g.resposta;
  try {
    const { sorteio_id, situacao } = await req.json().catch(() => ({}));
    if (!sorteio_id || !['valido', 'ausente'].includes(situacao)) {
      return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });
    }
    const { data, error } = await db.from('consorcio_sorteios').update({ situacao }).eq('id', sorteio_id).select().single();
    if (error) throw error;
    return NextResponse.json({ sorteio: data });
  } catch (e: any) {
    console.error('[consorcio] situacao', e);
    return NextResponse.json({ error: e?.message || 'Erro' }, { status: 500 });
  }
}
