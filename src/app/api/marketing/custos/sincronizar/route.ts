/* eslint-disable @typescript-eslint/no-explicit-any */
// =============================================================================
// Relê o valor ATUAL dos documentos de origem e grava em `valor_fonte`.
//
// O que este endpoint NÃO faz: mexer em `valor`. O valor do custo é snapshot
// autoritário de propósito — se o total se recalculasse na leitura, o ROI de
// uma feira encerrada mudaria sozinho quando alguém editasse uma requisição
// antiga meses depois. A tela mostra a divergência; quem decide é a pessoa.
// =============================================================================
import { NextResponse } from 'next/server';
import { guardar, erroResposta } from '@/lib/marketing/rota';
import { db } from '@/lib/marketing/db';
import { parseValorMisto } from '@/lib/marketing/custos';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const g = await guardar(req, 'marketing', 'custos:vincular');
  if (g.resposta) return g.resposta;

  try {
    const body = await req.json().catch(() => ({}));
    if (!body?.acao_id) return NextResponse.json({ error: 'Informe acao_id' }, { status: 400 });

    const { data: custos, error } = await db
      .from('mkt_custos')
      .select('id, vinculo_tipo, vinculo_ref, valor, valor_fonte')
      .eq('acao_id', body.acao_id)
      .not('vinculo_ref', 'is', null);
    if (error) throw Object.assign(new Error(error.message), { code: error.code });

    const vinculados = custos ?? [];
    if (vinculados.length === 0) {
      return NextResponse.json({ conferidos: 0, divergentes: 0, itens: [] });
    }

    const refs = (tipo: string) =>
      vinculados.filter((c: any) => c.vinculo_tipo === tipo).map((c: any) => c.vinculo_ref);

    const idsReq = refs('requisicao').map(Number).filter(Number.isFinite);
    const idsFp = refs('finan_pagar').map(Number).filter(Number.isFinite);
    const idsNe = refs('nota_entrada');

    const [reqs, fps, nes] = await Promise.all([
      idsReq.length ? db.from('Requisicao').select('id, valor_despeza').in('id', idsReq) : Promise.resolve({ data: [] as any[] }),
      idsFp.length ? db.from('finan_pagar').select('id, valor').in('id', idsFp) : Promise.resolve({ data: [] as any[] }),
      idsNe.length ? db.from('notas_entrada').select('ncod_nf, valor_nf').in('ncod_nf', idsNe) : Promise.resolve({ data: [] as any[] }),
    ]);

    const atual = new Map<string, number>();
    // valor_despeza é TEXT em formato BR/US misto — só parseValorMisto resolve.
    for (const r of reqs.data ?? []) atual.set(`requisicao:${r.id}`, parseValorMisto(r.valor_despeza));
    for (const f of fps.data ?? []) atual.set(`finan_pagar:${f.id}`, parseValorMisto(f.valor));
    for (const n of nes.data ?? []) atual.set(`nota_entrada:${n.ncod_nf}`, parseValorMisto(n.valor_nf));

    const agora = new Date().toISOString();
    const relatorio: any[] = [];
    let divergentes = 0;

    for (const c of vinculados) {
      const chave = `${c.vinculo_tipo}:${c.vinculo_ref}`;
      const fonte = atual.get(chave);
      if (fonte === undefined) {
        relatorio.push({ id: c.id, ref: chave, situacao: 'origem_nao_encontrada' });
        continue;
      }
      const difere = Math.abs(parseValorMisto(c.valor) - fonte) >= 0.01;
      if (difere) divergentes += 1;
      await db.from('mkt_custos')
        .update({ valor_fonte: fonte, sincronizado_em: agora })
        .eq('id', c.id);
      relatorio.push({ id: c.id, ref: chave, valor: Number(c.valor), fonte, divergente: difere });
    }

    return NextResponse.json({ conferidos: vinculados.length, divergentes, itens: relatorio });
  } catch (e) {
    return erroResposta(e, 'POST /custos/sincronizar');
  }
}
