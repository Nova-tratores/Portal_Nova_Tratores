import { NextRequest, NextResponse } from 'next/server';
import { parseConta, CONTA_DEFAULT } from '@/lib/ajustes/conta';
import { omieRequest, obterUrlDanfe } from '@/lib/ajustes/omie';

export const dynamic = 'force-dynamic';

// URL do DANFE (PDF) de um movimento. Query: conta, nCodNF (idDoc do movimento),
// numero (nº da NF, fallback via ConsultarNF), tipo=S|E (saída/entrada, p/ o
// fallback), serie (default 1).
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const conta = parseConta(sp.get('conta')) ?? CONTA_DEFAULT;
  const nCodNF = Number(sp.get('nCodNF')) || null;
  const numero = (sp.get('numero') || '').trim();
  const tipo = sp.get('tipo') === 'E' ? 'E' : 'S';
  const serie = sp.get('serie') || '1';
  try {
    // 1) tentativa direta: o idDoc do movimento costuma ser o nCodNF
    if (nCodNF) {
      try {
        const r = await obterUrlDanfe(conta, nCodNF);
        return NextResponse.json({ url: r.url });
      } catch { /* cai pro fallback por número */ }
    }
    // 2) fallback: resolve o nCodNF pelo número da NF (padrão lib/estoque/notas-entrada)
    if (numero) {
      const consulta = await omieRequest('/produtos/nfconsultar/', 'ConsultarNF', {
        nNF: numero, serie, tpNF: tipo === 'E' ? '0' : '1', tpAmb: '1',
      }, conta) as { nCodNF?: number; nfCadastro?: { nCodNF?: number } };
      const cod = consulta?.nCodNF || consulta?.nfCadastro?.nCodNF;
      if (cod) {
        const r = await obterUrlDanfe(conta, cod);
        return NextResponse.json({ url: r.url });
      }
    }
    return NextResponse.json({ erro: 'DANFE não disponível para este documento' }, { status: 404 });
  } catch (e) {
    return NextResponse.json({ erro: (e as { faultstring?: string }).faultstring || (e as Error).message }, { status: 500 });
  }
}
