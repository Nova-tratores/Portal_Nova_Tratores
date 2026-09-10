-- =====================================================================
-- R8 "Cadastro incompleto" + áreas por função (fila "Minha área")
-- =====================================================================
--  * feedback_oportunidades / feedback_config_regras / feedback_script: o
--    CHECK de `regra` ganha 'R8_cadastro' (e 'areas' na config).
--  * Config R8_cadastro: e-mails internos da loja tratados como "vazio",
--    domínios internos, janela de atividade (meses) e o que é "recente".
--  * Config areas: função do usuário (financeiro_usu.funcao, match por
--    "contém", sem acento/caixa) → regras que aparecem em "Minha área".
--  * Seed de roteiro para a R8.
-- Rodar no SQL Editor do projeto do Portal (citrhumdkfivdzbmayde). Idempotente.
-- Rollback: sql/rollback-feedbacks-add-r8-cadastro.sql
-- =====================================================================

ALTER TABLE feedback_oportunidades DROP CONSTRAINT IF EXISTS feedback_oportunidades_regra_check;
ALTER TABLE feedback_oportunidades
  ADD CONSTRAINT feedback_oportunidades_regra_check
  CHECK (regra IN ('R1_revisao','R2_sem_os','R3_upsell','R4_followup','R5_pecas','R6_fora_garantia','R7_garantia_risco','R8_cadastro'));

ALTER TABLE feedback_config_regras DROP CONSTRAINT IF EXISTS feedback_config_regras_regra_check;
ALTER TABLE feedback_config_regras
  ADD CONSTRAINT feedback_config_regras_regra_check
  CHECK (regra IN ('R1_revisao','R2_sem_os','R3_upsell','R4_followup','R5_pecas','R6_fora_garantia','R7_garantia_risco','R8_cadastro','retorno','areas'));

ALTER TABLE feedback_script DROP CONSTRAINT IF EXISTS feedback_script_regra_check;
ALTER TABLE feedback_script
  ADD CONSTRAINT feedback_script_regra_check
  CHECK (regra IN ('geral','R1_revisao','R2_sem_os','R3_upsell','R4_followup','R5_pecas','R6_fora_garantia','R7_garantia_risco','R8_cadastro'));

INSERT INTO feedback_config_regras (regra, parametros) VALUES
  ('R8_cadastro', '{
     "emails_internos": ["rodrigo.novatratores@gmail.com", "posvendas.novatratores@gmail.com", "zezo.piraju@gmail.com"],
     "dominios_internos": ["novatratores"],
     "somente_com_atividade": true,
     "atividade_meses": 24,
     "recente_meses": 6
   }'::jsonb),
  ('areas', '{
     "Peças":      ["R5_pecas", "R8_cadastro"],
     "Pós-Vendas": ["R1_revisao", "R2_sem_os", "R4_followup", "R6_fora_garantia", "R7_garantia_risco", "R8_cadastro"],
     "Serviço":    ["R1_revisao", "R2_sem_os", "R4_followup", "R6_fora_garantia", "R7_garantia_risco"],
     "Comercial":  ["R3_upsell", "R5_pecas"],
     "Vendas":     ["R3_upsell", "R5_pecas"]
   }'::jsonb)
ON CONFLICT (regra) DO NOTHING;

INSERT INTO feedback_script (regra, etapa, titulo, template, ordem)
SELECT 'R8_cadastro', 'argumentacao', 'Atualizar cadastro',
       'Estamos atualizando o cadastro dos clientes pra avisar de revisão e promoção sem errar. Esse telefone que estou ligando é o melhor pra falar com {primeiro_nome}? E qual e-mail posso deixar no cadastro?', 0
WHERE NOT EXISTS (SELECT 1 FROM feedback_script WHERE regra = 'R8_cadastro');

NOTIFY pgrst, 'reload schema';
