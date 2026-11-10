import { NextRequest, NextResponse } from 'next/server';
import { protegerRota } from '@/lib/ajustes/permissao-server';
import { opcoesLocacao, type OpcoesLocacao } from '@/lib/ajustes/localizacao';
import { getContasOmie } from '@/lib/ajustes/conta';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Valores permitidos na Omie para Prateleira / Andar / Caixa, por empresa. A locação
// é lista fixa na Omie: o modal de alocar mostra só estas opções (antes era texto
// livre e "h" ou caixa "4" eram recusados). Mesmo acesso do painel "A alocar" e da
// tela de Localização física.
export async function GET(req: NextRequest) {
  const g = await protegerRota(req, [
    { modulo: 'ajustes', acao: 'caracteristicas' },
    { modulo: 'ajustes', acao: 'localizacao' },
  ]);
  if (g.resposta) return g.resposta;
  const porEmpresa: Record<string, OpcoesLocacao> = {};
  const erros: string[] = [];
  for (const c of getContasOmie()) {
    try { porEmpresa[c.label.toUpperCase()] = await opcoesLocacao(c.label); }
    catch (e) { erros.push(`${c.label}: ${(e as Error).message}`); }
  }
  if (!Object.keys(porEmpresa).length) return NextResponse.json({ erro: erros.join(' · ') || 'Omie indisponível' }, { status: 502 });
  return NextResponse.json({ ok: true, porEmpresa, erros });
}
