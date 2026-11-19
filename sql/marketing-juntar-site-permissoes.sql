-- =============================================================================
-- Controle Marketing — o módulo Site entrou no Marketing (18/11/2026)
-- Backfill das permissões (ADITIVO, reversível) — mesmo molde do frota-migrar-permissoes.sql
--
-- O que muda:
--   - o módulo `site` deixou de existir no código; as telas dele agora são
--     `marketing:pedidos`, `marketing:catalogo`, `marketing:promocoes`,
--     `marketing:acessos`, `marketing:conteudo`, `marketing:campanhas`;
--   - as ações de escrita trocam o prefixo: `site:X:Y` -> `marketing:X:Y`;
--   - decisão do José: "todo mundo vê tudo" — quem tinha QUALQUER acesso ao
--     Site ou ao Marketing passa a VER todas as telas do Controle Marketing.
--     Ver não é editar: as ações de escrita continuam só com quem já tinha.
--
-- As chaves antigas `site...` CONTINUAM no array (nada quebra se o deploy for
-- revertido). A limpeza delas é um passo depois, com calma.
--
-- ORDEM: rodar ESTE arquivo ANTES do deploy (quem só tinha `site` ficaria sem
-- acesso no intervalo). Depois do deploy: npx tsx scripts/permissoes-v2-sync.ts --gravar
--
-- Correr no Supabase: SQL Editor -> colar -> Run. Idempotente.
-- =============================================================================

-- Antes: quem tem o quê?
-- SELECT user_id, modulos_permitidos FROM portal_permissoes
--  WHERE EXISTS (SELECT 1 FROM unnest(modulos_permitidos) m
--                 WHERE m = 'site' OR m LIKE 'site:%' OR m = 'marketing' OR m LIKE 'marketing:%');

-- 1) `site:X:Y` -> `marketing:X:Y` (as ações de escrita e as telas do antigo Site)
UPDATE portal_permissoes
   SET modulos_permitidos = (
     SELECT ARRAY(SELECT DISTINCT unnest(
       modulos_permitidos
       || ARRAY(SELECT 'marketing:' || substr(m, 6) FROM unnest(modulos_permitidos) m WHERE m LIKE 'site:%')
     ))
   )
 WHERE EXISTS (SELECT 1 FROM unnest(modulos_permitidos) m WHERE m LIKE 'site:%');

-- 2) `site` (módulo puro = podia tudo no Site) -> todas as ações de escrita das Redes sociais.
--    NÃO ganha `marketing` puro: isso daria também as escritas de Eventos.
UPDATE portal_permissoes
   SET modulos_permitidos = (
     SELECT ARRAY(SELECT DISTINCT unnest(
       modulos_permitidos
       || ARRAY['marketing:pedidos:editar','marketing:catalogo:editar','marketing:promocoes:editar',
                'marketing:conteudo:editar','marketing:conteudo:publicar','marketing:campanhas:editar']
     ))
   )
 WHERE 'site' = ANY(modulos_permitidos);

-- 3) "Todo mundo vê tudo": qualquer acesso ao Site ou ao Marketing -> ver as 11 telas.
--    (Quem tem `marketing` puro já vê tudo; ganhar as chaves não muda nada pra ele.)
UPDATE portal_permissoes
   SET modulos_permitidos = (
     SELECT ARRAY(SELECT DISTINCT unnest(
       modulos_permitidos
       || ARRAY['marketing:pedidos','marketing:catalogo','marketing:promocoes','marketing:acessos',
                'marketing:conteudo','marketing:campanhas',
                'marketing:dashboard','marketing:apoios','marketing:custos','marketing:leads','marketing:resultados']
     ))
   )
 WHERE EXISTS (SELECT 1 FROM unnest(modulos_permitidos) m
                WHERE m = 'site' OR m LIKE 'site:%' OR m = 'marketing' OR m LIKE 'marketing:%');

-- Conferência: todo mundo que tinha `site...` agora tem `marketing:...`.
-- (Esta consulta tem que voltar VAZIA.)
-- SELECT user_id, modulos_permitidos FROM portal_permissoes
--  WHERE EXISTS (SELECT 1 FROM unnest(modulos_permitidos) m WHERE m = 'site' OR m LIKE 'site:%')
--    AND NOT ('marketing:pedidos' = ANY(modulos_permitidos));
