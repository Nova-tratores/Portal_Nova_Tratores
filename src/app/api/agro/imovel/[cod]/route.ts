/* eslint-disable @typescript-eslint/no-explicit-any */
// GET  /api/agro/imovel/<cod_car>  — ficha do imóvel: cadastro, perfil, uso do solo por safra, crédito
//                                     (operações via glebas), sobreposições, vínculos, sugestões, validações, visitas.
// POST /api/agro/imovel/<cod_car>  — { acao: 'validar', cultura_real, confirmou, observacao? }
//                                     { acao: 'vincular', cliente_omie_id, cliente_nome, observacao? }
//                                     { acao: 'desvincular', cliente_omie_id }
// Escrita humana SEMPRE com o usuário da sessão (RPCs agro_validar_cultura / agro_vincular_cliente).
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { guardarAgro, erroAgro, logAgro, codCarValido, nomeDoUsuario } from '@/lib/agro/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ cod: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const g = await guardarAgro(req);
  if (g.resposta) return g.resposta;
  try {
    const cod = decodeURIComponent((await ctx.params).cod || '').toUpperCase();
    if (!codCarValido(cod)) return NextResponse.json({ error: 'código do CAR inválido' }, { status: 400 });
    const sb = supabaseAdmin;

    const [imovel, perfilV, uso, glebaCar, sobre, vinc, sug, valid, culturas] = await Promise.all([
      sb.from('agro_car_imovel').select('cod_car,uf,municipio_ibge,municipio,area_ha,area_util_ha,modulos_fiscais,status_car,condicao,tipo_imovel,criado_sicar_em,atualizado_em').eq('cod_car', cod).maybeSingle(),
      sb.from('agro_v_car_perfil').select('*').eq('cod_car', cod).maybeSingle(),
      sb.from('agro_uso_solo_car').select('ano_safra,fonte,cultura_codigo,area_ha,pct_area_util').eq('cod_car', cod).order('ano_safra', { ascending: false }),
      sb.from('agro_sicor_gleba_car').select('gleba_id,pct_gleba_no_car,agro_sicor_gleba(ref_bacen,nu_ordem,area_ha,n_pontos)').eq('cod_car', cod),
      sb.from('agro_car_sobreposicao').select('cod_car_a,cod_car_b,area_sobreposta_ha,pct_a,pct_b').or(`cod_car_a.eq.${cod},cod_car_b.eq.${cod}`).order('area_sobreposta_ha', { ascending: false }).limit(20),
      sb.from('agro_car_cliente_vinculo').select('*').eq('cod_car', cod).order('confirmado_em', { ascending: false }),
      sb.from('agro_car_vinculo_sugestao').select('*').eq('cod_car', cod).order('score', { ascending: false }),
      sb.from('agro_car_validacao').select('*').eq('cod_car', cod).order('informado_em', { ascending: false }).limit(20),
      sb.from('agro_dominio_cultura').select('codigo,nome,grupo,ordem').order('ordem'),
    ]);
    for (const r of [imovel, perfilV, uso, glebaCar, sobre, vinc, sug, valid, culturas]) if (r.error) throw r.error;
    if (!imovel.data) return NextResponse.json({ error: 'imóvel não encontrado' }, { status: 404 });

    // operações das glebas atribuídas (crédito), com o valor rateado pela área das glebas da operação
    const glebas: any[] = (glebaCar.data || []).map((x: any) => ({ ...x, g: Array.isArray(x.agro_sicor_gleba) ? x.agro_sicor_gleba[0] : x.agro_sicor_gleba })).filter((x) => x.g);
    const refs = Array.from(new Set(glebas.map((x) => x.g.ref_bacen)));
    let operacoes: any[] = [];
    if (refs.length) {
      const [ops, todas] = await Promise.all([
        sb.from('agro_sicor_operacao').select('ref_bacen,nu_ordem,dt_emissao,finalidade,atividade,modalidade,produto,cultura_codigo,valor,area_financiada,programa').in('ref_bacen', refs.slice(0, 300)),
        sb.from('agro_sicor_gleba').select('ref_bacen,nu_ordem,area_ha').in('ref_bacen', refs.slice(0, 300)),
      ]);
      if (ops.error) throw ops.error;
      const areaOp: Record<string, number> = {}; const nOp: Record<string, number> = {};
      for (const t of todas.data || []) { const k = `${t.ref_bacen}|${t.nu_ordem}`; areaOp[k] = (areaOp[k] || 0) + Number(t.area_ha || 0); nOp[k] = (nOp[k] || 0) + 1; }
      const areaAqui: Record<string, number> = {}; const nAqui: Record<string, number> = {};
      for (const x of glebas) { const k = `${x.g.ref_bacen}|${x.g.nu_ordem}`; areaAqui[k] = (areaAqui[k] || 0) + Number(x.g.area_ha || 0); nAqui[k] = (nAqui[k] || 0) + 1; }
      operacoes = (ops.data || []).filter((o: any) => areaAqui[`${o.ref_bacen}|${o.nu_ordem}`] !== undefined).map((o: any) => {
        const k = `${o.ref_bacen}|${o.nu_ordem}`;
        const fracao = areaOp[k] > 0 ? areaAqui[k] / areaOp[k] : nAqui[k] / Math.max(nOp[k] || 1, 1);
        return { ...o, glebas_no_imovel: nAqui[k], glebas_na_operacao: nOp[k] || nAqui[k], area_glebas_ha: areaAqui[k], fracao: Math.min(fracao, 1), valor_rateado: Number(o.valor || 0) * Math.min(fracao, 1) };
      }).sort((a: any, b: any) => String(b.dt_emissao).localeCompare(String(a.dt_emissao)));
    }

    // visitas do CRM que geraram sugestões neste imóvel
    const visitaIds = Array.from(new Set((sug.data || []).flatMap((s: any) => s.visita_ids || []))).slice(0, 100);
    let visitas: any[] = [];
    if (visitaIds.length) {
      const v = await sb.from('vw_visitas_detalhadas').select('id,data_visita,tipo,vendedor_nome,cliente_nome,propriedade_nome,resumo,proximos_passos,gps_accuracy').in('id', visitaIds).order('data_visita', { ascending: false });
      visitas = v.data || [];
    }

    return NextResponse.json({
      imovel: imovel.data, perfil: perfilV.data, uso: uso.data || [], operacoes,
      glebas: glebas.length, sobreposicoes: sobre.data || [], vinculos: vinc.data || [], sugestoes: sug.data || [],
      validacoes: valid.data || [], visitas, culturas: culturas.data || [],
    });
  } catch (e: any) {
    return erroAgro(e, 'imovel GET');
  }
}

export async function POST(req: Request, ctx: Ctx) {
  const g = await guardarAgro(req);
  if (g.resposta) return g.resposta;
  const auth = g.auth!;
  try {
    const cod = decodeURIComponent((await ctx.params).cod || '').toUpperCase();
    if (!codCarValido(cod)) return NextResponse.json({ error: 'código do CAR inválido' }, { status: 400 });
    const body = await req.json().catch(() => ({}));
    const usuario = auth.email || (await nomeDoUsuario(auth));
    const sb = supabaseAdmin;

    if (body?.acao === 'validar') {
      const cultura = String(body.cultura_real || '');
      if (!/^[a-z_]+$/.test(cultura)) return NextResponse.json({ error: 'cultura inválida' }, { status: 400 });
      const { data: perfil } = await sb.from('agro_car_perfil').select('ano_safra').eq('cod_car', cod).maybeSingle();
      const { data, error } = await sb.rpc('agro_validar_cultura', {
        p_cod_car: cod, p_ano_safra: perfil?.ano_safra ?? new Date().getFullYear(), p_cultura_real: cultura,
        p_confirmou: body.confirmou === true, p_usuario: usuario, p_fonte: ['cockpit', 'lista', 'visita', 'telefone', 'outro'].includes(body.fonte) ? body.fonte : 'lista',
        p_observacao: body.observacao ? String(body.observacao).slice(0, 500) : null,
      });
      if (error) throw error;
      await logAgro(auth, { acao: body.confirmou === true ? 'cultura_confirmada' : 'cultura_corrigida', entidade: 'car', entidadeId: cod, entidadeLabel: cod, detalhes: { cultura_real: cultura, validacao_id: data } });
      return NextResponse.json({ ok: true, validacao_id: data });
    }

    if (body?.acao === 'vincular') {
      const omie = String(body.cliente_omie_id || '').trim();
      if (!omie) return NextResponse.json({ error: 'cliente_omie_id é obrigatório' }, { status: 400 });
      const { error } = await sb.rpc('agro_vincular_cliente', {
        p_cod_car: cod, p_cliente_omie_id: omie, p_cliente_nome: String(body.cliente_nome || '').slice(0, 200) || null,
        p_usuario: usuario, p_origem: 'manual', p_observacao: body.observacao ? String(body.observacao).slice(0, 500) : null,
      });
      if (error) throw error;
      await logAgro(auth, { acao: 'vinculo_manual', entidade: 'car', entidadeId: cod, entidadeLabel: `${cod} ↔ ${body.cliente_nome || omie}`, detalhes: { cliente_omie_id: omie } });
      return NextResponse.json({ ok: true });
    }

    if (body?.acao === 'desvincular') {
      const omie = String(body.cliente_omie_id || '').trim();
      if (!omie) return NextResponse.json({ error: 'cliente_omie_id é obrigatório' }, { status: 400 });
      const { error } = await sb.from('agro_car_cliente_vinculo').delete().eq('cod_car', cod).eq('cliente_omie_id', omie);
      if (error) throw error;
      await logAgro(auth, { acao: 'vinculo_removido', entidade: 'car', entidadeId: cod, entidadeLabel: cod, detalhes: { cliente_omie_id: omie } });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'acao desconhecida (validar | vincular | desvincular)' }, { status: 400 });
  } catch (e: any) {
    return erroAgro(e, 'imovel POST');
  }
}
