import { NextResponse } from 'next/server';
import { popularComprasNaoImplementado } from '@/lib/estoque/admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// GET /api/popular-compras (server.js:4237). A pipeline de escrita de compras
// (NF-e fornecedor + contas a pagar + enriquecimento) ainda não foi portada
// para as libs do Portal — retorna erro claro até lá.
export async function GET() {
  return NextResponse.json(popularComprasNaoImplementado());
}
