-- =====================================================================
-- LIMPEZA DO AUTH — PARTE 2 (30/07/2026): contas órfãs/duplicadas/teste
-- =====================================================================
-- Baseado no diagnóstico que você rodou (36 contas). Estas NÃO têm cadastro
-- no portal (login nelas dá erro de "sem cadastro") e são duplicatas, typos
-- ou contas de teste. REVISE a lista antes de rodar — remova da lista
-- qualquer e-mail que você queira manter.
--
-- Já resolvidos por fora (NÃO estão na lista):
--   ana.novatratores@gmail.com     -> unificada (conta antiga já apagada)
--   mariano@novatratores.com.br    -> ganhou o cadastro (gmail ficou inativo)
--   lucas.novatratores@gmail.com   -> ganhou cadastro (conceder módulos no Admin)
--   B15BE2... (conta-lixo sem @)   -> coberta pelo passo 3 do limpeza-auth-users.sql
-- =====================================================================

-- A lista (usada por todos os DELETEs abaixo):
--   henri.fhioni@gmail.com           duplicata (Henri usa hf.hioni@gmail.com)
--   henri2@novatratores.com.br       duplicata
--   antonio.novatratoes@gmail.com    TYPO de antonio.novatratores (logou 1x em março)
--   pedroofavaro@gmail.com           sem cadastro, parado desde 01/06
--   leonardo.novatratores@gmail.com  sem cadastro, parado desde 09/06
--   dougrasmogrs9@gmail.com          sem cadastro, parado desde 06/07
--   vendedor@empresa.com             conta de teste
--   vendedor.teste@novatratores.com.br  conta de teste
--   gestoradm@novatratores.com.br    nunca logou
--   gestoradm2@novatratores.com.br   nunca logou

-- 1) Rastros nas tabelas do portal (FKs que bloqueiam o delete)
DELETE FROM public.portal_avisos_lidos WHERE user_id IN (
  SELECT id FROM auth.users WHERE email IN (
    'henri.fhioni@gmail.com','henri2@novatratores.com.br',
    'antonio.novatratoes@gmail.com','pedroofavaro@gmail.com',
    'leonardo.novatratores@gmail.com','dougrasmogrs9@gmail.com',
    'vendedor@empresa.com','vendedor.teste@novatratores.com.br',
    'gestoradm@novatratores.com.br','gestoradm2@novatratores.com.br'
  ));
DELETE FROM public.portal_opas_views WHERE user_id IN (
  SELECT id FROM auth.users WHERE email IN (
    'henri.fhioni@gmail.com','henri2@novatratores.com.br',
    'antonio.novatratoes@gmail.com','pedroofavaro@gmail.com',
    'leonardo.novatratores@gmail.com','dougrasmogrs9@gmail.com',
    'vendedor@empresa.com','vendedor.teste@novatratores.com.br',
    'gestoradm@novatratores.com.br','gestoradm2@novatratores.com.br'
  ));
DELETE FROM public.portal_permissoes WHERE user_id IN (
  SELECT id FROM auth.users WHERE email IN (
    'henri.fhioni@gmail.com','henri2@novatratores.com.br',
    'antonio.novatratoes@gmail.com','pedroofavaro@gmail.com',
    'leonardo.novatratores@gmail.com','dougrasmogrs9@gmail.com',
    'vendedor@empresa.com','vendedor.teste@novatratores.com.br',
    'gestoradm@novatratores.com.br','gestoradm2@novatratores.com.br'
  ));

-- 2) As contas em si (identities/sessions do auth caem em cascata)
DELETE FROM auth.users WHERE email IN (
  'henri.fhioni@gmail.com','henri2@novatratores.com.br',
  'antonio.novatratoes@gmail.com','pedroofavaro@gmail.com',
  'leonardo.novatratores@gmail.com','dougrasmogrs9@gmail.com',
  'vendedor@empresa.com','vendedor.teste@novatratores.com.br',
  'gestoradm@novatratores.com.br','gestoradm2@novatratores.com.br'
);
-- Se algum DELETE acima falhar com "still referenced from table X", me avise
-- com o nome da tabela que eu adiciono a limpeza dela aqui.

-- 3) Confira o resultado: só devem sobrar contas com cadastro (ou o Lucas)
SELECT u.email, u.last_sign_in_at, (f.id IS NOT NULL) AS tem_cadastro
FROM auth.users u LEFT JOIN public.financeiro_usu f ON f.id = u.id
ORDER BY tem_cadastro, u.email;
