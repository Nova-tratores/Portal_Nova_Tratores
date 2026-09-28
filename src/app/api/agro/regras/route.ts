/* eslint-disable @typescript-eslint/no-explicit-any */
// Regras de oportunidade (agro_oportunidade_regra) — o comercial diz, por cultura e faixa de área,
// qual máquina sugerir, o argumento e os pesos do score. Tabela, nunca hardcode (plano §5).
//   GET    /api/agro/regras            → { regras, culturas }
//   POST   /api/agro/regras            → cria
//   PATCH  /api/agro/regras            → { id, ...campos }
//   DELETE /api/agro/regras?id=        → remove
// O score dos imóveis só muda quando o pipeline recalcula o perfil (scripts/agro/calcular_perfil.py).
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { guardarAgro, erroAgro, logAgro } from '@/lib/agro/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const num = (v: any): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

function normalizar(body: any): { dados?: Record<string, any>; erro?: string } {
  const d: Record<string, any> = {};
  if ('cultura_codigo' in body) {
    if (!/^[a-z_]+$/.test(String(body.cultura_codigo || ''))) return { erro: 'cultura inválida' };
    d.cultura_codigo = String(body.cultura_codigo);
  }
  if ('faixa_area_min' in body) d.faixa_area_min = Math.max(num(body.faixa_area_min) ?? 0, 0);
  if ('faixa_area_max' in body) d.faixa_area_max = num(body.faixa_area_max);
  if ('produto_sugerido' in body) {
    d.produto_sugerido = String(body.produto_sugerido || '').trim().slice(0, 120);
    if (!d.produto_sugerido) return { erro: 'produto sugerido é obrigatório' };
  }
  if ('argumento' in body) d.argumento = String(body.argumento || '').trim().slice(0, 600) || null;
  if ('prioridade' in body) d.prioridade = Math.min(Math.max(Math.round(num(body.prioridade) ?? 5), 1), 5);
  for (const k of ['peso_area', 'peso_credito', 'peso_sem_compra']) {
    if (k in body) d[k] = Math.min(Math.max(num(body[k]) ?? 1, 0), 5);
  }
  if ('ativo' in body) d.ativo = body.ativo !== false;
  if (d.faixa_area_max != null && d.faixa_area_min != null && d.faixa_area_max <= d.faixa_area_min) {
    return { erro: 'a área máxima precisa ser maior que a mínima' };
  }
  return { dados: d };
}

export async function GET(req: Request) {
  const g = await guardarAgro(req);
  if (g.resposta) return g.resposta;
  try {
    const [regras, culturas] = await Promise.all([
      supabaseAdmin.from('agro_oportunidade_regra').select('*').order('cultura_codigo').order('faixa_area_min'),
      supabaseAdmin.from('agro_dominio_cultura').select('codigo,nome,grupo,ordem').order('ordem'),
    ]);
    if (regras.error) throw regras.error;
    return NextResponse.json({ regras: regras.data || [], culturas: culturas.data || [] });
  } catch (e: any) { return erroAgro(e, 'regras GET'); }
}

export async function POST(req: Request) {
  const g = await guardarAgro(req);
  if (g.resposta) return g.resposta;
  try {
    const body = await req.json().catch(() => ({}));
    const n = normalizar({ faixa_area_min: 0, prioridade: 5, ...body });
    if (n.erro) return NextResponse.json({ error: n.erro }, { status: 400 });
    if (!n.dados!.cultura_codigo || !n.dados!.produto_sugerido) return NextResponse.json({ error: 'cultura e produto sugerido são obrigatórios' }, { status: 400 });
    const { data, error } = await supabaseAdmin.from('agro_oportunidade_regra').insert([n.dados]).select().single();
    if (error) throw error;
    await logAgro(g.auth!, { acao: 'regra_criada', entidade: 'regra', entidadeId: String(data.id), entidadeLabel: `${data.cultura_codigo} → ${data.produto_sugerido}`, detalhes: n.dados });
    return NextResponse.json({ regra: data });
  } catch (e: any) { return erroAgro(e, 'regras POST'); }
}

export async function PATCH(req: Request) {
  const g = await guardarAgro(req);
  if (g.resposta) return g.resposta;
  try {
    const body = await req.json().catch(() => ({}));
    const id = Number(body?.id);
    if (!Number.isInteger(id)) return NextResponse.json({ error: 'id inválido' }, { status: 400 });
    const n = normalizar(body);
    if (n.erro) return NextResponse.json({ error: n.erro }, { status: 400 });
    const { data, error } = await supabaseAdmin.from('agro_oportunidade_regra')
      .update({ ...n.dados, atualizado_em: new Date().toISOString() }).eq('id', id).select().single();
    if (error) throw error;
    await logAgro(g.auth!, { acao: 'regra_editada', entidade: 'regra', entidadeId: String(id), entidadeLabel: `${data.cultura_codigo} → ${data.produto_sugerido}`, detalhes: n.dados });
    return NextResponse.json({ regra: data });
  } catch (e: any) { return erroAgro(e, 'regras PATCH'); }
}

export async function DELETE(req: Request) {
  const g = await guardarAgro(req);
  if (g.resposta) return g.resposta;
  try {
    const id = Number(new URL(req.url).searchParams.get('id'));
    if (!Number.isInteger(id)) return NextResponse.json({ error: 'id inválido' }, { status: 400 });
    const { error } = await supabaseAdmin.from('agro_oportunidade_regra').delete().eq('id', id);
    if (error) throw error;
    await logAgro(g.auth!, { acao: 'regra_removida', entidade: 'regra', entidadeId: String(id) });
    return NextResponse.json({ ok: true });
  } catch (e: any) { return erroAgro(e, 'regras DELETE'); }
}
