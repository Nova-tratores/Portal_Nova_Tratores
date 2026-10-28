/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { parseConta } from '@/lib/ajustes/conta';
import { baixarTitulo } from '@/lib/ajustes/contas';
import { baixaAntecipadaSuspeita } from '@/lib/ajustes/boletos-fornecedor';
import { protegerRota } from '@/lib/ajustes/permissao-server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// WRITE no Omie: baixa (marca pago/recebido) UM título (LancarPagamento/Recebimento).
export async function POST(req: NextRequest) {
  // Onda 0: exige login e permissao; o autor sai do login, nao do corpo.
  const acesso = await protegerRota(req, [{ modulo: 'ajustes', acao: 'baixa-contas' }]);
  if (acesso.resposta) return acesso.resposta;
  try {
    const b = (await req.json().catch(() => ({}))) as any;
    const conta = parseConta(b.conta);
    if (!conta) return NextResponse.json({ ok: false, erro: 'informe conta (NOVA/CASTRO)' }, { status: 400 });
    if (b.codigoLancamento == null) return NextResponse.json({ ok: false, erro: 'informe codigoLancamento' }, { status: 400 });
    if (b.codigoContaCorrente == null || String(b.codigoContaCorrente).trim() === '')
      return NextResponse.json({ ok: false, erro: 'informe a conta corrente' }, { status: 400 });
    const valor = Number(b.valor);
    if (!(valor > 0)) return NextResponse.json({ ok: false, erro: 'informe um valor maior que zero' }, { status: 400 });
    // Duplicata de NF baixada bem antes do vencimento = o padrão antigo do "boleto
    // agrupado" (baixa fictícia). Pode ter motivo legítimo (desconto, pagamento
    // antecipado), então não bloqueia: exige o motivo na observação.
    if (b.vencimento && baixaAntecipadaSuspeita(String(b.data || '').slice(0, 10) || new Date().toISOString().slice(0, 10), String(b.vencimento).slice(0, 10), b.idOrigem || null)
      && String(b.observacao || '').trim().length < 5) {
      return NextResponse.json({ ok: false, erro: 'baixa mais de 7 dias antes do vencimento de uma duplicata de NF: informe o motivo na observação (se for boleto agrupado do fornecedor, registre o boleto em vez de baixar)', antecipada: true }, { status: 400 });
    }
    const out = await baixarTitulo({ ...b, conta, valor });
    if (!out.ok) return NextResponse.json({ ok: false, erro: out.erro }, { status: 502 });
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ ok: false, erro: (e as Error).message }, { status: 500 });
  }
}
