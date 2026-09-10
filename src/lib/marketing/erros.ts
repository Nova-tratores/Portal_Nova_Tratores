// =============================================================================
// MARKETING & EVENTOS — classificação de erro do banco. Lib PURA (testada).
//
// Existe separada de db.ts porque db.ts instancia o cliente Supabase no topo e
// isso exigiria variáveis de ambiente só pra rodar um teste desta função.
// =============================================================================

/**
 * O erro é "a tabela/coluna ainda não existe" (migration pendente)?
 *
 * ⚠️ HISTÓRIA: a primeira versão testava /relation .* not/, que casa com
 * `null value in column "ordem" of relation "mkt_midias" violates NOT-null
 * constraint`. Resultado: um erro de DADO aparecia na tela como "as tabelas
 * deste módulo não existem", e a pessoa ia rodar uma migration que já estava
 * aplicada. Por isso aqui só entram sinais inequívocos de schema.
 */
export function migrationFaltou(err: unknown): boolean {
  const e = err as { code?: unknown; message?: unknown } | null | undefined;
  const codigo = String(e?.code ?? '');

  // 42P01 = tabela inexistente · 42703 = coluna inexistente
  // PGRST205 = PostgREST não achou a tabela no cache de schema
  if (codigo === '42P01' || codigo === '42703' || codigo === 'PGRST205') return true;

  // Erros de DADO têm código próprio (23502 not-null, 23503 FK, 23505 único,
  // 23514 check). Nenhum deles é migration — barrar antes de olhar o texto.
  if (/^23\d\d\d$/.test(codigo)) return false;

  const m = String(e?.message ?? '');
  return /does not exist|schema cache/i.test(m);
}
