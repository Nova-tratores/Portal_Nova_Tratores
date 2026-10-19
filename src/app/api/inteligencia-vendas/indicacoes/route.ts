/* eslint-disable @typescript-eslint/no-explicit-any */
// /api/inteligencia-vendas/indicacoes — indicações entre clientes (ideia 14).
//   GET            lista + vendedores ativos
//   POST {..}      registra
//   PATCH {id,..}  muda status / vendedor / prazo / benefício
//   DELETE ?id=    apaga
// Escrever exige 'inteligencia-vendas:indicacoes:editar' (ou o módulo inteiro).
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import type { Autenticado } from '@/lib/auth/server';
import { erroIV, guardarIV, logIV, nomeDoUsuario } from '@/lib/inteligencia-vendas/server';
import { docNorm } from '@/lib/inteligencia-vendas/normalizar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATUS = ['nova', 'contatada', 'proposta', 'ganha', 'perdida'];
const CAMPOS = ['indicante_doc', 'indicante_nome', 'indicado_nome', 'indicado_telefone', 'indicado_cidade', 'autorizado',
  'interesse', 'vendedor_id', 'vendedor_nome', 'prazo_contato', 'status', 'beneficio', 'beneficio_entregue', 'obs'] as const;

const podeEditar = (a: Autenticado) =>
  a.isAdmin || a.modulos.includes('inteligencia-vendas') || a.modulos.includes('inteligencia-vendas:indicacoes:editar');

function limpar(b: any): Record<string, any> {
  const out: Record<string, any> = {};
  for (const k of CAMPOS) {
    if (!(k in b)) continue;
    let v = b[k];
    if (typeof v === 'string') v = v.trim().slice(0, 500) || null;
    if (k === 'indicante_doc') v = docNorm(v) || null;
    if (k === 'vendedor_id') v = Number(v) || null;
    if (k === 'autorizado' || k === 'beneficio_entregue') v = !!v;
    if (k === 'prazo_contato' && v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) v = null;
    if (k === 'status' && !STATUS.includes(v)) continue;
    out[k] = v;
  }
  return out;
}

export async function GET(req: Request) {
  const g = await guardarIV(req, 'indicacoes');
  if (g.resposta) return g.resposta;
  try {
    const [{ data, error }, vend] = await Promise.all([
      supabaseAdmin.from('iv_indicacoes').select('*').order('criado_em', { ascending: false }).limit(2000),
      supabaseAdmin.from('vendedores').select('id,nome').eq('ativo', true).order('nome'),
    ]);
    if (error) throw error;
    return NextResponse.json({
      indicacoes: data || [],
      vendedores: (vend.data || []).filter((v: any) => !/teste/i.test(v.nome)),
      podeEditar: podeEditar(g.auth!),
    });
  } catch (e) {
    return erroIV(e, 'indicacoes GET');
  }
}

export async function POST(req: Request) {
  const g = await guardarIV(req, 'indicacoes');
  if (g.resposta) return g.resposta;
  if (!podeEditar(g.auth!)) return NextResponse.json({ error: 'Sem permissão para registrar indicações' }, { status: 403 });
  try {
    const dados = limpar(await req.json());
    if (!dados.indicante_nome || !dados.indicado_nome) {
      return NextResponse.json({ error: 'Informe quem indicou e quem foi indicado' }, { status: 400 });
    }
    const { data, error } = await supabaseAdmin.from('iv_indicacoes')
      .insert({ ...dados, status: dados.status || 'nova', criado_por: await nomeDoUsuario(g.auth!) }).select().single();
    if (error) throw error;
    await logIV(g.auth!, {
      acao: 'indicacao_criada', entidade: 'iv_indicacoes', entidadeId: String(data.id),
      entidadeLabel: `${dados.indicante_nome} → ${dados.indicado_nome}`,
    });
    return NextResponse.json({ indicacao: data });
  } catch (e) {
    return erroIV(e, 'indicacoes POST');
  }
}

export async function PATCH(req: Request) {
  const g = await guardarIV(req, 'indicacoes');
  if (g.resposta) return g.resposta;
  if (!podeEditar(g.auth!)) return NextResponse.json({ error: 'Sem permissão para editar indicações' }, { status: 403 });
  try {
    const b = await req.json();
    const id = Number(b.id);
    if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 });
    const dados = limpar(b);
    if (dados.status === 'contatada') dados.contatado_em = new Date().toISOString();
    const { data, error } = await supabaseAdmin.from('iv_indicacoes')
      .update({ ...dados, atualizado_em: new Date().toISOString() }).eq('id', id).select().single();
    if (error) throw error;
    await logIV(g.auth!, { acao: 'indicacao_alterada', entidade: 'iv_indicacoes', entidadeId: String(id), detalhes: dados });
    return NextResponse.json({ indicacao: data });
  } catch (e) {
    return erroIV(e, 'indicacoes PATCH');
  }
}

export async function DELETE(req: Request) {
  const g = await guardarIV(req, 'indicacoes');
  if (g.resposta) return g.resposta;
  if (!podeEditar(g.auth!)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
  try {
    const id = Number(new URL(req.url).searchParams.get('id'));
    if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 });
    const { error } = await supabaseAdmin.from('iv_indicacoes').delete().eq('id', id);
    if (error) throw error;
    await logIV(g.auth!, { acao: 'indicacao_apagada', entidade: 'iv_indicacoes', entidadeId: String(id) });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return erroIV(e, 'indicacoes DELETE');
  }
}
