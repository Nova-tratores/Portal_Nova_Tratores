// =============================================================================
// Permissões v2 como FONTE (Fase 4, parte 2 — 10/11/2026). Regras PURAS.
//
// Até aqui portal_permissoes.modulos_permitidos era a fonte e o espelho copiava
// para a v2. Agora a v2 (departamentos/pacotes + extras + bloqueios) é a fonte e a
// lista de chaves antiga é REGERADA a partir dela — as checagens que ainda leem a
// lista (rotas com regra própria, notificações por setor…) continuam iguais.
//
// Tudo é comparado no "espaço v2": o significado de uma lista de chaves é
// efetivas(conc(chaves)) do resolver (mesma regra do banco, provada por diff).
// =============================================================================
import { efetivas, nivelDaChaveAntiga, type Bloqueio, type Concessao } from './resolver';
import type { Nivel } from './telas';

export interface TelaCat { id: string; explicita: boolean; so_dev?: boolean }
export interface Override { tela: string; nivel: Nivel }
export interface EntradaPessoa {
  /** telas (como chaves) de cada departamento/pacote ATIVO em que a pessoa está */
  conjuntos: { id: string; nome: string; telas: Override[] }[];
  /** extras e bloqueios VIGENTES (vencidos ficam de fora) */
  extras: Override[];
  bloqueios: Override[];
}

const NINGUEM = { admin: false, dev: false };
const ID_OK = /^[a-z0-9_-]+(:[a-z0-9_-]+)*$/;

/** Telas que uma lista de chaves dá (presença; admin/dev ficam fora — vêm do papel). */
export function telasDasChaves(cat: TelaCat[], chaves: string[]): Set<string> {
  const conc: Concessao[] = [...new Set(chaves.map((k) => k.trim()).filter((k) => ID_OK.test(k)))]
    .map((tela) => ({ tela, nivel: nivelDaChaveAntiga(tela), origem: 'chave' }));
  return new Set(efetivas(cat, NINGUEM, conc).keys());
}

/** Telas que a pessoa tem pela v2 (conjuntos + extras − bloqueios), sem o papel admin/dev. */
export function telasDaPessoa(cat: TelaCat[], e: EntradaPessoa): Set<string> {
  const conc: Concessao[] = [
    ...e.conjuntos.flatMap((c) => c.telas.map((t) => ({ tela: t.tela, nivel: t.nivel, origem: c.nome }))),
    ...e.extras.map((x) => ({ tela: x.tela, nivel: x.nivel, origem: 'extra' })),
  ];
  const bl: Bloqueio[] = e.bloqueios.map((b) => ({ tela: b.tela, nivel: b.nivel }));
  return new Set(efetivas(cat, NINGUEM, conc, bl).keys());
}

export const mesmoConjunto = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((x) => b.has(x));

/**
 * Lista de chaves (formato antigo) que dá EXATAMENTE as telas `alvo`.
 * Módulo inteiro quando tudo o que ele dá está no alvo; senão as telas uma a uma.
 * `null` = não dá para escrever com chaves (ex.: só 'ver' no módulo sem nada dentro).
 */
export function chavesDaV2(cat: TelaCat[], alvo: Set<string>): string[] | null {
  const chaves: string[] = [];
  const raizes = [...new Set([...alvo].map((t) => t.split(':')[0]))].sort();
  for (const m of raizes) {
    const doModulo = [...alvo].filter((t) => t === m || t.startsWith(m + ':')).sort();
    const daChave = telasDasChaves(cat, [m]);
    if (alvo.has(m) && [...daChave].every((t) => alvo.has(t))) {
      chaves.push(m);
      chaves.push(...doModulo.filter((t) => !daChave.has(t)));
    } else {
      chaves.push(...doModulo.filter((t) => t !== m));
    }
  }
  return mesmoConjunto(telasDasChaves(cat, chaves), alvo) ? chaves : null;
}

/**
 * Lista de chaves a partir do que foi CONCEDIDO (conjuntos + extras), não só do
 * resultado: quem tem as telas do POS uma a uma continua com elas uma a uma (se
 * virasse 'pos', ganharia sozinho cada tela nova do POS). Concessão que tem algo
 * bloqueado dentro vira as telas uma a uma. Se não fechar com o resultado, cai no
 * chavesDaV2.
 */
export function chavesDaEntrada(cat: TelaCat[], e: EntradaPessoa): string[] | null {
  const alvo = telasDaPessoa(cat, e);
  const dentro = (a: string, t: string) => t === a || t.startsWith(a + ':');
  const conc = [...e.conjuntos.flatMap((c) => c.telas), ...e.extras];
  const chaves = new Set<string>();
  for (const c of conc) {
    if (nivelDaChaveAntiga(c.tela) !== c.nivel && !(c.nivel === 'gerir' && !c.tela.includes(':'))) return chavesDaV2(cat, alvo);
    if (!alvo.has(c.tela)) continue; // bloqueada inteira
    if (e.bloqueios.some((b) => dentro(c.tela, b.tela) || dentro(b.tela, c.tela))) {
      for (const t of telasDasChaves(cat, [c.tela])) if (alvo.has(t) && t !== c.tela.split(':')[0]) chaves.add(t);
      if (c.tela.includes(':')) chaves.add(c.tela);
    } else {
      chaves.add(c.tela);
    }
  }
  const lista = [...chaves].sort();
  return mesmoConjunto(telasDasChaves(cat, lista), alvo) ? lista : chavesDaV2(cat, alvo);
}

export interface PlanoPessoa {
  incluirExtras: Override[];
  removerExtras: string[];
  incluirBloqueios: Override[];
  removerBloqueios: string[];
}
export const planoPessoaVazio = (p: PlanoPessoa) =>
  !p.incluirExtras.length && !p.removerExtras.length && !p.incluirBloqueios.length && !p.removerBloqueios.length;

/**
 * Edição pela lista de chaves (as caixinhas do Admin): o que a pessoa passa a ter
 * vira extras/bloqueios POR CIMA dos departamentos e pacotes dela — os conjuntos
 * nunca são mexidos daqui. Extra que o conjunto já cobre não é criado.
 * `null` = não deu para montar (não deveria acontecer; quem chama recusa).
 */
export function planejarPessoa(cat: TelaCat[], atual: EntradaPessoa, chavesNovas: string[]): PlanoPessoa | null {
  const alvo = telasDasChaves(cat, chavesNovas);
  const doConjunto = telasDaPessoa(cat, { conjuntos: atual.conjuntos, extras: [], bloqueios: [] });
  const validas = [...new Set(chavesNovas.map((k) => k.trim()).filter((k) => ID_OK.test(k)))].sort();

  const tentar = (extrasChaves: string[]): { extras: Override[]; bloqueios: Override[] } | null => {
    const extras = extrasChaves.map((tela) => ({ tela, nivel: nivelDaChaveAntiga(tela) }));
    const sobra = [...telasDaPessoa(cat, { conjuntos: atual.conjuntos, extras, bloqueios: [] })].filter((t) => !alvo.has(t));
    const sobraSet = new Set(sobra);
    // bloqueia só o mais alto de cada galho (o bloqueio desce)
    const bloqueios = sobra.filter((t) => {
      const partes = t.split(':');
      for (let i = 1; i < partes.length; i++) if (sobraSet.has(partes.slice(0, i).join(':'))) return false;
      return true;
    }).sort().map((tela) => ({ tela, nivel: 'ver' as Nivel }));
    const resultado = telasDaPessoa(cat, { conjuntos: atual.conjuntos, extras, bloqueios });
    return mesmoConjunto(resultado, alvo) ? { extras, bloqueios } : null;
  };

  // 1º: só o que o conjunto não cobre; 2º (reserva): todas as chaves como extra
  const naoCobertas = validas.filter((k) => ![...telasDasChaves(cat, [k])].every((t) => doConjunto.has(t)));
  const r = tentar(naoCobertas) ?? tentar(validas);
  if (!r) return null;

  const chave = (o: Override) => `${o.tela}|${o.nivel}`;
  const extrasAtuais = new Set(atual.extras.map(chave));
  const extrasNovos = new Set(r.extras.map(chave));
  const blAtuais = new Set(atual.bloqueios.map(chave));
  const blNovos = new Set(r.bloqueios.map(chave));
  return {
    incluirExtras: r.extras.filter((o) => !extrasAtuais.has(chave(o))),
    removerExtras: atual.extras.filter((o) => !extrasNovos.has(chave(o))).map((o) => o.tela),
    incluirBloqueios: r.bloqueios.filter((o) => !blAtuais.has(chave(o))),
    removerBloqueios: atual.bloqueios.filter((o) => !blNovos.has(chave(o))).map((o) => o.tela),
  };
}

/** Quem ganha e quem perde o quê entre dois retratos (prévia antes de gravar). */
export function diferenca(antes: Set<string>, depois: Set<string>): { ganha: string[]; perde: string[] } {
  return {
    ganha: [...depois].filter((t) => !antes.has(t)).sort(),
    perde: [...antes].filter((t) => !depois.has(t)).sort(),
  };
}
