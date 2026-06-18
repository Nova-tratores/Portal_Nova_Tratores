-- Preferência de envio do boleto por cliente (WhatsApp ou Email)
-- Maracutaia do Pós-Vendas: cada cliente tem uma preferência de como receber o boleto.
CREATE TABLE IF NOT EXISTS "EnvioBoleto" (
  id BIGSERIAL PRIMARY KEY,
  cnpj_cpf TEXT NOT NULL,          -- chave do cliente (documento)
  cliente_nome TEXT,              -- nome só pra referência/leitura
  metodo TEXT CHECK (metodo IN ('whatsapp','email')),  -- preferência atual
  whatsapp TEXT,                  -- número (quando método = whatsapp)
  email TEXT,                     -- email (quando método = email)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID                 -- quem registrou/alterou
);

-- 1 preferência por cliente (upsert por documento)
CREATE UNIQUE INDEX IF NOT EXISTS envioboleto_cnpj_uidx ON "EnvioBoleto" (cnpj_cpf);

-- RLS desabilitado (mesmo padrão das outras tabelas)
ALTER TABLE "EnvioBoleto" DISABLE ROW LEVEL SECURITY;

-- Liga o faturamento (Chamado_NF) ao cliente pelo documento, pra puxar a preferência
ALTER TABLE "Chamado_NF" ADD COLUMN IF NOT EXISTS cnpj_cliente TEXT;

NOTIFY pgrst, 'reload schema';
