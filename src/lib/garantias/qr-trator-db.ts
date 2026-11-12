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
import { finalPublico, gerarCodigo, limparBusca, nomeLote, revisoesFeitas } from './qr-trator';

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
    // chassi digitado inteiro com uma letra diferente do cadastro (KT x KS): acha pelo final
    const fim = /\d{6}$/.test(busca.replace(/\s/g, '')) && busca.length >= 10 ? busca.replace(/\s/g, '').slice(-6) : '';
    tratores = ok(await db.from('tratores').select('Chassis,Modelo,Cliente,Entrega')
      .or(`Chassis.ilike.%${busca}%,Cliente.ilike.%${busca}%,Modelo.ilike.%${busca}%${fim ? `,Chassis.ilike.%${fim}` : ''}`)
      .not('Chassis', 'is', null).order('ID', { ascending: false }).limit(40)) as any[];
    const chassis = tratores.map((t) => t.Chassis).filter(Boolean);
    qrs = chassis.length ? ok(await db.from(T).select('*').in('chassis', chassis)) as any[] : [];
  } else {
    qrs = ok(await db.from(T).select('*').not('chassis', 'is', null).order('vinculado_em', { ascending: false, nullsFirst: false }).order('criado_em', { ascending: false }).limit(40)) as any[];
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
  if (!qr.chassis) return { codigo, livre: true as const };
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

// ── Lotes: adesivos impressos antes de ter trator ───────────────────────────

/** Cria `quantidade` códigos livres num lote novo. Devolve o nome do lote e os códigos. */
export async function gerarLote(quantidade: number, quem: string): Promise<{ lote: string; codigos: string[] }> {
  const lote = nomeLote(new Date());
  const codigos = new Set<string>();
  for (let tentativa = 0; tentativa < 5 && codigos.size < quantidade; tentativa++) {
    const faltam = quantidade - codigos.size;
    const novos = new Set<string>();
    while (novos.size < faltam) {
      const c = gerarCodigo((n) => randomInt(n));
      if (!codigos.has(c)) novos.add(c);
    }
    // descarta os que já existem no banco (colisão rara) e grava o resto
    const ja = ok(await db.from(T).select('codigo').in('codigo', [...novos])) as any[];
    for (const r of ja) novos.delete(r.codigo);
    if (!novos.size) continue;
    const { error } = await db.from(T).insert([...novos].map((codigo) => ({ codigo, chassis: null, lote, criado_por: quem })));
    if (error && error.code !== '23505') throw Object.assign(new Error(error.message), { code: error.code });
    if (!error) for (const c of novos) codigos.add(c);
  }
  if (codigos.size < quantidade) throw new Error('Não consegui gerar todos os códigos. Tente de novo.');
  return { lote, codigos: [...codigos] };
}

export type LoteResumo = { lote: string; criadoEm: string; criadoPor: string | null; total: number; vinculados: number };

/** Lotes criados, mais novos primeiro, com quantos já estão ligados a trator. */
export async function listarLotes(): Promise<LoteResumo[]> {
  const linhas: any[] = [];
  for (let de = 0; de < 20000; de += 1000) {
    const lote = ok(await db.from(T).select('lote, chassis, criado_em, criado_por').not('lote', 'is', null).order('criado_em').range(de, de + 999)) as any[];
    linhas.push(...lote);
    if (lote.length < 1000) break;
  }
  const mapa = new Map<string, LoteResumo>();
  for (const l of linhas) {
    const m = mapa.get(l.lote) || { lote: l.lote, criadoEm: l.criado_em, criadoPor: l.criado_por, total: 0, vinculados: 0 };
    m.total += 1;
    if (l.chassis) m.vinculados += 1;
    mapa.set(l.lote, m);
  }
  return [...mapa.values()].sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
}

export async function codigosDoLote(lote: string): Promise<{ codigo: string; chassis: string | null }[]> {
  return ok(await db.from(T).select('codigo, chassis').eq('lote', lote).order('codigo').limit(1000)) as any[];
}

/** Situação de um código (tela de vincular). */
export async function situacaoCodigo(codigo: string) {
  const qr = ok(await db.from(T).select('codigo, chassis, lote, vinculado_em, vinculado_por').eq('codigo', codigo).maybeSingle()) as any;
  if (!qr) return null;
  let trator: any = null;
  if (qr.chassis) trator = ok(await db.from('tratores').select('Chassis,Modelo,Cliente,Entrega').eq('Chassis', qr.chassis).limit(1).maybeSingle());
  return {
    codigo: qr.codigo as string,
    lote: qr.lote as string | null,
    chassis: qr.chassis as string | null,
    modelo: trator?.Modelo || null,
    cliente: trator?.Cliente || null,
    vinculadoEm: qr.vinculado_em as string | null,
    vinculadoPor: qr.vinculado_por as string | null,
  };
}

function erroStatus(msg: string, status: number) {
  return Object.assign(new Error(msg), { status });
}

/** Liga um código livre a um trator do cadastro (que ainda não tenha adesivo). */
export async function vincular(codigo: string, chassis: string, quem: string) {
  const qr = ok(await db.from(T).select('codigo, chassis').eq('codigo', codigo).maybeSingle()) as any;
  if (!qr) throw erroStatus('Código não encontrado.', 404);
  if (qr.chassis === chassis) return;
  if (qr.chassis) throw erroStatus(`Este adesivo já está ligado ao chassi ${qr.chassis}.`, 409);
  const trator = ok(await db.from('tratores').select('Chassis').eq('Chassis', chassis).limit(1).maybeSingle()) as any;
  if (!trator) throw erroStatus('Chassi não está no cadastro de tratores.', 404);
  const outro = ok(await db.from(T).select('codigo').eq('chassis', chassis).maybeSingle()) as any;
  if (outro) throw erroStatus(`Este trator já tem o adesivo ${outro.codigo}. Desligue o outro antes.`, 409);
  // só grava se continuar livre (dois celulares ao mesmo tempo)
  const { data, error } = await db.from(T)
    .update({ chassis, vinculado_em: new Date().toISOString(), vinculado_por: quem })
    .eq('codigo', codigo).is('chassis', null).select('codigo');
  if (error) {
    if (error.code === '23505') throw erroStatus('Este trator acabou de ganhar outro adesivo.', 409);
    throw Object.assign(new Error(error.message), { code: error.code });
  }
  if (!data?.length) throw erroStatus('Este adesivo acabou de ser ligado a outro trator.', 409);
}

/** Solta o código do trator (adesivo colado errado). Volta a ser livre. */
export async function desvincular(codigo: string) {
  const { error } = await db.from(T).update({ chassis: null, vinculado_em: null, vinculado_por: null }).eq('codigo', codigo);
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
}
