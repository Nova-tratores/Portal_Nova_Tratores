// Permissões v2 — roda o espelho na mão (o mesmo que o servidor faz no boot e a
// cada 10 min): catálogo de telas/rotas + v2 de todos os usuários acompanhando
// portal_permissoes. Depois confira com scripts/permissoes-v2-diff.ts.
//
//   npx tsx --env-file=.env.local scripts/permissoes-v2-espelhar.ts
import { espelharPermissoes, sincronizarCatalogo } from '../src/lib/permissoes/espelho-server';

async function main() {
  const cat = await sincronizarCatalogo();
  console.log(`catálogo: ${cat.telas} telas, ${cat.rotas} rotas`);
  const r = await espelharPermissoes();
  console.log(`espelho: ${r.alterados} de ${r.usuarios} usuário(s) acertado(s)`);
  if (r.ignoradas.length) console.log(`chaves ignoradas (formato inválido): ${r.ignoradas.join(', ')}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
