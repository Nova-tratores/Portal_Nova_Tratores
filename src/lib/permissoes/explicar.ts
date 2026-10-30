// Permissões v2 — explica em português a origem que perm_efetivas devolve.
// Puro: usado pela tela /admin/permissoes. Não decide acesso (a regra vive no banco).

export type TipoOrigem = 'admin' | 'dev' | 'conjunto' | 'extra' | 'bloqueio';
export interface OrigemExplicada { tipo: TipoOrigem; texto: string }

/** 'conjunto:Peças · gerir ppv' → herdada do conjunto, com o motivo da herança. */
export function explicarOrigem(origem: string): OrigemExplicada {
  if (origem === 'admin') return { tipo: 'admin', texto: 'Admin: tem tudo, menos as ações só de Dev' };
  if (origem === 'dev') return { tipo: 'dev', texto: 'Dev: tem tudo' };
  if (origem.startsWith('bloqueio ')) return { tipo: 'bloqueio', texto: `Bloqueio individual (${origem.slice(9)})` };

  const [base, detalhe] = origem.split(' · ');
  const como = !detalhe ? ''
    : detalhe.startsWith('gerir ') ? `, porque tem ${detalhe.slice(6)} inteiro`
    : detalhe.startsWith('por ') ? `, porque tem ${detalhe.slice(4)} (dentro desta tela)`
    : `, ${detalhe}`;
  if (base.startsWith('conjunto:')) return { tipo: 'conjunto', texto: `Herdada de ${base.slice(9)}${como}` };
  if (base.startsWith('extra')) {
    const validade = base.slice(5).trim();
    return { tipo: 'extra', texto: `Extra individual${validade ? ` ${validade}` : ''}${como}` };
  }
  return { tipo: 'extra', texto: origem };
}

export interface TelaMatriz {
  id: string; nome: string; categoria_menu: string; explicita: boolean; so_dev: boolean;
  nivel: string | null; origens: string[];
}

/** Agrupa por categoria do menu; dentro dela, ordem pelo id (o pai vem antes dos filhos). */
export function agruparPorCategoria(telas: TelaMatriz[]): { categoria: string; telas: TelaMatriz[] }[] {
  const m = new Map<string, TelaMatriz[]>();
  for (const t of telas) m.set(t.categoria_menu, [...(m.get(t.categoria_menu) ?? []), t]);
  return [...m.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([categoria, lista]) => ({ categoria, telas: lista.sort((x, y) => x.id.localeCompare(y.id)) }));
}

/** Recuo visual: quantos ':' a tela tem. */
export const profundidade = (id: string) => id.split(':').length - 1;
