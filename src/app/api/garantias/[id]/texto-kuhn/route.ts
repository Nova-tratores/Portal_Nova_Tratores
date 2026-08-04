import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/pos/supabase';
import { TBL_GARANTIAS, TBL_GAR_PECAS } from '@/lib/garantias/constants';
import { registrarEvento } from '@/lib/garantias/server';

// POST /api/garantias/[id]/texto-kuhn — monta o TEXTO ÚNICO no formato que a
// Extranet da KUHN pede na caixa "PROVÁVEL CAUSA E DESCRIÇÃO DO PROBLEMA"
// (numerado 1–6, com horas de M.O., KM e peças) pra aprovação da mão de obra.
// Usa os textos do Tratorilson (sg_reclamacao/sg_acao_tomada) quando existem;
// senão cai pro relato cru. Campos sem dado saem como ____ pro garantista
// completar antes de colar. Salva em checklist_respostas.sg_kuhn_site.
// body: { ator? }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const ator = body.ator || 'Garantista';

  const { data: g } = await supabase
    .from(TBL_GARANTIAS)
    .select('id, numero, id_ordem, status, checklist_respostas')
    .eq('id', id)
    .maybeSingle();
  if (!g) return NextResponse.json({ error: 'Garantia não encontrada.' }, { status: 404 });
  if (g.status === 'aprovada' || g.status === 'rejeitada') {
    return NextResponse.json({ error: 'Garantia já finalizada.' }, { status: 400 });
  }

  const [osRes, tecRes, pecasRes, anexosRes] = await Promise.all([
    supabase
      .from('Ordem_Servico')
      .select('Data, Serv_Solicitado')
      .eq('Id_Ordem', g.id_ordem)
      .maybeSingle(),
    supabase
      .from('Ordem_Servico_Tecnicos')
      .select('TecResp1, DataInicio, DataFinal, InicioHora, FinalHora, TotalHora, TotalKm, InicioKm, ServicoRealizado')
      .eq('Ordem_Servico', g.id_ordem)
      .order('IdOs', { ascending: false })
      .limit(1),
    supabase.from(TBL_GAR_PECAS).select('cod_produto, descricao').eq('garantia_id', id),
    supabase.from('garantia_anexos').select('id', { count: 'exact', head: true }).eq('garantia_id', id),
  ]);

  const os = osRes.data;
  const tec = (tecRes.data || [])[0] as Record<string, string | null> | undefined;
  const respostas = ((g.checklist_respostas as Record<string, unknown>) || {});

  const brData = (s: string | null | undefined): string => {
    const t = String(s || '').trim();
    const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[3]}-${iso[2]}-${iso[1]}`;
    const br = t.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (br) return `${br[1]}-${br[2]}-${br[3]}`;
    return t || '____';
  };
  const brNum = (s: string | null | undefined): string => {
    const n = Number(String(s ?? '').replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(n) && String(s ?? '').trim() !== '' ? n.toLocaleString('pt-BR') : '____';
  };
  const ou = (s: string | null | undefined, alt = '____'): string => {
    const t = String(s || '').trim();
    return t || alt;
  };

  // número da OS sem prefixo (OS-0634 -> 634)
  const numeroOS = String(g.id_ordem || '').replace(/^OS-?0*/i, '') || String(g.id_ordem || '____');
  // primeiro nome do técnico, maiúsculo (formato do exemplo aprovado pela Kuhn)
  const tecnico = ou(tec?.TecResp1).split(/\s+/)[0]?.toUpperCase() || '____';

  const kmInicial = brNum(tec?.InicioKm);
  const totalKm = brNum(tec?.TotalKm);
  const kmFinal = (() => {
    const ini = Number(String(tec?.InicioKm ?? '').replace(/\./g, '').replace(',', '.'));
    const tot = Number(String(tec?.TotalKm ?? '').replace(/\./g, '').replace(',', '.'));
    if (Number.isFinite(ini) && Number.isFinite(tot) && String(tec?.InicioKm ?? '').trim() !== '') {
      return (ini + tot).toLocaleString('pt-BR');
    }
    return '____';
  })();

  const reclamacao = ou(respostas['sg_reclamacao'] as string, ou(os?.Serv_Solicitado));
  const servico = ou(respostas['sg_acao_tomada'] as string, ou(tec?.ServicoRealizado));
  const codigosPecas = (pecasRes.data || [])
    .map((p) => String(p.cod_produto || '').trim() || String(p.descricao || '').trim())
    .filter((c) => c && !/^REQ-/i.test(c));

  const texto = [
    `- Arquivo em anexo : ${anexosRes.count ?? 0}`,
    `1. Data do atendimento: ${brData(tec?.DataFinal || tec?.DataInicio)};`,
    `2. Número da Ordem de Serviço: ${numeroOS};`,
    `3. Nome do Técnico da Revenda: ${tecnico};`,
    `4. Horas de Mão de Obra na Máquina: Inicio: ${ou(tec?.InicioHora)}, Término ${ou(tec?.FinalHora)}, ${ou(tec?.TotalHora)} horas de serviço sem pausas;`,
    `5. KM rodado inicial e final: KM Inicial: ${kmInicial}, KM Final: ${kmFinal}, ${totalKm} KM rodado;`,
    `6. Descrição completa do atendimento: ${brData(os?.Data)}: Reclamação do cliente: ${reclamacao}`,
    `${brData(tec?.DataFinal || tec?.DataInicio)}: Serviço: ${servico}`,
    codigosPecas.length ? `Peças: ${codigosPecas.join(', ')}` : `Peças: ____`,
  ].join('\n');

  await supabase
    .from(TBL_GARANTIAS)
    .update({
      checklist_respostas: { ...respostas, sg_kuhn_site: texto },
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  await registrarEvento(id, {
    tipo: 'sg_textos_formatados',
    ator,
    detalhe: 'Texto único no formato da KUHN (Extranet) montado pra aprovação da mão de obra.',
  });

  return NextResponse.json({ ok: true, texto });
}
