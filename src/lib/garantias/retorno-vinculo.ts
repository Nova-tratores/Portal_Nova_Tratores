// Devolução em garantia ↔ garantia (26/11/2026) — regras puras.
// Uma devolução (remessa de retorno de uma nota da fábrica) pode ficar ligada a uma ou mais
// garantias, ou marcada "sem garantia no portal". Faturada e sem nenhum dos dois = pendência:
// aparece no aviso da tela Garantias e no lembrete do sino até alguém resolver.
import { casarPecas, normCodigo, type PecaGarantia } from './notas';

export interface FichaVinculo {
  status: string;
  garantia_id?: string | null;
  garantia_ids?: string[] | null;
  sem_garantia_em?: string | null;
}

/** garantias ligadas (a coluna nova, ou a antiga quando a migration ainda não rodou) */
export function garantiasDaFicha(f: FichaVinculo): string[] {
  const ids = (f.garantia_ids || []).filter(Boolean);
  if (ids.length) return [...new Set(ids)];
  return f.garantia_id ? [f.garantia_id] : [];
}

export type SituacaoVinculo = 'ligada' | 'sem_garantia' | 'pendente' | 'nao_se_aplica';

/** só devolução FATURADA precisa de garantia ligada (criada/falhou ainda não devolveu nada) */
export function situacaoVinculo(f: FichaVinculo): SituacaoVinculo {
  if (garantiasDaFicha(f).length) return 'ligada';
  if (f.sem_garantia_em) return 'sem_garantia';
  return f.status === 'faturada' ? 'pendente' : 'nao_se_aplica';
}

export interface ItemDevolvido { codigo?: string | null; descricao?: string | null }
export interface GarantiaCandidata {
  id: string; numero: string; numero_externo: string | null; status: string; cliente: string | null;
  id_ordem: string | null; devolucao_status: string | null; montadora: string | null;
  pecas: PecaGarantia[]; created_at: string;
}
export interface Sugestao {
  id: string; numero: string; numeroExterno: string | null; cliente: string | null; idOrdem: string | null;
  status: string; devolucaoStatus: string | null; montadora: string | null;
  pecasCasadas: string[]; mesmaMontadora: boolean; pontos: number; motivo: string;
}

const STATUS_FORA = new Set(['cancelada', 'recusada']);

/** a montadora do portal ("Kuhn") aparece na razão social do fornecedor ("KUHN DO BRASIL S/A") */
export function mesmaMontadora(montadora: string | null | undefined, fornecedor: string | null | undefined): boolean {
  const p = String(montadora || '').trim().split(/\s+/)[0];
  if (!p || p.length < 3) return false;
  return normCodigo(fornecedor).includes(normCodigo(p));
}

/**
 * Garantias que provavelmente são desta devolução: peça da garantia com o mesmo código
 * de um item devolvido (exato ou dentro da descrição). Pontos: peça casada 10 cada,
 * devolução da garantia pendente +5, mesma montadora +3. Sem peça casada não sugere.
 */
export function sugerirGarantias(itens: ItemDevolvido[], fornecedor: string | null, candidatas: GarantiaCandidata[], max = 8): Sugestao[] {
  const its = itens.map((i) => ({ codigo: String(i.codigo || ''), descricao: String(i.descricao || ''), cfop: '', valor: 0, quantidade: 0 }));
  const out: Sugestao[] = [];
  for (const g of candidatas) {
    if (STATUS_FORA.has(g.status)) continue;
    const cas = casarPecas(g.pecas || [], its);
    if (!cas.length) continue;
    const pecas = [...new Set(cas.map((c) => c.peca))];
    const mm = mesmaMontadora(g.montadora, fornecedor);
    const pend = g.devolucao_status === 'pendente';
    const pontos = pecas.length * 10 + (pend ? 5 : 0) + (mm ? 3 : 0);
    const motivo = [`peça ${pecas.join(', ')}`, pend ? 'devolução pendente' : null, mm ? `mesma montadora (${g.montadora})` : null].filter(Boolean).join(' · ');
    out.push({
      id: g.id, numero: g.numero, numeroExterno: g.numero_externo, cliente: g.cliente, idOrdem: g.id_ordem,
      status: g.status, devolucaoStatus: g.devolucao_status, montadora: g.montadora,
      pecasCasadas: pecas, mesmaMontadora: mm, pontos, motivo,
    });
  }
  return out.sort((a, b) => b.pontos - a.pontos || b.numero.localeCompare(a.numero)).slice(0, max);
}

/** texto do lembrete do sino */
export function tituloLembrete(n: number): string {
  return n === 1 ? '1 devolução em garantia sem garantia ligada' : `${n} devoluções em garantia sem garantia ligada`;
}

export function validarMotivoSemGarantia(motivo: string | null | undefined): string | null {
  const m = String(motivo || '').trim();
  if (m.length < 5) return 'Explique por que esta devolução não tem garantia no portal (ex.: "peça trocada em garantia da fábrica direto com o cliente").';
  return null;
}
