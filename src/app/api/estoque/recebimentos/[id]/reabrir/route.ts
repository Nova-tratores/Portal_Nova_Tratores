import { NextRequest, NextResponse } from 'next/server';
import { parseConta } from '@/lib/estoque/conta';
import { reabrirRecebimento } from '@/lib/estoque/recebimentos';
import { protegerRota } from '@/lib/ajustes/permissao-server';
import { ACESSO_RECEBIMENTOS } from '@/lib/ajustes/recebimentos-espelho';
import { logEntradaReceb } from '@/lib/ajustes/recebimentos';
import { registrarAuditLog } from '@/lib/server/audit-notify';
import { supabase } from '@/lib/ajustes/supabase';

export const dynamic = 'force-dynamic';

// Tela única /estoque/recebimentos (Recebimentos ou Recebimentos (Omie)).
const OPCOES = ACESSO_RECEBIMENTOS;
export const maxDuration = 60;

// Reabrir: ESCREVE NO OMIE (ReverterRecebimento). Conta derivada da linha.
// Portado de POST /api/recebimentos/:id/reabrir (server.js:7798).
// Toda tentativa vai para o audit_log (inclusive a que a Omie recusa); a que deu
// certo também para recebimento_entrada_log (aba "Entradas feitas").
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await protegerRota(req, OPCOES);
  if (g.resposta) return g.resposta;
  const conta = parseConta(req.nextUrl.searchParams.get('conta'));
  try {
    const { id } = await params;
    const idReceb = parseInt(id, 10);

    // a nota como estava antes de reabrir (para o registro)
    let nfq = supabase.from('recebimentos_nfe')
      .select('conta_omie,numero_nfe,serie_nfe,fornecedor_razao,fornecedor,total_nfe,emissao_nfe,status,recebido_em')
      .eq('id_receb', idReceb);
    if (conta) nfq = nfq.eq('conta_omie', conta.toLowerCase());
    const { data: nf } = await nfq.maybeSingle();
    const n = (nf || {}) as Record<string, string | number | null>;
    const contaNota = String(n.conta_omie || conta || '').toUpperCase();
    const numero = String(n.numero_nfe || '').replace(/^0+(?=\d)/, '') || String(idReceb);

    const r = await reabrirRecebimento(conta, idReceb);

    const quem = g.user.nome || g.user.email || 'portal';
    const detalhes = {
      conta: contaNota,
      id_receb: idReceb,
      numero_nfe: n.numero_nfe ?? null,
      serie: n.serie_nfe ?? null,
      fornecedor: n.fornecedor_razao || n.fornecedor || null,
      valor: n.total_nfe ?? null,
      emissao: n.emissao_nfe ?? null,
      status_antes: n.status ?? null,
      recebido_em: n.recebido_em ?? null,
      ok: !r.erro && !r.naoEncontrado,
      erro: r.erro || null,
    };
    await registrarAuditLog({
      userId: g.user.id,
      userName: quem,
      sistema: 'recebimentos',
      acao: detalhes.ok ? 'reverter_recebimento' : 'reverter_recebimento_recusado',
      entidade: 'recebimento_nfe',
      entidadeId: String(idReceb),
      entidadeLabel: `NF ${numero}${detalhes.fornecedor ? ` · ${detalhes.fornecedor}` : ''} (${contaNota})`,
      detalhes,
    });
    if (detalhes.ok && (contaNota === 'NOVA' || contaNota === 'CASTRO')) {
      logEntradaReceb({
        conta: contaNota, idReceb, numeroNFe: (n.numero_nfe as string) ?? null, acao: 'reversao',
        userId: g.user.id, userNome: quem, resultado: { statusAntes: n.status ?? null, recebidoEm: n.recebido_em ?? null },
      });
    }

    if (r.naoEncontrado) return NextResponse.json({ erro: r.erro }, { status: 404 });
    if (r.erro) return NextResponse.json({ erro: r.erro });
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
