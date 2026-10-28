import { NextRequest, NextResponse } from 'next/server';
import { protegerRota } from '@/lib/ajustes/permissao-server';
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { extrairChassis, extrairHorasRevisaoOS } from '@/lib/pos/extrairTrator';
import { normalizarHorasRevisao } from '@/lib/pos/vigia-revisoes-regras';
import { finalDoChassi } from '@/lib/revisoes/vendidos';
import { tratoresVendidos, type TratorVendido } from '@/lib/revisoes/vendidos-server';

export const dynamic = 'force-dynamic';

// GET /api/revisoes/vendidos/da-os?os=OS-0855
// O Radar de tratores dentro da OS de revisão do POS (bloco do cheque): acha o trator novo vendido
// pelo chassi do Projeto da OS e devolve a venda, a entrega técnica e o certificado da Mahindra,
// onde o trator fica, as ligações registradas, a revisão de 50 h e a previsão da 300 h.
// Trator que não é novo vendido nos últimos 24 meses → { trator: null }.
// Módulo POS, Revisões ou Feedbacks.

let cache: { em: number; lista: TratorVendido[] } | null = null;
async function vendidos(): Promise<TratorVendido[]> {
  if (cache && Date.now() - cache.em < 10 * 60_000) return cache.lista;
  const d = new Date(Date.now() - 3 * 3_600_000);
  d.setUTCMonth(d.getUTCMonth() - 24);
  const lista = await tratoresVendidos(d.toISOString().slice(0, 10));
  cache = { em: Date.now(), lista };
  return lista;
}

export async function GET(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: 'pos' }, { modulo: 'revisoes' }, { modulo: 'feedbacks' }]);
  if (g.resposta) return g.resposta;
  const osId = String(req.nextUrl.searchParams.get('os') || '').trim();
  if (!osId) return NextResponse.json({ ok: false, erro: 'Falta a OS.' }, { status: 400 });
  try {
    const { data: os } = await supabaseAdmin.from('Ordem_Servico')
      .select('Id_Ordem, Projeto, Serv_Solicitado, Revisao, Tipo_Servico').eq('Id_Ordem', osId).maybeSingle();
    if (!os) return NextResponse.json({ ok: true, trator: null });
    const chassi = extrairChassis(os);
    if (!chassi) return NextResponse.json({ ok: true, trator: null });
    const t = (await vendidos()).find((x) => x.chassi && finalDoChassi(x.chassi) === finalDoChassi(chassi)) || null;
    if (!t) return NextResponse.json({ ok: true, trator: null });
    const { data: contatos } = await supabaseAdmin.from('radar_tratores_contatos')
      .select('id, chave, marco, resultado, nota, user_nome, criado_em').eq('chave', t.chave).order('criado_em', { ascending: false });
    return NextResponse.json({
      ok: true,
      horasOS: normalizarHorasRevisao(extrairHorasRevisaoOS(os)),
      trator: {
        chave: t.chave, modelo: t.modelo, cliente: t.cliente?.nome || null, dataVenda: t.dataVenda, dias: t.dias,
        entrega: t.entrega, revisao50: t.revisao50, previsao300: t.previsao300, certificado: t.certificado,
        locais: t.locais, endereco: [t.cliente?.endereco, t.cliente?.bairro, t.cliente?.cidade].filter(Boolean).join(', ') || null,
      },
      contatos: contatos || [],
    });
  } catch (e) {
    const erro = e instanceof Error ? e.message : String((e as { message?: string })?.message || e);
    return NextResponse.json({ ok: false, erro }, { status: 500 });
  }
}
