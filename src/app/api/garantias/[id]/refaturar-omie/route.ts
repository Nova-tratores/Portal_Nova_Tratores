import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/pos/supabase';
import { TBL_GARANTIAS } from '@/lib/garantias/constants';
import { registrarEvento } from '@/lib/garantias/server';
import { faturarOSGarantiaNoOmie } from '@/lib/garantias/omie-faturamento';

// POST /api/garantias/[id]/refaturar-omie
// Reaplica manualmente o padrão de garantia na OS que já está no Omie
// (categoria Serv Prest Garantia, sem conta a receber, conta INTERNO,
// contrato/projeto {Montadora}-pgo, recibo, departamento Garantias 100%).
// Pra consertar OS que foi enviada como comum antes da garantia existir,
// ou cujo envio saiu sem o padrão.
// body: { ator?: string }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const ator = String(body.ator || 'Garantista');

  const { data: garantia } = await supabase
    .from(TBL_GARANTIAS)
    .select('id, numero, id_ordem, status, montadora:garantia_montadoras(nome)')
    .eq('id', id)
    .maybeSingle();
  if (!garantia) return NextResponse.json({ error: 'Garantia não encontrada.' }, { status: 404 });
  if (!garantia.id_ordem) return NextResponse.json({ error: 'Garantia sem OS vinculada.' }, { status: 400 });
  if (garantia.status === 'rejeitada') {
    return NextResponse.json(
      { error: 'Garantia rejeitada não fatura como garantia no Omie (a OS segue como cobrança normal).' },
      { status: 400 },
    );
  }

  const montadoraNome = (garantia.montadora as { nome?: string } | null)?.nome || null;
  const resp = await faturarOSGarantiaNoOmie({
    idOrdem: String(garantia.id_ordem),
    montadoraNome,
    garantiaId: id,
  });

  if (resp.pendenteEnvio) {
    return NextResponse.json(
      { error: 'A OS ainda não foi enviada ao Omie — feche-a no POS que ela já sai no padrão de garantia.' },
      { status: 400 },
    );
  }

  await registrarEvento(id, {
    tipo: resp.ok ? 'omie_faturada_garantia' : 'omie_faturamento_erro',
    ator,
    detalhe: resp.ok
      ? `Padrão de garantia reaplicado na OS no Omie${montadoraNome ? ` (contrato/projeto ${montadoraNome}-pgo)` : ''} — pedido manual.`
      : `Falha ao reaplicar padrão de garantia no Omie: ${resp.motivo}`,
  });

  if (!resp.ok) return NextResponse.json({ error: resp.motivo || 'Falha no Omie.' }, { status: 502 });
  return NextResponse.json({ ok: true, nCodOS: resp.nCodOS });
}
