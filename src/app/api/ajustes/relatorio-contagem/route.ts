/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { parseConta, CONTA_DEFAULT } from '@/lib/ajustes/conta';
import { lerStatusNegativos } from '@/lib/ajustes/negativos';

export const dynamic = 'force-dynamic';

// Relatório de contagem física a partir dos produtos com estoque negativo já
// varridos (lê o resultado do scan worker-ready). ?codigos= filtra; retorna JSON
// (o front monta a tabela/CSV). Portado de coletarProdutosParaContagem (server.js).
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const conta = parseConta(sp.get('conta')) ?? CONTA_DEFAULT;
  const codigos = String(sp.get('codigos') || '').split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
  try {
    const res = await lerStatusNegativos(conta);
    const fonte: any[] = Array.isArray(res?.produtos) ? res.produtos : [];
    const set = new Set(codigos);
    const linhas: any[] = [];
    for (const p of fonte) {
      const cod = String(p.codigoProduto != null ? p.codigoProduto : p.codigo || p.key);
      if (set.size && !set.has(cod) && !set.has(String(p.key))) continue;
      const locais = (p.porLocal || []).filter((l: any) => Number(l.saldo) !== 0);
      const base = {
        codigoProduto: p.codigoProduto,
        codigo: p.codigo || null,
        codigoIntegracao: p.codigoIntegracao || null,
        descricao: p.descricao || null,
        suspeitaEmpresaErrada: !!p.suspeitaEmpresaErrada,
        outraEmpresa: p.outraEmpresa || null,
      };
      if (locais.length === 0) {
        linhas.push({ ...base, localNome: '(consolidado)', saldoSistema: p.saldoTotal, cmc: p.cmcAtual });
      } else {
        for (const l of locais) linhas.push({ ...base, localNome: l.localNome, saldoSistema: l.saldo, cmc: l.cmc });
      }
    }
    return NextResponse.json({ conta, contaLabel: conta, total: linhas.length, linhas, semVarredura: !res?.produtos });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
