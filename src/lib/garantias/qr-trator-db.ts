/* eslint-disable @typescript-eslint/no-explicit-any */
// =============================================================================
// QR DA GARANTIA POR TRATOR — banco (SERVIDOR, service role).
// Tabela garantia_qr_tratores (sql/garantia-qr-tratores.sql). Sem ela:
// o painel avisa e a página pública abre normal, sem o trator.
// =============================================================================
import { randomInt } from 'crypto';
import { supabaseAdmin as db } from '@/lib/server/supabase-admin';
import { migrationFaltou } from '@/lib/marketing/erros';
import { dataISO } from '@/lib/feedbacks/previsao-revisao';
import { finalPublico, gerarCodigo, limparBusca, revisoesFeitas } from './qr-trator';

export { migrationFaltou };
export const MSG_MIGRATION_QR =
  'Falta criar a tabela dos QR por trator. Rode sql/garantia-qr-tratores.sql no SQL Editor do Supabase.';

const T = 'garantia_qr_tratores';

function ok<T>(res: { data: T | null; error: any }): T {
  if (res.error) throw Object.assign(new Error(res.error.message), { code: res.error.code });
  return res.data as T;
}

export type TratorQR = {
  chassis: string;
  modelo: string | null;
  cliente: string | null;
  entrega: string | null;
  codigo: string | null;
  downloads: number;
  leituras: number;
  ultimaLeitura: string | null;
};

/** Leituras do adesivo (eventos 'qr_trator') por código. */
async function leiturasPorCodigo(codigos: string[]) {
  const mapa = new Map<string, { n: number; ultima: string | null }>();
  if (!codigos.length) return mapa;
  const { data } = await db.from('garantia_cliente_eventos')
    .select('valor, criado_em').eq('tipo', 'qr_trator').in('valor', codigos)
    .order('criado_em', { ascending: false }).limit(5000);
  for (const e of (data || []) as { valor: string; criado_em: string }[]) {
    const m = mapa.get(e.valor) || { n: 0, ultima: e.criado_em };
    m.n += 1;
    mapa.set(e.valor, m);
  }
  return mapa;
}

/**
 * Tratores do cadastro (busca por chassi, cliente ou modelo) com o código, se já tem.
 * Sem busca: os que já ganharam QR, mais recentes primeiro.
 */
export async function listarTratores(q: string): Promise<TratorQR[]> {
  const busca = limparBusca(q);
  let tratores: any[];
  let qrs: any[];
  if (busca) {
    tratores = ok(await db.from('tratores').select('Chassis,Modelo,Cliente,Entrega')
      .or(`Chassis.ilike.%${busca}%,Cliente.ilike.%${busca}%,Modelo.ilike.%${busca}%`)
      .not('Chassis', 'is', null).order('ID', { ascending: false }).limit(40)) as any[];
    const chassis = tratores.map((t) => t.Chassis).filter(Boolean);
    qrs = chassis.length ? ok(await db.from(T).select('*').in('chassis', chassis)) as any[] : [];
  } else {
    qrs = ok(await db.from(T).select('*').order('criado_em', { ascending: false }).limit(40)) as any[];
    const chassis = qrs.map((x) => x.chassis);
    tratores = chassis.length ? ok(await db.from('tratores').select('Chassis,Modelo,Cliente,Entrega').in('Chassis', chassis)) as any[] : [];
    // mantém a ordem dos QRs
    const porChassi = new Map(tratores.map((t) => [t.Chassis, t]));
    tratores = qrs.map((x) => porChassi.get(x.chassis) || { Chassis: x.chassis });
  }
  const porChassiQR = new Map(qrs.map((x) => [x.chassis, x]));
  const leituras = await leiturasPorCodigo(qrs.map((x) => x.codigo));
  return tratores.filter((t) => String(t.Chassis || '').trim().length >= 4).map((t) => {
    const qr = porChassiQR.get(t.Chassis);
    const l = qr ? leituras.get(qr.codigo) : undefined;
    return {
      chassis: t.Chassis,
      modelo: t.Modelo || null,
      cliente: t.Cliente || null,
      entrega: dataISO(t.Entrega),
      codigo: qr?.codigo ?? null,
      downloads: qr?.downloads ?? 0,
      leituras: l?.n ?? 0,
      ultimaLeitura: l?.ultima ?? null,
    };
  });
}

/** Código do trator: devolve o existente ou cria um novo (o chassi tem que estar no cadastro). */
export async function garantirCodigo(chassis: string, quem: string): Promise<string> {
  const existente = ok(await db.from(T).select('codigo').eq('chassis', chassis).maybeSingle()) as any;
  if (existente?.codigo) return existente.codigo;
  const trator = ok(await db.from('tratores').select('Chassis').eq('Chassis', chassis).limit(1).maybeSingle()) as any;
  if (!trator) throw Object.assign(new Error('Chassi não está no cadastro de tratores.'), { status: 404 });
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const codigo = gerarCodigo((n) => randomInt(n));
    const { error } = await db.from(T).insert({ codigo, chassis, criado_por: quem });
    if (!error) return codigo;
    if (error.code !== '23505') throw Object.assign(new Error(error.message), { code: error.code });
    // 23505: ou o código colidiu (tenta outro) ou outro pedido criou o do chassi
    const outro = ok(await db.from(T).select('codigo').eq('chassis', chassis).maybeSingle()) as any;
    if (outro?.codigo) return outro.codigo;
  }
  throw new Error('Não consegui gerar um código livre. Tente de novo.');
}

export async function marcarDownload(codigo: string) {
  const atual = ok(await db.from(T).select('downloads').eq('codigo', codigo).maybeSingle()) as any;
  if (!atual) return;
  await db.from(T).update({ downloads: (atual.downloads || 0) + 1, baixado_em: new Date().toISOString() }).eq('codigo', codigo);
}

/** O que a página pública mostra. Nada de nome do cliente nem chassi inteiro. */
export async function dadosPublicos(codigo: string) {
  const qr = ok(await db.from(T).select('chassis').eq('codigo', codigo).maybeSingle()) as any;
  if (!qr) return null;
  const t = ok(await db.from('tratores').select('Modelo,Entrega').eq('Chassis', qr.chassis).limit(1).maybeSingle()) as any;
  const final7 = String(qr.chassis).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(-7);
  let feitas: number[] = [];
  if (final7.length === 7) {
    const { data } = await db.from('revisao_emails').select('horas').ilike('chassis', `%${final7}`).limit(50);
    feitas = revisoesFeitas((data || []).map((r: any) => r.horas));
  }
  return {
    codigo,
    modelo: t?.Modelo || null,
    entrega: dataISO(t?.Entrega),
    chassiFinal: finalPublico(qr.chassis),
    revisoesFeitas: feitas,
  };
}
