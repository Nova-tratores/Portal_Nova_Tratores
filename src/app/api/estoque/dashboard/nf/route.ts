import { NextRequest, NextResponse } from 'next/server';
import { parseConta, CONTA_DEFAULT } from '@/lib/ajustes/conta';
import { consultarPedido, normalizarPedido } from '@/lib/ajustes/omie';
import { buscarNotasPorIdPedido, buscarNotasPorClienteData } from '@/lib/ajustes/notas';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Resolve a(s) NF-e de uma VENDA do dashboard. A linha da venda só tem o número
// HUMANO do pedido; a NF guarda o id INTERNO (n_id_pedido). Então: número humano
// -> ConsultarPedido (Omie) -> idPedido -> notas por n_id_pedido. Se não fechar
// (NF avulsa, pedido excluído, backfill incompleto), cai no fallback cliente+data.
// Retorna { candidatos: [{ numero, nCodNF, tipo, dataEmissao, valorNF, cancelada }], via }.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const conta = parseConta(sp.get('conta')) ?? CONTA_DEFAULT;
  const numeroPedido = (sp.get('numero_pedido') || '').trim();
  const codigoCliente = (sp.get('codigo_cliente') || '').trim();
  const data = (sp.get('data') || '').trim(); // DD/MM/YYYY ou YYYY-MM-DD

  try {
    // 1) Caminho exato: número do pedido -> id interno -> notas por n_id_pedido.
    if (numeroPedido) {
      let idPedido: number | null = null;
      try {
        const p = normalizarPedido(await consultarPedido(conta, { numeroPedido }));
        idPedido = p?.idPedido != null ? Number(p.idPedido) || null : null;
      } catch {
        idPedido = null; // pedido não encontrado nessa conta -> tenta fallback
      }
      if (idPedido) {
        const candidatos = await buscarNotasPorIdPedido(conta, idPedido);
        if (candidatos.length) return NextResponse.json({ candidatos, via: 'pedido' });
      }
    }

    // 2) Fallback: cliente + janela de data (a emissão da NF ~ data do pedido).
    if (codigoCliente && data) {
      const candidatos = await buscarNotasPorClienteData(conta, codigoCliente, data);
      return NextResponse.json({ candidatos, via: 'cliente_data' });
    }

    return NextResponse.json({ candidatos: [], via: 'nenhum' });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
