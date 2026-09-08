/* eslint-disable @typescript-eslint/no-explicit-any */
// =============================================================================
// "Achamos estes documentos que parecem ser desta ação."
//
// O portal já tem um eixo de centro de custo em produção: o PROJETO DO OMIE.
// A requisição grava projeto_codigo, o lançamento a pagar grava omie_projeto.
// Se a ação está amarrada a um projeto, dá pra oferecer os documentos dele em
// vez de a pessoa digitar tudo de novo.
//
// Sem projeto na ação, cai no plano B: documentos do PERÍODO da ação, que a
// pessoa confirma na mão.
//
// ⚠️ "Requisicao".valor_despeza é TEXT em formato BR/US misto. NUNCA somar em
// SQL — o valor sai daqui cru e quem converte é parseValorMisto no cliente.
// =============================================================================
import { NextResponse } from 'next/server';
import { guardar, erroResposta } from '@/lib/marketing/rota';
import { db, obterAcao } from '@/lib/marketing/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const COLS_REQ = 'id, titulo, tipo, setor, status, data, fornecedor, numero_nota, valor_despeza, projeto_codigo, projeto_nome';
const COLS_FP = 'id, fornecedor, valor, motivo, data_vencimento, numero_NF, status_envio, omie_projeto, omie_empresa, criado_em';

export async function GET(req: Request) {
  const g = await guardar(req, 'marketing');
  if (g.resposta) return g.resposta;

  try {
    const acaoId = new URL(req.url).searchParams.get('acao_id');
    if (!acaoId) return NextResponse.json({ error: 'Informe acao_id' }, { status: 400 });

    const acao = await obterAcao(acaoId);
    if (!acao) return NextResponse.json({ error: 'Ação não encontrada' }, { status: 404 });

    // O que já está lançado nesta ação não deve aparecer como sugestão.
    const { data: jaLancados } = await db
      .from('mkt_custos')
      .select('vinculo_tipo, vinculo_ref')
      .eq('acao_id', acaoId)
      .not('vinculo_ref', 'is', null);
    const usados = new Set((jaLancados ?? []).map((c: any) => `${c.vinculo_tipo}:${c.vinculo_ref}`));

    const porProjeto = !!acao.projeto_codigo;
    let requisicoes: any[] = [];
    let contas: any[] = [];
    let motivo = '';

    if (porProjeto) {
      motivo = `documentos do projeto "${acao.projeto_nome || acao.projeto_codigo}" no Omie`;
      const [r1, r2] = await Promise.all([
        db.from('Requisicao').select(COLS_REQ).eq('projeto_codigo', acao.projeto_codigo).neq('status', 'lixeira').order('id', { ascending: false }).limit(200),
        db.from('finan_pagar').select(COLS_FP).eq('omie_projeto', acao.projeto_codigo).order('id', { ascending: false }).limit(200),
      ]);
      requisicoes = r1.data ?? [];
      contas = r2.data ?? [];
    } else if (acao.data_inicio) {
      // Plano B: janela do evento com folga de 30 dias antes e 30 depois — o
      // estande é contratado antes e a nota chega depois.
      const de = new Date(acao.data_inicio + 'T00:00:00Z');
      de.setUTCDate(de.getUTCDate() - 30);
      const ate = new Date((acao.data_fim || acao.data_inicio) + 'T00:00:00Z');
      ate.setUTCDate(ate.getUTCDate() + 30);
      const deISO = de.toISOString().slice(0, 10);
      const ateISO = ate.toISOString().slice(0, 10);
      motivo = `documentos entre ${deISO} e ${ateISO} (a ação não tem projeto do Omie amarrado)`;

      const [r1, r2] = await Promise.all([
        db.from('Requisicao').select(COLS_REQ).gte('data', deISO).lte('data', ateISO).neq('status', 'lixeira').order('id', { ascending: false }).limit(150),
        db.from('finan_pagar').select(COLS_FP).gte('data_vencimento', deISO).lte('data_vencimento', ateISO).order('id', { ascending: false }).limit(150),
      ]);
      requisicoes = r1.data ?? [];
      contas = r2.data ?? [];
    } else {
      motivo = 'a ação não tem projeto do Omie nem data — sem base pra sugerir';
    }

    return NextResponse.json({
      porProjeto,
      motivo,
      requisicoes: requisicoes
        .filter((r: any) => !usados.has(`requisicao:${r.id}`))
        .map((r: any) => ({
          ref: String(r.id),
          titulo: r.titulo || `Requisição #${r.id}`,
          fornecedor: r.fornecedor,
          data: r.data,
          valorCru: r.valor_despeza,   // texto BR/US — converter no cliente
          extra: [r.tipo, r.setor, r.numero_nota ? `NF ${r.numero_nota}` : null].filter(Boolean).join(' · '),
          status: r.status,
        })),
      contas: contas
        .filter((c: any) => !usados.has(`finan_pagar:${c.id}`))
        .map((c: any) => ({
          ref: String(c.id),
          titulo: c.motivo || `Conta #${c.id}`,
          fornecedor: c.fornecedor,
          data: c.data_vencimento,
          valorCru: c.valor,
          extra: [c.numero_NF ? `NF ${c.numero_NF}` : null, c.omie_empresa, c.status_envio].filter(Boolean).join(' · '),
          status: c.status_envio,
        })),
    });
  } catch (e) {
    return erroResposta(e, 'GET /custos/sugestoes');
  }
}
