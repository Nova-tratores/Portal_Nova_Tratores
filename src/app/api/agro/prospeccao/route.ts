/* eslint-disable @typescript-eslint/no-explicit-any */
// GET /api/agro/prospeccao — lista de prospecção (imóveis ativos com perfil), ordenada por score.
//   filtros: municipio=<ibge> · cultura=<codigo|_div> · confianca=alta,media · area_min · area_max
//            credito=1 (crédito nos 36 m) · invest=1 (investimento nos 36 m)
//            vinculo=com|sem|sugestao · q=<cod_car ou município>
//   ordem=score|area|credito|invest|cultura_area (default score) · dir=asc|desc · pagina=0.. · limite=50..200
//   exportar=1 → até 5.000 linhas do filtro (pra CSV) e grava no audit_log
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { guardarAgro, erroAgro, logAgro } from '@/lib/agro/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ORDEM: Record<string, string> = {
  score: 'score_oportunidade', area: 'area_ha', credito: 'credito_36m', invest: 'credito_invest_36m',
  cultura_area: 'area_cultura_ha', municipio: 'municipio', cultura: 'cultura_nome', confianca: 'confianca',
};
const COLS = 'cod_car,municipio,municipio_ibge,area_ha,area_util_ha,modulos_fiscais,cultura_principal,cultura_nome,cultura_grupo,' +
  'area_cultura_ha,pct_area_util,confianca,motivo_confianca,fonte_principal,credito_12m,credito_36m,credito_invest_36m,' +
  'ultima_finalidade,ultimo_credito_em,score_oportunidade,score_detalhe,vinculos,sobreposicao_pct,centroide';

export async function GET(req: Request) {
  const g = await guardarAgro(req);
  if (g.resposta) return g.resposta;
  const auth = g.auth!;
  try {
    const p = new URL(req.url).searchParams;
    const exportar = p.get('exportar') === '1';
    const limite = exportar ? 5000 : Math.min(Math.max(Number(p.get('limite')) || 100, 10), 200);
    const pagina = exportar ? 0 : Math.max(Number(p.get('pagina')) || 0, 0);
    const ordem = ORDEM[p.get('ordem') || 'score'] || 'score_oportunidade';
    const asc = p.get('dir') === 'asc';

    let q = supabaseAdmin.from('agro_v_car_perfil').select(COLS, { count: 'exact' }).eq('status_car', 'AT').not('ano_safra', 'is', null);

    const municipio = Number(p.get('municipio'));
    if (Number.isInteger(municipio) && municipio > 0) q = q.eq('municipio_ibge', municipio);
    const cultura = p.get('cultura');
    if (cultura === '_div') q = q.is('cultura_principal', null);
    else if (cultura && /^[a-z_]+$/.test(cultura)) q = q.eq('cultura_principal', cultura);
    const conf = (p.get('confianca') || '').split(',').filter((c) => ['alta', 'media', 'baixa'].includes(c));
    if (conf.length) q = q.in('confianca', conf);
    const aMin = Number(p.get('area_min')); if (Number.isFinite(aMin) && aMin > 0) q = q.gte('area_ha', aMin);
    const aMax = Number(p.get('area_max')); if (Number.isFinite(aMax) && aMax > 0) q = q.lte('area_ha', aMax);
    if (p.get('credito') === '1') q = q.gt('credito_36m', 0);
    if (p.get('invest') === '1') q = q.gt('credito_invest_36m', 0);
    const vinculo = p.get('vinculo');
    if (vinculo === 'com') q = q.gt('vinculos', 0);
    if (vinculo === 'sem') q = q.eq('vinculos', 0);
    if (vinculo === 'sugestao') {
      const { data: sug } = await supabaseAdmin.from('agro_car_vinculo_sugestao').select('cod_car').eq('status', 'pendente');
      const ids = Array.from(new Set((sug || []).map((s: any) => s.cod_car)));
      q = q.in('cod_car', ids.length ? ids : ['-']);
    }
    const busca = (p.get('q') || '').trim().replace(/[^\p{L}\p{N}\- ]/gu, '');
    if (busca.length >= 3) q = q.or(`cod_car.ilike.%${busca}%,municipio.ilike.%${busca}%`);

    q = q.order(ordem, { ascending: asc, nullsFirst: false }).order('cod_car', { ascending: true });
    // PostgREST corta toda consulta em 1.000 linhas: a exportação pagina de 1.000 em 1.000 até o teto.
    let imoveis: any[] = [];
    let count: number | null = null;
    if (exportar) {
      for (let de = 0; de < limite; de += 1000) {
        const r = await q.range(de, de + 999);
        if (r.error) throw r.error;
        if (count == null) count = r.count ?? null;
        imoveis = imoveis.concat(r.data || []);
        if ((r.data || []).length < 1000) break;
      }
    } else {
      const r = await q.range(pagina * limite, pagina * limite + limite - 1);
      if (r.error) throw r.error;
      imoveis = r.data || []; count = r.count ?? null;
    }

    // enriquece a página: nome do cliente vinculado + sugestões pendentes
    const cods = imoveis.map((i) => i.cod_car);
    if (cods.length) {
      // vínculos e sugestões são tabelas pequenas (centenas de linhas): lê tudo e cruza em memória,
      // em vez de um .in() com milhares de códigos na URL
      const [vin, sug] = await Promise.all([
        supabaseAdmin.from('agro_car_cliente_vinculo').select('cod_car,cliente_nome').limit(5000),
        supabaseAdmin.from('agro_car_vinculo_sugestao').select('cod_car').eq('status', 'pendente').limit(5000),
      ]);
      const cli: Record<string, string[]> = {}; const ns: Record<string, number> = {};
      for (const v of vin.data || []) (cli[v.cod_car] = cli[v.cod_car] || []).push(v.cliente_nome || 'cliente');
      for (const s of sug.data || []) ns[s.cod_car] = (ns[s.cod_car] || 0) + 1;
      for (const i of imoveis) { i.clientes = cli[i.cod_car] || []; i.sugestoes_pendentes = ns[i.cod_car] || 0; }
    }

    if (exportar) {
      await logAgro(auth, { acao: 'exportar', entidade: 'prospeccao', detalhes: { filtros: Object.fromEntries(p.entries()), linhas: imoveis.length } });
      return NextResponse.json({ imoveis, total: count ?? imoveis.length });
    }

    // apoio dos filtros (1ª página só): culturas e municípios disponíveis
    let apoio: any = undefined;
    if (pagina === 0 && p.get('apoio') === '1') {
      const [cult, mun] = await Promise.all([
        supabaseAdmin.from('agro_dominio_cultura').select('codigo,nome,grupo,ordem').order('ordem'),
        supabaseAdmin.rpc('agro_mapa_municipios'),
      ]);
      apoio = { culturas: cult.data || [], municipios: (mun.data || []).map((m: any) => ({ ibge: m.ibge, nome: m.nome, imoveis: m.imoveis })) };
    }
    return NextResponse.json({ imoveis, total: count ?? 0, pagina, limite, apoio });
  } catch (e: any) {
    return erroAgro(e, 'prospeccao GET');
  }
}
