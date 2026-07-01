-- Marca uma OS como "fechada internamente" (sem NF de serviço).
-- Preenchido ao anexar a OS na pasta do cliente com a opção "Serviço interno".
-- A pasta mostra "Fechado interno" no lugar do status quando true.
ALTER TABLE portal_nt_clientes_os
  ADD COLUMN IF NOT EXISTS servico_interno boolean NOT NULL DEFAULT false;
