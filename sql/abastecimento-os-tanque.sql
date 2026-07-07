-- ============================================================
--  Abastecimento v2: guarda a Ordem de Serviço digitada pelo
--  motorista e a capacidade do tanque (auditoria de fraude:
--  litros > capacidade é red flag).
--  Correr no Supabase: SQL Editor -> colar -> Run (idempotente).
--
--  ATENÇÃO: linhas já importadas ficam com as colunas novas em
--  branco (o upload usa ON CONFLICT DO NOTHING). Para preencher,
--  exclua o(s) lote(s) na tela e reenvie os CSVs.
-- ============================================================

alter table abastecimentos
  add column if not exists ordem_servico text,           -- "Ordem Serviço - Dig.Motorista" ('0'/vazio = null)
  add column if not exists capacidade_tanque numeric(8,1); -- litros

create index if not exists idx_abastecimentos_os on abastecimentos (ordem_servico)
  where ordem_servico is not null;
