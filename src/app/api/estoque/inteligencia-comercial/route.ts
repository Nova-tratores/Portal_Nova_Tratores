import { NextRequest, NextResponse } from 'next/server';
import { parseConta } from '@/lib/estoque/conta';
import { comprasPorProduto, clientesResumo, oportunidadesRFM, exportarOportunidadesClientes, sugestoesSazonais, type GrupoFamilia } from '@/lib/estoque/inteligencia-comercial';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// Agregados do módulo Inteligência Comercial.
// ?aba=compras|clientes|oportunidades|export-oportunidades|sugestoes-sazonais
//   (+ conta; clientes aceita &grupo=; sugestoes-sazonais aceita &mes=&lead=).
export async function GET(req: NextRequest) {
  const conta = parseConta(req.nextUrl.searchParams.get('conta'));
  const aba = (req.nextUrl.searchParams.get('aba') || 'compras').toLowerCase();
  try {
    if (aba === 'clientes') {
      const g = (req.nextUrl.searchParams.get('grupo') || '') as GrupoFamilia;
      const grupo: GrupoFamilia = g === 'pecas' || g === 'maquinas' ? g : '';
      return NextResponse.json(await clientesResumo(conta, grupo));
    }
    if (aba === 'oportunidades') return NextResponse.json(await oportunidadesRFM(conta));
    if (aba === 'export-oportunidades') return NextResponse.json(await exportarOportunidadesClientes(conta));
    if (aba === 'sugestoes-sazonais') {
      const sp = req.nextUrl.searchParams;
      const mes = sp.get('mes') ? Number(sp.get('mes')) : undefined;
      const lead = sp.get('lead') ? Number(sp.get('lead')) : undefined;
      return NextResponse.json(await sugestoesSazonais(conta, { mes, lead }));
    }
    return NextResponse.json(await comprasPorProduto(conta));
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
