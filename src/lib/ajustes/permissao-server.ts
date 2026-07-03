// Enforcement de permissao no SERVIDOR para acoes sensiveis das API routes de
// Ajustes. O Portal valida permissao so no cliente (hook usePermissoes); rotas
// destrutivas (ex.: encerrar pedido informalmente) precisam validar tambem aqui,
// senao sao chamaveis direto via curl/fetch.
//
// Estrategia: o cliente envia o access_token do Supabase no header Authorization.
// Validamos o JWT (getUser) com um client anon e lemos portal_permissoes com o
// client service-role (lib/ajustes/supabase).
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from '@supabase/supabase-js';
import { supabase as supabaseAdmin } from './supabase';
import { httpErr } from './cmc';

// Valida o usuario logado e exige a permissao `modulo` (ou is_admin). Com `acao`,
// espelha a semantica do cliente `pode(modulo, acao)`: passa quem tem o modulo puro
// OU `modulo:acao` OU is_admin.
// Lanca httpErr(401) se sem/invalido token, httpErr(403) se sem permissao.
// Retorna o usuario autenticado (com nome de financeiro_usu) em caso de sucesso.
export async function exigirPermissao(req: Request, modulo: string, acao?: string): Promise<{ id: string; email?: string; nome?: string }> {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) throw httpErr(401, 'nao autenticado');

  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const { data: { user }, error } = await anon.auth.getUser(token);
  if (error || !user) throw httpErr(401, 'sessao invalida');

  const { data: perm } = await supabaseAdmin
    .from('portal_permissoes')
    .select('is_admin, modulos_permitidos')
    .eq('user_id', user.id)
    .single();

  const perms: string[] = (perm as any)?.modulos_permitidos || [];
  const ok = (perm as any)?.is_admin === true
    || perms.includes(modulo)
    || (!!acao && perms.includes(`${modulo}:${acao}`));
  if (!ok) throw httpErr(403, 'sem permissao para esta acao');

  // nome legivel do usuario (best-effort; nao bloqueia se faltar)
  let nome: string | undefined;
  try {
    const { data: usu } = await supabaseAdmin.from('financeiro_usu').select('nome').eq('id', user.id).single();
    nome = (usu as any)?.nome || undefined;
  } catch { /* segue sem nome */ }

  return { id: user.id, email: user.email, nome };
}
