// Permissões v2 como fonte — conferência com os dados REAIS (só leitura).
//
//   npx tsx scripts/permissoes-fonte-conferir.ts
//
// Para cada usuário: (1) a v2 (conjuntos + extras − bloqueios) dá as mesmas telas
// que a lista antiga; (2) dá para regerar a lista a partir da v2; (3) editar pela
// lista atual não muda nada (plano vazio). Sai com código 1 se algo falhar.
import { chavesDaEntrada, chavesDaV2, mesmoConjunto, planejarPessoa, planoPessoaVazio, telasDasChaves, telasDaPessoa, type EntradaPessoa, type Override } from '../src/lib/permissoes/fonte';
import type { Nivel } from '../src/lib/permissoes/telas';
import { lerTudo } from './permissoes-v2-rest';

type Ov = { user_id: string; tela_id: string; nivel: Nivel; tipo: 'extra' | 'bloqueio'; expira_em: string | null };
const cat = lerTudo<{ id: string; explicita: boolean; so_dev: boolean }>('perm_telas?select=id,explicita,so_dev&ativo=eq.true&order=id');
const linhas = lerTudo<{ user_id: string; modulos_permitidos: string[] | null }>('portal_permissoes?select=user_id,modulos_permitidos');
const nomes = Object.fromEntries(lerTudo<{ id: string; nome: string }>('financeiro_usu?select=id,nome').map((u) => [u.id, u.nome]));
const conjuntos = lerTudo<{ id: string; nome: string; ativo: boolean }>('perm_conjuntos?select=id,nome,ativo');
const ctelas = lerTudo<{ conjunto_id: string; tela_id: string; nivel: Nivel }>('perm_conjunto_telas?select=conjunto_id,tela_id,nivel');
const vinc = lerTudo<{ user_id: string; conjunto_id: string }>('perm_usuario_conjuntos?select=user_id,conjunto_id');
const ovs = lerTudo<Ov>('perm_usuario_overrides?select=user_id,tela_id,nivel,tipo,expira_em');

const agora = Date.now();
const vigente = (o: Ov) => !o.expira_em || new Date(o.expira_em).getTime() > agora;
function entrada(user: string): EntradaPessoa {
  const ids = new Set(vinc.filter((v) => v.user_id === user).map((v) => v.conjunto_id));
  const ov = (tipo: Ov['tipo']): Override[] => ovs.filter((o) => o.user_id === user && o.tipo === tipo && vigente(o)).map((o) => ({ tela: o.tela_id, nivel: o.nivel }));
  return {
    conjuntos: conjuntos.filter((c) => c.ativo && ids.has(c.id)).map((c) => ({
      id: c.id, nome: c.nome, telas: ctelas.filter((t) => t.conjunto_id === c.id).map((t) => ({ tela: t.tela_id, nivel: t.nivel })),
    })),
    extras: ov('extra'), bloqueios: ov('bloqueio'),
  };
}

let falhas = 0;
for (const l of linhas) {
  const nome = nomes[l.user_id] ?? l.user_id;
  const e = entrada(l.user_id);
  const v2 = telasDaPessoa(cat, e);
  const antiga = telasDasChaves(cat, l.modulos_permitidos || []);
  const problemas: string[] = [];
  if (!mesmoConjunto(v2, antiga)) {
    problemas.push(`v2≠lista: só v2 [${[...v2].filter((t) => !antiga.has(t)).join(', ')}] só lista [${[...antiga].filter((t) => !v2.has(t)).join(', ')}]`);
  }
  if (!chavesDaV2(cat, v2)) problemas.push('não dá para regerar a lista');
  const ke = chavesDaEntrada(cat, e);
  if (!ke || !mesmoConjunto(telasDasChaves(cat, ke), v2)) problemas.push('lista pelas concessões não fecha');
  const p = planejarPessoa(cat, e, l.modulos_permitidos || []);
  if (!p) problemas.push('sem plano');
  else if (!planoPessoaVazio(p)) problemas.push(`plano não vazio: ${JSON.stringify(p)}`);
  if (problemas.length) { falhas++; console.log(`✗ ${nome}: ${problemas.join(' · ')}`); }
}
console.log(`${linhas.length} usuários · ${cat.length} telas · falhas: ${falhas}`);
process.exit(falhas ? 1 : 0);
