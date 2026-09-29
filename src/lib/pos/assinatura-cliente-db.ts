// Assinatura do cliente por OS (qualquer serviço) — banco (service role).
// Tabela os_assinaturas_cliente (migration sql/os-assinaturas-cliente.sql).
// Link público /assinar/<token>; ao assinar, se a OS tem cheque de revisão,
// a assinatura é espelhada em revisao_cheques (aparece no cheque).
// Parte pura (mensagem, resumo) em assinatura-cliente.ts.
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'crypto';
import { extrairChassis, extrairHorasRevisaoOS } from '@/lib/pos/extrairTrator';
import { normalizarHorasRevisao } from '@/lib/pos/vigia-revisoes-regras';
import { resumirSolicitacao, type ResumoOS } from './assinatura-cliente';
export { mensagemAssinatura, type ResumoOS } from './assinatura-cliente';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

export interface GeoAssinatura { lat: number; lng: number; precisao_m?: number | null; obtido_em?: string | null }
export interface DispositivoAssinatura { modelo?: string | null; plataforma?: string | null; versao?: string | null; ua?: string | null; tela?: string | null }

export interface AssinaturaRow {
  id: string;
  os_id: string;
  token: string;
  assinatura_url: string | null;
  assinado_em: string | null;
  assinado_nome: string | null;
  assinado_ip: string | null;
  assinado_geo: GeoAssinatura | null;
  assinado_dispositivo: DispositivoAssinatura | null;
  criado_por: string | null;
  created_at: string;
  updated_at: string;
}

export class ErroAssinatura extends Error {
  constructor(public codigo: 'os_nao_encontrada' | 'token_invalido' | 'ja_assinado' | 'tabela_ausente', msg: string) { super(msg); }
}

const SEL = 'id,os_id,token,assinatura_url,assinado_em,assinado_nome,assinado_ip,assinado_geo,assinado_dispositivo,criado_por,created_at,updated_at';
const gerarToken = () => randomBytes(32).toString('base64url');

function checarTabela(error: { message?: string; code?: string } | null) {
  if (error && (error.code === '42P01' || /os_assinaturas_cliente.*(does not exist|schema cache)/i.test(error.message || ''))) {
    throw new ErroAssinatura('tabela_ausente', 'Tabela os_assinaturas_cliente não existe — aplicar sql/os-assinaturas-cliente.sql');
  }
}

export async function buscarPorOS(osId: string): Promise<AssinaturaRow | null> {
  const { data, error } = await db.from('os_assinaturas_cliente').select(SEL).eq('os_id', osId).maybeSingle();
  checarTabela(error);
  if (error) throw new Error(error.message);
  return (data as AssinaturaRow | null) || null;
}

export async function buscarPorToken(token: string): Promise<AssinaturaRow> {
  if (!/^[A-Za-z0-9_-]{20,128}$/.test(token)) throw new ErroAssinatura('token_invalido', 'link inválido');
  const { data, error } = await db.from('os_assinaturas_cliente').select(SEL).eq('token', token).maybeSingle();
  checarTabela(error);
  if (error) throw new Error(error.message);
  if (!data) throw new ErroAssinatura('token_invalido', 'link inválido');
  return data as AssinaturaRow;
}

/** Garante o registro (e o token) da OS. Qualquer OS serve. */
export async function garantirAssinatura(osId: string, criadoPor?: string | null): Promise<AssinaturaRow> {
  const existente = await buscarPorOS(osId);
  if (existente) return existente;
  const { data: os, error: e0 } = await db.from('Ordem_Servico').select('Id_Ordem').eq('Id_Ordem', osId).maybeSingle();
  if (e0) throw new Error(e0.message);
  if (!os) throw new ErroAssinatura('os_nao_encontrada', `OS ${osId} não encontrada`);
  const { data, error } = await db.from('os_assinaturas_cliente').insert([{ os_id: osId, token: gerarToken(), criado_por: criadoPor || null }]).select(SEL).single();
  checarTabela(error);
  if (error) { const denovo = await buscarPorOS(osId); if (denovo) return denovo; throw new Error(error.message); }
  return data as AssinaturaRow;
}

const dataBR = (d: string | null | undefined) => { const m = String(d || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : String(d || ''); };

/** Resumo da OS pra tela pública (não expõe valores nem dados internos). */
export async function resumoDaOS(osId: string): Promise<ResumoOS> {
  const { data: os, error } = await db.from('Ordem_Servico')
    .select('Id_Ordem,Os_Cliente,Os_Tecnico,Tipo_Servico,Revisao,Projeto,Serv_Solicitado,Data,Data_Fim_Servico,Ordem_Omie,id_omie')
    .eq('Id_Ordem', osId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!os) throw new ErroAssinatura('os_nao_encontrada', `OS ${osId} não encontrada`);
  const chassi = extrairChassis(os) || '';
  const horas = normalizarHorasRevisao(extrairHorasRevisaoOS(os));
  const nOmie = String(os.Ordem_Omie || os.id_omie || '').replace(/^0+/, '');
  const solic = String(os.Serv_Solicitado || '');
  const mHor = solic.match(/hor[ií]metro\s*:\s*([\d.,]+)/i);
  return {
    osId, numero: nOmie || String(os.Id_Ordem).replace(/^OS-?/i, ''),
    cliente: String(os.Os_Cliente || '').trim(), tipoServico: String(os.Tipo_Servico || ''),
    servico: resumirSolicitacao(solic), data: dataBR(os.Data_Fim_Servico || os.Data), tecnico: String(os.Os_Tecnico || ''),
    trator: String(os.Projeto || '').replace(chassi, '').replace(/\s+/g, ' ').trim(), chassi,
    horimetro: mHor ? `${mHor[1].replace('.', ',')} h` : '', revisaoHoras: horas,
  };
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

/** Espelha (ou limpa) a assinatura no cheque de revisão da OS, se houver. Best-effort. */
async function espelharNoCheque(osId: string, a: AssinaturaRow | null) {
  try {
    await db.from('revisao_cheques').update(a ? {
      assinatura_cliente_url: a.assinatura_url, assinado_em: a.assinado_em, assinado_nome: a.assinado_nome,
      assinado_ip: a.assinado_ip, assinado_geo: a.assinado_geo, assinado_dispositivo: a.assinado_dispositivo,
    } : { assinatura_cliente_url: null, assinado_em: null, assinado_nome: null, assinado_ip: null, assinado_geo: null, assinado_dispositivo: null })
      .eq('os_id', osId);
  } catch { /* sem cheque / tabela ausente */ }
}

/** Grava a assinatura (PNG base64). Uma vez só. */
export async function assinar(token: string, pngBase64: string, nome: string | null, ip: string | null, meta?: { geo?: unknown; dispositivo?: unknown }): Promise<AssinaturaRow> {
  const a = await buscarPorToken(token);
  if (a.assinado_em) throw new ErroAssinatura('ja_assinado', 'Esta OS já foi assinada.');
  const buf = Buffer.from(pngBase64.replace(/^data:image\/png;base64,/, ''), 'base64');
  if (buf.length < 500 || buf.length > 2_000_000) throw new Error('assinatura inválida');
  const path = `cheques/${a.os_id}/assinatura-cliente-${Date.now()}.png`;
  const up = await db.storage.from('revisoes').upload(path, buf, { contentType: 'image/png', upsert: true });
  if (up.error) throw new Error(`upload: ${up.error.message}`);
  const url = db.storage.from('revisoes').getPublicUrl(path).data.publicUrl;
  const { data, error } = await db.from('os_assinaturas_cliente').update({
    assinatura_url: url, assinado_em: new Date().toISOString(),
    assinado_nome: nome ? String(nome).slice(0, 120) : null, assinado_ip: ip ? String(ip).slice(0, 64) : null,
    assinado_geo: limparGeo(meta?.geo), assinado_dispositivo: limparDispositivo(meta?.dispositivo),
  }).eq('id', a.id).select(SEL).single();
  if (error) throw new Error(error.message);
  const row = data as AssinaturaRow;
  await espelharNoCheque(a.os_id, row);
  return row;
}

/** Admin: apaga a assinatura (pra refazer) e troca o link. */
export async function reabrir(osId: string): Promise<AssinaturaRow> {
  const a = await garantirAssinatura(osId);
  const { data, error } = await db.from('os_assinaturas_cliente')
    .update({ assinatura_url: null, assinado_em: null, assinado_nome: null, assinado_ip: null, assinado_geo: null, assinado_dispositivo: null, token: gerarToken() })
    .eq('id', a.id).select(SEL).single();
  if (error) throw new Error(error.message);
  await espelharNoCheque(osId, null);
  return data as AssinaturaRow;
}

export const PORTAL_BASE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://portalnovatratores-production.up.railway.app').replace(/\/$/, '');
export const linkAssinatura = (token: string) => `${PORTAL_BASE}/assinar/${token}`;
