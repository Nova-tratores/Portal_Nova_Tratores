/* eslint-disable @typescript-eslint/no-explicit-any */
// =============================================================================
// INTELIGÊNCIA DE VENDAS — casca das rotas /api/inteligencia-vendas/*.
//
// Gate: módulo 'inteligencia-vendas' (ou alguma tela dele). As leituras usam o
// service role e ficam em CACHE no processo (a base cruza ~60 mil linhas de 8
// tabelas: 10–15 s a frio). "Atualizar" na tela força a releitura.
// =============================================================================
import { gunzipSync, gzipSync } from 'node:zlib';
import { NextResponse } from 'next/server';
import { autenticar, type Autenticado } from '@/lib/auth/server';
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { registrarAuditLog } from '@/lib/server/audit-notify';
import { paginar } from '@/lib/db/paginar';
import { montarBase, type Fontes } from './base';
import { hojeBR } from './normalizar';
import type { ClienteIV } from './tipos';

export const SISTEMA_IV = 'inteligencia-vendas';

export function temAcessoIV(auth: Autenticado, tela?: string): boolean {
  if (auth.isAdmin) return true;
  if (auth.modulos.includes(SISTEMA_IV)) return true;
  if (!tela) return auth.modulos.some((m) => m.startsWith(`${SISTEMA_IV}:`));
  return auth.modulos.some((m) => m === `${SISTEMA_IV}:${tela}` || m.startsWith(`${SISTEMA_IV}:${tela}:`));
}

export async function guardarIV(
  req: Request,
  tela?: string,
): Promise<{ auth: Autenticado; resposta?: never } | { auth?: never; resposta: NextResponse }> {
  const auth = await autenticar(req);
  if (!auth) return { resposta: NextResponse.json({ error: 'Não autenticado' }, { status: 401 }) };
  if (!temAcessoIV(auth, tela)) return { resposta: NextResponse.json({ error: 'Sem permissão para a Inteligência de Vendas' }, { status: 403 }) };
  return { auth };
}

export async function nomeDoUsuario(auth: Autenticado): Promise<string> {
  try {
    const { data } = await supabaseAdmin.from('financeiro_usu').select('nome').eq('id', auth.userId).maybeSingle();
    if (data?.nome) return String(data.nome);
  } catch { /* fallback abaixo */ }
  return auth.email || 'Usuário do portal';
}

export async function logIV(
  auth: Autenticado,
  p: { acao: string; entidade?: string; entidadeId?: string; entidadeLabel?: string; detalhes?: Record<string, unknown> },
): Promise<void> {
  try {
    await registrarAuditLog({ userId: auth.userId, userName: await nomeDoUsuario(auth), sistema: SISTEMA_IV, ...p });
  } catch (e) {
    console.warn('[inteligencia-vendas] audit log falhou:', e);
  }
}

export function migracaoFaltando(e: any): boolean {
  const m = String(e?.message || e || '');
  return /iv_/.test(m) && /does not exist|not find|schema cache/i.test(m);
}

export function erroIV(e: any, contexto: string): NextResponse {
  if (migracaoFaltando(e)) {
    return NextResponse.json({ error: 'Migration sql/inteligencia-vendas.sql não aplicada', migracaoFaltando: true }, { status: 503 });
  }
  console.error(`[inteligencia-vendas] ${contexto}:`, e);
  return NextResponse.json({ error: e?.message || 'Erro inesperado' }, { status: 500 });
}

// ── cache simples no processo ───────────────────────────────────────────────
type Entrada<T> = { em: number; valor?: T; promessa?: Promise<T> };
const g = globalThis as any;
const CACHE: Map<string, Entrada<any>> = g.__ivCache || (g.__ivCache = new Map());

export async function emCache<T>(chave: string, ttlMs: number, fn: () => Promise<T>, forcar = false): Promise<T> {
  const e = CACHE.get(chave);
  if (!forcar && e?.valor !== undefined && Date.now() - e.em < ttlMs) return e.valor;
  if (e?.promessa) return e.promessa;
  const promessa = fn().then((v) => { CACHE.set(chave, { em: Date.now(), valor: v }); return v; })
    .catch((err) => { if (e?.valor !== undefined) CACHE.set(chave, { em: e.em, valor: e.valor }); else CACHE.delete(chave); throw err; });
  CACHE.set(chave, { em: e?.em ?? 0, valor: e?.valor, promessa });
  return promessa;
}

export function idadeCache(chave: string): number | null {
  const e = CACHE.get(chave);
  return e?.valor !== undefined ? e.em : null;
}

// ── cache NO BANCO (José, 19/10/2026: "não pode demorar, tem que ficar salvando no banco") ──
// O resultado pronto fica em iv_snapshot (JSON compactado). A tela lê de lá na hora; se
// estiver velho, devolve assim mesmo e recalcula por trás (o próximo já vem novo). Sem a
// tabela (migration sql/inteligencia-vendas-snapshot.sql), funciona como o emCache.
const SNAP = 'iv_snapshot';

async function lerSnapshot<T>(chave: string): Promise<{ valor: T; em: number } | null> {
  try {
    const { data, error } = await supabaseAdmin.from(SNAP).select('dados,gerado_em').eq('chave', chave).maybeSingle();
    if (error || !data?.dados) return null;
    const valor = JSON.parse(gunzipSync(Buffer.from(String(data.dados), 'base64')).toString('utf8')) as T;
    return { valor, em: Date.parse(data.gerado_em) || 0 };
  } catch { return null; }
}

async function gravarSnapshot(chave: string, valor: unknown, duracaoMs: number): Promise<void> {
  try {
    const dados = gzipSync(Buffer.from(JSON.stringify(valor), 'utf8')).toString('base64');
    await supabaseAdmin.from(SNAP).upsert({ chave, dados, gerado_em: new Date().toISOString(), duracao_ms: Math.round(duracaoMs) }, { onConflict: 'chave' });
  } catch (e) { console.error(`[inteligencia-vendas] snapshot ${chave} não gravado:`, (e as Error)?.message); }
}

/** Recalcula e grava no banco; uma vez por chave por vez no processo. */
function recalcular<T>(chave: string, fn: () => Promise<T>): Promise<T> {
  const e = CACHE.get(chave);
  if (e?.promessa) return e.promessa;
  const t0 = Date.now();
  const promessa = fn().then(async (v) => {
    CACHE.set(chave, { em: Date.now(), valor: v });
    await gravarSnapshot(chave, v, Date.now() - t0);
    return v;
  }).catch((err) => { if (e?.valor !== undefined) CACHE.set(chave, { em: e.em, valor: e.valor }); else CACHE.delete(chave); throw err; });
  CACHE.set(chave, { em: e?.em ?? 0, valor: e?.valor, promessa });
  return promessa;
}

/**
 * Memória → banco → calcula. Velho (> ttl) não trava a tela: devolve o que tem e
 * recalcula em segundo plano. `forcar` = botão Atualizar (espera o cálculo novo).
 */
export async function emBanco<T>(chave: string, ttlMs: number, fn: () => Promise<T>, forcar = false): Promise<{ valor: T; em: number }> {
  if (forcar) { const v = await recalcular(chave, fn); return { valor: v, em: Date.now() }; }
  let e = CACHE.get(chave);
  if (e?.valor === undefined) {
    const s = await lerSnapshot<T>(chave);
    if (s) { CACHE.set(chave, { em: s.em, valor: s.valor, promessa: CACHE.get(chave)?.promessa }); e = CACHE.get(chave); }
  }
  if (e?.valor !== undefined) {
    if (Date.now() - e.em > ttlMs && !e.promessa) recalcular(chave, fn).catch(() => { /* fica o antigo */ });
    return { valor: e.valor as T, em: e.em };
  }
  const v = await recalcular(chave, fn);
  return { valor: v, em: Date.now() };
}

async function tudo<T = any>(tabela: string, colunas: string, ordem: string): Promise<T[]> {
  const { data, error } = await paginar<T>((de, ate) => supabaseAdmin.from(tabela).select(colunas).order(ordem).range(de, ate) as any);
  if (error) throw new Error(`${tabela}: ${error.message}`);
  return data;
}

/** iv_cnpj é opcional (migration nova): falta = lista vazia. */
async function cnpjsOpcional(): Promise<Fontes['cnpjs']> {
  try {
    return await tudo('iv_cnpj', 'cnpj,cnae_codigo,cnae_descricao,data_inicio,porte,situacao', 'cnpj');
  } catch (e) {
    if (migracaoFaltando(e)) return [];
    throw e;
  }
}

export async function lerFontes(): Promise<Fontes & { negocios: any[]; visitasRetorno: any[]; propriedadesNome: any[] }> {
  const [cadastro, vendas, tratores, propostas, os, propriedades, visitas, vendedores, cnpjs, negocios] = await Promise.all([
    tudo('portal_nt_clientes_cadastro_omie', 'cod_cli,empresa,cnpj_cpf,razao_social,nome_fantasia,cidade,estado,telefone,inativo', 'cod_cli'),
    tudo('vendas_itens', 'conta_omie,codigo_cliente,familia,descricao,data_pedido,valor_total,numero_pedido', 'id'),
    tudo('tratores', 'Modelo,Chassis,Cliente,Cidade,Vendedor,Entrega', 'ID'),
    tudo('v_formulario', 'id,Cliente,cliente_doc_norm,"Cpf/Cpnj",Cidade,Modelo,Marca,status,vendedor_nome,criado_em,status_desde,proximo_contato,previsao_fechamento,validade,Valor_Total,em_aberto,motivo_perda_id,concorrente,concorrente_valor,fechado_em,termometro', 'id'),
    tudo('portal_nt_clientes_os', 'cod_cli,empresa,descricao,data_inclusao,cancelada', 'cod_os'),
    tudo('portal_nt_clientes_PRINCIPAL', 'id,id_omie,cnpj_cpf,area_hectares,culturas,nome_fantasia,razao_social,cidade,latitude,longitude,lat,lng', 'id'),
    tudo('visitas', 'id,vendedor_id,propriedade_id,data_visita,data_proximo_contato,proximos_passos', 'id'),
    tudo('vendedores', 'id,nome', 'id'),
    cnpjsOpcional(),
    tudo('negocios', 'id,vendedor_id,propriedade_id,status,valor,updated_at,created_at,data_fechamento_prevista,maquina_modelo,maquina_marca,notas,cidade', 'id'),
  ]);
  return {
    cadastro, vendas, tratores, propostas, os, propriedades, visitas, vendedores, cnpjs,
    negocios, visitasRetorno: visitas, propriedadesNome: propriedades,
  };
}

export const TTL_BASE = 30 * 60_000;

export async function carregarFontes(forcar = false) {
  return emCache('fontes', TTL_BASE, lerFontes, forcar);
}

/** Base dos clientes: vem pronta do banco (iv_snapshot); recalcula por trás quando passa de 30 min. */
export async function carregarBase(forcar = false): Promise<{ clientes: ClienteIV[]; atualizadoEm: number }> {
  const r = await emBanco('base', TTL_BASE, async () => montarBase(await carregarFontes(forcar), hojeBR()), forcar);
  return { clientes: r.valor, atualizadoEm: r.em };
}
