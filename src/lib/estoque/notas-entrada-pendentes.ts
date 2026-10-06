// Notas que o usuário procura em /estoque/notas-entrada mas que ainda NÃO são
// nota de entrada: estão no Recebimento de NF-e da Omie (espelho
// `recebimentos_nfe`) sem a entrada concluída (etapa 60). O `ListarNF` que
// alimenta `notas_entrada` só devolve NF com entrada concluída, então a busca
// por número devolvia "nenhuma nota" sem explicar. Regras puras (sem banco).

export interface RecebimentoPendenteRow {
  id_receb: number | string;
  conta_omie?: string | null;
  numero_nfe?: string | null;
  serie_nfe?: string | null;
  fornecedor?: string | null;
  fornecedor_razao?: string | null;
  emissao_nfe?: string | null;
  etapa?: string | null;
  status?: string | null;
  total_nfe?: number | string | null;
  qtd_itens?: number | null;
}

export interface NotaPendenteRecebimento {
  idReceb: string;
  conta: string;           // 'NOVA' | 'CASTRO'
  numeroNf: string;        // sem zeros à esquerda
  serie: string;
  fornecedor: string;
  emissao: string;         // DD/MM/YYYY
  etapa: string;
  status: string;
  rotulo: string;          // texto humano da situação
  cancelada: boolean;
  valor: number;
  qtdItens: number;
}

/** Etapa/status → frase curta para a tela. */
export function rotuloPendencia(etapa: string | null | undefined, status: string | null | undefined): string {
  const st = String(status || '').trim();
  const et = String(etapa || '').replace(/\D/g, '');
  if (/cancel/i.test(st)) return 'Cancelada na Omie' + (et ? ` (etapa ${et})` : '');
  if (et === '60' || /receb/i.test(st)) return 'Recebida (etapa 60)';
  const nome = st || (et ? 'Etapa ' + et : 'Em recebimento');
  return `${nome}${et && st ? ` (etapa ${et})` : ''} — entrada ainda não concluída`;
}

/** Normaliza `emissao_nfe` (ISO ou DD/MM/YYYY) para DD/MM/YYYY. */
export function emissaoBR(v: string | null | undefined): string {
  const s = String(v || '').trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  return s;
}

/** Linha do espelho → shape da tela. `conta_omie` em recebimentos_nfe é minúscula. */
export function normalizarPendente(row: RecebimentoPendenteRow): NotaPendenteRecebimento {
  const etapa = String(row.etapa || '').replace(/\D/g, '');
  const status = String(row.status || '').trim();
  return {
    idReceb: String(row.id_receb),
    conta: String(row.conta_omie || '').toUpperCase(),
    numeroNf: String(row.numero_nfe || '').replace(/^0+(?=\d)/, ''),
    serie: String(row.serie_nfe || ''),
    fornecedor: String(row.fornecedor || row.fornecedor_razao || '').trim() || '(fornecedor não informado)',
    emissao: emissaoBR(row.emissao_nfe),
    etapa,
    status,
    rotulo: rotuloPendencia(etapa, status),
    cancelada: /cancel/i.test(status),
    valor: parseFloat(String(row.total_nfe ?? 0)) || 0,
    qtdItens: Number(row.qtd_itens) || 0,
  };
}

/**
 * Filtra as linhas que valem a pena avisar: ainda não concluídas (etapa ≠ 60 e
 * status ≠ Recebida). Canceladas ficam (avisar "foi cancelada" também explica o
 * sumiço), mas vão para o fim.
 */
export function filtrarPendentes(rows: RecebimentoPendenteRow[]): NotaPendenteRecebimento[] {
  return rows
    .map(normalizarPendente)
    .filter((p) => p.etapa !== '60' && !/receb/i.test(p.status))
    .sort((a, b) => Number(a.cancelada) - Number(b.cancelada));
}
