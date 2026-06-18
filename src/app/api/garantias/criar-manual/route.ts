import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/pos/supabase';
import {
  TBL_GARANTIAS,
  TBL_GAR_PECAS,
  STATUS_FINALIZADOS,
} from '@/lib/garantias/constants';
import {
  registrarEvento,
  notificarTecnico,
  notificarGarantistas,
} from '@/lib/garantias/server';
import { listarPecasDaOS } from '@/lib/garantias/os-pecas';

// POST /api/garantias/criar-manual
// Garantista cria uma garantia a partir de uma OS existente — pra casos onde
// o técnico esqueceu de marcar como garantia ou a OS já está bloqueada
// pra edição. A garantia já entra em 'em_analise' com o garantista assumido.
//
// body: {
//   id_ordem: string;
//   garantista_nome: string;
//   garantista_user_id?: string;
//   motivo?: string;          // grava na timeline e em garantista_obs
//   incluir_pecas_ppv?: bool; // default true — puxa peças do PPV via movimentações
// }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const idOrdem = String(body.id_ordem || '').trim();
  const garantistaNome = String(body.garantista_nome || '').trim();
  const garantistaUserId = body.garantista_user_id ? String(body.garantista_user_id) : null;
  const motivo = String(body.motivo || '').trim();
  const incluirPecasPPV = body.incluir_pecas_ppv !== false; // default true

  if (!idOrdem || !garantistaNome) {
    return NextResponse.json({ error: 'OS e garantista são obrigatórios.' }, { status: 400 });
  }

  // 1) Verifica se a OS existe
  const { data: os } = await supabase
    .from('Ordem_Servico')
    .select('Id_Ordem, Os_Cliente, Projeto, ID_PPV, Os_Tecnico, Os_Tecnico2, Qtd_HR, Qtd_KM')
    .eq('Id_Ordem', idOrdem)
    .maybeSingle();
  if (!os) {
    return NextResponse.json({ error: `OS ${idOrdem} não encontrada.` }, { status: 404 });
  }

  // 2) Verifica se já tem garantia ativa pra essa OS
  const { data: existente } = await supabase
    .from(TBL_GARANTIAS)
    .select('id, numero, status')
    .eq('id_ordem', idOrdem)
    .not('status', 'in', `(${STATUS_FINALIZADOS.join(',')})`)
    .limit(1);
  if (existente && existente.length > 0) {
    return NextResponse.json(
      { error: `Já existe uma garantia ativa para a OS ${idOrdem} (${existente[0].numero}).` },
      { status: 409 },
    );
  }

  // 3) Carrega Chassis do relatório técnico
  const { data: tecRow } = await supabase
    .from('Ordem_Servico_Tecnicos')
    .select('Chassis')
    .eq('Ordem_Servico', idOrdem)
    .maybeSingle();

  // 4) Define o técnico: priorita Os_Tecnico, senão Os_Tecnico2
  const tecnicoNome =
    String(os.Os_Tecnico || '').trim() || String(os.Os_Tecnico2 || '').trim() || 'Sem técnico';

  const horas = Number(os.Qtd_HR) || 0;
  const km = Number(os.Qtd_KM) || 0;

  // 5) Insere a garantia direto em 'em_analise' (garantista já assumindo)
  const obsFinal = motivo
    ? `Criada manualmente pelo garantista. Motivo: ${motivo}`
    : 'Criada manualmente pelo garantista.';
  const now = new Date().toISOString();
  const { data: garantia, error } = await supabase
    .from(TBL_GARANTIAS)
    .insert({
      id_ordem: idOrdem,
      tecnico_nome: tecnicoNome,
      cliente: os.Os_Cliente || null,
      modelo: os.Projeto || null,
      chassis: tecRow?.Chassis || null,
      ppv_ids: os.ID_PPV || null,
      tecnico_horas: horas,
      tecnico_km: km,
      tecnico_obs: null,
      garantista_nome: garantistaNome,
      garantista_user_id: garantistaUserId,
      garantista_obs: obsFinal,
      status: 'em_analise',
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();

  if (error || !garantia) {
    if (error?.code === '23505') {
      return NextResponse.json(
        { error: 'Já existe uma garantia ativa pra essa OS.' },
        { status: 409 },
      );
    }
    console.error('Erro ao criar garantia manual:', error?.message);
    return NextResponse.json({ error: 'Falha ao criar garantia.' }, { status: 500 });
  }

  // 6) Incluir peças da OS (PPV + requisições + PecasInfo) — best-effort
  let qtdPecasCriadas = 0;
  if (incluirPecasPPV) {
    const pecasOS = await listarPecasDaOS(idOrdem);
    const pecasParaInsert = pecasOS.map((p) => ({
      garantia_id: garantia.id,
      cod_produto: p.cod_produto,
      descricao: p.descricao,
      quantidade: p.quantidade,
      preco_unitario: p.preco_unitario,
      origem: p.origem,
      fonte_ppv_id: p.fonte_ppv_id,
    }));
    if (pecasParaInsert.length > 0) {
      const { error: errPecas } = await supabase.from(TBL_GAR_PECAS).insert(pecasParaInsert);
      if (!errPecas) qtdPecasCriadas = pecasParaInsert.length;
      else console.warn('[criar-manual] falha ao inserir peças:', errPecas.message);
    }
  }

  // 7) Eventos: criação manual + assumir
  await registrarEvento(garantia.id, {
    tipo: 'criada_manual',
    statusNovo: 'em_analise',
    ator: garantistaNome,
    detalhe: motivo
      ? `Garantia ${garantia.numero} criada manualmente pelo garantista para a OS ${idOrdem}. Motivo: ${motivo}`
      : `Garantia ${garantia.numero} criada manualmente pelo garantista para a OS ${idOrdem}.`,
  });
  if (qtdPecasCriadas > 0) {
    await registrarEvento(garantia.id, {
      tipo: 'pecas_importadas',
      ator: garantistaNome,
      detalhe: `${qtdPecasCriadas} peça(s) importadas automaticamente do PPV.`,
    });
  }

  // 8) Notificações
  await notificarTecnico(tecnicoNome, {
    titulo: `Garantia ${garantia.numero} aberta na sua OS`,
    descricao: `${garantistaNome} abriu uma garantia para a OS ${idOrdem}${motivo ? ` (${motivo})` : ''}.`,
  });
  await notificarGarantistas({
    titulo: `Garantia ${garantia.numero} criada manualmente`,
    descricao: `${garantistaNome} abriu garantia pra OS ${idOrdem}`,
    link: `/garantias?id=${garantia.id}`,
  });

  return NextResponse.json({ garantia, qtd_pecas: qtdPecasCriadas });
}
