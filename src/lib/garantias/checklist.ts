// Helpers puros do checklist (usados no cliente e no servidor)
import type { ChecklistField } from './types';

// Retorna os labels dos campos obrigatórios ainda não preenchidos
export function camposObrigatoriosFaltando(
  campos: ChecklistField[],
  valores: Record<string, unknown>
): string[] {
  if (!Array.isArray(campos)) return [];
  return campos
    .filter((c) => c.tipo !== 'secao' && c.obrigatorio)
    .filter((c) => {
      const v = valores?.[c.id];
      return v === undefined || v === null || v === '';
    })
    .map((c) => c.label);
}
