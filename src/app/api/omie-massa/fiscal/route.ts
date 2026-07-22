// Catálogo FISCAL dos produtos, lido do cache local (`produtos`) em vez de 1
// ConsultarProduto por linha — abre em ~1s em vez de minutos. O cache é
// preenchido pelo cron diário de produtos (src/lib/estoque/produtos-sync.ts).
//
// GET ?conta=NOVA|CASTRO
//     &ncm=&familia=&busca=&semCest=1&semOrigem=1&semNcm=1
//     &pagina=1&porPagina=200          → linhas paginadas p/ a grade
//     &agrupar=ncm                     → uma linha por NCM (divergências)
//     &formato=csv                     → catálogo inteiro em CSV
//
// A tributação da empresa é definida por NCM no Cenário Fiscal do Omie (que não
// tem API); os campos por produto abaixo são as EXCEÇÕES. Por isso a visão
// agrupada por NCM é a que mostra onde estão os erros de cadastro.
import { NextResponse } from 'next/server';
import { autenticar } from '@/lib/auth/server';
import { supabaseAdmin as supabase, norm } from '@/lib/omie-massa/supabase';
import { contaDaQuery, contaLow } from '@/lib/omie-massa/omie';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const COLUNAS = [
  'codigo_produto', 'codigo', 'descricao', 'familia_nome', 'estoque', 'inativo',
  'ncm', 'cest', 'origem_mercadoria', 'tipo_item', 'ean', 'unidade',
  'cfop', 'cst_icms', 'csosn_icms', 'aliquota_icms', 'red_base_icms',
  'motivo_deson_icms', 'per_icms_fcp', 'codigo_beneficio',
  'cst_pis', 'aliquota_pis', 'red_base_pis',
  'cst_cofins', 'aliquota_cofins', 'red_base_cofins',
  'cst_ibs_cbs', 'class_trib', 'cnpj_fabricante', 'indicador_escala', 'cupom_fiscal',
  'fiscal_atualizado_em',
].join(', ');

interface LinhaFiscal {
  codigo_produto: number | string;
  codigo?: string;
  descricao?: string;
  familia_nome?: string;
  ncm?: string | null;
  cest?: string | null;
  origem_mercadoria?: string | null;
  [k: string]: unknown;
}

async function checarAcesso(req: Request) {
  const auth = await autenticar(req);
  if (!auth) return { erro: NextResponse.json({ error: 'Não autenticado' }, { status: 401 }) };
  const permitido = auth.isAdmin || ['ajustes', 'ajustes:omie-massa', 'omie-massa'].some((m) => auth.modulos.includes(m));
  if (!permitido) return { erro: NextResponse.json({ error: 'Sem permissão (ajustes:omie-massa)' }, { status: 403 }) };
  return { auth };
}

/** Lê TODAS as linhas fiscais da conta. `.order()` explícito: sem ordenação
 *  estável o range() do PostgREST repete/pula linhas entre páginas. */
async function lerTodas(conta: string): Promise<LinhaFiscal[]> {
  const linhas: LinhaFiscal[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('produtos')
      .select(COLUNAS)
      .eq('conta_omie', conta).eq('arquivado', false)
      .order('codigo_produto')
      .range(from, from + 999);
    if (error) throw new Error(`produtos: ${error.message}`);
    linhas.push(...((data || []) as unknown as LinhaFiscal[]));
    if (!data || data.length < 1000) break;
  }
  return linhas;
}

const vazio = (v: unknown) => String(v ?? '').trim() === '';

function aplicarFiltros(linhas: LinhaFiscal[], q: URLSearchParams): LinhaFiscal[] {
  const ncm = q.get('ncm')?.trim() || '';
  const familia = q.get('familia')?.trim() || '';
  const busca = q.get('busca')?.trim() || '';
  let out = linhas;
  if (ncm) out = out.filter((l) => String(l.ncm ?? '').startsWith(ncm));
  if (familia) {
    const alvo = norm(familia);
    out = out.filter((l) => norm(String(l.familia_nome ?? '')).includes(alvo));
  }
  if (busca) {
    const alvo = norm(busca);
    out = out.filter((l) => norm(`${l.codigo ?? ''} ${l.descricao ?? ''}`).includes(alvo));
  }
  if (q.get('semCest') === '1') out = out.filter((l) => vazio(l.cest));
  if (q.get('semOrigem') === '1') out = out.filter((l) => vazio(l.origem_mercadoria));
  if (q.get('semNcm') === '1') out = out.filter((l) => vazio(l.ncm));
  return out;
}

/** Uma linha por NCM: quantos produtos, e quais CEST/Origem convivem nele.
 *  Mais de um valor no mesmo NCM = divergência de cadastro (provável erro). */
function agruparPorNcm(linhas: LinhaFiscal[]) {
  const mapa = new Map<string, { ncm: string; produtos: number; cests: Set<string>; origens: Set<string>; semCest: number; semOrigem: number }>();
  for (const l of linhas) {
    const ncm = String(l.ncm ?? '').trim() || '(sem NCM)';
    let g = mapa.get(ncm);
    if (!g) { g = { ncm, produtos: 0, cests: new Set(), origens: new Set(), semCest: 0, semOrigem: 0 }; mapa.set(ncm, g); }
    g.produtos++;
    const cest = String(l.cest ?? '').trim();
    const origem = String(l.origem_mercadoria ?? '').trim();
    if (cest) g.cests.add(cest); else g.semCest++;
    if (origem) g.origens.add(origem); else g.semOrigem++;
  }
  return [...mapa.values()]
    .map((g) => ({
      ncm: g.ncm,
      produtos: g.produtos,
      cests: [...g.cests].sort(),
      origens: [...g.origens].sort(),
      semCest: g.semCest,
      semOrigem: g.semOrigem,
      // divergente = o mesmo NCM tem mais de um CEST/Origem, ou tem uns
      // preenchidos e outros vazios.
      divergente: g.cests.size > 1 || g.origens.size > 1
        || (g.cests.size === 1 && g.semCest > 0) || (g.origens.size === 1 && g.semOrigem > 0),
    }))
    .sort((a, b) => Number(b.divergente) - Number(a.divergente) || b.produtos - a.produtos);
}

function paraCsv(linhas: LinhaFiscal[]): string {
  const cols = COLUNAS.split(', ');
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const out = [cols.join(';')];
  for (const l of linhas) out.push(cols.map((c) => esc(l[c])).join(';'));
  return '﻿' + out.join('\r\n'); // BOM p/ o Excel abrir como UTF-8
}

export async function GET(req: Request) {
  const { erro } = await checarAcesso(req);
  if (erro) return erro;
  const q = new URL(req.url).searchParams;
  const conta = contaDaQuery(q.get('conta'));

  try {
    const todas = await lerTodas(contaLow(conta));
    if (!todas.length) {
      return NextResponse.json({
        linhas: [], total: 0, totalConta: 0, pagina: 1, porPagina: 0, resumo: null,
        aviso: 'Nenhum produto no cache. Rode o sync de produtos (cron estoque-sync-produtos).',
      });
    }
    const filtradas = aplicarFiltros(todas, q);
    // O cache guarda `tipo_item` (snake, padrão da tabela) mas a Omie grava por
    // `tipoItem` — a grade usa a chave da Omie para o POST cair certo.
    const paraGrade = (l: LinhaFiscal) => ({ ...l, tipoItem: l.tipo_item ?? '' });

    if (q.get('formato') === 'csv') {
      return new NextResponse(paraCsv(filtradas), {
        headers: {
          'Content-Type': 'text/csv;charset=utf-8',
          'Content-Disposition': `attachment; filename="catalogo-fiscal-${contaLow(conta)}.csv"`,
        },
      });
    }

    if (q.get('agrupar') === 'ncm') {
      const grupos = agruparPorNcm(filtradas);
      return NextResponse.json({
        grupos,
        total: grupos.length,
        divergentes: grupos.filter((g) => g.divergente).length,
        totalConta: todas.length,
      });
    }

    const porPagina = Math.min(Math.max(parseInt(q.get('porPagina') || '200', 10) || 200, 1), 1000);
    const pagina = Math.max(parseInt(q.get('pagina') || '1', 10) || 1, 1);
    const inicio = (pagina - 1) * porPagina;

    return NextResponse.json({
      linhas: filtradas.slice(inicio, inicio + porPagina).map(paraGrade),
      total: filtradas.length,
      totalConta: todas.length,
      pagina,
      porPagina,
      resumo: {
        semNcm: todas.filter((l) => vazio(l.ncm)).length,
        semCest: todas.filter((l) => vazio(l.cest)).length,
        semOrigem: todas.filter((l) => vazio(l.origem_mercadoria)).length,
        atualizadoEm: todas.find((l) => l.fiscal_atualizado_em)?.fiscal_atualizado_em ?? null,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    // Erro mais provável na estreia: a migration ainda não foi aplicada.
    if (/column .* does not exist|does not exist/i.test(msg)) {
      return NextResponse.json({
        error: 'As colunas fiscais ainda não existem na tabela `produtos`. Aplique sql/produtos-fiscal.sql no SQL Editor do Supabase e rode o sync de produtos.',
      }, { status: 503 });
    }
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
