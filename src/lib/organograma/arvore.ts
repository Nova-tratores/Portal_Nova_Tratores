// Organograma: junta as pessoas do portal (financeiro_usu) e do RH (rh_funcionarios) numa lista
// só e monta a árvore pelo chefe gravado em org_pessoas. Pura (client-safe): a rota lê as fontes.

export interface UsuarioPortal {
  id: string;
  nome: string | null;
  email: string | null;
  funcao: string | null;
  avatar_url: string | null;
  ativo: boolean | null;
}

export interface FuncionarioRHOrg {
  id: string;
  nome: string;
  email: string | null;
  empresa: string | null;
  cargo: string | null;
  departamento: string | null;
  foto_url: string | null;
  status: string | null;
  data_demissao: string | null;
}

export interface PessoaOrg {
  chave: string;               // 'u:<uid>' | 'rh:<id>'
  nome: string;
  foto: string | null;
  cargo: string | null;
  setor: string | null;
  empresa: string | null;
  origem: 'portal' | 'rh' | 'ambos';
  /** "dono de …": responsabilidades gravadas em outros módulos. */
  papeis: string[];
  /** Sistemas em que mais registrou ações nos últimos 90 dias. */
  pratica: Array<[string, number]>;
}

export interface VinculoOrg {
  pessoa_chave: string;
  gestor_chave: string | null;
  topo: boolean;
  fora: boolean;
  cargo: string | null;
  ordem: number;
}

export interface NoOrg { pessoa: PessoaOrg; filhos: NoOrg[] }

export function semAcento(s: string): string {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

// Contas que não são gente: testes, estação de impressão.
const NAO_PESSOA = /\bteste\b|esta[cç][aã]o de impress|\(claude\)|^reserva\b/i;

/** Corrige "PÃ³s-Vendas" (texto UTF-8 lido como Latin-1) quando der. */
function consertarTexto(s: string | null): string | null {
  if (!s) return s;
  if (!/Ã|Â/.test(s)) return s;
  try { return decodeURIComponent(escape(s)); } catch { return s; }
}

/**
 * Uma pessoa por gente: usuário do portal ativo casa com o funcionário do RH pelo e-mail ou, sem
 * e-mail igual, pelo nome (sem acento/caixa). Funcionário do RH sem login entra como 'rh:<id>'.
 * Demitido no RH e conta de teste ficam de fora.
 */
export function juntarPessoas(portal: UsuarioPortal[], rh: FuncionarioRHOrg[]): PessoaOrg[] {
  const rhAtivos = rh.filter((f) => !f.data_demissao && semAcento(f.status || '') !== 'demitido');
  const porEmail = new Map<string, FuncionarioRHOrg>();
  const porNome = new Map<string, FuncionarioRHOrg>();
  for (const f of rhAtivos) {
    if (f.email) porEmail.set(f.email.trim().toLowerCase(), f);
    porNome.set(semAcento(f.nome), f);
  }
  const usados = new Set<string>();
  const out: PessoaOrg[] = [];
  for (const u of portal) {
    if (u.ativo === false || !u.nome) continue;
    if (NAO_PESSOA.test(`${u.nome} ${u.funcao || ''} ${u.email || ''}`)) continue;
    const f = (u.email && porEmail.get(u.email.trim().toLowerCase())) || porNome.get(semAcento(u.nome)) || null;
    if (f) usados.add(f.id);
    out.push({
      chave: `u:${u.id}`,
      nome: u.nome.trim(),
      foto: u.avatar_url || f?.foto_url || null,
      cargo: f?.cargo || null,
      setor: f?.departamento || consertarTexto(u.funcao) || null,
      empresa: f?.empresa || null,
      origem: f ? 'ambos' : 'portal',
      papeis: [],
      pratica: [],
    });
  }
  for (const f of rhAtivos) {
    if (usados.has(f.id)) continue;
    out.push({
      chave: `rh:${f.id}`, nome: f.nome.trim(), foto: f.foto_url, cargo: f.cargo, setor: f.departamento,
      empresa: f.empresa, origem: 'rh', papeis: [], pratica: [],
    });
  }
  return out.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

/** true se pôr `gestor` como chefe de `pessoa` fecha um círculo (a pessoa viraria chefe de si mesma). */
export function criaCiclo(pessoa: string, gestor: string | null, vinculos: VinculoOrg[]): boolean {
  if (!gestor) return false;
  if (gestor === pessoa) return true;
  const chefe = new Map(vinculos.map((v) => [v.pessoa_chave, v.gestor_chave]));
  const vistos = new Set<string>();
  let atual: string | null | undefined = gestor;
  while (atual && !vistos.has(atual)) {
    if (atual === pessoa) return true;
    vistos.add(atual);
    atual = chefe.get(atual);
  }
  return false;
}

/**
 * Árvore: raízes = marcadas como topo. Sem chefe, com chefe fora da lista visível ou num círculo
 * = "a posicionar" (com a equipe que já tiver). Filhos ordenados por `ordem` e depois nome.
 */
export function montarArvore(pessoas: PessoaOrg[], vinculos: VinculoOrg[]): { raizes: NoOrg[]; aPosicionar: NoOrg[]; fora: PessoaOrg[] } {
  const vinc = new Map(vinculos.map((v) => [v.pessoa_chave, v]));
  const fora = pessoas.filter((p) => vinc.get(p.chave)?.fora);
  const visiveis = pessoas.filter((p) => !vinc.get(p.chave)?.fora).map((p) => {
    const cargo = vinc.get(p.chave)?.cargo;
    return cargo ? { ...p, cargo } : p;
  });
  const porChave = new Map(visiveis.map((p) => [p.chave, p]));
  const filhos = new Map<string, PessoaOrg[]>();
  const raizes: PessoaOrg[] = [];
  const aPosicionar: PessoaOrg[] = [];
  for (const p of visiveis) {
    const v = vinc.get(p.chave);
    if (v?.topo) raizes.push(p);
    else if (v?.gestor_chave && porChave.has(v.gestor_chave) && !criaCiclo(p.chave, v.gestor_chave, vinculos.filter((x) => x.pessoa_chave !== p.chave))) {
      const l = filhos.get(v.gestor_chave) || [];
      l.push(p); filhos.set(v.gestor_chave, l);
    } else aPosicionar.push(p);
  }
  const ord = (a: PessoaOrg, b: PessoaOrg) => (vinc.get(a.chave)?.ordem || 0) - (vinc.get(b.chave)?.ordem || 0) || a.nome.localeCompare(b.nome, 'pt-BR');
  const no = (p: PessoaOrg, caminho: Set<string>): NoOrg => {
    const prox = new Set(caminho).add(p.chave);
    return { pessoa: p, filhos: (filhos.get(p.chave) || []).filter((f) => !prox.has(f.chave)).sort(ord).map((f) => no(f, prox)) };
  };
  // quem está "a posicionar" leva junto a equipe que já foi ligada a ele
  return { raizes: raizes.sort(ord).map((p) => no(p, new Set())), aPosicionar: aPosicionar.sort(ord).map((p) => no(p, new Set())), fora };
}

/** Total de pessoas abaixo (todos os níveis). */
export function contarEquipe(n: NoOrg): number {
  return n.filhos.reduce((s, f) => s + 1 + contarEquipe(f), 0);
}
