import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/pos/supabase';
import {
  TBL_GARANTIAS,
  TBL_GAR_PECAS,
  STATUS_FINALIZADOS,
} from '@/lib/garantias/constants';
import { registrarEvento } from '@/lib/garantias/server';
import { listarPecasDaOS } from '@/lib/garantias/os-pecas';
import type { GarantiaStatus } from '@/lib/garantias/types';

// POST /api/garantias/[id]/sincronizar-os
// Re-sincroniza peças + horas + km + snapshot (cliente/modelo/chassi/PPV) da
// garantia a partir da OS de origem. As peças vêm da fonte combinada (PPV +
// requisições + PecasInfo). Horas/km vêm da Ordem_Servico (Qtd_HR/Qtd_KM).
// Só grava se algo mudou; bloqueado em garantias finalizadas (a foto das
// peças aprovadas/rejeitadas não pode mudar).
//
// body opcional: { ator?: string }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const ator = String(body.ator || '').trim() || 'Garantista';

  const { data: garantia } = await supabase
    .from(TBL_GARANTIAS)
    .select('id, numero, status, id_ordem, tecnico_horas, tecnico_km, cliente, modelo, chassis, ppv_ids')
    .eq('id', id)
    .maybeSingle();
  if (!garantia) return NextResponse.json({ error: 'Garantia não encontrada.' }, { status: 404 });

  if (STATUS_FINALIZADOS.includes(garantia.status as GarantiaStatus)) {
    return NextResponse.json(
      { error: 'Garantia finalizada — não é possível sincronizar peças/horas.' },
      { status: 400 },
    );
  }
  if (!garantia.id_ordem) {
    return NextResponse.json({ error: 'Garantia sem OS de origem.' }, { status: 400 });
  }

  // Dados atuais da OS
  const { data: os } = await supabase
    .from('Ordem_Servico')
    .select('Qtd_HR, Qtd_KM, Os_Cliente, Projeto, ID_PPV')
    .eq('Id_Ordem', garantia.id_ordem)
    .maybeSingle();
  if (!os) {
    return NextResponse.json({ error: `OS ${garantia.id_ordem} não encontrada.` }, { status: 404 });
  }
  const { data: tecRow } = await supabase
    .from('Ordem_Servico_Tecnicos')
    .select('Chassis')
    .eq('Ordem_Servico', garantia.id_ordem)
    .maybeSingle();

  const novasPecas = await listarPecasDaOS(garantia.id_ordem);
  const novasHoras = Number(os.Qtd_HR) || 0;
  const novoKm = Number(os.Qtd_KM) || 0;

  // Peças atuais da garantia (para detectar mudança)
  const { data: atuais } = await supabase
    .from(TBL_GAR_PECAS)
    .select('cod_produto, descricao, quantidade, preco_unitario')
    .eq('garantia_id', id);

  const assinatura = (
    arr: Array<{ cod_produto?: string | null; descricao?: string; quantidade?: number; preco_unitario?: number }>,
  ) =>
    arr
      .map((p) => `${p.cod_produto || ''}|${(p.descricao || '').trim()}|${Number(p.quantidade) || 0}|${(Number(p.preco_unitario) || 0).toFixed(2)}`)
      .sort()
      .join('§');

  const pecasMudaram = assinatura(atuais || []) !== assinatura(novasPecas);
  const horasMudaram = Number(garantia.tecnico_horas || 0) !== novasHoras || Number(garantia.tecnico_km || 0) !== novoKm;

  // Snapshot da OS (cliente renomeado, modelo/chassi/PPV preenchidos depois).
  // OS vazia não apaga o que a garantia já tem (correção manual preservada).
  const novoCliente = String(os.Os_Cliente || '').trim() || garantia.cliente || null;
  const novoModelo = String(os.Projeto || '').trim() || garantia.modelo || null;
  const novoChassis = String(tecRow?.Chassis || '').trim() || garantia.chassis || null;
  const novoPpv = String(os.ID_PPV || '').trim() || garantia.ppv_ids || null;
  const snapshotMudou =
    novoCliente !== (garantia.cliente || null) ||
    novoModelo !== (garantia.modelo || null) ||
    novoChassis !== (garantia.chassis || null) ||
    novoPpv !== (garantia.ppv_ids || null);

  if (!pecasMudaram && !horasMudaram && !snapshotMudou) {
    return NextResponse.json({ changed: false, qtd_pecas: (atuais || []).length, horas: novasHoras, km: novoKm });
  }

  // Substitui as peças (a garantia não está finalizada, então todas são 'pendente')
  if (pecasMudaram) {
    await supabase.from(TBL_GAR_PECAS).delete().eq('garantia_id', id);
    if (novasPecas.length > 0) {
      const insert = novasPecas.map((p) => ({
        garantia_id: id,
        cod_produto: p.cod_produto,
        descricao: p.descricao,
        quantidade: p.quantidade,
        preco_unitario: p.preco_unitario,
        origem: p.origem,
        fonte_ppv_id: p.fonte_ppv_id,
      }));
      const { error: errIns } = await supabase.from(TBL_GAR_PECAS).insert(insert);
      if (errIns) {
        console.error('[sincronizar-os] falha ao inserir peças:', errIns.message);
        return NextResponse.json({ error: 'Falha ao atualizar peças.' }, { status: 500 });
      }
    }
  }

  // Atualiza horas/km e snapshots da OS
  await supabase
    .from(TBL_GARANTIAS)
    .update({
      tecnico_horas: novasHoras,
      tecnico_km: novoKm,
      cliente: novoCliente,
      modelo: novoModelo,
      chassis: novoChassis,
      ppv_ids: novoPpv,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  const partes: string[] = [];
  if (pecasMudaram) partes.push(`${novasPecas.length} peça(s)`);
  if (horasMudaram) partes.push(`horas ${novasHoras}h / km ${novoKm}`);
  if (snapshotMudou) {
    if (novoCliente !== (garantia.cliente || null)) partes.push(`cliente "${novoCliente}"`);
    if (novoModelo !== (garantia.modelo || null)) partes.push(`modelo "${novoModelo}"`);
    if (novoChassis !== (garantia.chassis || null)) partes.push(`chassi "${novoChassis}"`);
    if (novoPpv !== (garantia.ppv_ids || null)) partes.push(`PPV "${novoPpv}"`);
  }
  await registrarEvento(id, {
    tipo: 'sincronizada_os',
    ator,
    detalhe: `Dados sincronizados da OS ${garantia.id_ordem}: ${partes.join(' · ')}.`,
  });

  return NextResponse.json({
    changed: true,
    pecasMudaram,
    horasMudaram,
    qtd_pecas: novasPecas.length,
    horas: novasHoras,
    km: novoKm,
  });
}
