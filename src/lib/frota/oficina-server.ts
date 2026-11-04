// Oficina da frota — banco. Regras puras em lib/frota/oficina.ts.
// Só servidor (service role). Sem a migration sql/frota-oficina.sql tudo
// devolve { tabela: false } e a rota responde "falta aplicar".
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ETAPAS_ATIVAS, ETAPA_INFO, ativa, custoParado, diasParado, numeroOS, paradoAgora, planejarConclusao, validarMudanca,
  type DadosEtapa, type EtapaOS,
} from '@/lib/frota/oficina';
import { carregarKm } from '@/lib/frota/km-server';
import { validarLeitura, type FonteLeitura } from '@/lib/frota/km';
import { calcularPreventivas } from '@/lib/frota/preventiva-server';
import { precisaAtencao } from '@/lib/frota/preventiva';
import { criarRequisicaoManutencao } from '@/lib/frota/requisicao-manutencao';
import { parseValorMisto } from '@/lib/marketing/custos';
import { diaBR } from '@/lib/frota/mapa-vivo';

export const MSG_MIGRACAO_OFICINA = 'Falta aplicar sql/frota-oficina.sql no Supabase para usar a oficina.';
export const semTabelaOficina = (m: string) => /frota_os|relation .* does not exist|schema cache/i.test(m);

export class ErroOficina extends Error {
  constructor(msg: string, public status = 400) { super(msg); }
}

export interface ItemOS {
  id: string; tipo: 'pendencia' | 'preventiva' | 'avulso'; pendencia_id: string | null; plano_id: string | null;
  descricao: string; feito: boolean; feito_em: string | null; feito_por: string | null; foto_url: string | null; obs: string | null;
}
export interface EventoOS { de: string | null; para: string; quem: string | null; em: string; detalhe: Record<string, unknown> | null }

export interface OsFrota {
  id: string; numero: number; rotulo: string;
  veiculo_id: string; placa: string; veiculo: string;
  etapa: EtapaOS; etapa_desde: string; descricao: string | null;
  oficina: 'propria' | 'externa'; fornecedor: string | null; os_pos: string | null; imobiliza: boolean;
  km_entrada: number | null; foto_entrada: string | null; entrada_em: string | null;
  peca: string | null; previsao_peca: string | null;
  pronta_em: string | null; km_saida: number | null; foto_saida: string | null; retirado_por: string | null;
  concluida_em: string | null; cancelada_motivo: string | null;
  requisicao: { id: number; status: string | null; valor: number | null } | null;
  criado_por: string | null; criado_em: string;
  itens: ItemOS[];
  eventos: EventoOS[];
  parado: boolean; dias_parado: number; custo_parado: number;
}

const descricaoVeiculo = (v: { marca?: string | null; modelo?: string | null; descricao?: string | null } | undefined) =>
  [v?.marca, v?.modelo].filter(Boolean).join(' ') || v?.descricao || '';

/** OS ativas + as encerradas nos últimos `diasEncerradas` dias. */
export async function carregarOficina(
  supabase: SupabaseClient,
  opts: { diasEncerradas?: number; placa?: string; id?: string; agora?: number } = {},
): Promise<{ tabela: boolean; os: OsFrota[] }> {
  const agora = opts.agora ?? Date.now();
  const desde = new Date(agora - (opts.diasEncerradas ?? 30) * 86_400_000).toISOString();
  let q = supabase.from('frota_os').select('*').order('etapa_desde', { ascending: true });
  if (opts.id) q = q.eq('id', opts.id);
  else {
    q = q.or(`etapa.in.(${ETAPAS_ATIVAS.join(',')}),atualizado_em.gte.${desde}`);
    if (opts.placa) q = q.eq('placa', opts.placa);
  }
  const { data: linhas, error } = await q;
  if (error) {
    if (semTabelaOficina(error.message)) return { tabela: false, os: [] };
    throw new Error(error.message);
  }
  const lista = (linhas || []) as Record<string, unknown>[];
  if (!lista.length) return { tabela: true, os: [] };
  const ids = lista.map((o) => String(o.id));
  const veicIds = [...new Set(lista.map((o) => String(o.veiculo_id)))];
  const reqIds = lista.map((o) => o.requisicao_id).filter((x) => x != null).map(Number);

  const [itens, eventos, veics, reqs] = await Promise.all([
    supabase.from('frota_os_itens').select('*').in('os_id', ids).order('criado_em'),
    supabase.from('frota_os_eventos').select('*').in('os_id', ids).order('em'),
    supabase.from('frota_veiculos').select('id, marca, modelo, descricao').in('id', veicIds),
    reqIds.length ? supabase.from('Requisicao').select('id, status, valor_despeza').in('id', reqIds) : Promise.resolve({ data: [], error: null }),
  ]);
  const itensPor = new Map<string, ItemOS[]>();
  for (const i of (itens.data || []) as (ItemOS & { os_id: string })[]) {
    const arr = itensPor.get(i.os_id) || [];
    arr.push(i);
    itensPor.set(i.os_id, arr);
  }
  const eventosPor = new Map<string, EventoOS[]>();
  for (const e of (eventos.data || []) as (EventoOS & { os_id: string })[]) {
    const arr = eventosPor.get(e.os_id) || [];
    arr.push(e);
    eventosPor.set(e.os_id, arr);
  }
  const veicPor = new Map((veics.data || []).map((v) => [String(v.id), v]));
  const reqPor = new Map((reqs.data || []).map((r: { id: number; status: string | null; valor_despeza: unknown }) => [Number(r.id), r]));

  const os: OsFrota[] = lista.map((o) => {
    const etapa = o.etapa as EtapaOS;
    const base = {
      etapa, imobiliza: o.imobiliza !== false,
      entrada_em: (o.entrada_em as string) || null, pronta_em: (o.pronta_em as string) || null,
    };
    const dias = diasParado(base, agora);
    const r = o.requisicao_id != null ? reqPor.get(Number(o.requisicao_id)) : null;
    const valor = r ? parseValorMisto(r.valor_despeza) : 0;
    return {
      id: String(o.id), numero: Number(o.numero), rotulo: numeroOS(o.numero as number),
      veiculo_id: String(o.veiculo_id), placa: String(o.placa), veiculo: descricaoVeiculo(veicPor.get(String(o.veiculo_id))),
      etapa, etapa_desde: String(o.etapa_desde), descricao: (o.descricao as string) || null,
      oficina: o.oficina === 'externa' ? 'externa' : 'propria', fornecedor: (o.fornecedor as string) || null,
      os_pos: (o.os_pos as string) || null, imobiliza: o.imobiliza !== false,
      km_entrada: o.km_entrada != null ? Number(o.km_entrada) : null, foto_entrada: (o.foto_entrada as string) || null,
      entrada_em: base.entrada_em,
      peca: (o.peca as string) || null, previsao_peca: (o.previsao_peca as string) || null,
      pronta_em: base.pronta_em, km_saida: o.km_saida != null ? Number(o.km_saida) : null,
      foto_saida: (o.foto_saida as string) || null, retirado_por: (o.retirado_por as string) || null,
      concluida_em: (o.concluida_em as string) || null, cancelada_motivo: (o.cancelada_motivo as string) || null,
      requisicao: o.requisicao_id != null ? { id: Number(o.requisicao_id), status: r?.status ?? null, valor: valor || null } : null,
      criado_por: (o.criado_por as string) || null, criado_em: String(o.criado_em),
      itens: itensPor.get(String(o.id)) || [],
      eventos: eventosPor.get(String(o.id)) || [],
      parado: paradoAgora(base), dias_parado: dias, custo_parado: custoParado(dias),
    };
  });
  return { tabela: true, os };
}

/** O que dá para pôr numa OS deste carro: pendências abertas (fora de outra OS
 *  ativa) e preventivas vencidas ou vencendo. */
export async function candidatosOS(supabase: SupabaseClient, placa: string) {
  const [pend, ativos] = await Promise.all([
    supabase.from('frota_pendencias').select('*').eq('placa', placa).eq('status', 'aberta').order('aberta_em', { ascending: false }),
    supabase.from('frota_os_itens').select('pendencia_id, plano_id, frota_os!inner(etapa, placa)')
      .eq('frota_os.placa', placa).in('frota_os.etapa', ETAPAS_ATIVAS),
  ]);
  const ocupadasPend = new Set((ativos.data || []).map((i: { pendencia_id: string | null }) => i.pendencia_id).filter(Boolean));
  const ocupadosPlano = new Set((ativos.data || []).map((i: { plano_id: string | null }) => i.plano_id).filter(Boolean));
  const pendencias = ((pend.data || []) as { id: string; titulo: string; descricao: string | null; origem: string; gravidade?: string | null; aberta_em: string }[])
    .filter((p) => !ocupadasPend.has(p.id) && p.origem !== 'preventiva')
    .map((p) => ({ id: p.id, titulo: p.titulo, descricao: p.descricao, origem: p.origem, gravidade: p.gravidade ?? null, aberta_em: p.aberta_em }));
  let preventivas: { plano_id: string; nome: string; estado: string; texto: string }[] = [];
  try {
    const r = await calcularPreventivas(supabase, { placas: [placa] });
    const v = r.veiculos.find((x) => x.placa === placa);
    preventivas = (v?.itens || [])
      .filter((i) => precisaAtencao(i.situacao.estado) && !ocupadosPlano.has(i.plano.id))
      .map((i) => ({ plano_id: i.plano.id, nome: i.plano.nome, estado: i.situacao.estado, texto: i.situacao.texto }));
  } catch { /* sem preventiva cadastrada: só as pendências */ }
  return { pendencias, preventivas };
}

async function evento(supabase: SupabaseClient, osId: string, de: string | null, para: string, quem: string, detalhe?: Record<string, unknown>) {
  await supabase.from('frota_os_eventos').insert({ os_id: osId, de, para, quem, detalhe: detalhe ?? null });
}

/** Grava a leitura de km da entrada/saída da oficina em frota_leituras (vira
 *  âncora do km confiável). Falha aqui não impede a mudança de etapa. */
async function gravarLeitura(supabase: SupabaseClient, placa: string, km: number, fotoUrl: string | null, fonte: FonteLeitura, quem: string) {
  try {
    const { porPlaca } = await carregarKm(supabase, { placas: [placa] });
    const k = porPlaca.get(placa);
    if (!k) return;
    const em = new Date().toISOString();
    const v = validarLeitura({ km, em }, { anterior: k.ancora, esperado: k.resultado.km, tipo: k.tipo });
    await supabase.from('frota_leituras').insert({
      veiculo_id: k.veiculo_id, placa, lida_em: em, km, foto_url: fotoUrl, fonte, lido_por: quem,
      situacao: v.situacao, motivo: v.motivos.join(' ') || null,
    });
  } catch { /* leitura é extra: a OS anda mesmo sem ela */ }
}

export interface NovaOS {
  placa: string;
  descricao?: string | null;
  oficina?: 'propria' | 'externa';
  fornecedor?: string | null;
  os_pos?: string | null;
  imobiliza?: boolean;
  pendencia_ids?: string[];
  plano_ids?: string[];
  avulsos?: string[];
}

async function montarItens(supabase: SupabaseClient, placa: string, n: Pick<NovaOS, 'pendencia_ids' | 'plano_ids' | 'avulsos'>) {
  const itens: { tipo: 'pendencia' | 'preventiva' | 'avulso'; pendencia_id?: string; plano_id?: string; descricao: string }[] = [];
  const pIds = [...new Set((n.pendencia_ids || []).filter(Boolean))];
  if (pIds.length) {
    const { data } = await supabase.from('frota_pendencias').select('id, titulo, placa, status').in('id', pIds);
    for (const p of data || []) {
      if (p.placa !== placa || p.status !== 'aberta') continue;
      itens.push({ tipo: 'pendencia', pendencia_id: p.id, descricao: p.titulo });
    }
  }
  const plIds = [...new Set((n.plano_ids || []).filter(Boolean))];
  if (plIds.length) {
    const { data } = await supabase.from('frota_planos').select('id, nome').in('id', plIds);
    for (const p of data || []) itens.push({ tipo: 'preventiva', plano_id: p.id, descricao: `Preventiva: ${p.nome}` });
  }
  for (const a of n.avulsos || []) {
    const t = String(a || '').trim().slice(0, 200);
    if (t) itens.push({ tipo: 'avulso', descricao: t });
  }
  return itens;
}

export async function abrirOS(supabase: SupabaseClient, n: NovaOS, quem: string): Promise<string> {
  const { data: v } = await supabase.from('frota_veiculos').select('id, placa').eq('placa', n.placa).maybeSingle();
  if (!v) throw new ErroOficina('Veículo não encontrado na frota.', 404);
  const itens = await montarItens(supabase, n.placa, n);
  if (!itens.length && !String(n.descricao || '').trim()) {
    throw new ErroOficina('Escolha pelo menos uma pendência ou preventiva, ou descreva o serviço.');
  }
  const oficina = n.oficina === 'externa' ? 'externa' : 'propria';
  if (oficina === 'externa' && !String(n.fornecedor || '').trim()) throw new ErroOficina('Informe a oficina externa (fornecedor).');
  const { data, error } = await supabase.from('frota_os').insert({
    veiculo_id: v.id, placa: n.placa, etapa: 'aberta',
    descricao: String(n.descricao || '').trim().slice(0, 1000) || null,
    oficina, fornecedor: oficina === 'externa' ? String(n.fornecedor).trim().slice(0, 200) : null,
    os_pos: String(n.os_pos || '').trim().slice(0, 40) || null,
    imobiliza: n.imobiliza !== false, criado_por: quem,
  }).select('id, numero').single();
  if (error) {
    if (semTabelaOficina(error.message)) throw new ErroOficina(MSG_MIGRACAO_OFICINA, 503);
    if (error.code === '23505') throw new ErroOficina(`O ${n.placa} já tem uma OS em andamento. Inclua os itens nela.`, 409);
    throw new Error(error.message);
  }
  if (itens.length) {
    const r = await supabase.from('frota_os_itens').insert(itens.map((i) => ({ ...i, os_id: data.id })));
    if (r.error) throw new Error(r.error.message);
  }
  await evento(supabase, data.id, null, 'aberta', quem, { itens: itens.length });
  return data.id as string;
}

export async function adicionarItens(supabase: SupabaseClient, osId: string, n: Pick<NovaOS, 'pendencia_ids' | 'plano_ids' | 'avulsos'>, quem: string) {
  const { data: os } = await supabase.from('frota_os').select('id, placa, etapa').eq('id', osId).maybeSingle();
  if (!os) throw new ErroOficina('OS não encontrada.', 404);
  if (!ativa(os.etapa as EtapaOS)) throw new ErroOficina('A OS já foi encerrada.');
  const itens = await montarItens(supabase, os.placa, n);
  if (!itens.length) throw new ErroOficina('Nada para incluir.');
  const r = await supabase.from('frota_os_itens').insert(itens.map((i) => ({ ...i, os_id: osId })));
  if (r.error) {
    if (r.error.code === '23505') throw new ErroOficina('Algum desses itens já está na OS.', 409);
    throw new Error(r.error.message);
  }
  await evento(supabase, osId, os.etapa, os.etapa, quem, { incluidos: itens.map((i) => i.descricao) });
}

export async function marcarItem(supabase: SupabaseClient, osId: string, itemId: string, feito: boolean, extra: { foto_url?: string | null; obs?: string | null }, quem: string) {
  const { data: os } = await supabase.from('frota_os').select('etapa').eq('id', osId).maybeSingle();
  if (!os) throw new ErroOficina('OS não encontrada.', 404);
  if (!ativa(os.etapa as EtapaOS)) throw new ErroOficina('A OS já foi encerrada.');
  const upd: Record<string, unknown> = {
    feito, feito_em: feito ? new Date().toISOString() : null, feito_por: feito ? quem : null,
  };
  if (extra.foto_url !== undefined) upd.foto_url = extra.foto_url;
  if (extra.obs !== undefined) upd.obs = extra.obs ? String(extra.obs).slice(0, 500) : null;
  const { error } = await supabase.from('frota_os_itens').update(upd).eq('id', itemId).eq('os_id', osId);
  if (error) throw new Error(error.message);
}

export async function removerItem(supabase: SupabaseClient, osId: string, itemId: string, quem: string) {
  const { data: os } = await supabase.from('frota_os').select('etapa').eq('id', osId).maybeSingle();
  if (!os || !ativa(os.etapa as EtapaOS)) throw new ErroOficina('A OS já foi encerrada.');
  const { data: it } = await supabase.from('frota_os_itens').delete().eq('id', itemId).eq('os_id', osId).select('descricao').maybeSingle();
  if (it) await evento(supabase, osId, os.etapa, os.etapa, quem, { removido: it.descricao });
}

/** Muda a etapa (com as travas). Concluir resolve as pendências feitas e
 *  registra o serviço das preventivas feitas. */
export async function moverOS(supabase: SupabaseClient, osId: string, para: EtapaOS, d: DadosEtapa, quem: string) {
  const { data: o, error } = await supabase.from('frota_os').select('*').eq('id', osId).maybeSingle();
  if (error) {
    if (semTabelaOficina(error.message)) throw new ErroOficina(MSG_MIGRACAO_OFICINA, 503);
    throw new Error(error.message);
  }
  if (!o) throw new ErroOficina('OS não encontrada.', 404);
  const de = o.etapa as EtapaOS;
  const hoje = diaBR();
  const erro = validarMudanca({ etapa: de, km_entrada: o.km_entrada, foto_entrada: o.foto_entrada }, para, d, hoje);
  if (erro) throw new ErroOficina(erro);

  const agoraIso = new Date().toISOString();
  const km = d.km != null ? Math.round(Number(d.km)) : null;
  const upd: Record<string, unknown> = { etapa: para, etapa_desde: agoraIso, atualizado_em: agoraIso };
  if (para === 'em_oficina' && de === 'aberta') {
    Object.assign(upd, { km_entrada: km, foto_entrada: d.foto_url, entrada_em: agoraIso });
  }
  if (para === 'em_oficina' && de === 'pronta') upd.pronta_em = null;   // não ficou bom: volta a contar parado
  if (para === 'aguardando_peca') Object.assign(upd, { peca: String(d.peca).trim().slice(0, 200), previsao_peca: d.previsao_peca });
  if (para === 'pronta') upd.pronta_em = agoraIso;
  if (para === 'concluida') {
    Object.assign(upd, { km_saida: km, foto_saida: d.foto_url, retirado_por: String(d.retirado_por).trim().slice(0, 120), concluida_em: agoraIso });
  }
  if (para === 'cancelada') upd.cancelada_motivo = String(d.motivo).trim().slice(0, 500);

  // update condicional: duas pessoas movendo a mesma OS ao mesmo tempo
  const { data: atual, error: eu } = await supabase.from('frota_os').update(upd).eq('id', osId).eq('etapa', de).select('id').maybeSingle();
  if (eu) throw new Error(eu.message);
  if (!atual) throw new ErroOficina('A OS mudou enquanto você editava. Atualize a tela.', 409);

  const detalhe: Record<string, unknown> = {};
  if (km) detalhe.km = km;
  if (d.peca) detalhe.peca = d.peca;
  if (d.previsao_peca) detalhe.previsao_peca = d.previsao_peca;
  if (d.retirado_por) detalhe.retirado_por = d.retirado_por;
  if (d.motivo) detalhe.motivo = d.motivo;
  await evento(supabase, osId, de, para, quem, Object.keys(detalhe).length ? detalhe : undefined);

  if (para === 'em_oficina' && de === 'aberta' && km) await gravarLeitura(supabase, o.placa, km, d.foto_url ?? null, 'oficina_entrada', quem);

  let resumo: { resolvidas: number; servicos: number; naoFeitos: number } | null = null;
  if (para === 'concluida') {
    if (km) await gravarLeitura(supabase, o.placa, km, d.foto_url ?? null, 'oficina_saida', quem);
    const { data: itens } = await supabase.from('frota_os_itens').select('id, tipo, pendencia_id, plano_id, feito').eq('os_id', osId);
    const plano = planejarConclusao((itens || []) as never[]);
    const rotulo = numeroOS(o.numero);
    if (plano.pendenciasResolver.length) {
      await supabase.from('frota_pendencias').update({
        status: 'resolvida', resolvida_por: quem, resolvida_em: agoraIso,
        resolucao: `Feito na ${rotulo} (oficina da frota).`,
      }).in('id', plano.pendenciasResolver).eq('status', 'aberta');
    }
    if (plano.planosServico.length) {
      await supabase.from('frota_servicos').insert(plano.planosServico.map((plano_id) => ({
        veiculo_id: o.veiculo_id, placa: o.placa, plano_id, data: hoje, km,
        origem: 'os', origem_ref: osId, obs: `Feito na ${rotulo}`, criado_por: quem,
      })));
    }
    resumo = { resolvidas: plano.pendenciasResolver.length, servicos: plano.planosServico.length, naoFeitos: plano.naoFeitos };
  }
  return { de, para, placa: o.placa as string, rotulo: numeroOS(o.numero), resumo };
}

export async function criarRequisicaoDaOS(supabase: SupabaseClient, osId: string, quem: string): Promise<number> {
  const { data: o } = await supabase.from('frota_os').select('*').eq('id', osId).maybeSingle();
  if (!o) throw new ErroOficina('OS não encontrada.', 404);
  if (o.requisicao_id) throw new ErroOficina(`A OS já tem a requisição #${o.requisicao_id}.`, 409);
  if (!ativa(o.etapa as EtapaOS)) throw new ErroOficina('A OS já foi encerrada.');
  const { data: itens } = await supabase.from('frota_os_itens').select('descricao').eq('os_id', osId);
  const lista = (itens || []).map((i: { descricao: string }) => i.descricao);
  const rotulo = numeroOS(o.numero);
  const titulo = `${rotulo} · ${o.placa}: ${lista.length ? lista.slice(0, 3).join(', ') + (lista.length > 3 ? ` +${lista.length - 3}` : '') : (o.descricao || 'manutenção')}`.slice(0, 200);
  const id = await criarRequisicaoManutencao(supabase, {
    placa: o.placa, titulo, solicitante: quem, criadoPor: quem, km: o.km_entrada ?? null,
    origem: `Aberta pela ${rotulo} da oficina da frota`,
    descricao: [o.descricao, ...lista.map((l: string) => `- ${l}`), o.oficina === 'externa' && o.fornecedor ? `Oficina: ${o.fornecedor}` : '']
      .filter(Boolean).join('\n'),
  });
  await supabase.from('frota_os').update({ requisicao_id: id, atualizado_em: new Date().toISOString() }).eq('id', osId);
  await evento(supabase, osId, o.etapa, o.etapa, quem, { requisicao: id });
  return id;
}

/** Para o motor de pendências: o que está numa OS ativa não é mexido por ele,
 *  e a requisição criada pela OS não vira pendência nova. */
export async function travasDaOficina(supabase: SupabaseClient): Promise<{ pendencias: Set<string>; requisicoes: Set<string> } | null> {
  const { data, error } = await supabase.from('frota_os').select('requisicao_id, etapa, frota_os_itens(pendencia_id)');
  if (error) return null;   // sem a migration: o motor segue como antes
  const pendencias = new Set<string>();
  const requisicoes = new Set<string>();
  for (const o of (data || []) as { requisicao_id: number | null; etapa: EtapaOS; frota_os_itens: { pendencia_id: string | null }[] }[]) {
    if (o.requisicao_id != null) requisicoes.add(String(o.requisicao_id));
    if (!ativa(o.etapa)) continue;
    for (const i of o.frota_os_itens || []) if (i.pendencia_id) pendencias.add(i.pendencia_id);
  }
  return { pendencias, requisicoes };
}

export { ETAPA_INFO };
