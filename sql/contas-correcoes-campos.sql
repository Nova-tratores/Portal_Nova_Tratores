-- =====================================================================
-- Correção de contas — auditoria dos campos extras (16/10/2026)
-- A tela /ajustes/correcao-contas passou a alterar também vencimento,
-- previsão de pagamento, projeto, conta corrente, nº do documento e
-- observação do título na Omie. A auditoria (contas_correcoes) ganha o
-- "de → para" desses campos. Sem esta migration o portal grava a auditoria
-- sem as duas colunas (retry automático) — nada quebra.
-- Rode no SQL Editor do Supabase. Idempotente.
-- =====================================================================
alter table contas_correcoes
  add column if not exists campos_anterior jsonb,  -- {dataVencimento, dataPrevisao, codigoProjeto, idContaCorrente, numeroDocumento, observacao} antes
  add column if not exists campos_novo     jsonb;  -- os mesmos campos depois (só o que mudou)

comment on column contas_correcoes.campos_anterior is 'Campos além de categoria/departamento antes da correção (só os que mudaram).';
comment on column contas_correcoes.campos_novo is 'Campos além de categoria/departamento depois da correção (só os que mudaram).';

notify pgrst, 'reload schema';
