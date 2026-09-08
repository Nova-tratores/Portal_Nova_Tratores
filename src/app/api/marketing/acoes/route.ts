/* eslint-disable @typescript-eslint/no-explicit-any */
// GET  /api/marketing/acoes   — lista de ações (com filtros) + resumo por ação
// POST /api/marketing/acoes   — cria ação
import { NextResponse } from 'next/server';
import { guardar, erroResposta, apenas, num, dataOuNull } from '@/lib/marketing/rota';
import { db, listarAcoes, lerOuVazio, idsInativos } from '@/lib/marketing/db';
import { logMarketing, nomeDoUsuario } from '@/lib/marketing/server';
import type { Acao } from '@/lib/marketing/tipos';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMPOS = [
  'codigo', 'nome', 'tipo', 'status', 'empresa', 'descricao', 'objetivo',
  'data_inicio', 'data_fim', 'local_nome', 'cidade', 'uf',
  'projeto_codigo', 'projeto_nome', 'projeto_empresa',
  'orcamento_previsto', 'meta_leads', 'meta_vendas', 'meta_receita',
  'responsavel_id', 'responsavel_nome', 'responsavel_email',
  'publico_estimado', 'observacoes',
] as const;

/** Normaliza o que vem do formulário: número é número, data é data. */
function normalizar(body: any) {
  const dados: any = apenas(body, CAMPOS);
  for (const k of ['projeto_codigo', 'orcamento_previsto', 'meta_leads', 'meta_vendas', 'meta_receita', 'publico_estimado']) {
    if (k in dados) dados[k] = num(dados[k]);
  }
  for (const k of ['data_inicio', 'data_fim']) {
    if (k in dados) dados[k] = dataOuNull(dados[k]);
  }
  if (typeof dados.uf === 'string') dados.uf = dados.uf.toUpperCase().slice(0, 2) || null;
  return dados;
}

export async function GET(req: Request) {
  const g = await guardar(req, 'marketing');
  if (g.resposta) return g.resposta;

  try {
    const url = new URL(req.url);
    const filtro = {
      ano: num(url.searchParams.get('ano')) ?? undefined,
      tipo: url.searchParams.get('tipo') || undefined,
      status: url.searchParams.get('status') || undefined,
      empresa: url.searchParams.get('empresa') || undefined,
      busca: url.searchParams.get('q') || undefined,
      incluirLixeira: url.searchParams.get('lixeira') === '1',
    };

    const { dados: acoes, migracaoFaltando } = await lerOuVazio<Acao[]>(
      () => listarAcoes(filtro),
      [],
    );
    if (migracaoFaltando) {
      return NextResponse.json({ acoes: [], resumos: {}, inativos: [], migracaoFaltando: true });
    }

    // Resumo por ação (custo, apoio, leads, propostas) numa consulta por tabela,
    // não uma por ação — a lista abre com 4 queries, não com 4×N.
    const ids = acoes.map((a) => a.id);
    const resumos: Record<string, { custo: number; apoioAprovado: number; apoioRecebido: number; leads: number; propostas: number; apoioPendente: number; prazoMaisProximo: string | null }> = {};
    for (const id of ids) {
      resumos[id] = { custo: 0, apoioAprovado: 0, apoioRecebido: 0, leads: 0, propostas: 0, apoioPendente: 0, prazoMaisProximo: null };
    }

    if (ids.length > 0) {
      const [custos, apoios, leads, props] = await Promise.all([
        db.from('mkt_custos').select('acao_id, valor, rateio_percent, status').in('acao_id', ids),
        db.from('mkt_apoios').select('acao_id, valor_aprovado, valor_recebido, relatorio_status, contrapartida_prazo, status').in('acao_id', ids),
        db.from('mkt_leads').select('acao_id').in('acao_id', ids),
        db.from('mkt_acao_propostas').select('acao_id').in('acao_id', ids),
      ]);

      for (const c of custos.data ?? []) {
        if (c.status === 'cancelado') continue;
        const r = resumos[c.acao_id];
        if (r) r.custo += Number(c.valor ?? 0) * (Number(c.rateio_percent ?? 100) / 100);
      }
      for (const a of apoios.data ?? []) {
        const r = resumos[a.acao_id];
        if (!r) continue;
        if (a.status !== 'recusado' && a.status !== 'cancelado') {
          r.apoioAprovado += Number(a.valor_aprovado ?? 0);
          r.apoioRecebido += Number(a.valor_recebido ?? 0);
          // Contrapartida ainda devida à fábrica: é o alerta da lista.
          if (a.relatorio_status === 'pendente' || a.relatorio_status === 'em_elaboracao') {
            r.apoioPendente += 1;
            if (a.contrapartida_prazo && (!r.prazoMaisProximo || a.contrapartida_prazo < r.prazoMaisProximo)) {
              r.prazoMaisProximo = a.contrapartida_prazo;
            }
          }
        }
      }
      for (const l of leads.data ?? []) { const r = resumos[l.acao_id]; if (r) r.leads += 1; }
      for (const p of props.data ?? []) { const r = resumos[p.acao_id]; if (r) r.propostas += 1; }
    }

    // Responsáveis que saíram da empresa (o caso IRRIGASHOW).
    const inativos = await idsInativos(acoes.map((a) => a.responsavel_id));

    return NextResponse.json({ acoes, resumos, inativos: [...inativos] });
  } catch (e) {
    return erroResposta(e, 'GET /acoes');
  }
}

export async function POST(req: Request) {
  const g = await guardar(req, 'marketing', 'acoes:criar');
  if (g.resposta) return g.resposta;

  try {
    const body = await req.json();
    const dados = normalizar(body);
    if (!dados.nome || !String(dados.nome).trim()) {
      return NextResponse.json({ error: 'Informe o nome da ação' }, { status: 400 });
    }

    const autor = await nomeDoUsuario(g.auth);
    const { data, error } = await db
      .from('mkt_acoes')
      .insert([{ ...dados, criado_por_id: g.auth.userId, criado_por_nome: autor }])
      .select('*')
      .single();
    if (error) throw Object.assign(new Error(error.message), { code: error.code });

    await logMarketing(g.auth, {
      acao: 'criar',
      entidade: 'acao',
      entidadeId: data.id,
      entidadeLabel: data.nome,
      detalhes: { tipo: data.tipo, empresa: data.empresa },
    });

    return NextResponse.json({ acao: data });
  } catch (e) {
    return erroResposta(e, 'POST /acoes');
  }
}
