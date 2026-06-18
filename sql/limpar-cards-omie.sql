-- LIMPEZA: apaga os cards criados automaticamente pelo sync do Omie
-- (reset por causa do histórico antigo que entrou). Mantém os criados à mão.
-- Apaga também os logs de auditoria desses cards.

DELETE FROM audit_log
 WHERE entidade = 'Chamado_NF'
   AND entidade_id IN (
     SELECT id::text FROM "Chamado_NF" WHERE origem IN ('omie_pecas','omie_os')
   );

DELETE FROM "Chamado_NF" WHERE origem IN ('omie_pecas','omie_os');
