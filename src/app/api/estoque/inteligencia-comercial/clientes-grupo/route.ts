import { NextRequest, NextResponse } from 'next/server';
import { parseConta } from '@/lib/estoque/conta';
import { clientesPorGrupo } from '@/lib/estoque/inteligencia-comercial';
import { protegerRota } from '@/lib/ajustes/permissao-server';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// Clientes que compram um GRUPO de peça (para o expand da aba "Sugestões por produto").
// GET ?tipo=<Tipo>&conta=  OU  ?produto=<codigo_produto>&conta=  (opcional &mes=&lead=)
export async function GET(req: NextRequest) {
  // Mesma regra da tela /estoque/inteligencia-comercial: pode('estoque', 'inteligencia-comercial').
  const g = await protegerRota(req, [{ modulo: 'estoque', acao: 'inteligencia-comercial' }]);
  if (g.resposta) return g.resposta;
  const conta = parseConta(req.nextUrl.searchParams.get('conta'));
  const sp = req.nextUrl.searchParams;
  const tipo = sp.get('tipo') || undefined;
  const produto = sp.get('produto') || undefined;
  if (!tipo && !produto) return NextResponse.json({ erro: 'informe tipo ou produto' }, { status: 400 });
  const mes = sp.get('mes') ? Number(sp.get('mes')) : undefined;
  const lead = sp.get('lead') ? Number(sp.get('lead')) : undefined;
  try {
    return NextResponse.json(await clientesPorGrupo(conta, { tipo, produto }, { mes, lead }));
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
