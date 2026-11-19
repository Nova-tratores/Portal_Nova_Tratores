/* eslint-disable @typescript-eslint/no-explicit-any */
// GET /api/marketing/acoes/[id]/linha-do-tempo — a história da campanha, da mais antiga para a mais nova
// (18/11/2026, José: "ligar as campanhas com as reuniões pra gente conseguir ter uma linha do tempo").
//
// Junta numa lista só:
//   - a própria campanha (criada, começou, terminou)
//   - as reuniões em que algum assunto da pauta foi ligado a ela (reunioes_itens.campanha_id),
//     com o que foi decidido
//   - as tarefas que nasceram desses assuntos (tickets.origem_reuniao_item_id)
//   - apoio de fábrica, custos e leads (por dia)
//   - a roleta do site: quantas pessoas participaram por dia
// Tabela que ainda não existe (SQL não rodado) só fica de fora — a linha do tempo não quebra.
import { NextResponse } from 'next/server';
import { guardar, erroResposta } from '@/lib/marketing/rota';
import { db, obterAcao } from '@/lib/marketing/db';
import type { EventoLinha } from '@/lib/marketing/linhaDoTempo';
import { montarLinhaDoTempo } from '@/lib/marketing/linhaDoTempo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const lista = async (q: PromiseLike<{ data: any; error: any }>): Promise<any[]> => {
  const { data, error } = await q;
  return error ? [] : (data ?? []);
};

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guardar(req, 'marketing');
  if (g.resposta) return g.resposta;

  try {
    const { id } = await ctx.params;
    const acao = await obterAcao(id);
    if (!acao) return NextResponse.json({ error: 'Campanha não encontrada' }, { status: 404 });

    const [itens, custos, leads, apoios, roletas] = await Promise.all([
      lista(db.from('reunioes_itens').select('id, reuniao_id, pergunta, resultado, decisao_texto, decisao_motivo').eq('campanha_id', id)),
      lista(db.from('mkt_custos').select('descricao, valor, rateio_percent, status, data, criado_em').eq('acao_id', id)),
      lista(db.from('mkt_leads').select('capturado_em').eq('acao_id', id)),
      lista(db.from('mkt_apoios').select('apoiador, valor_aprovado, status, criado_em').eq('acao_id', id)),
      lista(db.from('campanhas').select('id, slug').eq('acao_id', id)),
    ]);

    const reunioesIds = [...new Set(itens.map((i) => i.reuniao_id))];
    const itensIds = itens.map((i) => i.id);
    const [reunioes, tarefas, participacoes] = await Promise.all([
      reunioesIds.length
        ? lista(db.from('tickets').select('id, numero, titulo, prazo, reuniao_etapa').in('id', reunioesIds))
        : Promise.resolve([]),
      itensIds.length
        ? lista(db.from('tickets').select('id, numero, titulo, status, criado_em, resolvido_em, origem_reuniao_item_id').in('origem_reuniao_item_id', itensIds))
        : Promise.resolve([]),
      roletas.length
        ? lista(db.from('campanha_participacoes').select('criado_em').in('campanha_id', roletas.map((r) => r.id)).limit(50000))
        : Promise.resolve([]),
    ]);

    const eventos: EventoLinha[] = montarLinhaDoTempo({
      acao, itens, reunioes, tarefas, custos, leads, apoios,
      roleta: roletas[0] ? { slug: roletas[0].slug, participacoes } : null,
    });

    return NextResponse.json({ eventos });
  } catch (e) {
    return erroResposta(e, 'GET /acoes/[id]/linha-do-tempo');
  }
}
