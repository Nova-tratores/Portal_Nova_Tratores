// POST → consulta individual (ConsultarProduto) de um punhado de produtos, para
// preencher os campos que o cache local NÃO tem.
//
// Por que existe: o ListarProdutos — fonte do cron que alimenta o cache — não
// devolve `modalidade_icms`. Só a consulta individual devolve. Como é 1 chamada
// Omie por produto, isto roda sob demanda, só nas linhas visíveis na tela.
import { NextResponse } from 'next/server';
import { autenticar } from '@/lib/auth/server';
import { omieProdutoCall, pausa, PAUSA_MS, cestDe, origemDe, contaDaQuery, type ProdutoOmie } from '@/lib/omie-massa/omie';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const LIMITE = 300; // teto de segurança (a grade mostra 200 por página)

export async function POST(req: Request) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const permitido = auth.isAdmin || ['ajustes', 'ajustes:omie-massa', 'omie-massa'].some((m) => auth.modulos.includes(m));
  if (!permitido) return NextResponse.json({ error: 'Sem permissão (ajustes:omie-massa)' }, { status: 403 });

  const body = await req.json().catch(() => null) as { conta?: string; codigos?: number[] } | null;
  const conta = contaDaQuery(body?.conta);
  const codigos = (body?.codigos || []).map(Number).filter(Boolean);
  if (!codigos.length) return NextResponse.json({ error: 'Nenhum produto informado' }, { status: 400 });

  const alvo = codigos.slice(0, LIMITE);
  const detalhes: Array<Record<string, string | number>> = [];
  const falhas: number[] = [];

  for (const codigo_produto of alvo) {
    try {
      const o = await omieProdutoCall<ProdutoOmie>('ConsultarProduto', { codigo_produto }, conta);
      detalhes.push({
        codigo_produto,
        modalidade_icms: o.modalidade_icms ?? '',
        // aproveita a consulta para devolver o estado fresco dos aninhados
        cest: cestDe(o), origem_mercadoria: origemDe(o),
        ncm: o.ncm ?? '', tipoItem: o.tipoItem ?? '', cfop: o.cfop ?? '',
        cst_icms: o.cst_icms ?? '', csosn_icms: o.csosn_icms ?? '',
      });
    } catch {
      falhas.push(codigo_produto); // produto sem cadastro consultável — segue
    }
    await pausa(PAUSA_MS);
  }

  return NextResponse.json({
    detalhes,
    falhas,
    // avisa quando a seleção passou do teto, em vez de truncar em silêncio
    truncado: codigos.length > LIMITE ? codigos.length - LIMITE : 0,
  });
}
