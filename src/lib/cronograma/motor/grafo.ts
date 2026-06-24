// ════════════════════════════════════════════════════════════════════
// Grafo de dependências: lista de adjacência, ordenação topológica
// (Kahn) e detecção de ciclo.
// ════════════════════════════════════════════════════════════════════

import type { DepIn } from './tipos';

export interface ResultadoTopo {
  ordem: string[]; // ids em ordem topológica (predecessoras antes)
  ciclo: boolean;
  idsCiclo: string[]; // nós que sobraram (envolvidos no ciclo)
}

/**
 * Ordena os nós topologicamente. Só dependências entram como arestas
 * (predecessora → sucessora). Nós sem aresta também aparecem na ordem.
 * Se sobrar nó (grau de entrada nunca zera) → há ciclo.
 */
export function ordenacaoTopologica(ids: string[], deps: DepIn[]): ResultadoTopo {
  const grauEntrada = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const id of ids) {
    grauEntrada.set(id, 0);
    adj.set(id, []);
  }

  for (const d of deps) {
    // ignora arestas que apontam para nós inexistentes (defensivo)
    if (!grauEntrada.has(d.predecessoraId) || !grauEntrada.has(d.sucessoraId)) continue;
    adj.get(d.predecessoraId)!.push(d.sucessoraId);
    grauEntrada.set(d.sucessoraId, (grauEntrada.get(d.sucessoraId) ?? 0) + 1);
  }

  const fila: string[] = [];
  for (const [id, g] of grauEntrada) if (g === 0) fila.push(id);

  const ordem: string[] = [];
  while (fila.length) {
    const n = fila.shift()!;
    ordem.push(n);
    for (const viz of adj.get(n) ?? []) {
      const g = (grauEntrada.get(viz) ?? 0) - 1;
      grauEntrada.set(viz, g);
      if (g === 0) fila.push(viz);
    }
  }

  if (ordem.length < ids.length) {
    const idsCiclo = ids.filter((id) => !ordem.includes(id));
    return { ordem, ciclo: true, idsCiclo };
  }
  return { ordem, ciclo: false, idsCiclo: [] };
}
