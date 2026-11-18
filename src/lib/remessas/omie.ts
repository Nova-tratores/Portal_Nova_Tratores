// Módulo Remessas — conversa com a Omie (18/11/2026).
// Duas notas, o mesmo molde (o da devolução em garantia, lib/garantias/retorno-remessa-server.ts):
//   remessa de produtos   /produtos/remessa/     IncluirRemessa  → /produtos/remessafat/     ConferirRemessa + ConcluirRemessa
//   nota de entrada       /produtos/notaentrada/ IncluirNotaEnt  → /produtos/notaentradafat/ ConferirNotaEnt + ConcluirNotaEnt
// Toda inclusão leva o código de integração (cCodIntRem / cCodIntNotaEnt, até 20 caracteres):
// resposta incerta → consulta por ele antes de dizer que falhou (nunca cria em dobro).
// Faturamento incerto → confere o status antes de dizer que falhou.
import type { Conta } from '@/lib/ajustes/conta';
import { omieRequest } from '@/lib/ajustes/omie';

export type Doc = 'remessa' | 'notaent';

const CFG: Record<Doc, { ep: string; epFat: string; incluir: string; consultar: string; status: string; conferir: string; concluir: string; id: string; codInt: string }> = {
  remessa: {
    ep: '/produtos/remessa/', epFat: '/produtos/remessafat/', incluir: 'IncluirRemessa', consultar: 'ConsultarRemessa',
    status: 'StatusRemessa', conferir: 'ConferirRemessa', concluir: 'ConcluirRemessa', id: 'nCodRem', codInt: 'cCodIntRem',
  },
  notaent: {
    ep: '/produtos/notaentrada/', epFat: '/produtos/notaentradafat/', incluir: 'IncluirNotaEnt', consultar: 'ConsultarNotaEnt',
    status: 'StatusNotaEnt', conferir: 'ConferirNotaEnt', concluir: 'ConcluirNotaEnt', id: 'nCodNotaEnt', codInt: 'cCodIntNotaEnt',
  },
};

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
const sem0 = (s: unknown) => String(s ?? '').replace(/^0+(?=\d)/, '');
export const erroOmie = (e: unknown) => (e as { faultstring?: string })?.faultstring || (e as Error)?.message || String(e);

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON cru da Omie
export type Json = Record<string, any>;

export async function consultar(conta: Conta, doc: Doc, id: number): Promise<Json> {
  const c = CFG[doc];
  return omieRequest(c.ep, c.consultar, { [c.id]: id }, conta);
}

/** id na Omie pelo código de integração (0 = não existe) */
export async function idPorCodigo(conta: Conta, doc: Doc, cod: string): Promise<number> {
  const c = CFG[doc];
  try {
    const r = await omieRequest(c.ep, c.consultar, { [c.codInt]: cod }, conta);
    return Number(r?.cabec?.[c.id]) || 0;
  } catch { return 0; }
}

/** inclui com o código de integração no cabeçalho; resposta incerta → procura pelo código */
export async function incluir(conta: Conta, doc: Doc, payload: Json, cod: string): Promise<{ id: number; erro?: string }> {
  const c = CFG[doc];
  const corpo = { ...payload, cabec: { ...(payload.cabec || {}), [c.codInt]: cod } };
  try {
    const r = await omieRequest(c.ep, c.incluir, corpo, conta);
    const id = Number(r?.[c.id]) || (await idPorCodigo(conta, doc, cod));
    return id ? { id } : { id: 0, erro: 'A Omie não devolveu o número do documento.' };
  } catch (e) {
    const id = await idPorCodigo(conta, doc, cod);
    return id ? { id } : { id: 0, erro: erroOmie(e) };
  }
}

export interface StatusDoc { faturada: boolean; cancelada: boolean; nf: { numero: string; chave: string | null; danfe: string | null; xml: string | null; emissao: string | null } | null }

export async function status(conta: Conta, doc: Doc, id: number): Promise<StatusDoc | null> {
  const c = CFG[doc];
  try {
    const st = await omieRequest(c.ep, c.status, { [c.id]: id }, conta);
    const l = (st?.ListaNfe || []) as Json[];
    const n = l[l.length - 1];
    return {
      faturada: st?.faturada === 'S',
      cancelada: st?.cancelada === 'S',
      nf: n?.cNumNFe ? { numero: sem0(n.cNumNFe), chave: n.cChaveNFe || null, danfe: n.cDanfe || null, xml: n.cXmlDistribuicao || null, emissao: n.dtEmissao || null } : null,
    };
  } catch { return null; }
}

/** confere e conclui (emite a NF-e); espera o número da nota. Serve para "tentar de novo". */
export async function faturar(conta: Conta, doc: Doc, id: number): Promise<{ ok: boolean; nf?: StatusDoc['nf']; erro?: string; cancelada?: boolean }> {
  const c = CFG[doc];
  const st0 = await status(conta, doc, id);
  if (st0?.cancelada) return { ok: false, cancelada: true, erro: 'O documento está cancelado na Omie.' };
  if (!st0?.faturada) {
    try { await omieRequest(c.epFat, c.conferir, { [c.id]: id }, conta); }
    catch (e) { return { ok: false, erro: `A Omie não validou a nota: ${erroOmie(e)}` }; }
    try {
      const r = await omieRequest(c.epFat, c.concluir, { [c.id]: id }, conta);
      if (r?.cCodStatus && r.cCodStatus !== '0') return { ok: false, erro: `A Omie não emitiu a nota: ${r.cDescStatus || r.cCodStatus}` };
    } catch (e) {
      const st = await status(conta, doc, id);
      if (!st?.faturada) return { ok: false, erro: `A Omie não emitiu a nota: ${erroOmie(e)}` };
    }
  }
  let nf = st0?.nf || null;
  for (let i = 0; i < 6 && !nf; i++) { await espera(4000); nf = (await status(conta, doc, id))?.nf || null; }
  return { ok: true, nf };
}
