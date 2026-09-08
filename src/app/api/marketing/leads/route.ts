/* eslint-disable @typescript-eslint/no-explicit-any */
// =============================================================================
// Leads capturados numa ação. Numa feira a maioria dos visitantes NÃO é cliente
// cadastrado — por isso o lead nasce como TEXTO LIVRE e o vínculo ao cadastro
// Omie é opcional.
//
// Esta é a rota que a tela mobile do estande (/lead) usa. O POST aceita o
// módulo satélite `lead`, que não dá acesso ao resto do Marketing.
// =============================================================================
import { NextResponse } from 'next/server';
import { guardar, erroResposta, apenas, num, dataOuNull } from '@/lib/marketing/rota';
import { db } from '@/lib/marketing/db';
import { logMarketing, nomeDoUsuario, podeMarketing } from '@/lib/marketing/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMPOS = [
  'texto', 'nome', 'telefone', 'cidade', 'interesse', 'foto_url',
  'cliente_cod_cli', 'cliente_empresa', 'cliente_nome',
  'qualificacao', 'temperatura', 'responsavel_nome', 'proximo_contato', 'observacoes',
] as const;

function normalizar(body: any) {
  const d: any = apenas(body, CAMPOS);
  if ('cliente_cod_cli' in d) d.cliente_cod_cli = num(d.cliente_cod_cli);
  if ('proximo_contato' in d) d.proximo_contato = dataOuNull(d.proximo_contato);
  // O CHECK do banco: cod_cli sem empresa é proibido, porque o mesmo número
  // existe na NOVA e na CASTRO — a chave real é o PAR.
  if (d.cliente_cod_cli && !d.cliente_empresa) {
    d.cliente_cod_cli = null;
    d.cliente_nome = null;
  }
  return d;
}

export async function GET(req: Request) {
  // A tela mobile precisa ler os leads já capturados na ação pra avisar
  // duplicata, então o guard aqui é o do módulo satélite também.
  const g = await guardar(req, 'lead');
  if (g.resposta) return g.resposta;

  try {
    const url = new URL(req.url);
    const acaoId = url.searchParams.get('acao_id');

    if (acaoId) {
      const { data, error } = await db
        .from('mkt_leads').select('*').eq('acao_id', acaoId).order('capturado_em', { ascending: false });
      if (error) throw Object.assign(new Error(error.message), { code: error.code });
      return NextResponse.json({ itens: data ?? [] });
    }

    // Consolidado (tela Leads) — só pra quem tem o módulo grande.
    if (!podeMarketing(g.auth, 'leads')) {
      return NextResponse.json({ error: 'Sem permissão para a lista geral de leads' }, { status: 403 });
    }
    const { data, error } = await db
      .from('mkt_leads').select('*').order('capturado_em', { ascending: false }).limit(2000);
    if (error) throw Object.assign(new Error(error.message), { code: error.code });

    const leads = data ?? [];
    const acaoIds = [...new Set(leads.map((l: any) => l.acao_id))];
    const acoes: Record<string, any> = {};
    if (acaoIds.length > 0) {
      const { data: as } = await db
        .from('mkt_acoes').select('id, nome, tipo, data_inicio, deleted_at').in('id', acaoIds);
      for (const a of as ?? []) acoes[a.id] = a;
    }
    const vivos = leads.filter((l: any) => acoes[l.acao_id] && !acoes[l.acao_id].deleted_at);
    return NextResponse.json({ itens: vivos, acoes });
  } catch (e) {
    return erroResposta(e, 'GET /leads');
  }
}

export async function POST(req: Request) {
  const g = await guardar(req, 'lead');
  if (g.resposta) return g.resposta;

  try {
    const body = await req.json();
    if (!body?.acao_id) return NextResponse.json({ error: 'Escolha a ação' }, { status: 400 });
    const dados = normalizar(body);
    if (!dados.texto || !String(dados.texto).trim()) {
      return NextResponse.json({ error: 'Escreva o que o visitante quer' }, { status: 400 });
    }

    const autor = await nomeDoUsuario(g.auth);
    const { data, error } = await db
      .from('mkt_leads')
      .insert([{
        ...dados,
        acao_id: body.acao_id,
        capturado_por_id: g.auth.userId,
        capturado_por_nome: autor,
        responsavel_nome: dados.responsavel_nome || autor,
      }])
      .select('*')
      .single();
    if (error) throw Object.assign(new Error(error.message), { code: error.code });

    await logMarketing(g.auth, {
      acao: 'criar',
      entidade: 'lead',
      entidadeId: data.id,
      entidadeLabel: data.nome || String(data.texto).slice(0, 60),
    });
    return NextResponse.json({ item: data });
  } catch (e) {
    return erroResposta(e, 'POST /leads');
  }
}

export async function PATCH(req: Request) {
  const body = await req.json().catch(() => ({}));
  // Amarrar o lead a um cliente do cadastro é permissão à parte.
  const acaoPerm = body?.cliente_cod_cli ? 'leads:vincular_cliente' : 'leads:editar';
  const g = await guardar(req, 'marketing', acaoPerm);
  if (g.resposta) return g.resposta;

  try {
    if (!body?.id) return NextResponse.json({ error: 'Informe o id' }, { status: 400 });
    const dados = normalizar(body);
    if (Object.keys(dados).length === 0) {
      return NextResponse.json({ error: 'Nada para alterar' }, { status: 400 });
    }

    const { data, error } = await db
      .from('mkt_leads')
      .update({ ...dados, atualizado_em: new Date().toISOString() })
      .eq('id', body.id)
      .select('*')
      .single();
    if (error) throw Object.assign(new Error(error.message), { code: error.code });

    await logMarketing(g.auth, {
      acao: 'editar',
      entidade: 'lead',
      entidadeId: String(body.id),
      entidadeLabel: data.nome || String(data.texto).slice(0, 60),
      detalhes: { campos: Object.keys(dados) },
    });
    return NextResponse.json({ item: data });
  } catch (e) {
    return erroResposta(e, 'PATCH /leads');
  }
}

export async function DELETE(req: Request) {
  const g = await guardar(req, 'marketing', 'leads:editar');
  if (g.resposta) return g.resposta;

  try {
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Informe o id' }, { status: 400 });
    const { error } = await db.from('mkt_leads').delete().eq('id', id);
    if (error) throw Object.assign(new Error(error.message), { code: error.code });
    await logMarketing(g.auth, { acao: 'excluir', entidade: 'lead', entidadeId: id });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return erroResposta(e, 'DELETE /leads');
  }
}
