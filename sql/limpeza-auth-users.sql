-- =====================================================================
-- LIMPEZA DO AUTH (30/07/2026) — "Database error finding users"
-- =====================================================================
-- Sintoma: a listagem de usuários do GoTrue (auth admin) dá erro 500 a
-- partir da 4ª conta — há linhas em auth.users com campos NULL (ou contas
-- lixo com "e-mail" que é string aleatória, criadas por fora) que o GoTrue
-- não consegue ler. Isso também quebrou o diagnóstico de acessos.
-- Rodar no SQL Editor do Supabase do PORTAL, na ordem.
-- =====================================================================

-- 1) DIAGNÓSTICO — veja o que existe antes de apagar qualquer coisa
SELECT u.id, u.email, u.created_at, u.last_sign_in_at,
       (f.id IS NOT NULL) AS tem_cadastro_portal
FROM auth.users u
LEFT JOIN public.financeiro_usu f ON f.id = u.id
ORDER BY u.created_at;

-- 2) CONSERTO DO ERRO DE LISTAGEM — campos NULL que o GoTrue exige string
-- (clássico de contas criadas por SQL/fora do fluxo; idempotente e inofensivo)
UPDATE auth.users SET
  confirmation_token         = COALESCE(confirmation_token, ''),
  recovery_token             = COALESCE(recovery_token, ''),
  email_change               = COALESCE(email_change, ''),
  email_change_token_new     = COALESCE(email_change_token_new, ''),
  email_change_token_current = COALESCE(email_change_token_current, ''),
  phone_change               = COALESCE(phone_change, ''),
  phone_change_token         = COALESCE(phone_change_token, ''),
  reauthentication_token     = COALESCE(reauthentication_token, '')
WHERE confirmation_token IS NULL OR recovery_token IS NULL
   OR email_change IS NULL OR email_change_token_new IS NULL
   OR email_change_token_current IS NULL OR phone_change IS NULL
   OR phone_change_token IS NULL OR reauthentication_token IS NULL;

-- 3) CONTAS-LIXO ("e-mail" sem @) — CONFIRA a lista do passo 1 antes!
-- Remove rastros nas tabelas do portal e depois a conta.
DELETE FROM public.portal_avisos_lidos
 WHERE user_id IN (SELECT id FROM auth.users WHERE email NOT LIKE '%@%');
DELETE FROM auth.identities
 WHERE user_id IN (SELECT id FROM auth.users WHERE email NOT LIKE '%@%');
DELETE FROM auth.sessions
 WHERE user_id IN (SELECT id FROM auth.users WHERE email NOT LIKE '%@%');
DELETE FROM auth.users WHERE email NOT LIKE '%@%';

-- 4) DEPOIS: em Authentication → Providers/Settings do Supabase, DESLIGUE o
-- signup público (allow new users to sign up) — os usuários do portal são
-- criados pelo painel de Administração; signup aberto + anon key pública é
-- como a conta-lixo nasceu.
