// Sigla e código do fornecedor (13/11/2026). O código é do banco (sequência, sql/fornecedores-sigla-codigo.sql);
// a sigla é opcional e única sem diferenciar maiúscula/minúscula (índice fornecedores_sigla_uk).

/** Sigla gravada: MAIÚSCULAS, sem espaços nas pontas; vazia = null (não conta para a unicidade). */
export function normalizarSigla(s: string | null | undefined): string | null {
  const v = String(s ?? '').trim().toUpperCase()
  return v || null
}

/** Mensagem de gente para o erro do banco ao gravar o fornecedor. */
export function mensagemErroFornecedor(erro: { code?: string; message?: string } | null | undefined, sigla?: string | null): string {
  const msg = erro?.message || 'erro desconhecido'
  if (erro?.code === '23505' && /sigla/i.test(msg)) return `Já existe um fornecedor com a sigla ${sigla || 'informada'}.`
  if (erro?.code === '23505' && /codigo/i.test(msg)) return 'O código do fornecedor se repetiu — tente salvar de novo.'
  if (erro?.code === '42703' && /sigla|codigo/i.test(msg)) return 'Falta aplicar sql/fornecedores-sigla-codigo.sql no banco.'
  return msg
}
