// As TRÊS CLASSES de problema de um veículo (10/10/2026, Raio-X da Frota).
//
// Antes o card dizia "N pendências" e misturava "sem RENAVAM" com "pneu
// careca" com o mesmo peso. Agora cada pendência aberta cai numa classe:
//   - PARADO:   não deveria rodar — pendência de gravidade CRÍTICA, ou o
//               veículo marcado na Ficha como parado / em manutenção
//   - DEFEITO:  problema no carro para programar (checklist, requisição, OS,
//               Opa, manual)
//   - CADASTRO: papelada (régua da Ficha: RENAVAM, CRLV, documentos, multas)
//
// Módulo PURO (roda no navegador e no vitest).
import { gravidadeDaPendencia, PESO, type Gravidade } from '@/lib/frota/gravidade';

export type ClasseProblema = 'parado' | 'defeito' | 'cadastro';

export const CLASSES: ClasseProblema[] = ['parado', 'defeito', 'cadastro'];

export const CLASSE_LABEL: Record<ClasseProblema, string> = {
  parado: 'Parado',
  defeito: 'Defeito',
  cadastro: 'Cadastro',
};

export const CLASSE_AJUDA: Record<ClasseProblema, string> = {
  parado: 'Não deveria rodar: há um problema de gravidade crítica ou o veículo está marcado como parado/em manutenção na Ficha.',
  defeito: 'Problema no veículo para programar o conserto (veio do checklist, de requisição, de OS, do Opa ou foi aberto à mão).',
  cadastro: 'Papelada: falta RENAVAM, chassi, CRLV, documento vencendo ou multa em aberto.',
};

export const CLASSE_COR: Record<ClasseProblema, { bg: string; cor: string; forte: string }> = {
  parado: { bg: '#fee2e2', cor: '#991b1b', forte: '#dc2626' },
  defeito: { bg: '#ffedd5', cor: '#9a3412', forte: '#f97316' },
  cadastro: { bg: '#e0e7ff', cor: '#3730a3', forte: '#6366f1' },
};

/** Ordem de urgência: parado > defeito > cadastro. */
export const PESO_CLASSE: Record<ClasseProblema, number> = { parado: 3, defeito: 2, cadastro: 1 };

type Comps = Map<string, { sistema?: string | null; subsistema?: string | null; componente?: string | null }>;

export type PendenciaClassificavel = {
  origem?: string | null;
  gravidade?: string | null;
  componente_id?: string | null;
};

export function classeDaPendencia(p: PendenciaClassificavel, componentesPorId?: Comps): ClasseProblema {
  if (gravidadeDaPendencia(p, componentesPorId) === 'critica') return 'parado';
  if (p.origem === 'cadastro') return 'cadastro';
  return 'defeito';
}

/** Status da Ficha que tira o veículo de circulação. */
export function statusParado(status: string | null | undefined): boolean {
  return status === 'parado' || status === 'manutencao';
}

export interface ResumoClasses {
  parado: boolean;
  /** por que está parado: 'status' (Ficha) e/ou 'critica' (pendência) */
  motivoParado: ('status' | 'critica')[];
  criticas: number;
  defeitos: number;
  cadastro: number;
  /** a classe mais urgente presente (null = sem problema aberto) */
  pior: ClasseProblema | null;
  /** a gravidade mais alta entre as pendências abertas */
  piorGravidade: Gravidade | null;
}

export function resumoClasses(
  pendenciasAbertas: PendenciaClassificavel[],
  statusVeiculo: string | null | undefined,
  componentesPorId?: Comps,
): ResumoClasses {
  const out: ResumoClasses = { parado: false, motivoParado: [], criticas: 0, defeitos: 0, cadastro: 0, pior: null, piorGravidade: null };
  for (const p of pendenciasAbertas) {
    const g = gravidadeDaPendencia(p, componentesPorId);
    if (!out.piorGravidade || PESO[g] > PESO[out.piorGravidade]) out.piorGravidade = g;
    const c = classeDaPendencia(p, componentesPorId);
    if (c === 'parado') out.criticas++;
    else if (c === 'defeito') out.defeitos++;
    else out.cadastro++;
  }
  if (statusParado(statusVeiculo)) out.motivoParado.push('status');
  if (out.criticas > 0) out.motivoParado.push('critica');
  out.parado = out.motivoParado.length > 0;
  out.pior = out.parado ? 'parado' : out.defeitos > 0 ? 'defeito' : out.cadastro > 0 ? 'cadastro' : null;
  return out;
}

/** Ordena pendências: classe mais urgente primeiro, depois a gravidade. */
export function ordenarPorClasse<T extends PendenciaClassificavel>(pends: T[], componentesPorId?: Comps): T[] {
  return [...pends].sort((a, b) => {
    const dc = PESO_CLASSE[classeDaPendencia(b, componentesPorId)] - PESO_CLASSE[classeDaPendencia(a, componentesPorId)];
    if (dc) return dc;
    return PESO[gravidadeDaPendencia(b, componentesPorId)] - PESO[gravidadeDaPendencia(a, componentesPorId)];
  });
}
