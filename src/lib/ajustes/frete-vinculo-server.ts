/* eslint-disable @typescript-eslint/no-explicit-any */
// Frete (CT-e) ↔ nota de produto — banco + Omie. Regras puras em ./frete-vinculo.ts.
// Não importar ./recebimentos daqui (ele importa este arquivo).

import type { Conta } from './conta';
import { supabase } from './supabase';
import { consultarRecebimentoFinanceiro } from './omie';
import {
  candidatasDoFrete, fretesDaNota, notaDoResponsavel, avaliarTravaFrete, chaveEhCte,
  type NotaEspelho, type Candidata, type NotaLigadaEstado, type TravaFrete,
} from './frete-vinculo';

const COLS = 'id_receb,numero_nfe,chave_nfe,emissao_nfe,fornecedor_cnpj,fornecedor,total_nfe,status';
const TABELA = 'recebimento_frete_vinculos';

const low = (c: string) => String(c).toLowerCase();

function nota(l: any): NotaEspelho {
  return {
    idReceb: Number(l.id_receb), numero: l.numero_nfe ?? null, chave: l.chave_nfe ?? null,
    emissao: l.emissao_nfe ?? null, cnpj: l.fornecedor_cnpj ?? null, fornecedor: l.fornecedor ?? null,
    valor: Number(l.total_nfe) || 0, status: l.status ?? null,
  };
}

const tabelaFalta = (e: any) => !!e && (e.code === 'PGRST205' || e.code === '42P01' || /recebimento_frete_vinculos/.test(e.message || ''));

async function linha(conta: string, id: number): Promise<NotaEspelho | null> {
  const { data } = await supabase.from('recebimentos_nfe').select(COLS).eq('conta_omie', low(conta)).eq('id_receb', id).maybeSingle();
  return data ? nota(data) : null;
}

/** Notas do espelho destes fornecedores (CNPJ como gravado), mais novas primeiro. */
async function notasDosCnpjs(conta: string, cnpjs: string[]): Promise<NotaEspelho[]> {
  const lista = [...new Set(cnpjs.filter(Boolean))];
  if (!lista.length) return [];
  const { data, error } = await supabase.from('recebimentos_nfe').select(COLS)
    .eq('conta_omie', low(conta)).in('fornecedor_cnpj', lista).order('id_receb', { ascending: false }).limit(3000);
  if (error) throw new Error(error.message);
  return ((data || []) as any[]).map(nota);
}

export interface VinculoFrete { nfes: number[]; semNota: string | null }

/** Vínculos salvos por CT-e. `faltaTabela` = migration não aplicada (tudo vazio). */
export async function lerVinculos(conta: string, ctes: number[]): Promise<{ mapa: Map<number, VinculoFrete>; faltaTabela: boolean }> {
  const mapa = new Map<number, VinculoFrete>();
  if (!ctes.length) return { mapa, faltaTabela: false };
  const { data, error } = await supabase.from(TABELA).select('id_receb_cte,id_receb_nfe,motivo_sem_nota')
    .eq('conta_omie', low(conta)).in('id_receb_cte', ctes);
  if (error) return { mapa, faltaTabela: tabelaFalta(error) };
  for (const v of (data || []) as any[]) {
    const k = Number(v.id_receb_cte);
    const atual = mapa.get(k) || { nfes: [], semNota: null };
    if (Number(v.id_receb_nfe) > 0) atual.nfes.push(Number(v.id_receb_nfe));
    else atual.semNota = v.motivo_sem_nota || 'sem nota de produto';
    mapa.set(k, atual);
  }
  return { mapa, faltaTabela: false };
}

/** Troca os vínculos do CT-e. nfes vazio + motivo = "sem nota de produto". */
export async function salvarVinculos(conta: string, idCte: number, nfes: number[], semNotaMotivo: string | null, autor: { nome?: string | null; id?: string | null }): Promise<{ ok: boolean; faltaTabela?: boolean }> {
  const del = await supabase.from(TABELA).delete().eq('conta_omie', low(conta)).eq('id_receb_cte', idCte);
  if (del.error) return { ok: false, faltaTabela: tabelaFalta(del.error) };
  const linhas = (nfes.length ? nfes.map((n) => ({ id_receb_nfe: n, motivo_sem_nota: null })) : semNotaMotivo ? [{ id_receb_nfe: 0, motivo_sem_nota: semNotaMotivo }] : [])
    .map((x) => ({ conta_omie: low(conta), id_receb_cte: idCte, ...x, vinculado_por: autor.nome || null, vinculado_por_id: autor.id || null }));
  if (linhas.length) {
    const ins = await supabase.from(TABELA).insert(linhas);
    if (ins.error) return { ok: false, faltaTabela: tabelaFalta(ins.error) };
  }
  return { ok: true };
}

/** Janela do CT-e: notas candidatas + as já ligadas. */
export async function notasDoFrete(conta: string, idCte: number) {
  const cte = await linha(conta, idCte);
  if (!cte || !chaveEhCte(cte.chave)) return { cte, candidatas: [] as Candidata[], ligadas: [] as number[], semNota: null as string | null, faltaTabela: false };
  const [notas, vinc] = await Promise.all([notasDosCnpjs(conta, [cte.cnpj || '']), lerVinculos(conta, [idCte])]);
  const v = vinc.mapa.get(idCte) || { nfes: [], semNota: null };
  const candidatas = candidatasDoFrete(cte, notas);
  // ligada fora da janela (escolhida à mão) também aparece
  const fora = v.nfes.filter((id) => !candidatas.some((c) => c.idReceb === id));
  for (const id of fora) { const l = await linha(conta, id); if (l) candidatas.push({ ...l, distanciaDias: NaN }); }
  return { cte, candidatas, ligadas: v.nfes, semNota: v.semNota, faltaTabela: vinc.faltaTabela };
}

/** Aba "Frete (CT-e)" da nota de produto: CT-e pendentes que podem ser dela + os já ligados. */
export async function fretesDaNotaServer(conta: string, idNfe: number) {
  const nf = await linha(conta, idNfe);
  if (!nf || chaveEhCte(nf.chave)) return { fretes: [] as (Candidata & { ligado: boolean; ligadoOutra: boolean })[], faltaTabela: false };
  const todas = await notasDosCnpjs(conta, [nf.cnpj || '']);
  const ctes = todas.filter((t) => chaveEhCte(t.chave));
  const vinc = await lerVinculos(conta, ctes.map((t) => t.idReceb));
  const ligadosAqui = new Set(ctes.filter((t) => vinc.mapa.get(t.idReceb)?.nfes.includes(idNfe)).map((t) => t.idReceb));
  const fretes = fretesDaNota(nf, ctes, ligadosAqui).map((t) => {
    const v = vinc.mapa.get(t.idReceb);
    return { ...t, ligado: ligadosAqui.has(t.idReceb), ligadoOutra: !!v && !ligadosAqui.has(t.idReceb) && (v.nfes.length > 0 || !!v.semNota) };
  });
  return { fretes, faltaTabela: vinc.faltaTabela };
}

/**
 * Trava antes de dar entrada no CT-e. `nfes`/`semNotaMotivo` vindos da janela valem
 * (e são salvos); sem eles usa o que está salvo. Confere AO VIVO na Omie se cada nota
 * ligada já foi recebida e a data de registro dela.
 */
export async function conferirFrete(conta: Conta, idCte: number, args: {
  nfes?: number[] | null; semNotaMotivo?: string | null; dRegistroCte?: string | null;
  autor: { nome?: string | null; id?: string | null };
}): Promise<TravaFrete & { ligadas: NotaLigadaEstado[] }> {
  let nfes = Array.isArray(args.nfes) ? args.nfes.map(Number).filter((n) => n > 0) : null;
  let semNota = args.semNotaMotivo?.trim() || null;
  if (nfes || semNota) await salvarVinculos(conta, idCte, nfes || [], nfes?.length ? null : semNota, args.autor);
  else {
    const v = (await lerVinculos(conta, [idCte])).mapa.get(idCte);
    nfes = v?.nfes || [];
    semNota = v?.semNota || null;
  }
  const ligadas: NotaLigadaEstado[] = [];
  for (const id of nfes || []) {
    const [fin, l] = await Promise.all([consultarRecebimentoFinanceiro(conta, id), linha(conta, id)]);
    ligadas.push({ idReceb: id, numero: l?.numero || null, recebida: fin.recebido, dRegistro: fin.dRegistro });
  }
  // data de registro do CT-e: a da janela; senão a que já está na Omie
  let dCte = args.dRegistroCte || null;
  if (!dCte) { try { dCte = (await consultarRecebimentoFinanceiro(conta, idCte)).dRegistro; } catch { /* a Omie decide */ } }
  return { ...avaliarTravaFrete({ ligadas, semNotaMotivo: semNota, dRegistroCte: dCte }), ligadas };
}

/**
 * Para herdar o responsável: CT-e (com o CNPJ do REMETENTE e a emissão) → nota da carga.
 * Ligada > única candidata. Erro = mapa vazio (fica o padrão por tipo).
 */
export async function notaDaCargaPorFrete(conta: string, ctes: { idReceb: number; remetenteCnpj: string | null; emissao: string | null; chave: string | null }[]): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  if (!ctes.length) return out;
  try {
    const [notas, vinc] = await Promise.all([
      notasDosCnpjs(conta, ctes.map((c) => c.remetenteCnpj || '')),
      lerVinculos(conta, ctes.map((c) => c.idReceb)),
    ]);
    for (const c of ctes) {
      const v = vinc.mapa.get(c.idReceb);
      const cand = candidatasDoFrete({ idReceb: c.idReceb, numero: null, chave: c.chave, emissao: c.emissao, cnpj: c.remetenteCnpj, fornecedor: null, valor: 0, status: null }, notas);
      const nf = notaDoResponsavel(v?.nfes || [], cand);
      if (nf) out.set(c.idReceb, nf);
    }
  } catch { /* sem herança */ }
  return out;
}
