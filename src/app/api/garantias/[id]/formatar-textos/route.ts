// POST /api/garantias/[id]/formatar-textos — o Tratorilson lê o relato CRU do
// técnico (Ordem_Servico + Ordem_Servico_Tecnicos) e devolve os 4 campos da
// SG Mahindra formatados. Salva em checklist_respostas.sg_* (mesmo lugar do
// tipo_garantia_sg) — o garantista revisa/edita no drawer e o gerador da SG
// usa esses textos no lugar dos crus.
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/pos/supabase';
import { TBL_GARANTIAS, TBL_GAR_PECAS } from '@/lib/garantias/constants';
import { formatarTextosSG } from '@/lib/garantias/sg-textos';
import { registrarEvento } from '@/lib/garantias/server';

export const runtime = 'nodejs';
export const maxDuration = 60; // chamada de IA

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const ator = body.ator || 'Garantista';

  try {
    const { data: garantia, error } = await supabase
      .from(TBL_GARANTIAS)
      .select('id, numero, id_ordem, modelo, status, checklist_respostas')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!garantia) return NextResponse.json({ error: 'Garantia não encontrada.' }, { status: 404 });
    if (!garantia.id_ordem) {
      return NextResponse.json({ error: 'Garantia sem OS vinculada — não há relato do técnico pra formatar.' }, { status: 400 });
    }

    const [osRes, tecRes, pecasRes] = await Promise.all([
      supabase.from('Ordem_Servico').select('Serv_Solicitado').eq('Id_Ordem', garantia.id_ordem).maybeSingle(),
      supabase.from('Ordem_Servico_Tecnicos').select('Motivo, ServicoRealizado').eq('Ordem_Servico', garantia.id_ordem).maybeSingle(),
      supabase.from(TBL_GAR_PECAS).select('cod_produto, descricao').eq('garantia_id', id),
    ]);

    const reclamacaoBruta = osRes.data?.Serv_Solicitado || null;
    const diagnosticoBruto = tecRes.data?.Motivo || null;
    const acaoBruta = tecRes.data?.ServicoRealizado || null;
    if (!reclamacaoBruta && !diagnosticoBruto && !acaoBruta) {
      return NextResponse.json({ error: 'A OS não tem relato do técnico (solicitação/diagnóstico/serviço vazios).' }, { status: 400 });
    }

    // peças da garantia × itens de serviços de terceiros (cod REQ- = requisição)
    const pecas: string[] = [];
    const servicosTerceiros: string[] = [];
    for (const p of pecasRes.data || []) {
      const d = String(p.descricao || '').trim();
      if (!d) continue;
      if (String(p.cod_produto || '').startsWith('REQ-')) servicosTerceiros.push(d);
      else pecas.push(d);
    }

    const textos = await formatarTextosSG({
      reclamacaoBruta,
      diagnosticoBruto,
      acaoBruta,
      pecas,
      servicosTerceiros,
      modelo: garantia.modelo,
    });

    // grava junto das outras respostas (tipo_garantia_sg vive aqui também)
    const respostas = {
      ...((garantia.checklist_respostas as Record<string, unknown>) || {}),
      sg_reclamacao: textos.reclamacao,
      sg_diagnostico: textos.diagnostico,
      sg_acao_tomada: textos.acao_tomada,
      sg_observacoes: textos.observacoes || '',
    };
    const { error: errUpd } = await supabase
      .from(TBL_GARANTIAS)
      .update({ checklist_respostas: respostas })
      .eq('id', id);
    if (errUpd) throw new Error(errUpd.message);

    await registrarEvento(id, {
      tipo: 'sg_textos_formatados',
      ator,
      detalhe: 'Textos da SG formatados pelo Tratorilson a partir do relato do técnico (revisáveis antes de gerar).',
    });

    return NextResponse.json({ ok: true, textos });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const dica = /OPENAI_API_KEY|ia sem chave/.test(msg)
      ? ' — configure OPENAI_API_KEY no ambiente (o Tratorilson usa a OpenAI).'
      : '';
    return NextResponse.json({ error: msg + dica }, { status: 500 });
  }
}
