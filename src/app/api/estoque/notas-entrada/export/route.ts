import { NextRequest, NextResponse } from 'next/server';
import { parseConta } from '@/lib/estoque/conta';
import { exportarItensNotasEntrada } from '@/lib/estoque/notas-entrada';

export const dynamic = 'force-dynamic';

// Escapa um campo p/ CSV separador ';' (aspas se contiver ; " ou quebra de linha).
function csvCell(v: unknown): string {
  const s = String(v ?? '');
  return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

// Exporta as notas de entrada item-a-item em CSV. Params iguais à listagem
// (conta, nf, fornecedor, descricao, mes?, ano?). Sem mes/ano => histórico inteiro.
export async function GET(req: NextRequest) {
  const conta = parseConta(req.nextUrl.searchParams.get('conta'));
  const sp = req.nextUrl.searchParams;
  const mes = sp.get('mes') ? parseInt(sp.get('mes')!) : undefined;
  const ano = sp.get('ano') ? parseInt(sp.get('ano')!) : undefined;
  const nf = sp.get('nf') || undefined;
  const fornecedor = sp.get('fornecedor') || undefined;
  const descricao = sp.get('descricao') || undefined;
  try {
    const linhas = await exportarItensNotasEntrada({ mes, ano, nf, fornecedor, descricao }, conta);
    const cabecalho = ['Conta', 'NF', 'Data', 'Cod. Omie (interno)', 'SKU fornecedor', 'Descrição', 'Qtd', 'Fornecedor', 'CNPJ Fornecedor'];
    const corpo = linhas.map((l) => [
      csvCell(l.conta), csvCell(l.numero_nf), csvCell(l.data_emissao),
      csvCell(l.cod_omie), csvCell(l.sku), csvCell(l.descricao),
      csvCell(l.quantidade), csvCell(l.fornecedor), csvCell(l.cnpj_fornecedor),
    ].join(';'));
    // BOM (﻿) p/ o Excel abrir com acentuação correta.
    const csv = '﻿' + [cabecalho.join(';'), ...corpo].join('\r\n');
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="notas-entrada-itens.csv"',
      },
    });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
