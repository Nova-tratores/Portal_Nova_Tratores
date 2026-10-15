// Permissões v2 — diff entre a regra de HOJE (portal_permissoes + permite/podeTela*)
// e a função do BANCO (view permissoes_efetivas), por usuário e por tela.
//
//   npx tsx scripts/permissoes-v2-diff.ts
//
// Sai com código 1 se houver qualquer diferença. Só leitura.
import { antigoTem } from '../src/lib/permissoes/resolver';
import { lerTudo } from './permissoes-v2-rest';

const linhas = lerTudo<{ user_id: string; is_admin: boolean; is_dev: boolean; modulos_permitidos: string[] | null }>(
  'portal_permissoes?select=user_id,is_admin,is_dev,modulos_permitidos');
const nomes = Object.fromEntries(lerTudo<{ id: string; nome: string }>('financeiro_usu?select=id,nome').map((u) => [u.id, u.nome]));
const telas = lerTudo<{ id: string }>('perm_telas?select=id&ativo=eq.true&order=id');
const ef = lerTudo<{ user_id: string; tela_id: string }>('permissoes_efetivas?select=user_id,tela_id&order=user_id,tela_id');

const v2 = new Set(ef.map((e) => `${e.user_id}|${e.tela_id}`));
let difs = 0, iguais = 0;
for (const l of linhas) {
  const papel = { admin: !!(l.is_admin || l.is_dev), dev: !!l.is_dev };
  for (const t of telas) {
    const antes = antigoTem(l.modulos_permitidos || [], papel, t.id);
    const depois = v2.has(`${l.user_id}|${t.id}`);
    if (antes === depois) { iguais++; continue; }
    difs++;
    console.log(`DIF ${nomes[l.user_id] ?? l.user_id} · ${t.id}: hoje=${antes} banco=${depois}`);
  }
}
console.log(`${linhas.length} usuários × ${telas.length} telas = ${iguais + difs} comparações · diferenças: ${difs}`);
process.exit(difs ? 1 : 0);
