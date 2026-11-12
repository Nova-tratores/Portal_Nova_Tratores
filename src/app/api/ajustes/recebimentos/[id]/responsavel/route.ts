import { NextRequest, NextResponse } from 'next/server';
import { parseConta, CONTA_DEFAULT } from '@/lib/ajustes/conta';
import { setResponsavelReceb } from '@/lib/ajustes/recebimentos';
import { protegerRota } from '@/lib/ajustes/permissao-server';
import { ACESSO_RECEBIMENTOS } from '@/lib/ajustes/recebimentos-espelho';
import { supabase } from '@/lib/ajustes/supabase';
import { notificarUsuario } from '@/lib/pecas/unidades-server';

export const dynamic = 'force-dynamic';

// Transferencia de responsavel de um recebimento -> recebimento_meta
// (responsavel_user_id = financeiro_usu.id; responsavel = nome p/ exibicao).
// body: { userId: string|null, userNome: string|null } = o NOVO responsavel (nao e' autoria).
// Quem recebe a nota (se não for quem transferiu) é avisado no sino.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await protegerRota(req, ACESSO_RECEBIMENTOS);
  if (g.resposta) return g.resposta;
  const conta = parseConta(req.nextUrl.searchParams.get('conta')) ?? CONTA_DEFAULT;
  try {
    const { id } = await params;
    const idReceb = parseInt(id, 10);
    const body = (await req.json().catch(() => ({}))) as { userId?: string | null; userNome?: string | null };
    const userId = body.userId ?? null;
    await setResponsavelReceb(conta, idReceb, userId, body.userNome ?? null);
    if (userId && userId !== g.user.id) {
      const { data: nf } = await supabase
        .from('recebimentos_nfe').select('numero_nfe,fornecedor,total_nfe')
        .eq('conta_omie', conta.toLowerCase()).eq('id_receb', idReceb).maybeSingle();
      const n = (nf || {}) as { numero_nfe?: string; fornecedor?: string; total_nfe?: number };
      const numero = String(n.numero_nfe || '').replace(/^0+(?=\d)/, '') || String(idReceb);
      const valor = n.total_nfe != null ? ` · ${Number(n.total_nfe).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}` : '';
      await notificarUsuario(userId, {
        titulo: `Nota de entrada para você: NF ${numero}`,
        descricao: `${g.user.nome || 'Alguém'} passou para você a NF ${numero}${n.fornecedor ? ` de ${n.fornecedor}` : ''} (${conta})${valor}.`,
        link: `/estoque/recebimentos?conta=${conta}&nota=${idReceb}`,
      });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, erro: (e as Error).message }, { status: 500 });
  }
}
