-- Inativar usuário (soft-delete): usuário inativo some das listas e não loga,
-- mas os dados dele permanecem. Todos os existentes ficam ativos.
ALTER TABLE financeiro_usu
  ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT true;

NOTIFY pgrst, 'reload schema';
