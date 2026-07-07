// Saneia texto do usuário antes de interpolar num filtro do PostgREST
// (`.or(...)`, `.ilike`, `.eq`). Sem isso, um `,` `(` `)` no termo de busca
// injeta condições extras no filtro — no melhor caso vaza dados, e num UPDATE
// com `.or()` pode alterar linhas que não deviam (perda de dados em massa).
//
// Remove os metacaracteres da gramática do filtro: vírgula (separa condições),
// parênteses (agrupam lógica) e os curingas do ilike (% e *). Barra invertida
// também sai por segurança. O ponto é mantido (é literal dentro do valor).
export function sanitizarFiltro(s: unknown): string {
  return String(s ?? '').replace(/[%,()*\\]/g, '');
}
