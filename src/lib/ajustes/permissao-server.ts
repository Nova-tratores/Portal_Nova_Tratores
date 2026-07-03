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

// Valida o usuario logado e exige a permissao `modulo` (ou is_admin).
// Lanca httpErr(401) se sem/invalido token, httpErr(403) se sem permissao.
// Retorna o usuario autenticado em caso de sucesso.
// `acao` (opcional) identifica a acao granular pretendida; hoje a checagem
// continua a nivel de modulo (+ is_admin). TODO(Vinicius): enforcar granular.
export async function exigirPermissao(
  req: Request,
  modulo: string,
  acao?: string,
): Promise<{ id: string; email?: string; nome?: string }> {
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

  const ok = (perm as any)?.is_admin === true || ((perm as any)?.modulos_permitidos || []).includes(modulo);
  if (!ok) throw httpErr(403, `sem permissao para esta acao${acao ? ` (${acao})` : ''}`);

  return { id: user.id, email: user.email };
}
