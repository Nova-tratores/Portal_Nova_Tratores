import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/pos/supabase';
import { TBL_GARANTIAS, TBL_GAR_PECAS, STATUS_FINALIZADOS } from '@/lib/garantias/constants';
import { registrarEvento, notificarGarantistas } from '@/lib/garantias/server';

// GET /api/garantias?status=&os=&chassis=&montadora=&tecnico=&finalizadas=
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  let query = supabase
    .from(TBL_GARANTIAS)
    .select(
      '*, montadora:garantia_montadoras(id,nome,cor), pecas:garantia_pecas(id), pendencias:garantia_pendencias(id,tipo,status,descricao,exige_visita), anexos:garantia_anexos(id,categoria,url,nome_arquivo,created_at)'
    )
    .order('created_at', { ascending: false });

  const status = sp.get('status');
  const os = sp.get('os');
  const chassis = sp.get('chassis');
  const montadora = sp.get('montadora');
  const tecnico = sp.get('tecnico');
  const finalizadas = sp.get('finalizadas');

  if (status) query = query.eq('status', status);
  if (os) query = query.eq('id_ordem', os);
  if (chassis) query = query.ilike('chassis', `%${chassis}%`);
  if (montadora) query = query.eq('montadora_id', montadora);
  if (tecnico) query = query.eq('tecnico_nome', tecnico);
  if (finalizadas === 'true') query = query.in('status', STATUS_FINALIZADOS);
  if (finalizadas === 'false') query = query.not('status', 'in', `(${STATUS_FINALIZADOS.join(',')})`);

  const { data, error } = await query;
  if (error) {
    console.error('Erro ao listar garantias:', error.message);
    return NextResponse.json({ error: 'Falha ao listar garantias.' }, { status: 500 });
  }
  return NextResponse.json({ garantias: data || [] });
}

// POST /api/garantias — técnico cria a requisição de garantia
export async function POST(req: NextRequest) {
  const body = await req.json();
  const idOrdem = String(body.id_ordem || '').trim();
  const tecnicoNome = String(body.tecnico_nome || '').trim();

  if (!idOrdem || !tecnicoNome) {
    return NextResponse.json({ error: 'OS e técnico são obrigatórios.' }, { status: 400 });
  }

  const pecas = Array.isArray(body.pecas) ? body.pecas : [];
  if (pecas.length === 0) {
    return NextResponse.json({ error: 'Selecione ao menos uma peça para a garantia.' }, { status: 400 });
  }

  // Garante uma única garantia ativa por OS
  const { data: existente } = await supabase
    .from(TBL_GARANTIAS)
    .select('id, numero, status')
    .eq('id_ordem', idOrdem)
    .not('status', 'in', `(${STATUS_FINALIZADOS.join(',')})`)
    .limit(1);
  if (existente && existente.length > 0) {
    return NextResponse.json(
      { error: `Já existe uma garantia ativa para a OS ${idOrdem} (${existente[0].numero}).` },
      { status: 409 }
    );
  }

  // Snapshot de dados da OS para busca e exibição
  const { data: osRow } = await supabase
    .from('Ordem_Servico')
    .select('Os_Cliente, Projeto, ID_PPV')
    .eq('Id_Ordem', idOrdem)
    .maybeSingle();
  const { data: tecRow } = await supabase
    .from('Ordem_Servico_Tecnicos')
    .select('Chassis')
    .eq('Ordem_Servico', idOrdem)
    .maybeSingle();

  const { data: garantia, error } = await supabase
    .from(TBL_GARANTIAS)
    .insert({
      id_ordem: idOrdem,
      tecnico_nome: tecnicoNome,
      cliente: osRow?.Os_Cliente || null,
      modelo: osRow?.Projeto || null,
      chassis: tecRow?.Chassis || null,
      ppv_ids: osRow?.ID_PPV || null,
      tecnico_horas: Number(body.tecnico_horas) || 0,
      tecnico_km: Number(body.tecnico_km) || 0,
      tecnico_obs: body.tecnico_obs || null,
      status: 'aberta',
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Já existe uma garantia ativa para esta OS.' }, { status: 409 });
    }
    console.error('Erro ao criar garantia:', error.message);
    return NextResponse.json({ error: 'Falha ao criar garantia.' }, { status: 500 });
  }

  // Peças selecionadas
  await supabase.from(TBL_GAR_PECAS).insert(
    pecas.map((p: Record<string, unknown>) => ({
      garantia_id: garantia.id,
      cod_produto: p.cod_produto || null,
      descricao: p.descricao || 'Peça',
      quantidade: Number(p.quantidade) || 1,
      preco_unitario: Number(p.preco_unitario) || 0,
      origem: p.origem || null,
      fonte_ppv_id: p.fonte_ppv_id || null,
    }))
  );

  await registrarEvento(garantia.id, {
    tipo: 'criada',
    statusNovo: 'aberta',
    ator: tecnicoNome,
    detalhe: `Garantia ${garantia.numero} solicitada para a OS ${idOrdem}`,
  });
  await notificarGarantistas({
    titulo: `Nova requisição de garantia — ${garantia.numero}`,
    descricao: `${tecnicoNome} solicitou garantia na OS ${idOrdem}`,
    link: `/garantias?id=${garantia.id}`,
  });

  return NextResponse.json({ garantia });
}
