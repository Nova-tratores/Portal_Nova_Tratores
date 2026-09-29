// Cheque de revisão — acesso ao banco (service role). Tabela revisao_cheques
// (migration sql/revisao-cheques.sql). Tudo aqui é chamado pelas rotas /api.
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'crypto';
import { PORTAL_BASE } from '@/lib/portal-url';
import { extrairChassis, extrairHorasRevisaoOS } from '@/lib/pos/extrairTrator';
import { normalizarHorasRevisao } from '@/lib/pos/vigia-revisoes-regras';
import { dadosIniciais, normalizarDados, PAGINA_TALAO, type DadosCheque, type FonteOS, type FonteTrator } from './cheque';

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
}

export interface GeoAssinatura { lat: number; lng: number; precisao_m?: number | null; obtido_em?: string | null }
export interface DispositivoAssinatura { modelo?: string | null; plataforma?: string | null; versao?: string | null; ua?: string | null; tela?: string | null }

export class ErroCheque extends Error {
  constructor(public codigo: 'os_nao_encontrada' | 'nao_e_revisao' | 'sem_chassi' | 'nao_mahindra' | 'token_invalido' | 'ja_assinado' | 'tabela_ausente', msg: string) { super(msg); }
}

const SEL = 'id,os_id,chassis,horas,pagina,dados,token,assinatura_cliente_url,assinado_em,assinado_nome,assinado_ip,assinado_geo,assinado_dispositivo,assinatura_tecnico_url,criado_por,created_at,updated_at';

function gerarToken(): string { return randomBytes(32).toString('base64url'); }

function normalizarRow(r: Record<string, unknown>): ChequeRow {
  return { ...(r as unknown as ChequeRow), dados: normalizarDados(r.dados) };
}

function checarTabela(error: { message?: string; code?: string } | null) {
  if (error && (error.code === '42P01' || /revisao_cheques.*(does not exist|schema cache)/i.test(error.message || ''))) {
    throw new ErroCheque('tabela_ausente', 'Tabela revisao_cheques não existe — aplicar sql/revisao-cheques.sql');
  }
}

export async function buscarPorOS(osId: string): Promise<ChequeRow | null> {
  const { data, error } = await db.from('revisao_cheques').select(SEL).eq('os_id', osId).maybeSingle();
  checarTabela(error);
  if (error) throw new Error(error.message);
  return data ? normalizarRow(data as Record<string, unknown>) : null;
}

export async function buscarPorToken(token: string): Promise<ChequeRow> {
  if (!/^[A-Za-z0-9_-]{20,128}$/.test(token)) throw new ErroCheque('token_invalido', 'link inválido');
  const { data, error } = await db.from('revisao_cheques').select(SEL).eq('token', token).maybeSingle();
  checarTabela(error);
  if (error) throw new Error(error.message);
  if (!data) throw new ErroCheque('token_invalido', 'link inválido');
  return normalizarRow(data as Record<string, unknown>);
}

/** Lê OS + trator e monta os dados iniciais. Lança ErroCheque quando a OS não serve. */
async function montarInicial(osId: string): Promise<{ chassis: string; horas: number; dados: DadosCheque }> {
  const { data: os, error } = await db.from('Ordem_Servico')
    .select('Id_Ordem,Os_Cliente,Cnpj_Cliente,Os_Tecnico,Projeto,Serv_Solicitado,Revisao,Tipo_Servico,Data,Data_Fim_Servico,Ordem_Omie,id_omie')
    .eq('Id_Ordem', osId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!os) throw new ErroCheque('os_nao_encontrada', `OS ${osId} não encontrada`);
  const horas = normalizarHorasRevisao(extrairHorasRevisaoOS(os));
  if (!horas) throw new ErroCheque('nao_e_revisao', 'A OS não é de revisão (não achei as horas no plano nem na solicitação).');
  const chassis = extrairChassis(os);
  if (!chassis) throw new ErroCheque('sem_chassi', 'A OS não tem chassi (Projeto/solicitação).');
  const [{ data: trator }, { data: tec }] = await Promise.all([
    db.from('tratores').select('Modelo,Numero_Motor,Entrega,Cliente').ilike('Chassis', chassis).limit(1).maybeSingle(),
    db.from('Ordem_Servico_Tecnicos').select('Horimetro,IdOs').eq('Ordem_Servico', osId).order('IdOs', { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!trator) throw new ErroCheque('nao_mahindra', `Chassi ${chassis} não está no cadastro de tratores Mahindra.`);
  const dados = dadosIniciais(os as FonteOS, chassis, trator as FonteTrator, (tec as { Horimetro?: string } | null)?.Horimetro);
  return { chassis, horas, dados };
}

/** Garante que a OS tem um cheque (cria com dados iniciais se não tiver). */
export async function garantirCheque(osId: string, criadoPor?: string | null): Promise<ChequeRow> {
  const existente = await buscarPorOS(osId);
  if (existente) return existente;
  const { chassis, horas, dados } = await montarInicial(osId);
  // a OS pode já ter sido assinada pelo link genérico (/assinar) antes do cheque existir
  let herdada: Record<string, unknown> = {};
  try {
    const { buscarPorOS: buscarAss } = await import('@/lib/pos/assinatura-cliente-db');
    const a = await buscarAss(osId);
    if (a?.assinado_em) herdada = { assinatura_cliente_url: a.assinatura_url, assinado_em: a.assinado_em, assinado_nome: a.assinado_nome, assinado_ip: a.assinado_ip, assinado_geo: a.assinado_geo, assinado_dispositivo: a.assinado_dispositivo };
  } catch { /* sem tabela de assinaturas */ }
  const { data, error } = await db.from('revisao_cheques').insert([{
    os_id: osId, chassis, horas, pagina: PAGINA_TALAO[horas] ?? null, dados, token: gerarToken(), criado_por: criadoPor || null, ...herdada,
  }]).select(SEL).single();
  checarTabela(error);
  if (error) {
    // corrida: outro pedido criou ao mesmo tempo
    const denovo = await buscarPorOS(osId);
    if (denovo) return denovo;
    throw new Error(error.message);
  }
  return normalizarRow(data as Record<string, unknown>);
}

export async function atualizarDados(osId: string, dados: Partial<DadosCheque>, horas?: number | null): Promise<ChequeRow> {
  const atual = await garantirCheque(osId);
  const novos = normalizarDados({ ...atual.dados, ...dados });
  const patch: Record<string, unknown> = { dados: novos };
  if (horas && PAGINA_TALAO[horas]) { patch.horas = horas; patch.pagina = PAGINA_TALAO[horas]; }
  if (novos.chassi && novos.chassi !== atual.chassis) patch.chassis = novos.chassi;
  const { data, error } = await db.from('revisao_cheques').update(patch).eq('id', atual.id).select(SEL).single();
  if (error) throw new Error(error.message);
  return normalizarRow(data as Record<string, unknown>);
}

/** Recria os dados iniciais a partir da OS/trator (descarta edições). */
export async function repreencher(osId: string): Promise<ChequeRow> {
  const atual = await garantirCheque(osId);
  const { chassis, horas, dados } = await montarInicial(osId);
  const { data, error } = await db.from('revisao_cheques').update({ chassis, horas, pagina: PAGINA_TALAO[horas] ?? null, dados }).eq('id', atual.id).select(SEL).single();
  if (error) throw new Error(error.message);
  return normalizarRow(data as Record<string, unknown>);
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
  const { data, error } = await db.from('revisao_cheques')
    .update({
      assinatura_cliente_url: url, assinado_em: new Date().toISOString(),
      assinado_nome: nome ? String(nome).slice(0, 120) : null, assinado_ip: ip ? String(ip).slice(0, 64) : null,
      assinado_geo: limparGeo(meta?.geo), assinado_dispositivo: limparDispositivo(meta?.dispositivo),
    })
    .eq('id', c.id).select(SEL).single();
  if (error) throw new Error(error.message);
  return normalizarRow(data as Record<string, unknown>);
}

/** Admin: apaga a assinatura do cliente (pra refazer) e troca o token do link. */
export async function reabrirAssinatura(osId: string): Promise<ChequeRow> {
  const c = await garantirCheque(osId);
  const { data, error } = await db.from('revisao_cheques')
    .update({ assinatura_cliente_url: null, assinado_em: null, assinado_nome: null, assinado_ip: null, assinado_geo: null, assinado_dispositivo: null, token: gerarToken() })
    .eq('id', c.id).select(SEL).single();
  if (error) throw new Error(error.message);
  return normalizarRow(data as Record<string, unknown>);
}

/** Assinatura do técnico (PNG base64) — gravada no cheque. */
export async function salvarAssinaturaTecnico(osId: string, pngBase64: string | null): Promise<ChequeRow> {
  const c = await garantirCheque(osId);
  let url: string | null = null;
  if (pngBase64) {
    const buf = Buffer.from(pngBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    const path = `cheques/${c.os_id}/assinatura-tecnico-${Date.now()}.png`;
    const up = await db.storage.from('revisoes').upload(path, buf, { contentType: 'image/png', upsert: true });
    if (up.error) throw new Error(`upload: ${up.error.message}`);
    url = db.storage.from('revisoes').getPublicUrl(path).data.publicUrl;
  }
  const { data, error } = await db.from('revisao_cheques').update({ assinatura_tecnico_url: url }).eq('id', c.id).select(SEL).single();
  if (error) throw new Error(error.message);
  return normalizarRow(data as Record<string, unknown>);
}

export const linkCheque = (token: string) => `${PORTAL_BASE}/cheque/${token}`;

