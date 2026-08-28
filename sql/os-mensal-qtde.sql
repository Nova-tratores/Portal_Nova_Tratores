-- Contagem de OS por mês no os_mensal (para o toggle "Qtd de OS" no histórico do
-- card Serviços do /estoque/dashboard). Espelha o split de valor:
--   qtde_os        = OS faturadas (etapa 60, não canceladas) no mês
--   qtde_os_nota   = dessas, quantas têm NFS-e emitida (mesma régua de valor_nota)
--   qtde_os_interno= as demais (sem nota) = qtde_os − qtde_os_nota
--
-- Colunas nullable: linhas antigas ficam NULL até o backfill recalcular
-- (scripts/os-mensal-backfill.ts) — mesmo padrão de valor_nota/valor_interno.
-- Aplicar no SQL Editor do Supabase ANTES de rodar o backfill / deploy do código.
alter table os_mensal add column if not exists qtde_os int;
alter table os_mensal add column if not exists qtde_os_nota int;
alter table os_mensal add column if not exists qtde_os_interno int;
