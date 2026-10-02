// Cheque de revisão — acesso ao banco (service role). Tabela revisao_cheques
// (migrations sql/revisao-cheques.sql + sql/revisao-cheques-atrasados.sql).
// Tudo aqui é chamado pelas rotas /api.
//
// Uma OS tem UM cheque principal (o da revisão dela) e pode ter cheques
// ATRASADOS (atrasado=true): revisões anteriores que nunca foram enviadas,
// geradas a partir desta OS — com os dados da OS daquela revisão quando ela
// existe (os_ref), senão com data/horímetro em branco pra preencher.
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'crypto';
import { PORTAL_BASE } from '@/lib/portal-url';
import { extrairChassis, extrairHorasRevisaoOS } from '@/lib/pos/extrairTrator';
import { normalizarHorasRevisao } from '@/lib/pos/vigia-revisoes-regras';
import {
  classificarAnteriores, dadosAtrasadoSemOS, dadosIniciais, dataBR, normalizarDados, HORAS_CHEQUE, PAGINA_TALAO,
  type DadosCheque, type FonteOS, type FonteTrator, type OSRef, type RevisaoAnterior,
} from './cheque';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

export interface ChequeRow {
  id: string;
  os_id: string;
  chassis: string;
  horas: number;
  pagina: number | null;
  dados: DadosCheque;
  token: string;
  assinatura_cliente_url: string | null;
  assinado_em: string | null;
  assinado_nome: string | null;
  assinado_ip: string | null;
  assinado_geo: GeoAssinatura | null;
  assinado_dispositivo: DispositivoAssinatura | null;
  assinatura_tecnico_url: string | null;
  criado_por: string | null;
  created_at: string;
  updated_at: string;
  /** cheque de revisão ANTERIOR gerado por esta OS */
  atrasado: boolean;
  /** OS daquela revisão anterior usada como fonte (se existia) */
  os_ref: string | null;
}

export interface GeoAssinatura { lat: number; lng: number; precisao_m?: number | null; obtido_em?: string | null }
export interface DispositivoAssinatura { modelo?: string | null; plataforma?: string | null; versao?: string | null; ua?: string | null; tela?: string | null }

export type CodigoErroCheque = 'os_nao_encontrada' | 'nao_e_revisao' | 'sem_chassi' | 'nao_mahindra' | 'token_invalido' | 'ja_assinado' | 'tabela_ausente'
  | 'cheque_nao_encontrado' | 'horas_invalidas' | 'cheque_existe' | 'migration_atrasados';
export class ErroCheque extends Error {
  constructor(public codigo: CodigoErroCheque, msg: string) { super(msg); }
}

const SEL_BASE = 'id,os_id,chassis,horas,pagina,dados,token,assinatura_cliente_url,assinado_em,assinado_nome,assinado_ip,assinado_geo,assinado_dispositivo,assinatura_tecnico_url,criado_por,created_at,updated_at';
const SEL_NOVO = `${SEL_BASE},atrasado,os_ref`;

// A migration dos atrasados pode não ter sido aplicada: as consultas tentam com
// as colunas novas e caem pro formato antigo (sem atrasado/os_ref) se faltarem.
let temColunasNovas: boolean | null = null;
type Erro = { message?: string; code?: string } | null;
const semColunaNova = (e: Erro) => !!e && (e.code === '42703' || /(atrasado|os_ref)/i.test(e.message || ''));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function rodar<T>(fn: (sel: string, novo: boolean) => PromiseLike<{ data: any; error: Erro }>): Promise<{ data: T | null; error: Erro }> {
  if (temColunasNovas !== false) {
    const r = await fn(SEL_NOVO, true);
    if (!semColunaNova(r.error)) { temColunasNovas = true; return r as { data: T | null; error: Erro }; }
    temColunasNovas = false;
  }
  return (await fn(SEL_BASE, false)) as { data: T | null; error: Erro };
}

function gerarToken(): string { return randomBytes(32).toString('base64url'); }

function normalizarRow(r: Record<string, unknown>): ChequeRow {
  return { ...(r as unknown as ChequeRow), dados: normalizarDados(r.dados), atrasado: !!r.atrasado, os_ref: (r.os_ref as string | null) ?? null };
}

function checarTabela(error: Erro) {
  if (error && (error.code === '42P01' || /revisao_cheques.*(does not exist|schema cache)/i.test(error.message || ''))) {
    throw new ErroCheque('tabela_ausente', 'Tabela revisao_cheques não existe — aplicar sql/revisao-cheques.sql');
  }
}

/** Cheque de uma OS: sem `horas` é o PRINCIPAL (o da revisão da OS); com `horas` é o daquelas horas (principal ou atrasado). */
export async function buscarPorOS(osId: string, horas?: number | null): Promise<ChequeRow | null> {
  const { data, error } = await rodar<Record<string, unknown>>((sel, novo) => {
    let q = db.from('revisao_cheques').select(sel).eq('os_id', osId);
    if (horas) q = q.eq('horas', horas);
    else if (novo) q = q.eq('atrasado', false);
    return q.order('created_at', { ascending: true }).limit(1).maybeSingle();
  });
  checarTabela(error);
  if (error) throw new Error(error.message);
  return data ? normalizarRow(data) : null;
}

/** Todos os cheques de uma OS (principal + atrasados), por horas. */
export async function listarChequesOS(osId: string): Promise<ChequeRow[]> {
  const { data, error } = await rodar<Record<string, unknown>[]>((sel) => db.from('revisao_cheques').select(sel).eq('os_id', osId).order('horas', { ascending: true }));
  checarTabela(error);
  if (error) throw new Error(error.message);
  return (data || []).map(normalizarRow);
}

export async function buscarPorToken(token: string): Promise<ChequeRow> {
  if (!/^[A-Za-z0-9_-]{20,128}$/.test(token)) throw new ErroCheque('token_invalido', 'link inválido');
  const { data, error } = await rodar<Record<string, unknown>>((sel) => db.from('revisao_cheques').select(sel).eq('token', token).maybeSingle());
  checarTabela(error);
  if (error) throw new Error(error.message);
  if (!data) throw new ErroCheque('token_invalido', 'link inválido');
  return normalizarRow(data);
}

const SEL_OS = 'Id_Ordem,Os_Cliente,Cnpj_Cliente,Os_Tecnico,Projeto,Serv_Solicitado,Revisao,Tipo_Servico,Status,Data,Data_Fim_Servico,Ordem_Omie,id_omie';
type RowOS = FonteOS & { Revisao?: string | null; Tipo_Servico?: string | null; Status?: string | null };

async function lerOS(osId: string): Promise<RowOS> {
  const { data: os, error } = await db.from('Ordem_Servico').select(SEL_OS).eq('Id_Ordem', osId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!os) throw new ErroCheque('os_nao_encontrada', `OS ${osId} não encontrada`);
  return os as RowOS;
}

async function horimetroTecnico(osId: string): Promise<string | null> {
  const { data } = await db.from('Ordem_Servico_Tecnicos').select('Horimetro,IdOs').eq('Ordem_Servico', osId).order('IdOs', { ascending: false }).limit(1).maybeSingle();
  return (data as { Horimetro?: string } | null)?.Horimetro ?? null;
}

/**
 * Trator do cadastro Mahindra pelo chassi. Tolera erro de digitação no cadastro
 * (caso real: "MDI07513V50005756" gravado com "5" no lugar do "S"): se não acha
 * exato, aceita o ÚNICO trator com o mesmo final de 7 caracteres.
 */
export async function buscarTrator(chassis: string): Promise<(FonteTrator & { Chassis?: string }) | null> {
  const cols = 'Modelo,Numero_Motor,Entrega,Cliente,Chassis';
  const exato = await db.from('tratores').select(cols).ilike('Chassis', chassis).limit(1).maybeSingle();
  if (exato.data) return exato.data as FonteTrator & { Chassis?: string };
  const final = chassis.slice(-7);
  if (final.length < 7) return null;
  const { data } = await db.from('tratores').select(cols).ilike('Chassis', `%${final}`).limit(2);
  if (data?.length === 1) {
    console.warn(`[cheque] chassi ${chassis} não está exato no cadastro — usando ${data[0].Chassis} (mesmo final ${final})`);
    return data[0] as FonteTrator & { Chassis?: string };
  }
  return null;
}

/** Monta os dados do cheque a partir de UMA OS (a dela mesma ou a de uma revisão anterior). */
async function montarDeOS(os: RowOS, chassis: string): Promise<DadosCheque> {
  const [trator, hor] = await Promise.all([buscarTrator(chassis), horimetroTecnico(os.Id_Ordem)]);
  if (!trator) throw new ErroCheque('nao_mahindra', `Chassi ${chassis} não está no cadastro de tratores Mahindra.`);
  return dadosIniciais(os, chassis, trator, hor);
}

/** Lê OS + trator e monta os dados iniciais do cheque PRINCIPAL. Lança ErroCheque quando a OS não serve. */
async function montarInicial(osId: string): Promise<{ chassis: string; horas: number; dados: DadosCheque }> {
  const os = await lerOS(osId);
  const horas = normalizarHorasRevisao(extrairHorasRevisaoOS(os));
  if (!horas) throw new ErroCheque('nao_e_revisao', 'A OS não é de revisão (não achei as horas no plano nem na solicitação).');
  const chassis = extrairChassis(os);
  if (!chassis) throw new ErroCheque('sem_chassi', 'A OS não tem chassi (Projeto/solicitação).');
  const dados = await montarDeOS(os, chassis);
  return { chassis, horas, dados };
}

/** Assinatura do cliente já colhida pelo link genérico (/assinar) da OS, pra herdar no cheque. */
async function assinaturaHerdada(osId: string): Promise<Record<string, unknown>> {
  try {
    const { buscarPorOS: buscarAss } = await import('@/lib/pos/assinatura-cliente-db');
    const a = await buscarAss(osId);
    if (a?.assinado_em) return { assinatura_cliente_url: a.assinatura_url, assinado_em: a.assinado_em, assinado_nome: a.assinado_nome, assinado_ip: a.assinado_ip, assinado_geo: a.assinado_geo, assinado_dispositivo: a.assinado_dispositivo };
  } catch { /* sem tabela de assinaturas */ }
  return {};
}

/** Garante que a OS tem o cheque PRINCIPAL (cria com dados iniciais se não tiver). */
export async function garantirCheque(osId: string, criadoPor?: string | null): Promise<ChequeRow> {
  const existente = await buscarPorOS(osId);
  if (existente) return existente;
  const { chassis, horas, dados } = await montarInicial(osId);
  const herdada = await assinaturaHerdada(osId);
  const { data, error } = await rodar<Record<string, unknown>>((sel) => db.from('revisao_cheques').insert([{
    os_id: osId, chassis, horas, pagina: PAGINA_TALAO[horas] ?? null, dados, token: gerarToken(), criado_por: criadoPor || null, ...herdada,
  }]).select(sel).single());
  checarTabela(error);
  if (error) {
    // corrida: outro pedido criou ao mesmo tempo
    const denovo = await buscarPorOS(osId);
    if (denovo) return denovo;
    throw new Error(error.message);
  }
  return normalizarRow(data!);
}

/** Cheque-alvo das operações: sem `horas` o principal (criando se preciso); com `horas` tem que existir. */
async function alvo(osId: string, horas?: number | null): Promise<ChequeRow> {
  if (!horas) return garantirCheque(osId);
  const c = await buscarPorOS(osId, horas);
  if (!c) throw new ErroCheque('cheque_nao_encontrado', `A OS ${osId} não tem cheque das ${horas} horas.`);
  return c;
}

export async function atualizarDados(osId: string, dados: Partial<DadosCheque>, horas?: number | null, alvoHoras?: number | null): Promise<ChequeRow> {
  const atual = await alvo(osId, alvoHoras);
  const novos = normalizarDados({ ...atual.dados, ...dados });
  const patch: Record<string, unknown> = { dados: novos };
  // só o cheque principal pode trocar de horas (o atrasado É as horas dele)
  if (!atual.atrasado && horas && PAGINA_TALAO[horas]) { patch.horas = horas; patch.pagina = PAGINA_TALAO[horas]; }
  if (novos.chassi && novos.chassi !== atual.chassis) patch.chassis = novos.chassi;
  const { data, error } = await rodar<Record<string, unknown>>((sel) => db.from('revisao_cheques').update(patch).eq('id', atual.id).select(sel).single());
  if (error) throw new Error(error.message);
  return normalizarRow(data!);
}

/** Recria os dados iniciais a partir da OS/trator (descarta edições). Atrasado: da OS de referência, ou em branco. */
export async function repreencher(osId: string, alvoHoras?: number | null): Promise<ChequeRow> {
  const atual = await alvo(osId, alvoHoras);
  let patch: Record<string, unknown>;
  if (atual.atrasado) {
    const { dados, os_ref } = await montarAtrasado(osId, atual.horas);
    patch = { dados, os_ref };
  } else {
    const { chassis, horas, dados } = await montarInicial(osId);
    patch = { chassis, horas, pagina: PAGINA_TALAO[horas] ?? null, dados };
  }
  const { data, error } = await rodar<Record<string, unknown>>((sel) => db.from('revisao_cheques').update(patch).eq('id', atual.id).select(sel).single());
  if (error) throw new Error(error.message);
  return normalizarRow(data!);
}

// ---- revisões anteriores / cheques atrasados ----

/** OSs de revisão do mesmo chassi (menos a atual e as canceladas), uma por horas (a mais recente). */
async function osDoChassiPorHoras(chassis: string, excluirOs: string): Promise<Map<number, OSRef & { os: RowOS }>> {
  const { data, error } = await db.from('Ordem_Servico').select(SEL_OS)
    .or(`Projeto.ilike.%${chassis}%,Serv_Solicitado.ilike.%${chassis}%`)
    .neq('Id_Ordem', excluirOs).limit(200);
  if (error) throw new Error(error.message);
  const rows = ((data || []) as RowOS[]).filter((o) => String(o.Status || '') !== 'Cancelada');
  const ids = rows.map((o) => o.Id_Ordem);
  const hor = new Map<string, string>();
  if (ids.length) {
    const { data: tecs } = await db.from('Ordem_Servico_Tecnicos').select('Ordem_Servico,Horimetro,IdOs').in('Ordem_Servico', ids).order('IdOs', { ascending: true });
    for (const t of (tecs || []) as { Ordem_Servico: string; Horimetro?: string | null }[]) if (t.Horimetro) hor.set(t.Ordem_Servico, String(t.Horimetro));
  }
  const mapa = new Map<number, OSRef & { os: RowOS }>();
  for (const os of rows.sort((a, b) => String(a.Data || '').localeCompare(String(b.Data || '')))) {
    const h = normalizarHorasRevisao(extrairHorasRevisaoOS(os));
    if (!h) continue;
    const horim = hor.get(os.Id_Ordem) || '';
    mapa.set(h, { id: os.Id_Ordem, data: dataBR(os.Data_Fim_Servico || os.Data), horimetro: horim ? `${horim.replace('.', ',')} h` : '', os });
  }
  return mapa;
}

/** Revisões anteriores à da OS e a situação de cada uma (enviada / com cheque / pendente). */
export async function revisoesAnteriores(osId: string): Promise<{ chassis: string; horasAtual: number; anteriores: RevisaoAnterior[] }> {
  const principal = await garantirCheque(osId);
  const chassis = principal.chassis;
  const [{ data: env }, cheques, osPorHoras] = await Promise.all([
    db.from('revisao_emails').select('horas').eq('chassis_final', chassis.slice(-4)),
    rodar<{ os_id: string; horas: number; atrasado?: boolean }[]>((sel) => db.from('revisao_cheques').select(sel).ilike('chassis', chassis)),
    osDoChassiPorHoras(chassis, osId),
  ]);
  const enviadas = new Set<number>();
  for (const r of (env || []) as { horas: string | number }[]) { const h = normalizarHorasRevisao(Number(r.horas)); if (h) enviadas.add(h); }
  const porHoras = new Map<number, { osId: string; atrasado: boolean }>();
  for (const c of cheques.data || []) {
    if (c.os_id === osId && c.horas === principal.horas) continue; // o principal desta OS não é "anterior"
    // prioridade: cheque desta OS (atrasado) > cheque de outra OS
    const ja = porHoras.get(c.horas);
    if (!ja || c.os_id === osId) porHoras.set(c.horas, { osId: c.os_id, atrasado: !!c.atrasado });
  }
  const refs = new Map<number, OSRef>();
  for (const [h, v] of osPorHoras) refs.set(h, { id: v.id, data: v.data, horimetro: v.horimetro });
  return { chassis, horasAtual: principal.horas, anteriores: classificarAnteriores(principal.horas, enviadas, porHoras, refs) };
}

/** Dados de um cheque atrasado: da OS daquela revisão (se existe) ou da OS atual com data/horímetro em branco. */
async function montarAtrasado(osId: string, horas: number): Promise<{ dados: DadosCheque; os_ref: string | null }> {
  const principal = await garantirCheque(osId);
  const refs = await osDoChassiPorHoras(principal.chassis, osId);
  const ref = refs.get(horas);
  if (ref) return { dados: await montarDeOS(ref.os, principal.chassis), os_ref: ref.id };
  return { dados: dadosAtrasadoSemOS(principal.dados), os_ref: null };
}

/** Gera (ou devolve) o cheque ATRASADO das `horas` a partir desta OS. */
export async function gerarAtrasado(osId: string, horas: number, criadoPor?: string | null): Promise<ChequeRow> {
  const principal = await garantirCheque(osId, criadoPor);
  if (!HORAS_CHEQUE.includes(horas) || horas >= principal.horas) {
    throw new ErroCheque('horas_invalidas', `Só dá pra gerar cheque de revisão ANTERIOR às ${principal.horas} horas desta OS.`);
  }
  const existente = await buscarPorOS(osId, horas);
  if (existente) return existente;
  const { data: outro } = await db.from('revisao_cheques').select('os_id').ilike('chassis', principal.chassis).eq('horas', horas).limit(1).maybeSingle();
  if (outro?.os_id) throw new ErroCheque('cheque_existe', `Já existe o cheque das ${horas} horas deste trator na ${outro.os_id} — use aquele.`);
  const { dados, os_ref } = await montarAtrasado(osId, horas);
  // assinatura do cliente: a da OS daquela revisão, se ele assinou lá; senão a desta OS
  let herdada = os_ref ? await assinaturaHerdada(os_ref) : {};
  if (!Object.keys(herdada).length) {
    herdada = principal.assinado_em
      ? { assinatura_cliente_url: principal.assinatura_cliente_url, assinado_em: principal.assinado_em, assinado_nome: principal.assinado_nome, assinado_ip: principal.assinado_ip, assinado_geo: principal.assinado_geo, assinado_dispositivo: principal.assinado_dispositivo }
      : {};
  }
  const { data, error } = await db.from('revisao_cheques').insert([{
    os_id: osId, chassis: principal.chassis, horas, pagina: PAGINA_TALAO[horas] ?? null, dados, token: gerarToken(), criado_por: criadoPor || null,
    atrasado: true, os_ref, assinatura_tecnico_url: principal.assinatura_tecnico_url, ...herdada,
  }]).select(SEL_NOVO).single();
  if (error) {
    if (semColunaNova(error) || error.code === '23505') throw new ErroCheque('migration_atrasados', 'Falta aplicar sql/revisao-cheques-atrasados.sql no Supabase (cheques de revisões anteriores).');
    throw new Error(error.message);
  }
  return normalizarRow(data as Record<string, unknown>);
}

/** Apaga um cheque ATRASADO (o principal não se apaga). */
export async function apagarAtrasado(osId: string, horas: number): Promise<void> {
  const c = await buscarPorOS(osId, horas);
  if (!c) return;
  if (!c.atrasado) throw new ErroCheque('horas_invalidas', 'O cheque principal da OS não pode ser apagado.');
  const { error } = await db.from('revisao_cheques').delete().eq('id', c.id);
  if (error) throw new Error(error.message);
}

function limparGeo(g: unknown): GeoAssinatura | null {
  if (!g || typeof g !== 'object') return null;
  const o = g as Record<string, unknown>;
  const lat = Number(o.lat), lng = Number(o.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const p = Number(o.precisao_m);
  return { lat, lng, precisao_m: Number.isFinite(p) ? Math.round(p) : null, obtido_em: o.obtido_em ? String(o.obtido_em).slice(0, 40) : null };
}
function limparDispositivo(d: unknown): DispositivoAssinatura | null {
  if (!d || typeof d !== 'object') return null;
  const o = d as Record<string, unknown>;
  const s = (v: unknown, n: number) => (v == null || v === '' ? null : String(v).slice(0, n));
  const out = { modelo: s(o.modelo, 80), plataforma: s(o.plataforma, 40), versao: s(o.versao, 40), ua: s(o.ua, 300), tela: s(o.tela, 30) };
  return Object.values(out).some(Boolean) ? out : null;
}

/** Salva a assinatura do cliente (PNG base64) no bucket público "revisoes" e marca assinado. Uma vez só. */
export async function assinarCliente(token: string, pngBase64: string, nome: string | null, ip: string | null, meta?: { geo?: unknown; dispositivo?: unknown }): Promise<ChequeRow> {
  const c = await buscarPorToken(token);
  if (c.assinado_em) throw new ErroCheque('ja_assinado', 'Este cheque já foi assinado.');
  const b64 = pngBase64.replace(/^data:image\/png;base64,/, '');
  const buf = Buffer.from(b64, 'base64');
  if (buf.length < 500 || buf.length > 2_000_000) throw new Error('assinatura inválida');
  const path = `cheques/${c.os_id}/assinatura-cliente-${Date.now()}.png`;
  const up = await db.storage.from('revisoes').upload(path, buf, { contentType: 'image/png', upsert: true });
  if (up.error) throw new Error(`upload: ${up.error.message}`);
  const url = db.storage.from('revisoes').getPublicUrl(path).data.publicUrl;
  const { data, error } = await rodar<Record<string, unknown>>((sel) => db.from('revisao_cheques')
    .update({
      assinatura_cliente_url: url, assinado_em: new Date().toISOString(),
      assinado_nome: nome ? String(nome).slice(0, 120) : null, assinado_ip: ip ? String(ip).slice(0, 64) : null,
      assinado_geo: limparGeo(meta?.geo), assinado_dispositivo: limparDispositivo(meta?.dispositivo),
    })
    .eq('id', c.id).select(sel).single());
  if (error) throw new Error(error.message);
  return normalizarRow(data!);
}

/** Admin: apaga a assinatura do cliente (pra refazer) e troca o token do link. */
export async function reabrirAssinatura(osId: string, alvoHoras?: number | null): Promise<ChequeRow> {
  const c = await alvo(osId, alvoHoras);
  const { data, error } = await rodar<Record<string, unknown>>((sel) => db.from('revisao_cheques')
    .update({ assinatura_cliente_url: null, assinado_em: null, assinado_nome: null, assinado_ip: null, assinado_geo: null, assinado_dispositivo: null, token: gerarToken() })
    .eq('id', c.id).select(sel).single());
  if (error) throw new Error(error.message);
  return normalizarRow(data!);
}

/** Assinatura do técnico (PNG base64) — gravada no cheque. */
export async function salvarAssinaturaTecnico(osId: string, pngBase64: string | null, alvoHoras?: number | null): Promise<ChequeRow> {
  const c = await alvo(osId, alvoHoras);
  let url: string | null = null;
  if (pngBase64) {
    const buf = Buffer.from(pngBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    const path = `cheques/${c.os_id}/assinatura-tecnico-${Date.now()}.png`;
    const up = await db.storage.from('revisoes').upload(path, buf, { contentType: 'image/png', upsert: true });
    if (up.error) throw new Error(`upload: ${up.error.message}`);
    url = db.storage.from('revisoes').getPublicUrl(path).data.publicUrl;
  }
  const { data, error } = await rodar<Record<string, unknown>>((sel) => db.from('revisao_cheques').update({ assinatura_tecnico_url: url }).eq('id', c.id).select(sel).single());
  if (error) throw new Error(error.message);
  return normalizarRow(data!);
}

export const linkCheque = (token: string) => `${PORTAL_BASE}/cheque/${token}`;
