/* eslint-disable @typescript-eslint/no-explicit-any */
// POST /api/marketing/leads/da-roleta { acao_id } — inscrições da roleta da campanha que ainda não viraram lead
// (revisão da tela de campanha, 23/11/2026). O gatilho trg_roleta_para_lead (sql/marketing-roleta-leads.sql)
// já faz isso sozinho em cada inscrição nova; este botão cobre o que ficou para trás. Um lead por inscrição.
import { NextResponse } from 'next/server';
import { guardar, erroResposta } from '@/lib/marketing/rota';
import { db } from '@/lib/marketing/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SETOR: Record<string, string> = { posvendas: 'Pós-vendas', pecas: 'Peças', vendas: 'Vendas' };

/** Mesmo texto da função mkt_texto_lead_roleta do banco. */
function textoDoLead(p: any): string {
  return [
    `Girou a roleta (${SETOR[p.setor] || p.setor})`,
    p.premio_nome ? `ganhou: ${p.premio_nome}` : null,
    p.tem_trator ? `tem trator${p.modelo ? ` ${p.modelo}` : ''}` : 'não tem trator',
    p.codigo ? `código ${p.codigo}` : null,
  ].filter(Boolean).join(' · ');
}

export async function POST(req: Request) {
  const g = await guardar(req, 'marketing', 'acoes:editar');
  if (g.resposta) return g.resposta;
  try {
    const { acao_id } = await req.json().catch(() => ({}));
    if (!acao_id) return NextResponse.json({ error: 'Informe acao_id' }, { status: 400 });
    const { data: camps } = await db.from('campanhas').select('id').eq('acao_id', acao_id);
    if (!camps?.length) return NextResponse.json({ criados: 0 });
    const { data: parts, error } = await db.from('campanha_participacoes')
      .select('id, setor, nome, cidade, tem_trator, modelo, premio_nome, codigo, criado_em').in('campanha_id', camps.map((c: any) => c.id));
    if (error) throw Object.assign(new Error(error.message), { code: error.code });
    const { data: ja, error: e2 } = await db.from('mkt_leads').select('participacao_id').eq('acao_id', acao_id).not('participacao_id', 'is', null);
    if (e2) {
      if (/participacao_id|origem/.test(e2.message)) return NextResponse.json({ error: 'Falta rodar sql/marketing-roleta-leads.sql no Supabase.' }, { status: 500 });
      throw Object.assign(new Error(e2.message), { code: e2.code });
    }
    const feitos = new Set((ja || []).map((x: any) => x.participacao_id));
    const novos = (parts || []).filter((p: any) => !feitos.has(p.id)).map((p: any) => ({
      acao_id, texto: textoDoLead(p), nome: p.nome, cidade: p.cidade,
      interesse: p.tem_trator ? (p.modelo ? `Tem ${p.modelo}` : 'Tem trator') : null,
      qualificacao: 'novo', origem: 'roleta', participacao_id: p.id, capturado_em: p.criado_em, capturado_por_nome: 'Roleta do site',
    }));
    if (!novos.length) return NextResponse.json({ criados: 0 });
    const { error: e3 } = await db.from('mkt_leads').insert(novos);
    if (e3) throw Object.assign(new Error(e3.message), { code: e3.code });
    return NextResponse.json({ criados: novos.length });
  } catch (e) {
    return erroResposta(e, 'POST /leads/da-roleta');
  }
}
