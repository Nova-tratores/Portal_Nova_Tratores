// Lista unificada de notas fiscais (entrada + saída) do cache + cobertura + TOTAL dos filtros.
// Permissão: financeiro:notas (ou módulo financeiro inteiro / admin).
// Filtros: abas/período/busca (`q` + `campo`) + filtros do cabeçalho (f_cat, f_num, f_parte,
// f_ped, f_maq, f_vmin, f_vmax, situacao) — regras em lib/notas/filtros-relatorios.ts.
// Migrations opcionais (vínculos, categoria, numero_n) ausentes: a consulta cai para o que existe.
import { NextRequest, NextResponse } from 'next/server';
import { protegerRota } from '@/lib/ajustes/permissao-server';
import { permite } from '@/lib/permissoes/explicitas';
import { cobertura, migracaoFaltando, ultimaRodada } from '@/lib/notas/cache-docs';
import { podeVerEntrada } from '@/lib/notas/cache-regras';
import { somar, type LinhaSoma } from '@/lib/notas/filtros-relatorios';
import { buscarTodasNotas, colsSoma, comFallback, lerParamsNotas, montarConsultaNotas, ordenar } from '@/lib/notas/consulta-server';

export const dynamic = 'force-dynamic';

type RespLista = { data: unknown[] | null; count: number | null; error: { message?: string } | null };

const POR_PAGINA = 50;
const TETO_SOMA = 60000; // acima disso o total não é calculado (filtre mais)

export async function GET(req: NextRequest) {
  const guarda = await protegerRota(req, [{ modulo: 'financeiro', acao: 'notas' }]);
  if (guarda.resposta) return guarda.resposta;
  // nota de ENTRADA só para quem tem Recebimentos (o mesmo gate de /estoque/recebimentos)
  const podeEntrada = podeVerEntrada(guarda.user.isAdmin, guarda.user.modulos);

  const sp = req.nextUrl.searchParams;
  const p = lerParamsNotas(sp, podeEntrada);
  const pagina = Math.max(1, parseInt(sp.get('pagina') || '1', 10) || 1);
  const offset = (pagina - 1) * POR_PAGINA;

  try {
    const [lista, cob, rodada] = await Promise.all([
      comFallback<RespLista>((f) => ordenar(montarConsultaNotas(p, f, { contar: true }), p, f).range(offset, offset + POR_PAGINA - 1)),
      cobertura(p.conta || undefined, { semEntrada: !podeEntrada }),
      ultimaRodada(),
    ]);
    const { res, faltando } = lista;
    if (res.error) throw new Error(res.error.message);
    const total = res.count || 0;

    // Total dos filtros (todas as páginas): soma o valor de cada nota do filtro.
    let soma = null;
    let somaErro: string | null = null;
    if (total <= TETO_SOMA) {
      try {
        const todas = total <= POR_PAGINA && pagina === 1
          ? { linhas: (res.data || []) as LinhaSoma[] }
          : await buscarTodasNotas<LinhaSoma>(p, faltando, colsSoma(faltando), TETO_SOMA);
        soma = somar(todas.linhas);
      } catch (e) { somaErro = (e as Error).message; }
    } else somaErro = `Mais de ${TETO_SOMA.toLocaleString('pt-BR')} notas no filtro — filtre mais para ver o total.`;

    return NextResponse.json({
      notas: res.data || [],
      total,
      pagina,
      porPagina: POR_PAGINA,
      totalPaginas: Math.max(1, Math.ceil(total / POR_PAGINA)),
      soma,
      somaErro,
      cobertura: cob,
      ultimaRodada: rodada,
      podeIndexar: guarda.user.isAdmin,
      podeEntrada,
      podeRelatorios: permite(guarda.user.modulos, guarda.user.isAdmin, 'financeiro', 'notas-relatorios'),
      campo: p.campo,
      ordem: p.ordem,
      vinculosFaltando: faltando.semVinculos,
      categoriaFaltando: faltando.semCategoria && !faltando.semVinculos,
      numeroComoTexto: faltando.semNumeroN,
    });
  } catch (e) {
    const msg = (e as Error).message || '';
    if (migracaoFaltando(msg)) {
      return NextResponse.json({ erro: 'Cache de notas ainda não instalado no banco (aplicar sql/notas-fiscais-cache.sql).', migracaoFaltando: true }, { status: 503 });
    }
    return NextResponse.json({ erro: msg }, { status: 500 });
  }
}
