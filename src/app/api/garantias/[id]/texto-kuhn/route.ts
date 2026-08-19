import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/pos/supabase';
import { TBL_GARANTIAS, TBL_GAR_PECAS } from '@/lib/garantias/constants';
import { registrarEvento } from '@/lib/garantias/server';
import { formatarTextosSG } from '@/lib/garantias/sg-textos';
import { extrairDias, montarTextoKuhn } from '@/lib/garantias/texto-kuhn';

// POST /api/garantias/[id]/texto-kuhn — monta o TEXTO ÚNICO no formato que a
// Extranet da KUHN pede na caixa "PROVÁVEL CAUSA E DESCRIÇÃO DO PROBLEMA"
// (numerado 1–6 do manual, com horas de M.O. e KM POR DIA — a
// Ordem_Servico_Tecnicos guarda até 3 dias no mesmo registro) pra aprovação
// da mão de obra. Reclamação/serviço vêm dos textos do Tratorilson: usa os
// sg_* já revisados e, se faltarem, GERA na hora (só cai pro relato cru se a
// IA estiver fora do ar). Fecha com "SG PEÇAS: <nº na KUHN>" (numero_externo).
// Campos sem dado saem como ____ pro garantista completar antes de colar.
// Montagem pura em lib/garantias/texto-kuhn.ts. Salva em
// checklist_respostas.sg_kuhn_site. body: { ator? }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const ator = body.ator || 'Garantista';

  const { data: g } = await supabase
    .from(TBL_GARANTIAS)
    .select('id, numero, id_ordem, modelo, numero_externo, status, checklist_respostas')
    .eq('id', id)
    .maybeSingle();
  if (!g) return NextResponse.json({ error: 'Garantia não encontrada.' }, { status: 404 });
  if (g.status === 'aprovada' || g.status === 'rejeitada') {
    return NextResponse.json({ error: 'Garantia já finalizada.' }, { status: 400 });
  }

  const [osRes, tecRes, pecasRes, reqsRes] = await Promise.all([
    supabase
      .from('Ordem_Servico')
      .select('Data, Serv_Solicitado')
      .eq('Id_Ordem', g.id_ordem)
      .maybeSingle(),
    supabase
      .from('Ordem_Servico_Tecnicos')
      .select(
        'TecResp1, Motivo, ServicoRealizado, DataInicio, DataFinal, InicioHora, FinalHora, InicioKm, FinalKm, ' +
        'DataInicio2, InicioHora2, FinalHora2, InicioKm2, FinalKm2, ' +
        'DataInicio3, InicioHora3, FinaHora3, InicioKm3, FinalKm3, TotalHora, TotalKm'
      )
      .eq('Ordem_Servico', g.id_ordem)
      .order('IdOs', { ascending: false })
      .limit(1),
    supabase.from(TBL_GAR_PECAS).select('cod_produto, descricao').eq('garantia_id', id),
    supabase
      .from('Requisicao')
      .select('id, titulo')
      .eq('ordem_servico', g.id_ordem)
      .not('status', 'in', '("lixeira","cancelada")'),
  ]);

  const s = (v: unknown): string => String(v ?? '').trim();
  const os = osRes.data;
  const tec = (tecRes.data || [])[0] as unknown as Record<string, unknown> | undefined;
  let respostas = ((g.checklist_respostas as Record<string, unknown>) || {});

  // Reclamação/serviço: sg_* revisados > gerados agora pelo Tratorilson > cru.
  let reclamacao = s(respostas['sg_reclamacao']);
  let servico = s(respostas['sg_acao_tomada']);
  if (!reclamacao || !servico) {
    const pecas = (pecasRes.data || []) as { descricao: string; cod_produto: string | null }[];
    const reqs = (reqsRes.data || []) as { id: number; titulo: string | null }[];
    // Serviços de terceiros: só requisições casadas com as peças da garantia —
    // MESMO critério do formatar-textos (manter em sincronia).
    const norm = (t: string) => t.trim().toLowerCase();
    const reqIdsDasPecas = new Set(
      pecas
        .map((p) => String(p.cod_produto || '').match(/^REQ-(\d+)/i)?.[1])
        .filter(Boolean)
        .map((n) => Number(n)),
    );
    const descricoesPecas = pecas.map((p) => norm(String(p.descricao || ''))).filter(Boolean);
    const servicosTerceiros = reqs
      .filter((r) => {
        if (reqIdsDasPecas.has(r.id)) return true;
        const t = norm(String(r.titulo || ''));
        if (!t) return false;
        return descricoesPecas.some((d) => d === t || d.includes(t) || t.includes(d));
      })
      .map((r) => String(r.titulo || '').trim())
      .filter(Boolean);
    try {
      const textos = await formatarTextosSG({
        reclamacaoBruta: os?.Serv_Solicitado || null,
        diagnosticoBruto: s(tec?.Motivo) || null,
        acaoBruta: s(tec?.ServicoRealizado) || null,
        pecas: pecas
          .filter((p) => !String(p.cod_produto || '').startsWith('REQ-'))
          .map((p) => String(p.descricao || '').trim())
          .filter(Boolean),
        servicosTerceiros,
        modelo: g.modelo,
      });
      // Preenche só o que faltava — texto já revisado pelo garantista fica.
      respostas = {
        ...respostas,
        sg_reclamacao: s(respostas['sg_reclamacao']) || textos.reclamacao,
        sg_diagnostico: s(respostas['sg_diagnostico']) || textos.diagnostico,
        sg_acao_tomada: s(respostas['sg_acao_tomada']) || textos.acao_tomada,
        sg_observacoes: s(respostas['sg_observacoes']) || textos.observacoes || '',
      };
      reclamacao = reclamacao || textos.reclamacao;
      servico = servico || textos.acao_tomada;
    } catch (e) {
      console.warn('[garantias] Tratorilson indisponível no texto-kuhn:', e instanceof Error ? e.message : e);
      reclamacao = reclamacao || s(os?.Serv_Solicitado);
      servico = servico || s(tec?.ServicoRealizado);
    }
  }

  // número da OS sem prefixo (OS-0418 -> 418)
  const numeroOS = String(g.id_ordem || '').replace(/^OS-?0*/i, '') || String(g.id_ordem || '____');
  // primeiro nome do técnico, maiúsculo (formato do exemplo aprovado pela Kuhn)
  const tecnico = s(tec?.TecResp1).split(/\s+/)[0]?.toUpperCase() || '____';

  const texto = montarTextoKuhn({
    numeroOS,
    tecnico,
    dataAtendimento: s(tec?.DataFinal) || s(tec?.DataInicio),
    dataReclamacao: s(os?.Data),
    dias: extrairDias(tec),
    totalHoraCampo: s(tec?.TotalHora),
    reclamacao,
    servico,
    sgPecas: s(g.numero_externo),
  });

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
