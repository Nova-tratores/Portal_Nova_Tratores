// Destino dos avisos (para quem vai). Pura: usada pela tela /avisos, pelo pop-up
// do portal e pela publicação (lib/avisos/publicar.ts).
//
// portal_avisos.destino guarda:
//   'todos' | <categoria> | 'tecnicos'              → o setor inteiro (como sempre foi)
//   'gestores' | 'gestores:<categoria>' | 'gestores:tecnicos' → SÓ o gestor do(s) setor(es)
// Sem coluna nova: o prefixo 'gestores' cabe no texto que já existe.
//
// Gestor de um departamento = quem está nele (categoria do Admin) e é gestor de
// alguém no Organograma (org_pessoas.gestor_chave). Se ninguém do setor gere
// ninguém, vale o chefe (no Organograma) das pessoas do setor.

export const SETORES: { key: string; label: string }[] = [
  { key: 'todos', label: 'Todos' },
  { key: 'Peças', label: 'Peças' },
  { key: 'Pós Vendas', label: 'Pós-Vendas' },
  { key: 'Comercial', label: 'Comercial' },
  { key: 'Financeiro', label: 'Financeiro' },
  { key: 'T.I.', label: 'T.I.' },
  { key: 'tecnicos', label: 'Técnicos' },
];

export interface Destino { setor: string; soGestor: boolean }

export function lerDestino(d: string | null | undefined): Destino {
  const v = String(d || 'todos').trim() || 'todos';
  if (v === 'gestores') return { setor: 'todos', soGestor: true };
  if (v.startsWith('gestores:')) return { setor: v.slice(9) || 'todos', soGestor: true };
  return { setor: v, soGestor: false };
}

export function montarDestino(setor: string, soGestor: boolean): string {
  const s = setor || 'todos';
  if (!soGestor) return s;
  return s === 'todos' ? 'gestores' : `gestores:${s}`;
}

export function rotuloSetor(setor: string): string {
  return SETORES.find((s) => s.key === setor)?.label || setor || 'Todos';
}

export function rotuloDestino(d: string | null | undefined): string {
  const { setor, soGestor } = lerDestino(d);
  if (!soGestor) return rotuloSetor(setor);
  return setor === 'todos' ? 'Gestores de cada departamento' : `Gestor de ${rotuloSetor(setor)}`;
}

/** O aviso também sai no app dos mecânicos? Só para todos ou para os técnicos. */
export function vaiParaMecanicos(d: string | null | undefined): boolean {
  const { setor, soGestor } = lerDestino(d);
  return !soGestor && (setor === 'todos' || setor === 'tecnicos');
}

export interface PermUsuario { user_id: string; categoria: string | null; mecanico_role?: string | null }
export interface LinhaOrg { pessoa_chave: string; gestor_chave: string | null; fora?: boolean | null }

const uid = (chave: string | null | undefined) => (chave && chave.startsWith('u:') ? chave.slice(2) : null);

function noSetor(p: PermUsuario, setor: string): boolean {
  if (setor === 'tecnicos') return p.mecanico_role === 'tecnico';
  return p.categoria === setor;
}

/** user_ids dos gestores de UM setor (categoria ou 'tecnicos'). */
export function gestoresDoSetor(setor: string, perms: PermUsuario[], org: LinhaOrg[]): string[] {
  const ativos = org.filter((o) => !o.fora);
  const quemGere = new Set(ativos.map((o) => uid(o.gestor_chave)).filter(Boolean) as string[]);
  const doSetor = perms.filter((p) => noSetor(p, setor));
  // 1) quem é do setor e gere alguém
  const diretos = doSetor.filter((p) => quemGere.has(p.user_id)).map((p) => p.user_id);
  if (diretos.length) return [...new Set(diretos)];
  // 2) senão, o chefe das pessoas do setor
  const ids = new Set(doSetor.map((p) => p.user_id));
  const chefes = ativos
    .filter((o) => { const u = uid(o.pessoa_chave); return u && ids.has(u); })
    .map((o) => uid(o.gestor_chave))
    .filter(Boolean) as string[];
  return [...new Set(chefes)];
}

/** Os departamentos (categorias) e quem gere cada um. Sem 'todos' e sem 'tecnicos'. */
export function gestoresPorDepartamento(perms: PermUsuario[], org: LinhaOrg[]): { setor: string; ids: string[] }[] {
  return SETORES
    .filter((s) => s.key !== 'todos' && s.key !== 'tecnicos')
    .map((s) => ({ setor: s.key, ids: gestoresDoSetor(s.key, perms, org) }));
}

/** user_ids que recebem um aviso com esse destino (sem tirar o criador). */
export function destinatarios(d: string | null | undefined, perms: PermUsuario[], org: LinhaOrg[]): string[] {
  const { setor, soGestor } = lerDestino(d);
  if (soGestor) {
    if (setor === 'todos') return [...new Set(gestoresPorDepartamento(perms, org).flatMap((g) => g.ids))];
    return gestoresDoSetor(setor, perms, org);
  }
  if (setor === 'todos') return [...new Set(perms.map((p) => p.user_id))];
  return [...new Set(perms.filter((p) => noSetor(p, setor)).map((p) => p.user_id))];
}

/** Setores (inclui 'tecnicos') de que essa pessoa é gestora. */
export function setoresQueGere(userId: string, perms: PermUsuario[], org: LinhaOrg[]): string[] {
  return SETORES
    .filter((s) => s.key !== 'todos')
    .filter((s) => gestoresDoSetor(s.key, perms, org).includes(userId))
    .map((s) => s.key);
}

export interface QuemVe {
  userId: string | null;
  isAdmin: boolean;
  categoria: string | null;
  mecanicoRole: string | null;
  /** Setores de que a pessoa é gestora (GET /api/avisos/gestores). */
  setoresQueGere: string[];
}

/** A pessoa deve ver o aviso? Admin e o criador sempre veem. */
export function podeVerAviso(a: { destino: string | null; criado_por?: string | null }, q: QuemVe): boolean {
  if (q.isAdmin) return true;
  if (q.userId && a.criado_por === q.userId) return true;
  const { setor, soGestor } = lerDestino(a.destino);
  if (soGestor) {
    if (setor === 'todos') return q.setoresQueGere.some((s) => s !== 'tecnicos');
    return q.setoresQueGere.includes(setor);
  }
  if (setor === 'todos') return true;
  if (setor === 'tecnicos') return q.mecanicoRole === 'tecnico';
  return q.categoria === setor;
}
