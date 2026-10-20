/* eslint-disable @typescript-eslint/no-explicit-any */
// =============================================================================
// INTELIGÊNCIA DE VENDAS — aba Prospecção (servidor). Junta numa leitura só o que as
// abas Oportunidades, Sem retorno, Concorrência, Indicações, Empresas, Municípios e o
// Dashboard Agro (imóveis do CAR) sabem, e guarda pronto no banco (iv_snapshot).
// Cada parte falha sozinha (vira lista vazia) para a tela nunca ficar em branco.
// =============================================================================
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { carregarBase, carregarFontes, emBanco, TTL_BASE } from './server';
import { carregarMunicipios } from './municipios-server';
import { montarFila } from './retorno';
import { REGRAS } from './regras';
import { PROPOSTA_PERDIDA } from './base';
import { dataISO, hojeBR, somarDias, textoNorm } from './normalizar';
import type { RegraId } from './tipos';
import type { Propriedade, ResumoProspeccao } from './prospeccao';

const tenta = async <T>(fn: () => Promise<T>, padrao: T): Promise<T> => { try { return await fn(); } catch (e) { console.error('[prospeccao]', (e as Error)?.message); return padrao; } };

async function propriedadesSemCliente(): Promise<Propriedade[]> {
  // contagem exata nessa view estoura o tempo do banco: só as melhores, sem total
  const { data, error } = await supabaseAdmin.from('agro_v_car_perfil')
    .select('cod_car,municipio,area_ha,cultura_nome,credito_36m,credito_invest_36m,score_oportunidade')
    .eq('status_car', 'AT').not('ano_safra', 'is', null).eq('vinculos', 0).eq('confianca', 'alta')
    .order('score_oportunidade', { ascending: false, nullsFirst: false }).order('area_ha', { ascending: false }).limit(12);
  if (error) throw error;
  return (data || []).map((p: any) => ({
    cod: p.cod_car, municipio: p.municipio || '', areaHa: Number(p.area_ha) || 0, cultura: p.cultura_nome || '',
    investimento: Number(p.credito_invest_36m) || 0, credito: Number(p.credito_36m) || 0,
  }));
}

async function montar(): Promise<ResumoProspeccao> {
  const hoje = hojeBR();
  const [{ clientes }, fontes, municipios, propriedades, sugestoes, indicacoes, empresas] = await Promise.all([
    carregarBase(),
    carregarFontes(),
    tenta(() => carregarMunicipios(false), { municipios: [], anoIBGE: '', avisos: [] }),
    tenta(propriedadesSemCliente, [] as Propriedade[]),
    tenta(async () => (await supabaseAdmin.from('agro_car_vinculo_sugestao').select('cod_car', { count: 'exact', head: true }).eq('status', 'pendente')).count || 0, 0),
    tenta(async () => (await supabaseAdmin.from('iv_indicacoes').select('indicado_nome,indicado_cidade,indicante_nome,status').order('criado_em', { ascending: false }).limit(200)).data || [], [] as any[]),
    tenta(async () => (await supabaseAdmin.from('iv_cnpj').select('razao_social,nome_fantasia,municipio,cnae_descricao,data_inicio').eq('origem', 'receita').order('data_inicio', { ascending: false }).limit(200)).data || [], [] as any[]),
  ]);

  // carteira
  const comMotivo = clientes.filter((c) => c.oportunidades.length > 0);
  const cont = new Map<RegraId, number>();
  for (const c of comMotivo) for (const o of c.oportunidades) cont.set(o.regra, (cont.get(o.regra) || 0) + 1);
  const porMotivo = [...cont.entries()].map(([regra, qtd]) => ({ regra, rotulo: REGRAS[regra].rotulo, cor: REGRAS[regra].cor, qtd })).sort((a, b) => b.qtd - a.qtd);

  // recuperar: fila "sem retorno" (15 dias), quem perdeu proposta e para quem perdemos
  const props = new Map(fontes.propriedadesNome.map((x: any) => [x.id, { nome: String(x.nome_fantasia || x.razao_social || ''), cidade: String(x.cidade || '') }]));
  const vend = new Map(fontes.vendedores.map((v) => [v.id, v.nome]));
  const fila = montarFila({
    propostas: fontes.propostas, negocios: fontes.negocios, visitas: fontes.visitasRetorno, hoje, diasParada: 15,
    nomePropriedade: (id) => (id != null && props.get(id)) || { nome: '', cidade: '' },
    nomeVendedor: (id) => (id != null ? vend.get(id) || '' : ''),
  }).filter((i) => !/teste/i.test(i.vendedor));
  const reabordar = clientes.filter((c) => c.oportunidades.some((o) => o.regra === 'reabordar'));
  const desde = somarDias(hoje, -365);
  const perdidas = fontes.propostas.filter((p) => p.status === PROPOSTA_PERDIDA && dataISO(p.fechado_em || p.status_desde || p.criado_em) >= desde);
  const porConc = new Map<string, { nome: string; qtd: number }>();
  for (const p of perdidas) {
    const nome = String(p.concorrente || '').trim();
    if (!nome) continue;
    const k = textoNorm(nome);
    const e = porConc.get(k) || { nome: nome.replace(/\b\w/g, (x) => x.toUpperCase()), qtd: 0 };
    e.qtd++; porConc.set(k, e);
  }

  // novos
  const abertas = indicacoes.filter((i: any) => !/fechad|vendid|perdid|descart/i.test(String(i.status || '')));

  return {
    geradoEm: new Date().toISOString(),
    carteira: { clientes: clientes.length, comMotivo: comMotivo.length, porMotivo, top: comMotivo.slice(0, 24) },
    recuperar: {
      parados: fila.length, valorParado: fila.reduce((a, i) => a + (i.valor || 0), 0),
      topParados: [...fila].sort((a, b) => b.gravidade - a.gravidade || (b.valor || 0) - (a.valor || 0)).slice(0, 14),
      reabordar: reabordar.length, topReabordar: reabordar.slice(0, 8),
      perdidas12m: perdidas.length, concorrentes: [...porConc.values()].sort((a, b) => b.qtd - a.qtd).slice(0, 5),
    },
    novos: {
      propriedades, sugestoesVinculo: sugestoes,
      indicacoesAbertas: abertas.length,
      indicacoes: abertas.slice(0, 6).map((i: any) => ({ nome: i.indicado_nome || '', cidade: i.indicado_cidade || '', quem: i.indicante_nome || '', status: i.status || '' })),
      empresasNovas: empresas.length,
      empresas: empresas.slice(0, 6).map((e: any) => ({ nome: e.nome_fantasia || e.razao_social || '', municipio: e.municipio || '', cnae: e.cnae_descricao || '', abertura: e.data_inicio || '' })),
    },
    territorio: {
      municipios: [...municipios.municipios].sort((a, b) => b.foco - a.foco).slice(0, 12).map((m) => ({
        nome: m.nome, foco: m.foco, cultura: m.culturaPrincipal, clientes: m.clientes, tratores: m.tratoresVendidos, areaHa: m.areaPlantadaHa, linhas: m.linhas,
      })),
    },
  };
}

/** Pronto no banco: abre na hora e recalcula por trás após 30 min. `forcar` = botão Atualizar. */
export async function carregarProspeccao(forcar = false): Promise<ResumoProspeccao> {
  const { valor } = await emBanco('prospeccao', TTL_BASE, montar, forcar);
  return valor;
}
