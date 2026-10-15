// Permissões v2 — grava o catálogo (telas + rotas) e o BACKFILL de portal_permissoes.
//
//   npx tsx scripts/permissoes-v2-sync.ts            # simula: mostra o plano e o diff calculado aqui
//   npx tsx scripts/permissoes-v2-sync.ts --gravar   # grava (precisa de sql/permissoes-v2.sql aplicada)
//
// Idempotente (upsert). Não apaga nada. Não muda acesso de ninguém: o portal
// ainda decide por portal_permissoes até a Fase 3.
import { MOTIVO_BACKFILL, planejarBackfill, type LinhaPermissao } from '../src/lib/permissoes/backfill';
import { antigoTem, efetivas } from '../src/lib/permissoes/resolver';
import { catalogoRotas, catalogoTelas } from '../src/lib/permissoes/telas';
import { lerTudo, upsert } from './permissoes-v2-rest';

const gravar = process.argv.includes('--gravar');

const linhas = lerTudo<LinhaPermissao>('portal_permissoes?select=user_id,is_admin,is_dev,categoria,modulos_permitidos');
const nomes = Object.fromEntries(lerTudo<{ id: string; nome: string }>('financeiro_usu?select=id,nome').map((u) => [u.id, u.nome]));
const catalogo = catalogoTelas();
const plano = planejarBackfill(linhas, catalogo);
const telas = [...catalogo, ...plano.telasNovas];
const rotas = catalogoRotas();

console.log(`telas: ${catalogo.length} do catálogo + ${plano.telasNovas.length} legado (${plano.telasNovas.map((t) => t.id).join(', ') || '—'})`);
console.log(`rotas: ${rotas.length}`);
for (const d of plano.departamentos) {
  console.log(`departamento "${d.nome}": ${d.membros.length} pessoa(s), ${d.telas.length} tela(s) em comum [${d.telas.map((t) => t.tela).join(', ')}]`);
}
console.log(`extras (override com motivo de backfill): ${plano.extras.length}`);
const porUser = new Map<string, number>();
for (const e of plano.extras) porUser.set(e.user_id, (porUser.get(e.user_id) || 0) + 1);
for (const [u, n] of [...porUser].sort((a, b) => b[1] - a[1])) console.log(`  ${nomes[u] ?? u}: ${n}`);

// Diff local (espelho TS da função do banco) — o diff contra o banco é o permissoes-v2-diff.ts.
let difs = 0;
for (const l of linhas) {
  const dep = plano.departamentos.find((d) => d.membros.includes(l.user_id));
  const conc = [
    ...(dep?.telas ?? []).map((t) => ({ ...t, origem: `conjunto:${dep!.nome}` })),
    ...plano.extras.filter((e) => e.user_id === l.user_id).map((e) => ({ tela: e.tela, nivel: e.nivel, origem: 'extra' })),
  ];
  const papel = { admin: !!(l.is_admin || l.is_dev), dev: !!l.is_dev };
  const ef = efetivas(telas, papel, conc);
  for (const t of telas) {
    const antes = antigoTem(l.modulos_permitidos || [], papel, t.id);
    if (antes !== ef.has(t.id)) { difs++; console.log(`  DIF ${nomes[l.user_id] ?? l.user_id} ${t.id}: hoje=${antes} v2=${ef.has(t.id)}`); }
  }
}
console.log(`diff local (${linhas.length} usuários × ${telas.length} telas): ${difs}`);

if (!gravar) { console.log('\nsimulação — nada gravado (use --gravar)'); process.exit(difs ? 1 : 0); }
if (difs) { console.error('diff local ≠ 0 — não gravo'); process.exit(1); }

upsert('perm_telas', telas.map((t) => ({ ...t, atualizado_em: new Date().toISOString() })), 'id');
upsert('perm_tela_rotas', rotas.map((r) => ({ padrao: r.padrao, acesso: r.acesso, tela_id: r.tela_id ?? null, alternativas: r.alternativas ?? [], nota: r.nota ?? null })), 'padrao');
const conjuntos = upsert<{ id: string; nome: string }>('perm_conjuntos',
  plano.departamentos.map((d) => ({ nome: d.nome, tipo: 'departamento', descricao: 'Backfill 13/10/2026: o que todos da categoria já tinham' })), 'nome');
const idDe = Object.fromEntries(conjuntos.map((c) => [c.nome, c.id]));
upsert('perm_conjunto_telas', plano.departamentos.flatMap((d) => d.telas.map((t) => ({ conjunto_id: idDe[d.nome], tela_id: t.tela, nivel: t.nivel }))), 'conjunto_id,tela_id');
upsert('perm_usuario_conjuntos', plano.departamentos.flatMap((d) => d.membros.map((user_id) => ({ user_id, conjunto_id: idDe[d.nome] }))), 'user_id,conjunto_id');
upsert('perm_usuario_overrides', plano.extras.map((e) => ({ user_id: e.user_id, tela_id: e.tela, nivel: e.nivel, tipo: 'extra', motivo: MOTIVO_BACKFILL })), 'user_id,tela_id,tipo');
console.log('\ngravado. Rode: npx tsx scripts/permissoes-v2-diff.ts');
