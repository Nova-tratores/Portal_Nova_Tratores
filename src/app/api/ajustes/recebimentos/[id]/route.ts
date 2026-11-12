import { NextRequest, NextResponse } from 'next/server';
import { parseConta } from '@/lib/ajustes/conta';
import { protegerRota } from '@/lib/ajustes/permissao-server';
import { analisarUmRecebimento } from '@/lib/ajustes/analise';
import { enriquecerResponsaveis } from '@/lib/ajustes/recebimentos';
import { ACESSO_RECEBIMENTOS } from '@/lib/ajustes/recebimentos-espelho';
import { supabase } from '@/lib/ajustes/supabase';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// GET ?conta= — UMA nota, ao vivo na Omie (ConsultarRecebimento), com o impacto no
// CMC quando tem sinal de garantia. É o que a tela única chama ao abrir "Dar entrada".
// Se a Omie diz que a nota já entrou (ou foi cancelada), acerta o espelho na hora.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await protegerRota(req, ACESSO_RECEBIMENTOS);
  if (g.resposta) return g.resposta;
  const conta = parseConta(req.nextUrl.searchParams.get('conta'));
  if (!conta) return NextResponse.json({ erro: 'Escolha NOVA ou CASTRO.' }, { status: 400 });
  const { id } = await params;
  const idReceb = Number(id);
  if (!Number.isFinite(idReceb) || idReceb <= 0) return NextResponse.json({ erro: 'id invalido' }, { status: 400 });
  const low = conta.toLowerCase();
  try {
    const { data: meta } = await supabase
      .from('recebimento_meta').select('tipo,tipo_manual').eq('conta_omie', low).eq('id_receb', idReceb).maybeSingle();
    const tipoManual = meta && (meta as { tipo_manual?: boolean }).tipo_manual ? (meta as { tipo?: string }).tipo || null : null;
    const r = await analisarUmRecebimento(conta, idReceb, tipoManual);
    await enriquecerResponsaveis(conta, [r]);
    if (r.recebido || r.cancelada) {
      await supabase.from('recebimentos_nfe')
        .update(r.recebido ? { status: 'Recebida', etapa: '60' } : { status: 'Cancelada' })
        .eq('conta_omie', low).eq('id_receb', idReceb);
    }
    return NextResponse.json({ recebimento: r });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 502 });
  }
}
