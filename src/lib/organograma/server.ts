// Organograma — leitura das fontes (portal, RH, responsabilidades em outros módulos, uso) e
// gravação do chefe em org_pessoas. Servidor (service role); regras em ./arvore.ts.
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { catalogoRotas, catalogoTelas } from '@/lib/permissoes/telas';
import { ACOES_POR_MODULO } from '@/lib/permissoes/catalogo';
import type { AcessoPessoa, TelaMarcada, TelaOpcao } from './acessos';
import { renomearNaLista } from './tarefas';
import { listarFuncionariosRH, rhConfigurado } from '@/lib/frota/rh';
import { juntarPessoas, type PessoaOrg, type UsuarioPortal, type VinculoOrg } from './arvore';
import type { FuncaoOrg, TarefaOrg } from './tarefas';

const faltando = (e: unknown) =>
  /PGRST205|PGRST204|42P01|42703|schema cache|does not exist/i.test(`${(e as { code?: string })?.code || ''} ${(e as Error)?.message || ''}`);

type Resp<T> = PromiseLike<{ data: T[] | null; error: { message: string; code?: string } | null }>;
async function tudo<T>(montar: (de: number, ate: number) => Resp<T>, teto = 30000): Promise<T[]> {
  const out: T[] = [];
  for (let off = 0; off < teto; off += 1000) {
    const { data, error } = await montar(off, off + 999);
    if (error) throw Object.assign(new Error(error.message), { code: error.code });
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

/** Lê uma fonte opcional: tabela/coluna que não existe vira lista vazia. */
async function opcional<T>(q: PromiseLike<{ data: T[] | null; error: { message: string; code?: string } | null }>): Promise<T[]> {
  const { data, error } = await q;
  if (error) { if (!faltando(error)) console.warn('[organograma]', error.message); return []; }
  return data || [];
}

const ROTULO_SISTEMA: Record<string, string> = {
  pos: 'Ordens de serviço', ppv: 'Pedidos de peças', financeiro: 'Financeiro', requisicoes: 'Requisições',
  revisoes: 'Revisões', feedbacks: 'Atendimento/CRM', ajustes: 'Ajustes', frota: 'Frota', estoque: 'Estoque',
  tickets: 'Tickets', garantias: 'Garantias', marketing: 'Marketing', propostas: 'Propostas', agenda: 'Agenda',
  planta: 'Planta Viva', ideias: 'Ideias', 'vendas-modelo': 'Vendas por modelo', alocacao: 'Alocação de peças',
  localizacao: 'Localização de peças', caracteristicas: 'Cadastro de peças', sat: 'SAT', opa: 'Opa',
  avisos: 'Avisos', 'consulta-omie': 'Consulta Omie', 'estoque-recebimentos': 'Recebimentos', 'app-requisicoes': 'Requisições (app)',
  dre: 'DRE', 'painel-omie': 'Painel Omie', pops: 'POPs', reunioes: 'Reuniões', clientes: 'Pasta de clientes',
};

/** Responsabilidades gravadas em outros módulos, por chave 'u:<uid>'. */
async function papeisPorUsuario(): Promise<Map<string, string[]>> {
  const m = new Map<string, string[]>();
  const add = (uid: string | null | undefined, txt: string) => {
    if (!uid) return;
    const k = `u:${uid}`;
    const l = m.get(k) || [];
    if (!l.includes(txt)) l.push(txt);
    m.set(k, l);
  };
  const [perm, pops, kb, sc, receb, reun] = await Promise.all([
    opcional<{ user_id: string; is_admin: boolean | null; is_diretor?: boolean | null }>(supabaseAdmin.from('portal_permissoes').select('user_id,is_admin,is_diretor'))
      .then(async (r) => (r.length ? r : opcional<{ user_id: string; is_admin: boolean | null }>(supabaseAdmin.from('portal_permissoes').select('user_id,is_admin')))),
    opcional<{ user_id: string; papel: string; pops_areas: { nome: string } | null }>(supabaseAdmin.from('pops_area_papeis').select('user_id,papel,pops_areas(nome)')),
    opcional<{ user_id: string; modulo: string }>(supabaseAdmin.from('kb_responsaveis').select('user_id,modulo')),
    opcional<{ diretoria_id: string | null; financeiro_id: string | null; comprador_id: string | null }>(supabaseAdmin.from('tickets_compras_config').select('diretoria_id,financeiro_id,comprador_id')),
    opcional<{ conta_omie: string; responsavel_user_id: string }>(supabaseAdmin.from('recebimento_classificacao_responsavel').select('conta_omie,responsavel_user_id')),
    opcional<{ nome: string; condutor_id: string; ativa?: boolean }>(supabaseAdmin.from('reunioes_series').select('nome,condutor_id')),
  ]);
  for (const p of perm) {
    if ((p as { is_diretor?: boolean | null }).is_diretor) add(p.user_id, 'Diretoria');
    if (p.is_admin) add(p.user_id, 'Administrador do portal');
  }
  for (const p of pops) add(p.user_id, `${p.papel === 'dono' ? 'Dono' : 'Aprovador'} dos POPs: ${p.pops_areas?.nome || 'área'}`);
  const kbPor = new Map<string, string[]>();
  for (const k of kb) kbPor.set(k.user_id, [...(kbPor.get(k.user_id) || []), k.modulo]);
  for (const [uid, mods] of kbPor) add(uid, `Aprova a base de conhecimento (${mods.length} módulo${mods.length > 1 ? 's' : ''})`);
  for (const c of sc) {
    add(c.diretoria_id, 'Compras: aprova (diretoria)');
    add(c.financeiro_id, 'Compras: aprova (financeiro)');
    add(c.comprador_id, 'Compras: comprador');
  }
  for (const r of receb) add(r.responsavel_user_id, `Alocação de peças recebidas (${String(r.conta_omie).toUpperCase()})`);
  for (const r of reun) add(r.condutor_id, `Conduz a reunião "${r.nome}"`);
  return m;
}

/** Sistemas com mais ações no audit_log nos últimos 90 dias, por chave 'u:<uid>'. */
async function praticaPorUsuario(): Promise<Map<string, Array<[string, number]>>> {
  const desde = new Date(Date.now() - 90 * 86400000).toISOString();
  const linhas = await tudo<{ user_id: string | null; sistema: string | null }>((a, b) =>
    supabaseAdmin.from('audit_log').select('user_id,sistema').gte('created_at', desde).order('id').range(a, b) as unknown as Resp<{ user_id: string | null; sistema: string | null }>,
  ).catch(() => []);
  const cont = new Map<string, Map<string, number>>();
  for (const l of linhas) {
    if (!l.user_id || !l.sistema) continue;
    const k = `u:${l.user_id}`;
    const m = cont.get(k) || new Map<string, number>();
    const s = ROTULO_SISTEMA[l.sistema] || l.sistema;
    m.set(s, (m.get(s) || 0) + 1);
    cont.set(k, m);
  }
  const out = new Map<string, Array<[string, number]>>();
  for (const [k, m] of cont) out.set(k, [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3));
  return out;
}

export interface DadosOrganograma {
  pessoas: PessoaOrg[];
  vinculos: VinculoOrg[];
  migracaoFaltando: boolean;
  rhConfigurado: boolean;
  tarefas: TarefaOrg[];
  funcoes: FuncaoOrg[];
  /** sql/organograma-tarefas.sql ainda não aplicada */
  tarefasFaltando: boolean;
  /** sql/organograma-tarefa-telas.sql ainda não aplicada */
  telasFaltando: boolean;
}

const CAMPOS_TAREFA = 'id,origem,ordem,numero,assunto,acao,onde,quando,frequencia,quem,justificativa,destinatario,areas';

async function lerTarefas(): Promise<{ tarefas: TarefaOrg[]; funcoes: FuncaoOrg[]; tarefasFaltando: boolean; telasFaltando: boolean }> {
  const consulta = (campos: string) => supabaseAdmin.from('org_tarefas').select(campos).eq('ativo', true).order('origem').order('ordem').range(0, 999);
  const [t0, f] = await Promise.all([consulta(`${CAMPOS_TAREFA},telas`), supabaseAdmin.from('org_funcoes').select('funcao,pessoas')]);
  // Sem a coluna `telas` as tarefas continuam aparecendo; só a marcação fica desligada.
  const telasFaltando = !!t0.error && /telas/.test(t0.error.message) && faltando(t0.error);
  const t = telasFaltando ? await consulta(CAMPOS_TAREFA) : t0;
  const erro = t.error || f.error;
  if (erro) { if (faltando(erro)) return { tarefas: [], funcoes: [], tarefasFaltando: true, telasFaltando: false }; throw new Error(erro.message); }
  return { tarefas: (t.data || []) as unknown as TarefaOrg[], funcoes: (f.data || []) as FuncaoOrg[], tarefasFaltando: false, telasFaltando };
}

/** Telas com página própria, POS e PPV primeiro. */
export function telasParaMarcar(): TelaOpcao[] {
  const nomes = new Map(catalogoTelas().map((t) => [t.id, t.nome]));
  const ids = new Set(catalogoRotas().flatMap((r) => (r.acesso === 'tela' && r.tela_id ? [r.tela_id] : [])));
  const primeiro = (id: string) => (id === 'pos' ? 0 : id === 'ppv' ? 1 : 2);
  return [...ids].filter((id) => nomes.has(id)).map((id) => ({
    id, nome: nomes.get(id)!,
    separaEditar: !id.includes(':') && (ACOES_POR_MODULO[id] || []).some((a) => a.id === 'editar'),
  })).sort((a, b) => primeiro(a.id) - primeiro(b.id) || a.nome.localeCompare(b.nome, 'pt-BR'));
}

/** Permissões de quem tem login, por chave do organograma. Só para admin (a rota confere). */
export async function lerAcessos(): Promise<Record<string, AcessoPessoa>> {
  const { data, error } = await supabaseAdmin.from('portal_permissoes').select('user_id,is_admin,is_dev,modulos_permitidos');
  if (error) throw new Error(error.message);
  return Object.fromEntries((data || []).map((p) => [`u:${p.user_id}`, {
    perms: (p.modulos_permitidos || []) as string[], isAdmin: !!p.is_admin || !!p.is_dev, isDev: !!p.is_dev,
  }]));
}

export async function gravarTelasDaTarefa(id: number, telas: TelaMarcada[]): Promise<void> {
  const { error } = await supabaseAdmin.from('org_tarefas').update({ telas }).eq('id', id);
  if (error) throw Object.assign(new Error(error.message), { code: error.code, faltando: faltando(error) });
}

/** A função já existe (nas tarefas ou salva)? */
export async function funcaoExiste(funcao: string): Promise<boolean> {
  const [t, f] = await Promise.all([
    supabaseAdmin.from('org_tarefas').select('id').contains('quem', [funcao]).limit(1),
    supabaseAdmin.from('org_funcoes').select('funcao').eq('funcao', funcao).limit(1),
  ]);
  if (t.error || f.error) throw new Error((t.error || f.error)!.message);
  return !!(t.data?.length || f.data?.length);
}

/**
 * Renomeia a função em todas as tarefas. A ordem (grava o novo nome → troca nas tarefas → apaga o
 * velho) permite repetir: se cair no meio, renomear de novo com "juntar" termina o serviço.
 * `pessoas` = quem ocupa agora (inclui a ligação automática, que o nome novo perderia).
 */
export async function renomearFuncao(de: string, para: string, pessoas: string[], userId: string): Promise<void> {
  const falha = (e: { message: string; code?: string }) => Object.assign(new Error(e.message), { code: e.code, faltando: faltando(e) });
  const { data: destino, error: e1 } = await supabaseAdmin.from('org_funcoes').select('pessoas').eq('funcao', para).maybeSingle();
  if (e1) throw falha(e1);
  await gravarFuncao(para, [...new Set([...((destino?.pessoas || []) as string[]), ...pessoas])], userId);
  const { data: tarefas, error: e2 } = await supabaseAdmin.from('org_tarefas').select('id,quem').contains('quem', [de]);
  if (e2) throw falha(e2);
  for (const t of tarefas || []) {
    const { error } = await supabaseAdmin.from('org_tarefas').update({ quem: renomearNaLista(t.quem as string[], de, para) }).eq('id', t.id);
    if (error) throw falha(error);
  }
  const { error: e3 } = await supabaseAdmin.from('org_funcoes').delete().eq('funcao', de);
  if (e3) throw falha(e3);
}

export async function gravarFuncao(funcao: string, pessoas: string[], userId: string): Promise<void> {
  const { error } = await supabaseAdmin.from('org_funcoes').upsert(
    { funcao, pessoas, atualizado_em: new Date().toISOString(), atualizado_por: userId }, { onConflict: 'funcao' });
  if (error) throw Object.assign(new Error(error.message), { code: error.code, faltando: faltando(error) });
}

export async function lerOrganograma(): Promise<DadosOrganograma> {
  const [usuarios, rh, papeis, pratica, trf] = await Promise.all([
    opcional<UsuarioPortal>(supabaseAdmin.from('financeiro_usu').select('id,nome,email,funcao,avatar_url,ativo')),
    listarFuncionariosRH(),
    papeisPorUsuario(),
    praticaPorUsuario(),
    lerTarefas(),
  ]);
  let migracaoFaltando = false;
  const { data: vinc, error } = await supabaseAdmin.from('org_pessoas').select('pessoa_chave,gestor_chave,topo,fora,cargo,ordem');
  if (error) { if (faltando(error)) migracaoFaltando = true; else throw new Error(error.message); }
  const pessoas = juntarPessoas(usuarios, rh).map((p) => ({ ...p, papeis: papeis.get(p.chave) || [], pratica: pratica.get(p.chave) || [] }));
  return { pessoas, vinculos: (vinc || []) as VinculoOrg[], migracaoFaltando, rhConfigurado: rhConfigurado(), ...trf };
}

export async function lerVinculos(): Promise<VinculoOrg[]> {
  const { data, error } = await supabaseAdmin.from('org_pessoas').select('pessoa_chave,gestor_chave,topo,fora,cargo,ordem');
  if (error) throw Object.assign(new Error(error.message), { code: error.code, faltando: faltando(error) });
  return (data || []) as VinculoOrg[];
}

export async function gravarVinculo(v: Omit<VinculoOrg, 'ordem'> & { ordem?: number }, userId: string): Promise<void> {
  const { error } = await supabaseAdmin.from('org_pessoas').upsert({
    pessoa_chave: v.pessoa_chave, gestor_chave: v.gestor_chave, topo: v.topo, fora: v.fora, cargo: v.cargo,
    ...(v.ordem != null ? { ordem: v.ordem } : {}), atualizado_em: new Date().toISOString(), atualizado_por: userId,
  }, { onConflict: 'pessoa_chave' });
  if (error) throw Object.assign(new Error(error.message), { code: error.code, faltando: faltando(error) });
}
