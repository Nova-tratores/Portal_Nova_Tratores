-- =============================================================================
-- Frota — backfill das permissões (ADITIVO, reversível)
--
-- O Abastecimento virou submódulo do Frota. Quem tem a chave antiga gravada em
-- portal_permissoes.modulos_permitidos ganha a nova AQUI — mas a antiga
-- CONTINUA no array. Assim:
--   - nada quebra se o deploy for revertido;
--   - o lib/permissoes/compat.ts (que traduz em runtime) vira redundante, não
--     obrigatório.
--
-- A LIMPEZA (remover as chaves legadas + o compat.ts) é a Fase 5, e só depois
-- de conferir que ninguém mais depende delas.
--
-- Correr no Supabase: SQL Editor -> colar -> Run. Idempotente.
-- =============================================================================

-- Antes: quem tem o quê?
-- SELECT user_id, modulos_permitidos FROM portal_permissoes
--  WHERE modulos_permitidos && ARRAY['abastecimento','abastecimento:dashboard','abastecimento:upload','consulta-estoque:frota'];

-- 1) `abastecimento` (módulo puro) = acesso total ao submódulo
UPDATE portal_permissoes
   SET modulos_permitidos = (
     SELECT ARRAY(SELECT DISTINCT unnest(
       modulos_permitidos
       || ARRAY['frota:abastecimento','frota:abastecimento:flex','frota:abastecimento:upload']
     ))
   )
 WHERE 'abastecimento' = ANY(modulos_permitidos);

-- 2) `abastecimento:dashboard` = só ver os relatórios
UPDATE portal_permissoes
   SET modulos_permitidos = (
     SELECT ARRAY(SELECT DISTINCT unnest(
       modulos_permitidos || ARRAY['frota:abastecimento','frota:abastecimento:flex']
     ))
   )
 WHERE 'abastecimento:dashboard' = ANY(modulos_permitidos);

-- 3) `abastecimento:upload` = importar CSV / gerir lotes
UPDATE portal_permissoes
   SET modulos_permitidos = (
     SELECT ARRAY(SELECT DISTINCT unnest(
       modulos_permitidos || ARRAY['frota:abastecimento:upload']
     ))
   )
 WHERE 'abastecimento:upload' = ANY(modulos_permitidos);

-- 4) `consulta-estoque:frota` (a tela do pátio) -> vira tela do Frota.
--    (A tela só é absorvida na Fase 2; o grant já pode ir na frente.)
UPDATE portal_permissoes
   SET modulos_permitidos = (
     SELECT ARRAY(SELECT DISTINCT unnest(
       modulos_permitidos || ARRAY['frota:patio']
     ))
   )
 WHERE 'consulta-estoque:frota' = ANY(modulos_permitidos);

-- Conferência: ninguém pode ter perdido acesso.
-- SELECT user_id, modulos_permitidos FROM portal_permissoes
--  WHERE modulos_permitidos && ARRAY['abastecimento','abastecimento:dashboard','abastecimento:upload']
--     OR modulos_permitidos && ARRAY['frota','frota:abastecimento','frota:abastecimento:upload'];
