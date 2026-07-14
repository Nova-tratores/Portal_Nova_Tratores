// =============================================================================
// Compatibilidade de permissões — chaves LEGADAS -> chaves NOVAS.
//
// O Abastecimento virou submódulo do Frota e o pátio do Visual Estoque foi
// absorvido. As chaves antigas já estão GRAVADAS em
// `portal_permissoes.modulos_permitidos` de quem usa o portal hoje — se a gente
// só trocasse o nome, essas pessoas perderiam o acesso da noite pro dia.
//
// Então, em vez de migrar o banco e torcer, a expansão acontece em RUNTIME, em
// exatamente DOIS pontos (que cobrem cliente e servidor inteiros):
//   - src/hooks/usePermissoes.ts   (todo o front)
//   - src/lib/auth/server.ts       (todas as rotas /api)
//
// ⚠️ NÃO plugar isto no admin/page.tsx: ele lê `portal_permissoes` com query
// própria e ESCREVE o array de volta — se a expansão vazasse pra lá, o admin
// gravaria as chaves expandidas sem querer.
//
// Some quando o backfill (sql/frota-migrar-permissoes.sql) estiver aplicado e
// ninguém mais tiver chave legada. Ver Fase 5 do plano.
// =============================================================================

const ALIAS: Record<string, string[]> = {
  // Abastecimento -> submódulo do Frota
  abastecimento: [
    'frota:abastecimento',
    'frota:abastecimento:flex',
    'frota:abastecimento:upload',
  ],
  'abastecimento:dashboard': ['frota:abastecimento', 'frota:abastecimento:flex'],
  'abastecimento:upload': ['frota:abastecimento:upload'],

  // A tela `frota` do Visual Estoque (pátio) foi descontinuada — quem a tinha
  // passa a ver a lista de Veículos do Frota (que absorveu a função).
  'consulta-estoque:frota': ['frota:veiculos'],
};

/**
 * Devolve as permissões do usuário + as equivalentes novas. Aditivo: as antigas
 * continuam no array (nada que dependa delas quebra).
 */
export function expandirPermissoes(perms: string[] | null | undefined): string[] {
  const lista = Array.isArray(perms) ? perms : [];
  const out = new Set(lista);
  for (const p of lista) {
    for (const novo of ALIAS[p] || []) out.add(novo);
  }
  return [...out];
}
