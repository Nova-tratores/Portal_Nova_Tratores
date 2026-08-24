// Log de alterações feitas PELA TELA DE DESPESAS.
//
// Grava no `audit_log` que o portal já usa (16 mil linhas, mesmo formato de
// requisições/PPV/POS) em vez de criar tabela nova — assim o histórico da
// despesa aparece junto do resto no dia em que alguém montar um painel único.
//
// Convenção seguida (a mesma de `financeiro`/`Chamado_NF` que já está lá):
//   sistema  = 'financeiro'
//   acao     = 'editar'
//   entidade = 'finan_pagar'
//   detalhes = { campo, de, deNome, para, paraNome }
//
// Guardar o CÓDIGO e o NOME é de propósito: nome é o que a pessoa entende hoje,
// código é o que continua identificando a categoria se ela for renomeada no
// Omie amanhã.

export interface LogDespesa {
  id: number | string
  user_nome: string | null
  acao: string | null
  entidade_id: string | null
  entidade_label: string | null
  detalhes: Record<string, unknown> | null
  created_at: string | null
}

export interface DetalheCategoria {
  campo: 'omie_categoria'
  de: string | null
  deNome: string | null
  para: string
  paraNome: string
}

export function detalhesCategoria(d: DetalheCategoria): Record<string, unknown> {
  return { ...d }
}

/** Frase legível de uma linha do log. Sem depender de React, pra ter teste. */
export function descreverLog(log: LogDespesa): string {
  const d = (log.detalhes || {}) as Partial<DetalheCategoria>
  if (d.campo === 'omie_categoria') {
    const para = d.paraNome || d.para || '—'
    const de = d.deNome || d.de
    return de
      ? `Categoria alterada de "${de}" para "${para}"`
      : `Categoria definida como "${para}"`
  }
  // ação desconhecida (log antigo ou de outro fluxo): mostra o que dá, em vez
  // de esconder a linha — um histórico com buraco é pior que um genérico
  return log.acao === 'editar' ? 'Despesa editada' : String(log.acao || 'Alteração')
}
