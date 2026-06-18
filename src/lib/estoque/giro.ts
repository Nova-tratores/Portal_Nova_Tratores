// Giro de estoque: giro = COGS anualizado / valor em estoque, por SKU.
// Classes: excelente >=4x | bom 2-4x | lento 1-2x | morto <1x | sem_giro =0 |
// fora_estoque (vendeu mas estoque=0). Portado de /api/giro-estoque (server.js:3724).

import { supabase, filtroConta } from './supabase';
import { CONTA_DEFAULT, type Conta, type ContaFiltro } from './conta';

const num = (v: unknown): number => parseFloat(String(v ?? 0)) || 0;
const norm = (s: string): string =>
  (s || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export type GiroClasse = 'excelente' | 'bom' | 'lento' | 'morto' | 'sem_giro' | 'fora_estoque';

export interface GiroItem {
  codigo_produto: string;
  descricao: string;
  familia: string;
  estoque: number;
  cmc: number;
  valor_estoque: number;
  cogs_periodo: number;
  cogs_anual: number;
  qtd_vendida: number;
  faturamento: number;
  giro: number;
  dias_cobertura: number | null;
  classe: GiroClasse;
  sku?: string;
  posicao?: number;
}

interface ClasseResumo { skus: number; valor: number }
export interface GiroResumo {
  total_skus: number;
  valor_estoque_total: number;
  cogs_anual_total: number;
  giro_medio_ponderado: number;
  dias_cobertura_media: number | null;
  por_classe: Record<GiroClasse, ClasseResumo>;
  pct_saudaveis: number;
}

export interface GiroResult {
  itens: GiroItem[];
  resumo: GiroResumo;
  periodo: number;
  familia: string;
  fator_anualizacao: number;
  total: number;
}

interface VendaAgg { cogs: number; qtd: number; faturamento: number; descricao: string; familia: string }

export async function calcularGiroEstoque(periodo: number, filtroFamilia: string, conta: ContaFiltro): Promise<GiroResult> {
  const contaId: Conta = conta ?? CONTA_DEFAULT;
  const now = new Date();
  const fatorAnualizacao = 12 / periodo;

  // 1. Vendas do período por produto
  const vendasPorProd: Record<string, VendaAgg> = {};
  for (let i = 0; i < periodo; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const mes = d.getMonth() + 1, ano = d.getFullYear();
    let offset = 0;
    while (true) {
      const { data } = await filtroConta(
        supabase.from('vendas_itens').select('codigo_produto,descricao,valor_total,quantidade,cmc_unitario,familia').eq('mes', mes).eq('ano', ano),
        conta,
      ).range(offset, offset + 999);
      if (!data || data.length === 0) break;
      let filtrado = data as Array<Record<string, unknown>>;
      if (filtroFamilia === 'pecas') {
        filtrado = filtrado.filter((it) => { const fam = norm(String(it.familia ?? '')); return fam === '' || fam.includes('peca') || fam.includes('pecas'); });
      } else if (filtroFamilia === 'maquinas') {
        filtrado = filtrado.filter((it) => { const fam = norm(String(it.familia ?? '')); return fam.includes('maquina') || fam.includes('trator') || fam.includes('implemento') || fam.includes('agricul'); });
      }
      filtrado.forEach((it) => {
        const cod = String(it.codigo_produto || '');
        if (!cod) return;
        if (!vendasPorProd[cod]) vendasPorProd[cod] = { cogs: 0, qtd: 0, faturamento: 0, descricao: String(it.descricao || cod), familia: String(it.familia || '') };
        const cmc = num(it.cmc_unitario), qtd = num(it.quantidade);
        if (cmc > 0 && qtd > 0) vendasPorProd[cod].cogs += cmc * qtd;
        vendasPorProd[cod].qtd += qtd;
        vendasPorProd[cod].faturamento += num(it.valor_total);
        if (it.descricao) vendasPorProd[cod].descricao = String(it.descricao);
        if (it.familia) vendasPorProd[cod].familia = String(it.familia);
      });
      if (data.length < 1000) break;
      offset += 1000;
    }
  }

  // 2. Estoque de todos os produtos
  const estoquePorProd: Record<string, { estoque: number; cmc: number; valor_estoque: number }> = {};
  let offEst = 0;
  while (true) {
    const { data } = await filtroConta(
      supabase.from('produtos').select('codigo_produto,estoque,cmc,valor_estoque'),
      conta,
    ).range(offEst, offEst + 999);
    if (!data || data.length === 0) break;
    (data as Array<Record<string, unknown>>).forEach((p) => {
      const est = num(p.estoque), cmc = num(p.cmc);
      let valEst = num(p.valor_estoque);
      if (valEst <= 0 && est > 0 && cmc > 0) valEst = est * cmc;
      estoquePorProd[String(p.codigo_produto)] = { estoque: est < 0 ? 0 : est, cmc, valor_estoque: valEst < 0 ? 0 : valEst };
    });
    if (data.length < 1000) break;
    offEst += 1000;
  }

  // 3. Família por produto (só se filtrar)
  const famPorProd: Record<string, string> = {};
  if (filtroFamilia) {
    let offFam = 0;
    while (true) {
      const { data } = await supabase.from('produto_tipo').select('codigo_produto,familia').eq('conta_omie', contaId).range(offFam, offFam + 999);
      if (!data || data.length === 0) break;
      (data as Array<{ codigo_produto: string; familia?: string }>).forEach((p) => { famPorProd[String(p.codigo_produto)] = p.familia || ''; });
      if (data.length < 1000) break;
      offFam += 1000;
    }
  }
  const matchFamiliaCatalogo = (cod: string): boolean => {
    if (!filtroFamilia) return true;
    const fam = norm(famPorProd[cod] || '');
    if (filtroFamilia === 'pecas') return fam === '' || fam.includes('peca');
    if (filtroFamilia === 'maquinas') return fam.includes('maquina') || fam.includes('trator') || fam.includes('implemento') || fam.includes('agricul');
    return true;
  };

  // 4. União: produtos com venda OU com estoque
  const codigosUniao = new Set<string>();
  Object.keys(vendasPorProd).forEach((c) => codigosUniao.add(c));
  Object.keys(estoquePorProd).forEach((c) => { if (estoquePorProd[c].estoque > 0 && matchFamiliaCatalogo(c)) codigosUniao.add(c); });

  const itens: GiroItem[] = [];
  codigosUniao.forEach((cod) => {
    const v = vendasPorProd[cod];
    const e = estoquePorProd[cod] || { estoque: 0, cmc: 0, valor_estoque: 0 };
    const cogsPeriodo = v ? v.cogs : 0;
    const cogsAnual = cogsPeriodo * fatorAnualizacao;
    const valorEstoque = e.valor_estoque;
    const estoque = e.estoque;
    let giro = 0;
    let diasCobertura: number | null = null;
    let classe: GiroClasse;
    if (estoque <= 0 || valorEstoque <= 0) {
      classe = cogsPeriodo > 0 ? 'fora_estoque' : 'sem_giro';
    } else {
      giro = cogsAnual / valorEstoque;
      if (giro <= 0) { classe = 'sem_giro'; diasCobertura = null; }
      else {
        diasCobertura = 365 / giro;
        if (giro >= 4) classe = 'excelente';
        else if (giro >= 2) classe = 'bom';
        else if (giro >= 1) classe = 'lento';
        else classe = 'morto';
      }
    }
    itens.push({
      codigo_produto: cod,
      descricao: (v && v.descricao) || cod,
      familia: (v && v.familia) || famPorProd[cod] || '',
      estoque, cmc: e.cmc, valor_estoque: valorEstoque,
      cogs_periodo: cogsPeriodo, cogs_anual: cogsAnual,
      qtd_vendida: v ? v.qtd : 0, faturamento: v ? v.faturamento : 0,
      giro, dias_cobertura: diasCobertura, classe,
    });
  });

  const itensValidos = itens.filter((it) => it.estoque > 0 || it.cogs_periodo > 0);

  // 6. SKU + descrição via Produtos_Completos
  const codsProd = itensValidos.map((it) => it.codigo_produto);
  const skuMap: Record<string, string> = {};
  const descMap: Record<string, string> = {};
  for (let i = 0; i < codsProd.length; i += 50) {
    const lote = codsProd.slice(i, i + 50).map((c) => parseInt(c)).filter((n) => !isNaN(n));
    if (lote.length === 0) continue;
    const { data: prods } = await filtroConta(supabase.from('Produtos_Completos').select('id_omie,Codigo_Produto,Descricao_Produto').in('id_omie', lote), conta);
    if (prods) (prods as Array<{ id_omie: unknown; Codigo_Produto?: string; Descricao_Produto?: string }>).forEach((p) => {
      skuMap[String(p.id_omie)] = p.Codigo_Produto || '';
      if (p.Descricao_Produto) descMap[String(p.id_omie)] = p.Descricao_Produto;
    });
  }
  itensValidos.forEach((it) => {
    it.sku = skuMap[it.codigo_produto] || '';
    if (descMap[it.codigo_produto]) it.descricao = descMap[it.codigo_produto];
  });

  // 7. Ordena (morto/sem_giro com mais valor parado primeiro)
  const ordemClasse: Record<GiroClasse, number> = { morto: 0, sem_giro: 1, lento: 2, fora_estoque: 3, bom: 4, excelente: 5 };
  itensValidos.sort((a, b) => (ordemClasse[a.classe] !== ordemClasse[b.classe] ? ordemClasse[a.classe] - ordemClasse[b.classe] : (b.valor_estoque || 0) - (a.valor_estoque || 0)));
  itensValidos.forEach((it, i) => { it.posicao = i + 1; });

  // 8. Resumo
  const resumo: GiroResumo = {
    total_skus: itensValidos.length,
    valor_estoque_total: 0,
    cogs_anual_total: 0,
    giro_medio_ponderado: 0,
    dias_cobertura_media: 0,
    por_classe: {
      excelente: { skus: 0, valor: 0 }, bom: { skus: 0, valor: 0 }, lento: { skus: 0, valor: 0 },
      morto: { skus: 0, valor: 0 }, sem_giro: { skus: 0, valor: 0 }, fora_estoque: { skus: 0, valor: 0 },
    },
    pct_saudaveis: 0,
  };
  itensValidos.forEach((it) => {
    resumo.valor_estoque_total += it.valor_estoque || 0;
    resumo.cogs_anual_total += it.cogs_anual || 0;
    const pc = resumo.por_classe[it.classe];
    if (pc) { pc.skus++; pc.valor += it.valor_estoque || 0; }
  });
  resumo.giro_medio_ponderado = resumo.valor_estoque_total > 0 ? resumo.cogs_anual_total / resumo.valor_estoque_total : 0;
  resumo.dias_cobertura_media = resumo.giro_medio_ponderado > 0 ? 365 / resumo.giro_medio_ponderado : null;
  resumo.pct_saudaveis = resumo.total_skus > 0 ? ((resumo.por_classe.excelente.skus + resumo.por_classe.bom.skus) * 100) / resumo.total_skus : 0;

  return { itens: itensValidos, resumo, periodo, familia: filtroFamilia || 'todas', fator_anualizacao: fatorAnualizacao, total: itensValidos.length };
}
