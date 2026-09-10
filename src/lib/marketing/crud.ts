/* eslint-disable @typescript-eslint/no-explicit-any */
// =============================================================================
// MARKETING & EVENTOS — CRUD genérico das entidades filhas de uma ação.
//
// Equipe, itens, ações realizadas, concorrentes, mídia e avaliação são todas a
// mesma coisa do ponto de vista da rota: lista por acao_id, cria, edita, apaga.
// Uma fábrica evita seis arquivos quase idênticos onde o gate ia divergir por
// esquecimento.
//
// Custos, apoios e leads NÃO usam isto: cada um tem regra própria (rateio e
// vínculo; máquina de estados; captura offline).
// =============================================================================
import { NextResponse } from 'next/server';
import { guardar, erroResposta, apenas, num, dataOuNull } from './rota';
import { db } from './db';
import { logMarketing } from './server';

export interface DefCrud {
  tabela: string;
  entidade: string;          // rótulo no audit_log
  acao: string;              // permissão granular exigida na escrita
  campos: readonly string[];
  numericos?: readonly string[];
  datas?: readonly string[];
  booleanos?: readonly string[];
  /**
   * Colunas NOT NULL que têm valor PADRÃO no banco. Quando o formulário deixa
   * o campo em branco, a chave é OMITIDA em vez de virar null — senão o insert
   * bate no not-null de uma coluna que sabia se virar sozinha.
   * (Foi o que quebrou o anexo de mídia: `ordem` em branco → null → 23502.)
   */
  padraoDoBanco?: readonly string[];
  ordem?: string;
  /** Campo usado como rótulo no audit_log. */
  label?: string;
}

function normalizar(body: any, d: DefCrud) {
  const dados: any = apenas(body, d.campos);
  for (const k of d.numericos ?? []) if (k in dados) dados[k] = num(dados[k]);
  for (const k of d.datas ?? []) if (k in dados) dados[k] = dataOuNull(dados[k]);
  for (const k of d.booleanos ?? []) if (k in dados) dados[k] = dados[k] === true || dados[k] === 'true';
  // Em branco numa coluna com padrão: deixa o banco decidir.
  for (const k of d.padraoDoBanco ?? []) {
    if (k in dados && (dados[k] === null || dados[k] === undefined)) delete dados[k];
  }
  return dados;
}

export function criarRotasCrud(d: DefCrud) {
  async function GET(req: Request) {
    const g = await guardar(req, 'marketing');
    if (g.resposta) return g.resposta;
    try {
      const acaoId = new URL(req.url).searchParams.get('acao_id');
      if (!acaoId) return NextResponse.json({ error: 'Informe acao_id' }, { status: 400 });
      const { data, error } = await db
        .from(d.tabela)
        .select('*')
        .eq('acao_id', acaoId)
        .order(d.ordem ?? 'criado_em');
      if (error) throw Object.assign(new Error(error.message), { code: error.code });
      return NextResponse.json({ itens: data ?? [] });
    } catch (e) {
      return erroResposta(e, `GET ${d.tabela}`);
    }
  }

  async function POST(req: Request) {
    const g = await guardar(req, 'marketing', d.acao);
    if (g.resposta) return g.resposta;
    try {
      const body = await req.json();
      if (!body?.acao_id) return NextResponse.json({ error: 'Informe acao_id' }, { status: 400 });
      const dados = normalizar(body, d);
      const { data, error } = await db
        .from(d.tabela)
        .insert([{ ...dados, acao_id: body.acao_id }])
        .select('*')
        .single();
      if (error) throw Object.assign(new Error(error.message), { code: error.code });

      await logMarketing(g.auth, {
        acao: 'criar',
        entidade: d.entidade,
        entidadeId: String(data.id),
        entidadeLabel: d.label ? String(data[d.label] ?? '') : undefined,
      });
      return NextResponse.json({ item: data });
    } catch (e) {
      return erroResposta(e, `POST ${d.tabela}`);
    }
  }

  async function PATCH(req: Request) {
    const g = await guardar(req, 'marketing', d.acao);
    if (g.resposta) return g.resposta;
    try {
      const body = await req.json();
      if (!body?.id) return NextResponse.json({ error: 'Informe o id' }, { status: 400 });
      const dados = normalizar(body, d);
      if (Object.keys(dados).length === 0) {
        return NextResponse.json({ error: 'Nada para alterar' }, { status: 400 });
      }
      const { data, error } = await db
        .from(d.tabela)
        .update(dados)
        .eq('id', body.id)
        .select('*')
        .single();
      if (error) throw Object.assign(new Error(error.message), { code: error.code });

      await logMarketing(g.auth, {
        acao: 'editar',
        entidade: d.entidade,
        entidadeId: String(body.id),
        entidadeLabel: d.label ? String(data[d.label] ?? '') : undefined,
        detalhes: { campos: Object.keys(dados) },
      });
      return NextResponse.json({ item: data });
    } catch (e) {
      return erroResposta(e, `PATCH ${d.tabela}`);
    }
  }

  async function DELETE(req: Request) {
    const g = await guardar(req, 'marketing', d.acao);
    if (g.resposta) return g.resposta;
    try {
      const id = new URL(req.url).searchParams.get('id');
      if (!id) return NextResponse.json({ error: 'Informe o id' }, { status: 400 });
      const { error } = await db.from(d.tabela).delete().eq('id', id);
      if (error) throw Object.assign(new Error(error.message), { code: error.code });

      await logMarketing(g.auth, { acao: 'excluir', entidade: d.entidade, entidadeId: id });
      return NextResponse.json({ ok: true });
    } catch (e) {
      return erroResposta(e, `DELETE ${d.tabela}`);
    }
  }

  return { GET, POST, PATCH, DELETE };
}
