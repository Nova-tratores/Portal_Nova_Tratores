import { NextRequest, NextResponse } from 'next/server';
import { parseConta } from '@/lib/estoque/conta';
import { reabrirRecebimento } from '@/lib/estoque/recebimentos';
import { protegerRota } from '@/lib/ajustes/permissao-server';
import { ACESSO_RECEBIMENTOS } from '@/lib/ajustes/recebimentos-espelho';
import { logEntradaReceb } from '@/lib/ajustes/recebimentos';
import { registrarAuditLog } from '@/lib/server/audit-notify';
import { supabase } from '@/lib/ajustes/supabase';
import { planoReversao, reverterComPagamentos } from '@/lib/estoque/reversao-server';
import { notificarUsuario } from '@/lib/pecas/unidades-server';

export const dynamic = 'force-dynamic';

// Tela única /estoque/recebimentos (Recebimentos ou Recebimentos (Omie)).
const OPCOES = ACESSO_RECEBIMENTOS;
// Nota COM pagamento: além de Recebimentos, precisa de Baixar contas (decisão 13/11/2026).
const BAIXA_CONTAS = [{ modulo: 'financeiro', acao: 'baixa-contas' }, { modulo: 'ajustes', acao: 'baixa-contas' }];
export const maxDuration = 120;

async function contaDaNota(contaParam: string | null, idReceb: number) {
  const conta = parseConta(contaParam);
  let q = supabase.from('recebimentos_nfe')
    .select('conta_omie,numero_nfe,serie_nfe,fornecedor_razao,fornecedor,total_nfe,emissao_nfe,status,recebido_em')
    .eq('id_receb', idReceb);
  if (conta) q = q.eq('conta_omie', conta.toLowerCase());
  const { data } = await q.maybeSingle();
  const n = (data || {}) as Record<string, string | number | null>;
  const up = String(n.conta_omie || conta || '').toUpperCase();
  return { conta, contaNota: (up === 'CASTRO' ? 'CASTRO' : up === 'NOVA' ? 'NOVA' : null) as 'NOVA' | 'CASTRO' | null, n };
}

// GET: o que a reversão vai fazer (contas a pagar e pagamentos da nota, lidos na Omie agora).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await protegerRota(req, OPCOES);
  if (g.resposta) return g.resposta;
  const { id } = await params;
  const idReceb = parseInt(id, 10);
  const { contaNota } = await contaDaNota(req.nextUrl.searchParams.get('conta'), idReceb);
  if (!contaNota) return NextResponse.json({ erro: 'Nota não encontrada.' }, { status: 404 });
  try {
    const plano = await planoReversao(contaNota, idReceb);
    return NextResponse.json(plano);
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 502 });
  }
}

// POST { motivo? }: Reabrir. ESCREVE NA OMIE. Sem pagamento = ReverterRecebimento direto.
// Com pagamento = motivo obrigatório + Baixar contas; cancela os pagamentos, reverte e guarda
// a ficha para relançar depois (tudo ou nada). Toda tentativa vai ao audit_log.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await protegerRota(req, OPCOES);
  if (g.resposta) return g.resposta;
  try {
    const { id } = await params;
    const idReceb = parseInt(id, 10);
    const body = (await req.json().catch(() => ({}))) as { motivo?: string };
    const motivo = String(body.motivo || '').trim().slice(0, 300);
    const { conta, contaNota, n } = await contaDaNota(req.nextUrl.searchParams.get('conta'), idReceb);
    if (!contaNota) return NextResponse.json({ erro: 'Nota não encontrada.' }, { status: 404 });
    const numero = String(n.numero_nfe || '').replace(/^0+(?=\d)/, '') || String(idReceb);
    const quem = g.user.nome || g.user.email || 'portal';

    const plano = await planoReversao(contaNota, idReceb);
    const comPagamento = plano.pagamentos.length > 0;
    if (comPagamento) {
      const gb = await protegerRota(req, BAIXA_CONTAS);
      if (gb.resposta) return NextResponse.json({ erro: 'Esta nota tem pagamento lançado. Para reverter, é preciso ter a permissão "Baixar contas" do Financeiro.' }, { status: 403 });
      if (motivo.length < 5) return NextResponse.json({ erro: 'Escreva o motivo da reversão (a nota tem pagamento lançado).' }, { status: 400 });
    }

    let r: { ok?: boolean; erro?: string; naoEncontrado?: boolean; migracaoFaltando?: boolean; fichaId?: string; pagamentos?: number };
    if (comPagamento) r = await reverterComPagamentos({ conta: contaNota, idReceb, motivo, userId: g.user.id, userNome: quem });
    else r = await reabrirRecebimento(conta, idReceb);

    const detalhes = {
      conta: contaNota, id_receb: idReceb, numero_nfe: n.numero_nfe ?? null, serie: n.serie_nfe ?? null,
      fornecedor: n.fornecedor_razao || n.fornecedor || null, valor: n.total_nfe ?? null, emissao: n.emissao_nfe ?? null,
      status_antes: n.status ?? null, recebido_em: n.recebido_em ?? null, motivo: motivo || null,
      pagamentos_cancelados: comPagamento ? plano.pagamentos.map((p) => ({ data: p.data, valor: p.valor, conciliado: !!p.conciliadoEm })) : [],
      ficha_id: r.fichaId || null, ok: !!r.ok, erro: r.erro || null,
    };
    await registrarAuditLog({
      userId: g.user.id, userName: quem, sistema: 'recebimentos',
      acao: r.ok ? 'reverter_recebimento' : 'reverter_recebimento_recusado',
      entidade: 'recebimento_nfe', entidadeId: String(idReceb),
      entidadeLabel: `NF ${numero}${detalhes.fornecedor ? ` · ${detalhes.fornecedor}` : ''} (${contaNota})`,
      detalhes,
    });
    if (r.ok) {
      logEntradaReceb({
        conta: contaNota, idReceb, numeroNFe: (n.numero_nfe as string) ?? null, acao: 'reversao',
        userId: g.user.id, userNome: quem, payload: { motivo: motivo || null },
        resultado: { statusAntes: n.status ?? null, recebidoEm: n.recebido_em ?? null, pagamentosCancelados: detalhes.pagamentos_cancelados.length },
      });
      if (comPagamento) {
        const total = plano.pagamentos.reduce((s, p) => s + p.valor, 0);
        await notificarUsuario(g.user.id, {
          titulo: `Relançar ${plano.pagamentos.length} pagamento(s) da NF ${numero}`,
          descricao: `Você reverteu a NF ${numero} (${contaNota}) e o portal cancelou ${plano.pagamentos.length} pagamento(s) (R$ ${total.toFixed(2).replace('.', ',')}). Depois de dar entrada de novo, relance pela tela de Recebimentos.`,
          link: `/estoque/recebimentos?conta=${contaNota}&nota=${idReceb}`,
        });
      }
    }

    if (r.naoEncontrado) return NextResponse.json({ erro: r.erro }, { status: 404 });
    if (r.migracaoFaltando) return NextResponse.json({ erro: r.erro, migracaoFaltando: true }, { status: 503 });
    if (r.erro) return NextResponse.json({ erro: r.erro });
    return NextResponse.json({ ...r, pagamentosCancelados: comPagamento ? plano.pagamentos.length : 0 });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
