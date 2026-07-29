-- Senha do cartão Veloe (pedágio/abastecimento) na ficha do veículo.
-- Rodar no SQL Editor do Supabase do Portal.
ALTER TABLE frota_veiculos
  ADD COLUMN IF NOT EXISTS senha_cartao_veloe TEXT;

NOTIFY pgrst, 'reload schema';
