/* eslint-disable @typescript-eslint/no-explicit-any */
// =============================================================================
// INTELIGÊNCIA DE VENDAS — feed do vendedor (servidor). Monta a reserva de contatos de
// cada vendedor ativo (cidades em vendedor_cidades, as mesmas do app de vendas) e grava
// em iv_feed_pool, que o app lê. O robô roda no instrumentation (IV_FEED).
// =============================================================================
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { carregarBase, carregarFontes } from './server';
import { centrosMunicipios, municipiosIBGE } from './ibge-server';
import { montarFila } from './retorno';
import { mesmoVendedor } from './equipe';
import { chaveCidade, hojeBR } from './normalizar';
import { chaveNome, montarReserva, type PropriedadeCAR } from './feed';

/** centroide do CAR vem como GeoJSON (Point) ou "POINT(lng lat)". */
function ponto(c: any): [number, number] | null {
  if (!c) return null;
  if (typeof c === 'object' && Array.isArray(c.coordinates)) return [Number(c.coordinates[1]), Number(c.coordinates[0])];
  const m = String(c).match(/POINT\s*\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)/i);
  return m ? [Number(m[2]), Number(m[1])] : null;
}

async function propriedadesSemCliente(municipios: string[]): Promise<PropriedadeCAR[]> {
  if (!municipios.length) return [];
  const { data, error } = await supabaseAdmin.from('agro_v_car_perfil')
    .select('cod_car,municipio,area_ha,cultura_nome,credito_invest_36m,centroide')
    .eq('status_car', 'AT').not('ano_safra', 'is', null).eq('vinculos', 0).eq('confianca', 'alta')
    .in('municipio', municipios).order('area_ha', { ascending: false }).limit(600);
  if (error) throw error;
  return (data || []).map((p: any) => {
    const c = ponto(p.centroide);
    return { cod: p.cod_car, municipio: p.municipio || '', areaHa: Number(p.area_ha) || 0, cultura: p.cultura_nome || '', investimento: Number(p.credito_invest_36m) || 0, lat: c?.[0] ?? null, lng: c?.[1] ?? null };
  });
}

export interface ResultadoFeed { vendedores: number; contatos: number; semCidade: string[]; erros: string[] }

export async function gerarFeeds(opcoes: { gravar?: boolean } = {}): Promise<ResultadoFeed & { amostra?: any; linhas?: any[] }> {
  const gravar = opcoes.gravar !== false;
  const hoje = hojeBR();
  const [{ data: vends, error: ev }, { data: cids, error: ec }, { clientes }, fontes, ibge, centros] = await Promise.all([
    supabaseAdmin.from('vendedores').select('id,nome,ativo'),
    supabaseAdmin.from('vendedor_cidades').select('vendedor_id,cidade'),
    carregarBase(),
    carregarFontes(),
    municipiosIBGE(['SP', 'PR']),
    centrosMunicipios(),
  ]);
  if (ev) throw ev;
  if (ec) throw ec;
  const ativos = (vends || []).filter((v: any) => v.ativo !== false && !/teste/i.test(v.nome || ''));

  // propostas e negócios parados (a mesma fila de "Sem retorno")
  const props = new Map(fontes.propriedadesNome.map((x: any) => [x.id, { nome: String(x.nome_fantasia || x.razao_social || ''), cidade: String(x.cidade || '') }]));
  const vendMap = new Map(fontes.vendedores.map((v) => [v.id, v.nome]));
  const parados = montarFila({
    propostas: fontes.propostas, negocios: fontes.negocios, visitas: fontes.visitasRetorno, hoje, diasParada: 15,
    nomePropriedade: (id) => (id != null && props.get(id)) || { nome: '', cidade: '' },
    nomeVendedor: (id) => (id != null ? vendMap.get(id) || '' : ''),
  });

  const centro = (cidade: string): [number, number] | null => {
    const m = ibge.get(chaveCidade(cidade));
    return m ? centros.get(m.ibge) ?? null : null;
  };

  // cidades de cada vendedor: as atribuídas no app; sem nenhuma, as dos clientes dele
  const porVend = new Map<number, Set<string>>();
  const nomesCidade = new Map<string, string>();
  for (const c of cids || []) {
    const k = chaveNome(c.cidade);
    if (!porVend.has(c.vendedor_id)) porVend.set(c.vendedor_id, new Set());
    porVend.get(c.vendedor_id)!.add(k);
    nomesCidade.set(k, String(c.cidade).replace(/\s*[(/-]\s*[A-Za-z]{2}\)?\s*$/, ''));
  }
  const semCidade: string[] = [];
  for (const v of ativos) {
    if (porVend.get(v.id)?.size) continue;
    const s = new Set(clientes.filter((c) => c.vendedor && mesmoVendedor(c.vendedor, v.nome)).map((c) => chaveNome(c.cidade)).filter(Boolean));
    porVend.set(v.id, s);
    for (const c of clientes) if (s.has(chaveNome(c.cidade))) nomesCidade.set(chaveNome(c.cidade), c.cidade.replace(/\s*\(..\)$/, ''));
    if (!s.size) semCidade.push(v.nome);
  }

  // CAR das cidades de todos (uma consulta só), pelo nome como está no CAR
  const todas = new Set<string>(); for (const s of porVend.values()) for (const k of s) todas.add(k);
  const erros: string[] = [];
  const nomesCar = [...todas].map((k) => nomesCidade.get(k) || k).map((n) => n.toLowerCase().replace(/(^|\s)\S/g, (x) => x.toUpperCase()));
  let car: PropriedadeCAR[] = [];
  try { car = await propriedadesSemCliente(nomesCar); } catch (e: any) { erros.push(`CAR: ${e?.message || e}`); }

  let contatos = 0;
  const linhas: any[] = [];
  for (const v of ativos) {
    const cidades = porVend.get(v.id) || new Set<string>();
    const itens = montarReserva({ cidades, ehDoVendedor: (n) => !!n && mesmoVendedor(n, v.nome), clientes, parados, propriedades: car, centro });
    contatos += itens.length;
    linhas.push({ vendedor_id: v.id, gerado_em: new Date().toISOString(), cidades: [...cidades].map((k) => nomesCidade.get(k) || k), itens });
  }
  if (gravar && linhas.length) {
    const { error } = await supabaseAdmin.from('iv_feed_pool').upsert(linhas, { onConflict: 'vendedor_id' });
    if (error) throw error;
  }
  return { vendedores: linhas.length, contatos, semCidade, erros, linhas: gravar ? undefined : linhas, amostra: gravar ? undefined : linhas.map((l) => ({ vendedor: ativos.find((a: any) => a.id === l.vendedor_id)?.nome, cidades: l.cidades.length, itens: l.itens.length, porTipo: ['carteira', 'recuperar', 'novos'].map((t) => l.itens.filter((i: any) => i.tipo === t).length) })) };
}
