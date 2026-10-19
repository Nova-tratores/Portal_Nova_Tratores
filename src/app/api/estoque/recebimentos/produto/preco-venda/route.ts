import { NextRequest, NextResponse } from 'next/server';
import { parseConta } from '@/lib/estoque/conta';
import { alterarPrecoVenda } from '@/lib/estoque/recebimentos';
import { protegerRota } from '@/lib/ajustes/permissao-server';

export const dynamic = 'force-dynamic';

// Mesmo gate da tela /estoque/recebimentos-omie (pode('estoque','recebimentos-omie')).
const OPCOES = [{ modulo: 'estoque', acao: 'recebimentos-omie' }];
export const maxDuration = 60;

// Atualiza preço de venda no Omie (AlterarProduto) + espelha no Supabase.
// Portado de POST /api/produto/preco-venda (server.js:7820), restrito ao popup
// de recebimentos (recebe codigo_produto = id interno Omie).
export async function POST(req: NextRequest) {
  const g = await protegerRota(req, OPCOES);
  if (g.resposta) return g.resposta;
  const conta = parseConta(req.nextUrl.searchParams.get('conta'));
  try {
    const body = (await req.json().catch(() => ({}))) as { codigo_produto?: string | number; valor_venda?: string | number };
    const idProd = parseInt(String(body.codigo_produto ?? ''), 10);
    const valor = parseFloat(String(body.valor_venda ?? ''));
    if (!idProd) return NextResponse.json({ erro: 'codigo_produto obrigatorio' }, { status: 400 });
    if (isNaN(valor) || valor < 0) return NextResponse.json({ erro: 'valor_venda invalido' }, { status: 400 });
    await alterarPrecoVenda(idProd, valor, conta);
    return NextResponse.json({ ok: true, valor_venda: valor });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
