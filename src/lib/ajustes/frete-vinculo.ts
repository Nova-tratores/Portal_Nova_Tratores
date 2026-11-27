// Frete (CT-e) ↔ nota de produto (NF-e). Regras PURAS — servidor e tela usam as mesmas.
//
// A API da Omie não diz a qual NF-e um CT-e recebido se refere (o XML do CT-e de terceiro
// não sai pela API — ObterCTe só serve para CT-e que nós emitimos; conferido 27/11/2026).
// Então o portal SUGERE pelas pistas que temos e a pessoa confirma:
//  - o "fornecedor" que a Omie grava no CT-e é o REMETENTE da carga = o fornecedor da NF-e;
//  - a NF-e é emitida antes (ou no mesmo dia) do CT-e: janela de 10 dias antes a 2 depois.
// Medido no espelho (2026): 466 CT-e → 220 com 1 candidata, 212 com várias (Mahindra/Kuhn
// mandam um CT-e para várias NF), 34 sem nenhuma.
//
// Decisões do usuário (27/11/2026):
//  - o responsável do frete é o responsável da nota de produto;
//  - o CT-e só entra DEPOIS da nota de produto: a NF ligada precisa estar recebida e a data
//    de registro do CT-e não pode ser anterior à dela (a Omie soma o frete no custo pela
//    data de registro: CT-e antes da NF, com o estoque zerado, o frete some do CMC);
//  - o CT-e pode ser aprovado junto da nota, na aba "Frete (CT-e)" da janela Dar entrada.

export const DIAS_NF_ANTES_DO_CTE = 10;
export const DIAS_NF_DEPOIS_DO_CTE = 2;

const DIA = 86400000;

/** "2026-11-20", "20/11/2026" (com ou sem hora) → ms UTC do dia; null se não der. */
export function diaMs(s: unknown): number | null {
  const t = String(s || '').trim().split(/[T ]/)[0];
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]);
  m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t);
  if (m) return Date.UTC(+m[3], +m[2] - 1, +m[1]);
  return null;
}

/** ms UTC → "DD/MM/AAAA" (formato da Omie). */
export function dataBRDe(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

const dig = (s: unknown) => String(s || '').replace(/\D/g, '');

export function chaveEhCte(chave: unknown): boolean {
  const d = dig(chave);
  return d.length === 44 && d.slice(20, 22) === '57';
}

/** Linha do espelho (recebimentos_nfe) que interessa ao casamento. */
export interface NotaEspelho {
  idReceb: number;
  numero: string | null;
  chave: string | null;
  emissao: string | null;
  cnpj: string | null;      // fornecedor_cnpj do espelho (no CT-e = remetente da carga)
  fornecedor: string | null;
  valor: number;
  status: string | null;    // Faturada (pendente) | Recebida | Cancelada
}

export interface Candidata extends NotaEspelho { distanciaDias: number }

/** NF-e de produto que podem ser a carga deste CT-e (mais perto da data primeiro). */
export function candidatasDoFrete(cte: NotaEspelho, notas: NotaEspelho[]): Candidata[] {
  const e = diaMs(cte.emissao);
  const c = dig(cte.cnpj);
  if (e == null || !c) return [];
  return notas
    .filter((n) => n.idReceb !== cte.idReceb && !chaveEhCte(n.chave) && n.status !== 'Cancelada' && dig(n.cnpj) === c)
    .map((n) => ({ ...n, distanciaDias: diaMs(n.emissao) == null ? NaN : (e - (diaMs(n.emissao) as number)) / DIA }))
    .filter((n) => n.distanciaDias <= DIAS_NF_ANTES_DO_CTE && n.distanciaDias >= -DIAS_NF_DEPOIS_DO_CTE)
    .sort((a, b) => Math.abs(a.distanciaDias) - Math.abs(b.distanciaDias) || b.idReceb - a.idReceb);
}

/** CT-e que podem ser o frete desta NF-e (pendentes ou já ligados a ela). */
export function fretesDaNota(nf: NotaEspelho, ctes: NotaEspelho[], ligados: Set<number>): Candidata[] {
  return ctes
    .filter((t) => chaveEhCte(t.chave) && t.status !== 'Cancelada')
    .filter((t) => ligados.has(t.idReceb) || (t.status !== 'Recebida' && candidatasDoFrete(t, [nf]).length > 0))
    .map((t) => ({ ...t, distanciaDias: ((diaMs(t.emissao) ?? 0) - (diaMs(nf.emissao) ?? 0)) / DIA }))
    .sort((a, b) => Number(ligados.has(b.idReceb)) - Number(ligados.has(a.idReceb)) || Math.abs(a.distanciaDias) - Math.abs(b.distanciaDias));
}

/** NF da carga para herdar o responsável: a ligada; senão a única candidata; senão nenhuma. */
export function notaDoResponsavel(ligadas: number[], candidatas: Candidata[]): number | null {
  if (ligadas.length) return ligadas[0];
  return candidatas.length === 1 ? candidatas[0].idReceb : null;
}

export interface NotaLigadaEstado {
  idReceb: number;
  numero: string | null;
  recebida: boolean;
  dRegistro: string | null; // DD/MM/AAAA
}

export type TravaFrete =
  | { ok: false; erro: string }
  | { ok: true; dRegistro: string | null; ajustada: boolean };

/**
 * Pode dar entrada no CT-e? Exige a NF-e da carga (ou "sem nota de produto" com motivo)
 * já recebida e devolve a data de registro a usar: a do CT-e, ou a mais nova das NF-e
 * quando a do CT-e for anterior (ajustada = true). `dRegistroCte` vazio = a Omie decide
 * (o dia da entrada, que já é ≥ o da NF recebida antes).
 */
export function avaliarTravaFrete(args: {
  ligadas: NotaLigadaEstado[];
  semNotaMotivo: string | null;
  dRegistroCte: string | null;
}): TravaFrete {
  const { ligadas, semNotaMotivo } = args;
  if (!ligadas.length) {
    if (semNotaMotivo && semNotaMotivo.trim().length >= 5) return { ok: true, dRegistro: args.dRegistroCte || null, ajustada: false };
    return { ok: false, erro: 'Antes de dar entrada no frete, diga de qual nota de produto ele é (aba "Frete (CT-e)" da nota, ou "Nota da carga" aqui). Sem nota no portal: marque "Este frete não tem nota de produto" e explique.' };
  }
  const faltam = ligadas.filter((n) => !n.recebida);
  if (faltam.length) {
    const nums = faltam.map((n) => String(n.numero || n.idReceb).replace(/^0+(?=\d)/, '')).join(', ');
    return { ok: false, erro: `Dê entrada primeiro na nota de produto ${nums}: o frete só entra depois dela, senão a Omie pode não somar o frete no custo das peças.` };
  }
  const maisNova = Math.max(...ligadas.map((n) => diaMs(n.dRegistro) ?? -Infinity));
  const cte = diaMs(args.dRegistroCte);
  if (!Number.isFinite(maisNova)) return { ok: true, dRegistro: args.dRegistroCte || null, ajustada: false };
  if (cte == null) return { ok: true, dRegistro: null, ajustada: false };
  if (cte >= maisNova) return { ok: true, dRegistro: dataBRDe(cte), ajustada: false };
  return { ok: true, dRegistro: dataBRDe(maisNova), ajustada: true };
}
