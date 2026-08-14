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

// Valida o usuario logado e exige a permissao `modulo` (ou is_admin/is_dev). Com
// `acao`, espelha a semantica do cliente pode(modulo, acao): passa quem tem o
// modulo puro OU `modulo:acao` OU is_admin/is_dev.
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
    .select('is_admin, is_dev, modulos_permitidos')
    .eq('user_id', user.id)
    .single();

  const p = perm as any;
  const isAdmin = p?.is_admin === true || p?.is_dev === true;
  const mods: string[] = p?.modulos_permitidos || [];
  const ok = isAdmin
    || mods.includes(modulo)
    || (!!acao && mods.includes(`${modulo}:${acao}`));
  if (!ok) throw httpErr(403, `sem permissao para esta acao${acao ? ` (${acao})` : ''}`);

  // nome legivel do usuario (best-effort; nao bloqueia se faltar)
  let nome: string | undefined;
  try {
    const { data: usu } = await supabaseAdmin.from('financeiro_usu').select('nome').eq('id', user.id).single();
    nome = (usu as any)?.nome || undefined;
  } catch { /* segue sem nome */ }

  return { id: user.id, email: user.email, nome };
}

// Espelho servidor do temAcesso(modulo) do cliente (usePermissoes): passa quem
// tem o modulo puro OU QUALQUER acao granular dele (`modulo:*`) OU is_admin/
// is_dev. Para rotas de LEITURA gateadas na tela por temAcesso — exigirPermissao
// sem acao negaria (403) usuario que so tem permissao granular do modulo.
export async function exigirAcessoModulo(req: Request, modulo: string): Promise<{ id: string; email?: string; nome?: string }> {
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
    .select('is_admin, is_dev, modulos_permitidos')
    .eq('user_id', user.id)
    .single();

  const p = perm as any;
  const isAdmin = p?.is_admin === true || p?.is_dev === true;
  const mods: string[] = p?.modulos_permitidos || [];
  const ok = isAdmin || mods.includes(modulo) || mods.some((m) => m.startsWith(`${modulo}:`));
  if (!ok) throw httpErr(403, 'sem permissao para este modulo');

  let nome: string | undefined;
  try {
    const { data: usu } = await supabaseAdmin.from('financeiro_usu').select('nome').eq('id', user.id).single();
    nome = (usu as any)?.nome || undefined;
  } catch { /* segue sem nome */ }

  return { id: user.id, email: user.email, nome };
}
