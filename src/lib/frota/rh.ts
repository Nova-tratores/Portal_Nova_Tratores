// =============================================================================
// Cliente do Supabase do RH (projeto rh-nova-tratores) — SÓ SERVIDOR.
//
// Env: RH_SUPABASE_URL + RH_SUPABASE_SERVICE_KEY (service role do RH — a RLS
// de rh_funcionarios bloqueia anon; precedente inverso: o RH lê o portal via
// PORTAL_SUPABASE_KEY). Sem as envs, tudo degrada gracioso: rhConfigurado()
// devolve false e as listas voltam vazias (a tela avisa, nunca quebra).
//
// ⚠️ SALÁRIO NUNCA TRAFEGA: este é o ÚNICO ponto do portal que toca
// rh_funcionarios, e o select é EXPLÍCITO — salario_bruto, comissao_percentual
// e encargos_percentual ficam estruturalmente fora do payload.
// =============================================================================
// (importar SOMENTE de rotas /api — as envs RH_* não existem no client)
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const BUCKET_DOCS_RH = 'rh-documentos'; // bucket PRIVADO do RH (fotos + anexos)
const TTL_CACHE_MS = 5 * 60_000; // lista de funcionários
const TTL_ASSINATURA_S = 3600; // URLs assinadas (> TTL do cache)

export function rhConfigurado(): boolean {
  return !!(process.env.RH_SUPABASE_URL && process.env.RH_SUPABASE_SERVICE_KEY);
}

let cliente: SupabaseClient | null = null;
function rh(): SupabaseClient | null {
  if (!rhConfigurado()) return null;
  if (!cliente) {
    cliente = createClient(process.env.RH_SUPABASE_URL!, process.env.RH_SUPABASE_SERVICE_KEY!, {
      auth: { persistSession: false },
    });
  }
  return cliente;
}

// SEM salario_bruto / comissao_percentual / encargos_percentual — de propósito.
const COLUNAS_FUNCIONARIO =
  'id, empresa, nome, cpf, rg, data_nascimento, sexo, estado_civil, telefone, email, ' +
  'endereco, bairro, cidade, estado, cep, cargo, departamento, data_admissao, ' +
  'data_demissao, tipo_contrato, status, foto_url, atualizado_em';

export interface FuncionarioRH {
  id: string;
  empresa: string | null; // NOVA | CASTRO
  nome: string;
  cpf: string | null;
  rg: string | null;
  data_nascimento: string | null;
  sexo: string | null;
  estado_civil: string | null;
  telefone: string | null;
  email: string | null;
  endereco: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  cep: string | null;
  cargo: string | null;
  departamento: string | null;
  data_admissao: string | null;
  data_demissao: string | null;
  tipo_contrato: string | null;
  status: string | null; // ativo|inativo|ferias|afastado|demitido
  foto_url: string | null; // já RESOLVIDA (assinada se era path do bucket)
  atualizado_em: string | null;
}

// Foto pode ser URL completa (passa direto) ou path do bucket privado → assina.
async function resolverFotos<T extends { foto_url: string | null }>(db: SupabaseClient, linhas: T[]): Promise<T[]> {
  const paths = linhas
    .map((l) => l.foto_url)
    .filter((f): f is string => !!f && !/^https?:\/\//i.test(f));
  if (paths.length === 0) return linhas;
  try {
    const { data } = await db.storage.from(BUCKET_DOCS_RH).createSignedUrls(paths, TTL_ASSINATURA_S);
    const porPath = new Map((data || []).map((d) => [d.path, d.signedUrl]));
    for (const l of linhas) {
      if (l.foto_url && porPath.has(l.foto_url)) l.foto_url = porPath.get(l.foto_url) || null;
      else if (l.foto_url && !/^https?:\/\//i.test(l.foto_url)) l.foto_url = null; // path que não assinou
    }
  } catch {
    for (const l of linhas) if (l.foto_url && !/^https?:\/\//i.test(l.foto_url)) l.foto_url = null;
  }
  return linhas;
}

let cacheLista: { ts: number; dados: FuncionarioRH[] } | null = null;

/** TODOS os funcionários do RH (a tela filtra) — cache em memória 5 min. */
export async function listarFuncionariosRH(): Promise<FuncionarioRH[]> {
  const db = rh();
  if (!db) return [];
  if (cacheLista && Date.now() - cacheLista.ts < TTL_CACHE_MS) return cacheLista.dados;
  try {
    const { data, error } = await db
      .from('rh_funcionarios')
      .select(COLUNAS_FUNCIONARIO)
      .order('nome');
    if (error) throw error;
    const linhas = await resolverFotos(db, (data || []) as unknown as FuncionarioRH[]);
    cacheLista = { ts: Date.now(), dados: linhas };
    return linhas;
  } catch (e) {
    console.warn('[frota/rh] falha lendo rh_funcionarios:', e instanceof Error ? e.message : e);
    return cacheLista?.dados || []; // degrade: melhor lista velha que tela morta
  }
}

/** Um funcionário (sem cache — usado no PATCH e no detalhe). */
export async function buscarFuncionarioRH(id: string): Promise<FuncionarioRH | null> {
  const db = rh();
  if (!db) return null;
  try {
    const { data, error } = await db
      .from('rh_funcionarios')
      .select(COLUNAS_FUNCIONARIO)
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const [linha] = await resolverFotos(db, [data as unknown as FuncionarioRH]);
    return linha;
  } catch (e) {
    console.warn('[frota/rh] falha lendo funcionário:', e instanceof Error ? e.message : e);
    return null;
  }
}

export interface DocumentoRH {
  id: string;
  tipo: string;
  descricao: string | null;
  data_validade: string | null;
  url: string | null; // assinada (expira em 1h)
}

/** Documentos anexados no RH, com link assinado (TTL 1h). */
export async function listarDocumentosRH(funcionarioId: string): Promise<DocumentoRH[]> {
  const db = rh();
  if (!db) return [];
  try {
    const { data, error } = await db
      .from('rh_documentos')
      .select('id, tipo, descricao, arquivo_url, data_validade')
      .eq('funcionario_id', funcionarioId)
      .order('criado_em', { ascending: false });
    if (error) throw error;
    const docs = (data || []) as { id: string; tipo: string; descricao: string | null; arquivo_url: string; data_validade: string | null }[];
    const paths = docs.map((d) => d.arquivo_url).filter((p) => !!p && !/^https?:\/\//i.test(p));
    const porPath = new Map<string, string>();
    if (paths.length > 0) {
      const { data: assinadas } = await db.storage.from(BUCKET_DOCS_RH).createSignedUrls(paths, TTL_ASSINATURA_S);
      for (const a of assinadas || []) if (a.signedUrl) porPath.set(a.path || '', a.signedUrl);
    }
    return docs.map((d) => ({
      id: d.id,
      tipo: d.tipo,
      descricao: d.descricao,
      data_validade: d.data_validade,
      url: /^https?:\/\//i.test(d.arquivo_url) ? d.arquivo_url : porPath.get(d.arquivo_url) || null,
    }));
  } catch (e) {
    console.warn('[frota/rh] falha lendo documentos:', e instanceof Error ? e.message : e);
    return [];
  }
}
