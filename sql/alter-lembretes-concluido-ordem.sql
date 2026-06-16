-- Lembretes do cliente: registrar em qual OS o lembrete foi concluído.
ALTER TABLE lembretes_clientes ADD COLUMN IF NOT EXISTS concluido BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE lembretes_clientes ADD COLUMN IF NOT EXISTS concluido_em TIMESTAMPTZ;
ALTER TABLE lembretes_clientes ADD COLUMN IF NOT EXISTS concluido_por TEXT;
ALTER TABLE lembretes_clientes ADD COLUMN IF NOT EXISTS concluido_em_ordem TEXT;
ALTER TABLE lembretes_clientes ADD COLUMN IF NOT EXISTS cliente_cnpj_cpf TEXT NOT NULL DEFAULT '';

NOTIFY pgrst, 'reload schema';
