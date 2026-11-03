// Tipos de atendimento da OS ("Tipo de Atendimento" no drawer do POS).
// Lib PURA (navegador e servidor). A lista vem da tabela pos_tipos_atendimento;
// sem a migration, vale TIPOS_PADRAO. "Manutenção" e "Revisão" são fixos:
// "Revisão" liga o plano de revisão, o PPV automático e o serviço de revisão
// no Omie (lib/pos/omie.ts) — não podem ser apagados nem renomeados.

export const TIPOS_FIXOS = ['Manutenção', 'Revisão'] as const;
export const TIPOS_PADRAO = ['Manutenção', 'Revisão', 'Entrega Técnica', 'Inspeção Pré-Entrega'] as const;
export const NOME_MAX = 40;

export type TipoAtendimento = { id: string | null; nome: string; fixo: boolean };

/** Espaços colapsados e aparados. */
export function limparNome(nome: unknown): string {
  return String(nome ?? '').replace(/\s+/g, ' ').trim();
}

/** Chave de comparação: sem acento, sem caixa. "inspecao pre-entrega" = "Inspeção Pré-Entrega". */
export function chaveTipo(nome: unknown): string {
  return limparNome(nome).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function ehFixo(nome: unknown): boolean {
  const k = chaveTipo(nome);
  return TIPOS_FIXOS.some((f) => chaveTipo(f) === k);
}

/** Erro de validação de um nome novo, ou null. */
export function validarNomeTipo(nome: unknown, existentes: string[]): string | null {
  const n = limparNome(nome);
  if (!n) return 'Informe o nome do tipo.';
  if (n.length > NOME_MAX) return `Nome com no máximo ${NOME_MAX} caracteres.`;
  const k = chaveTipo(n);
  if (existentes.some((e) => chaveTipo(e) === k)) return `"${n}" já existe.`;
  return null;
}

/** Fixos sempre primeiro (na ordem de TIPOS_FIXOS), depois os do banco na ordem recebida, sem repetir. */
export function montarLista(doBanco: { id: string | null; nome: string }[]): TipoAtendimento[] {
  const out: TipoAtendimento[] = TIPOS_FIXOS.map((nome) => {
    const linha = doBanco.find((t) => chaveTipo(t.nome) === chaveTipo(nome));
    return { id: linha?.id ?? null, nome, fixo: true };
  });
  const vistos = new Set(out.map((t) => chaveTipo(t.nome)));
  for (const t of doBanco) {
    const nome = limparNome(t.nome);
    const k = chaveTipo(nome);
    if (!nome || vistos.has(k)) continue;
    vistos.add(k);
    out.push({ id: t.id, nome, fixo: false });
  }
  return out;
}

/** Opções do select: a lista + o valor atual da OS se ele não estiver nela (tipo desativado ou legado). */
export function opcoesComAtual(lista: string[], atual: string | null | undefined): string[] {
  const a = limparNome(atual);
  if (!a || lista.some((n) => chaveTipo(n) === chaveTipo(a))) return lista;
  return [...lista, a];
}
